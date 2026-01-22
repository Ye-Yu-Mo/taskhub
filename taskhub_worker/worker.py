import asyncio
import os
import signal
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from taskhub_api.models import RunStatus, Run
from taskhub_api.storage import Storage

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("taskhub.worker")

class Worker:
    def __init__(self, storage: Storage, worker_id: str, lease_seconds: int = 30):
        self.storage = storage
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        self.running = True

    async def run(self):
        """Worker 主循环"""
        logger.info(f"Worker {self.worker_id} 已启动，准备处理任务。")
        while self.running:
            try:
                # 1. 尝试抢占任务
                run_record = await self.storage.acquire_run_lease(self.worker_id, self.lease_seconds)
                
                if run_record:
                    logger.info(f"抢占任务成功: {run_record.run_id} (Task: {run_record.task_id})")
                    # 2. 执行任务
                    await self.execute_run(run_record)
                else:
                    # 队列为空或受限，休息一下
                    await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Worker 循环异常: {str(e)}")
                await asyncio.sleep(5)

    async def execute_run(self, run_record: Run):
        """执行单个 Run"""
        # TODO: 这里应该根据 task_id 加载真实的 TaskSpec 构造命令
        # v0.1 暂时硬编码一个演示用的命令
        params_json = json.dumps(run_record.params)
        cmd = ["python3", "-c", f"""
import time, sys, json
print("开始执行演示脚本...")
print(f"收到参数: {{json.dumps({params_json})}}")
for i in range(1, 6):
    print(f"TASKHUB_EVENT {{json.dumps({{'type': 'progress', 'data': {{'pct': i*20, 'stage': 'running'}} }})}}")
    print(f"正在处理第 {{i}} 步...")
    time.sleep(1)
print("执行完成！")
"""]
        
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

        # 启动心跳和 IO 收集
        heartbeat_task = asyncio.create_task(self.heartbeat_loop(run_record.run_id))
        stdout_task = asyncio.create_task(self.drain_stream(process.stdout, run_record.run_id, "stdout"))
        stderr_task = asyncio.create_task(self.drain_stream(process.stderr, run_record.run_id, "stderr"))

        try:
            exit_code = await process.wait()
            logger.info(f"任务 {run_record.run_id} 运行结束，退出码: {exit_code}")
            
            # 更新状态
            status = RunStatus.SUCCEEDED if exit_code == 0 else RunStatus.FAILED
            error_msg = None if exit_code == 0 else f"Process exited with {exit_code}"
            await self.storage.update_run_status(run_record.run_id, status, exit_code, error_msg)
            
        except asyncio.CancelledError:
            # 处理取消逻辑
            logger.warning(f"任务 {run_record.run_id} 被取消，正在杀掉进程组 {pgid}")
            os.killpg(pgid, signal.SIGKILL)
            await self.storage.update_run_status(run_record.run_id, RunStatus.CANCELED, error="Canceled by user")
        finally:
            heartbeat_task.cancel()
            await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)

    async def heartbeat_loop(self, run_id: str):
        """心跳更新 Lease"""
        while True:
            await asyncio.sleep(self.lease_seconds // 3)
            success = await self.storage.extend_lease(run_id, self.worker_id, self.lease_seconds)
            if not success:
                logger.error(f"任务 {run_id} 续租失败！")
                break

    async def drain_stream(self, stream: asyncio.StreamReader, run_id: str, stream_name: str):
        """读取输出并解析事件"""
        # TODO: 写入 run_record.workdir 下的 stdout.log / stderr.log
        # TODO: 识别 TASKHUB_EVENT 写入 events.jsonl
        while True:
            line = await stream.readline()
            if not line:
                break
            text = line.decode('utf-8', errors='replace').rstrip()
            
            if stream_name == "stdout" and text.startswith("TASKHUB_EVENT "):
                try:
                    event_data = json.loads(text[14:])
                    # TODO: 写入 events.jsonl
                    # logger.info(f"EVENT [{run_id}]: {event_data}")
                except:
                    pass
            
            # logger.debug(f"[{run_id} {stream_name}] {text}")

    def stop(self):
        self.running = False
