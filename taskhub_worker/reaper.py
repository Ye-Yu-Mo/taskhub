import asyncio
import os
import signal
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, or_
from taskhub_api.storage import Storage, DB_URL
from taskhub_api.models import Run, RunStatus

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s [REAPER] %(message)s')
logger = logging.getLogger("taskhub.reaper")

class Reaper:
    def __init__(self, storage: Storage, check_interval: int = 60, lease_buffer: int = 10):
        self.storage = storage
        self.check_interval = check_interval
        self.lease_buffer = lease_buffer # 允许的租约宽限期（秒）
        self.running = True

    async def run(self):
        logger.info("Reaper 已启动，开始监视僵尸进程...")
        while self.running:
            try:
                await self.reap_zombies()
            except Exception as e:
                logger.error(f"Reaper 扫描异常: {e}")
            
            await asyncio.sleep(self.check_interval)

    async def reap_zombies(self):
        now = datetime.now(timezone.utc)
        threshold = now - timedelta(seconds=self.lease_buffer)

        async with self.storage.session_factory() as session:
            # 查找所有过期的 RUNNING 任务
            # 注意：这里的逻辑是，如果 lease 过期了，说明 Worker 已经挂了或者网络断了
            # 那么这个任务对应的进程可能还在跑（孤儿），也可能已经没了
            # 无论如何，我们都得去确认一下
            stmt = select(Run).where(
                Run.status == RunStatus.RUNNING,
                Run.lease_expires_at < threshold
            )
            result = await session.execute(stmt)
            zombies = result.scalars().all()

            if not zombies:
                return

            for run in zombies:
                logger.warning(f"发现过期任务: {run.run_id} (PID: {run.worker_pid}, Expires: {run.lease_expires_at})")
                
                # 1. 尝试杀进程
                killed = False
                if run.worker_pid:
                    try:
                        # 检查进程是否存在并属于当前用户（简单通过 kill 0 测试）
                        # 注意：在多机环境下，Reaper 只能杀本机的进程。
                        # 这里我们假设是单机部署，或者 Reaper 和 Worker 跑在一起。
                        # 如果是多机，Reaper 需要根据 run.lease_owner 来判断是否是本机，或者这就得是分布式的。
                        # V0.1: 假设单机。
                        
                        # 发送 SIGKILL 给进程组
                        os.killpg(run.worker_pid, signal.SIGKILL)
                        logger.info(f"已向进程组 {run.worker_pid} 发送 SIGKILL")
                        killed = True
                    except ProcessLookupError:
                        logger.info(f"进程组 {run.worker_pid} 已不存在")
                    except PermissionError:
                        logger.error(f"无权杀死进程组 {run.worker_pid}")
                    except Exception as e:
                        logger.error(f"杀进程失败: {e}")

                # 2. 更新数据库状态
                # 我们开启一个新的事务来更新，避免长事务
                # 但这里我们在循环里，简单起见直接用 session (它是绑定在外部事务吗？看 storage 实现是 session_factory() 创建的)
                # 等等，上面是用 session 查出来的对象，直接改属性然后 commit 即可
                
                run.status = RunStatus.FAILED
                run.error = "Lease expired (Reaped)"
                run.finished_at = now
                run.lease_expires_at = None
                
                session.add(run)
            
            await session.commit()
            if len(zombies) > 0:
                logger.info(f"清理完成，共收割 {len(zombies)} 个僵尸任务")

    def stop(self):
        self.running = False
