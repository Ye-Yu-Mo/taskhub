import asyncio
import os
import signal
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from taskhub_api.models import RunStatus, Run
from taskhub_api.storage import Storage
from taskhub_api.registry import Registry

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("taskhub.worker")

class Worker:
    def __init__(self, storage: Storage, worker_id: str, lease_seconds: int = 30):
        self.storage = storage
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        self.running = True
        self.registry = Registry()
        self.registry.discover()
        
        # 内部状态跟踪
        self._current_status = "IDLE"
        self._current_run_id = None

    async def run(self):
        """Worker 主循环"""
        logger.info(f"Worker {self.worker_id} 已启动，准备处理任务。")
        
        hostname = self.worker_id.split('-')[1] if '-' in self.worker_id else "unknown"
        await self.storage.register_worker(self.worker_id, hostname, os.getpid())
        
        # 启动后台心跳
        heartbeat_task = asyncio.create_task(self.worker_status_loop())

        while self.running:
            try:
                run_record = await self.storage.acquire_run_lease(self.worker_id, self.lease_seconds)
                
                if run_record:
                    logger.info(f"抢占任务成功: {run_record.run_id}")
                    self._current_status = "BUSY"
                    self._current_run_id = run_record.run_id
                    
                    # 强制立即刷新一次状态
                    await self.storage.heartbeat_worker(self.worker_id, "BUSY", run_record.run_id)
                    
                    await self.execute_run(run_record)
                    
                    self._current_status = "IDLE"
                    self._current_run_id = None
                    # 立即刷新回 IDLE
                    await self.storage.heartbeat_worker(self.worker_id, "IDLE", None)
                else:
                    await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Worker 循环异常: {str(e)}")
                await asyncio.sleep(5)
        
        heartbeat_task.cancel()

    async def worker_status_loop(self):
        """定期同步 Worker 状态到数据库"""
        while self.running:
            await asyncio.sleep(15) # 每15秒打卡一次
            try:
                await self.storage.heartbeat_worker(
                    self.worker_id, 
                    self._current_status, 
                    self._current_run_id
                )
            except Exception as e:
                logger.error(f"Worker 心跳失败: {e}")

    async def execute_run(self, run_record: Run):
        """执行单个 Run"""
        # 动态加载任务定义
        task_spec = self.registry.get_task(run_record.task_id)
        if not task_spec:
            logger.error(f"找不到任务定义: {run_record.task_id}")
            await self.storage.update_run_status(run_record.run_id, RunStatus.FAILED, error=f"Task definition {run_record.task_id} not found")
            return

        try:
            # 校验并构造命令
            params_obj = task_spec.params_model(**run_record.params)
            cmd = task_spec.build_command(params_obj)
        except Exception as e:
            logger.error(f"构造命令失败: {e}")
            await self.storage.update_run_status(run_record.run_id, RunStatus.FAILED, error=f"Build command failed: {e}")
            return
        
        # 确保工作目录存在
        Path(run_record.workdir).mkdir(parents=True, exist_ok=True)
        
        # 记录 PID 以便 Reaper 清理（在 POSIX 下我们要的是进程组 ID）
        # asyncio 不直接提供 pgid，但我们可以通过 preexec_fn 开启 session
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=run_record.workdir,
            preexec_fn=os.setsid # 核心：创建新进程组
        )

        pgid = process.pid # 在 setsid 后，pid 就是 pgid
        
        # 立即记录 PID，以便 Reaper 在我们崩溃时能接管
        try:
            await self.storage.set_run_pid(run_record.run_id, pgid)
        except Exception as e:
            logger.error(f"记录 PID 失败: {e}，正在终止任务以防孤儿进程")
            os.killpg(pgid, signal.SIGKILL)
            await self.storage.update_run_status(run_record.run_id, RunStatus.FAILED, error="Failed to persist PID")
            return

        # 启动心跳和 IO 收集
        heartbeat_task = asyncio.create_task(self.heartbeat_loop(run_record.run_id, pgid))
        stdout_task = asyncio.create_task(self.drain_stream(process.stdout, run_record.run_id, "stdout"))
        stderr_task = asyncio.create_task(self.drain_stream(process.stderr, run_record.run_id, "stderr"))

        try:
            exit_code = await process.wait()
            logger.info(f"任务 {run_record.run_id} 运行结束，退出码: {exit_code}")
            
            # 检查是否是因为取消而结束的
            is_canceled = await self.storage.check_run_cancel_status(run_record.run_id)
            if is_canceled:
                 await self.storage.update_run_status(run_record.run_id, RunStatus.CANCELED, error="Canceled by user")
            else:
                # 更新状态
                status = RunStatus.SUCCEEDED if exit_code == 0 else RunStatus.FAILED
                error_msg = None if exit_code == 0 else f"Process exited with {exit_code}"
                await self.storage.update_run_status(run_record.run_id, status, exit_code, error_msg)
            
        except asyncio.CancelledError:
            # 处理取消逻辑 (Worker 停止时触发)
            logger.warning(f"任务 {run_record.run_id} 被 Worker 停止信号中断，正在杀掉进程组 {pgid}")
            try:
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            await self.storage.update_run_status(run_record.run_id, RunStatus.CANCELED, error="Worker stopped")
        finally:
            heartbeat_task.cancel()
            await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)

    async def heartbeat_loop(self, run_id: str, pgid: int):
        """心跳更新 Lease，同时检查取消信号"""
        import time
        last_lease_time = 0
        check_interval = 1.0  # 1秒检查一次取消状态
        
        while True:
            # 1. 检查是否被取消
            try:
                if await self.storage.check_run_cancel_status(run_id):
                    logger.info(f"检测到取消信号，正在终止任务 {run_id} (PGID: {pgid})")
                    try:
                        os.killpg(pgid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass # 进程可能已经死了
                    break
            except Exception as e:
                logger.error(f"检查取消状态失败: {e}")

            # 2. 续租 (按 lease_seconds / 3 的频率)
            now = time.time()
            if now - last_lease_time > (self.lease_seconds / 3):
                try:
                    success = await self.storage.extend_lease(run_id, self.worker_id, self.lease_seconds)
                    if not success:
                        logger.error(f"任务 {run_id} 续租失败（可能已被抢占或过期）！")
                        try:
                            os.killpg(pgid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        break
                    last_lease_time = now
                except Exception as e:
                    logger.error(f"续租异常: {e}")
                    break
            
            await asyncio.sleep(check_interval)

    async def drain_stream(self, stream: asyncio.StreamReader, run_id: str, stream_name: str):
        """读取输出并解析事件"""
        # 准备文件路径
        # TODO: 更好的方式是从 run_record 传递 workdir，这里暂时为了简单直接拼
        # 实际生产中应该在 execute_run 里把 file handle 传进来
        workdir = f"data/runs/{run_id}"
        log_file = Path(workdir) / f"{stream_name}.log"
        events_file = Path(workdir) / "events.jsonl"
        
        # 简单的 seq 计数器，注意：并发写 events 只有这一个协程吗？
        # 目前只有 stdout 会产生 events，所以是安全的。
        # 如果 stderr 也要产生，需要锁。
        # v0.1 假设只有 stdout 产出 events。
        seq_counter = 0 
        
        # 确保目录存在（虽然 execute_run 已经建了，防万一）
        log_file.parent.mkdir(parents=True, exist_ok=True)

        try:
            with open(log_file, "a", encoding="utf-8", buffering=1) as f_log:
                while True:
                    line_bytes = await stream.readline()
                    if not line_bytes:
                        break
                    
                    # 写入原始日志
                    text = line_bytes.decode('utf-8', errors='replace')
                    f_log.write(text)
                    
                    # 解析事件 (仅 stdout)
                    clean_line = text.strip()
                    if stream_name == "stdout" and clean_line.startswith("TASKHUB_EVENT "):
                        try:
                            raw_json = clean_line[14:]
                            event_data = json.loads(raw_json)
                            
                            seq_counter += 1
                            event_record = {
                                "seq": seq_counter,
                                "ts": datetime.now(timezone.utc).isoformat(),
                                "run_id": run_id,
                                "type": event_data.get("type", "log"),
                                "data": event_data.get("data", {})
                            }
                            
                            with open(events_file, "a", encoding="utf-8") as f_events:
                                f_events.write(json.dumps(event_record) + "\n")
                                
                        except Exception as e:
                            logger.warning(f"事件解析失败: {e} - Line: {clean_line[:50]}...")
        except Exception as e:
             logger.error(f"流处理异常 [{stream_name}]: {e}")

    def stop(self):
        self.running = False
