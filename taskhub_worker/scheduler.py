import asyncio
import logging
import uuid
from datetime import datetime, timezone
from croniter import croniter
from taskhub_api.storage import Storage
from taskhub_api.models import Run, RunStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SCHEDULER] %(message)s")
logger = logging.getLogger("taskhub.scheduler")


class Scheduler:
    def __init__(self, storage: Storage, check_interval: int = 10):
        self.storage = storage
        self.check_interval = check_interval
        self.running = True

    async def run(self):
        logger.info("Scheduler 已启动，开始监控定时任务...")
        while self.running:
            try:
                await self.schedule_jobs()
            except Exception as e:
                logger.error(f"调度循环异常: {e}")
            await asyncio.sleep(self.check_interval)

    async def schedule_jobs(self):
        # 获取所有 next_run_at <= now 的任务
        due_jobs = await self.storage.get_due_cron_jobs()
        if not due_jobs:
            return

        now = datetime.now(timezone.utc)

        for job in due_jobs:
            try:
                # 1. 计算下一次运行时间
                # 策略：基于当前时间 (now) 计算下一次。
                # 这意味着如果系统停机了一天，重启后会立即运行一次，然后跳过中间错过的 N 次。
                # 这是最安全的恢复策略。
                try:
                    iter = croniter(job.cron_expression, now)
                    next_run = iter.get_next(datetime)
                except Exception as e:
                    logger.error(f"Cron 表达式错误 {job.cron_id} ({job.cron_expression}): {e}")
                    # 禁用该任务防止死循环报错? 或者只是跳过本次
                    continue

                # 2. 获取任务元信息 (为了版本号和 Schema Hash)
                task = await self.storage.get_task(job.task_id)
                if not task:
                    logger.error(f"Cron {job.cron_id} 关联的任务 {job.task_id} 不存在，跳过")
                    # 更新时间以免卡死
                    await self.storage.update_cron_job_next_run(job.cron_id, now, next_run)
                    continue

                if not task.is_enabled:
                    logger.info(f"任务 {job.task_id} 已禁用，跳过 Cron 触发")
                    await self.storage.update_cron_job_next_run(job.cron_id, now, next_run)
                    continue

                # 3. 创建运行记录
                run_id = f"r-cron-{uuid.uuid4().hex[:8]}"
                workdir = f"data/runs/{run_id}"

                new_run = Run(
                    run_id=run_id,
                    task_id=job.task_id,
                    task_version=task.version,
                    schema_hash=task.schema_hash,
                    status=RunStatus.QUEUED,
                    params=job.params,
                    workdir=workdir,
                    created_at=now,
                )

                # 原子操作：创建 Run
                await self.storage.create_run(new_run)
                logger.info(
                    f"触发定时任务: {job.name} (ID: {job.cron_id}) -> Run: {run_id}"
                )

                # 4. 更新 Cron 记录
                await self.storage.update_cron_job_next_run(job.cron_id, now, next_run)

            except Exception as e:
                logger.error(f"调度任务 {job.cron_id} 失败: {e}")
                # 尽力尝试更新时间，防止因单次失败导致该任务永远卡在 "due" 状态
                try:
                    iter = croniter(job.cron_expression, now)
                    next_run = iter.get_next(datetime)
                    await self.storage.update_cron_job_next_run(job.cron_id, now, next_run)
                except:
                    pass

    def stop(self):
        self.running = False
