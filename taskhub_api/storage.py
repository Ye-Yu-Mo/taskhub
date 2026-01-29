import asyncio
from typing import Optional, List, Any
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select, update, delete, func, text
from pathlib import Path
from datetime import datetime, timedelta, timezone

from .models import Base, Task, Run, RunQueue, RunStatus, WorkerHeartbeat, CronJob

# 默认数据库连接
DB_URL = "sqlite+aiosqlite:///data/taskhub.db"


class Storage:
    def __init__(self, db_url: str = DB_URL):
        # 启用 WAL 模式以支持更高并发
        self.engine = create_async_engine(db_url, echo=False)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    # --- Cron Jobs Methods ---

    async def list_cron_jobs(self) -> List[CronJob]:
        async with self.session_factory() as session:
            result = await session.execute(select(CronJob))
            return result.scalars().all()

    async def get_cron_job(self, cron_id: str) -> Optional[CronJob]:
        async with self.session_factory() as session:
            return await session.get(CronJob, cron_id)

    async def create_cron_job(self, job: CronJob) -> CronJob:
        async with self.session_factory() as session:
            async with session.begin():
                session.add(job)
            await session.refresh(job)
            return job

    async def update_cron_job(self, cron_id: str, updates: dict) -> Optional[CronJob]:
        async with self.session_factory() as session:
            async with session.begin():
                stmt = (
                    update(CronJob)
                    .where(CronJob.cron_id == cron_id)
                    .values(**updates)
                    .returning(CronJob)
                )
                result = await session.execute(stmt)
                return result.scalar_one_or_none()

    async def delete_cron_job(self, cron_id: str) -> bool:
        async with self.session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    delete(CronJob).where(CronJob.cron_id == cron_id)
                )
                return result.rowcount > 0

    async def get_due_cron_jobs(self) -> List[CronJob]:
        """获取所有到期的 Cron 任务"""
        now = datetime.now(timezone.utc)
        async with self.session_factory() as session:
            result = await session.execute(
                select(CronJob).where(
                    CronJob.is_enabled == True, CronJob.next_run_at <= now
                )
            )
            return result.scalars().all()

    async def update_cron_job_next_run(
        self, cron_id: str, last_run: datetime, next_run: datetime
    ):
        """更新 Cron 下次运行时间"""
        async with self.session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(CronJob)
                    .where(CronJob.cron_id == cron_id)
                    .values(last_run_at=last_run, next_run_at=next_run)
                )

    # --- Existing Methods ---
    
    async def register_worker(self, worker_id: str, hostname: str, pid: int):
        """Worker 启动注册"""
        async with self.session_factory() as session:
            async with session.begin():
                # Upsert
                worker = await session.get(WorkerHeartbeat, worker_id)
                if not worker:
                    worker = WorkerHeartbeat(
                        worker_id=worker_id, hostname=hostname, pid=pid, status="IDLE"
                    )
                    session.add(worker)
                else:
                    worker.status = "IDLE"
                    worker.current_run_id = None
                    worker.last_heartbeat = datetime.now(timezone.utc)

    async def heartbeat_worker(
        self, worker_id: str, status: str, current_run_id: Optional[str] = None
    ):
        """Worker 状态更新"""
        async with self.session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(WorkerHeartbeat)
                    .where(WorkerHeartbeat.worker_id == worker_id)
                    .values(
                        last_heartbeat=datetime.now(timezone.utc),
                        status=status,
                        current_run_id=current_run_id,
                    )
                )

    async def get_active_workers(
        self, timeout_seconds: int = 60
    ) -> List[WorkerHeartbeat]:
        """获取活跃的 Worker"""
        threshold = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)
        async with self.session_factory() as session:
            result = await session.execute(
                select(WorkerHeartbeat).where(
                    WorkerHeartbeat.last_heartbeat > threshold
                )
            )
            return result.scalars().all()

    async def prune_dead_workers(self, timeout_seconds: int = 60):
        """清理已死亡的 Worker 记录"""
        threshold = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)
        async with self.session_factory() as session:
            async with session.begin():
                await session.execute(
                    delete(WorkerHeartbeat).where(
                        WorkerHeartbeat.last_heartbeat < threshold
                    )
                )

    async def init_db(self):
        # 启用 WAL 模式以支持更高并发
        self.engine = create_async_engine(db_url, echo=False)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

    async def init_db(self):
        """初始化数据库表结构并开启 WAL 模式"""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        # 显式开启 WAL (Write-Ahead Logging) 模式
        async with self.engine.connect() as conn:
            await conn.execute(text("PRAGMA journal_mode=WAL;"))
            await conn.execute(text("PRAGMA synchronous=NORMAL;"))

    async def get_task(self, task_id: str) -> Optional[Task]:
        async with self.session_factory() as session:
            return await session.get(Task, task_id)

    async def create_run(self, run: Run) -> Run:
        """原子操作：创建 Run 记录并加入队列"""
        async with self.session_factory() as session:
            async with session.begin():
                session.add(run)
                # 同时入队
                queue_item = RunQueue(
                    run_id=run.run_id,
                    priority=0,  # v0.1 默认优先级
                    enqueued_at=run.created_at,
                )
                session.add(queue_item)
            # 提交后刷新 run 对象以返回 ID
            await session.refresh(run)
            return run

    async def acquire_run_lease(
        self, worker_id: str, lease_seconds: int = 30
    ) -> Optional[Run]:
        """
        Worker 核心逻辑：从队列中取出一个任务并锁定。
        解决 Head-of-Line Blocking：如果队首任务达到并发限制，尝试队列中后面的任务。
        """
        now = datetime.now(timezone.utc)
        lease_expiry = now + timedelta(seconds=lease_seconds)

        async with self.session_factory() as session:
            async with session.begin():  # 开启事务
                # 1. 获取候选任务 (尝试前 10 个，避免队首阻塞)
                result = await session.execute(
                    select(RunQueue)
                    .order_by(RunQueue.priority.desc(), RunQueue.enqueued_at.asc())
                    .limit(10)
                )
                candidates = result.scalars().all()

                if not candidates:
                    return None

                for queue_item in candidates:
                    # 2. 检查该任务的并发限制
                    run_record = await session.get(Run, queue_item.run_id)
                    if not run_record:
                        await session.delete(queue_item)
                        continue

                    task_record = await session.get(Task, run_record.task_id)
                    if not task_record:
                        run_record.status = RunStatus.FAILED
                        run_record.error = "Task definition not found"
                        await session.delete(queue_item)
                        continue

                    # 2.2 检查每任务并发
                    if task_record.concurrency_limit is not None:
                        running_count = await session.scalar(
                            select(func.count(Run.run_id)).where(
                                Run.task_id == task_record.task_id,
                                Run.status == RunStatus.RUNNING,
                                Run.lease_expires_at > now,
                            )
                        )

                        if running_count >= task_record.concurrency_limit:
                            # 超过并发限制，尝试队列中的下一个候选者
                            continue

                    # 3. 抢锁成功：从队列删除
                    # 关键修复：显式执行 delete 并检查 rowcount，防止并发抢占
                    del_result = await session.execute(
                        delete(RunQueue).where(RunQueue.run_id == run_record.run_id)
                    )
                    
                    if del_result.rowcount == 0:
                        # 手慢了，被别人抢了，尝试下一个
                        continue

                    # 4. 更新 Run 状态
                    run_record.status = RunStatus.RUNNING
                    run_record.started_at = now
                    run_record.lease_owner = worker_id
                    run_record.lease_expires_at = lease_expiry

                    session.add(run_record)
                    return run_record

                return None

    

    async def extend_lease(
        self, run_id: str, worker_id: str, lease_seconds: int = 30
    ) -> bool:
        """Worker 心跳：续租"""
        now = datetime.now(timezone.utc)
        new_expiry = now + timedelta(seconds=lease_seconds)

        async with self.session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    update(Run)
                    .where(
                        Run.run_id == run_id,
                        Run.lease_owner == worker_id,
                        Run.status == RunStatus.RUNNING,
                    )
                    .values(lease_expires_at=new_expiry)
                )
                return result.rowcount > 0

    async def set_run_pid(self, run_id: str, pid: int):
        """记录任务对应的进程ID"""
        async with self.session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(Run).where(Run.run_id == run_id).values(worker_pid=pid)
                )

    async def check_run_cancel_status(self, run_id: str) -> bool:
        """检查任务是否被请求取消"""
        async with self.session_factory() as session:
            # 只查 cancel_requested_at 字段，轻量级
            run = await session.get(Run, run_id)
            return run.cancel_requested_at is not None if run else False

    async def update_run_status(
        self,
        run_id: str,
        status: RunStatus,
        exit_code: Optional[int] = None,
        error: Optional[str] = None,
    ):
        """Worker 结束任务"""
        now = datetime.now(timezone.utc)
        async with self.session_factory() as session:
            async with session.begin():
                values = {
                    "status": status,
                    "finished_at": now,
                    "lease_expires_at": None,  # 清除租约
                }
                if exit_code is not None:
                    values["exit_code"] = exit_code
                if error is not None:
                    values["error"] = error

                await session.execute(
                    update(Run).where(Run.run_id == run_id).values(**values)
                )


# 简单的单例模式占位，实际使用时应该由依赖注入管理
_storage_instance: Optional[Storage] = None


def get_storage() -> Storage:
    global _storage_instance
    if _storage_instance is None:
        raise RuntimeError("Storage not initialized")
    return _storage_instance
