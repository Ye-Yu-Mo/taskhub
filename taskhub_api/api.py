from fastapi import FastAPI, HTTPException, Depends, Query
from typing import List, Optional
import uuid
from datetime import datetime
from contextlib import asynccontextmanager

from .models import Run, RunStatus, Task
from .schemas import TaskRead, RunCreate, RunRead
from .storage import Storage, _storage_instance

# 这里的数据库路径之后应该从 config 加载
DB_URL = "sqlite+aiosqlite:///data/taskhub.db"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化
    global _storage_instance
    _storage_instance = Storage(DB_URL)
    await _storage_instance.init_db()
    
    # TODO: 扫描 tasks/ 目录并自动注册任务
    # 为了演示，我们可以手动插入一个测试任务（现实中应该由扫描逻辑完成）
    async with _storage_instance.session_factory() as session:
        async with session.begin():
            test_task = await session.get(Task, "demo_task")
            if not test_task:
                session.add(Task(
                    task_id="demo_task",
                    name="演示任务",
                    description="这是一个用于测试的演示任务",
                    params_schema={
                        "type": "object",
                        "properties": {
                            "count": {"type": "integer", "default": 10},
                            "message": {"type": "string", "default": "hello"}
                        }
                    },
                    schema_hash="initial",
                    version="0.1.0",
                    concurrency_limit=2
                ))
    
    yield
    # 关闭时清理（如有需要）

api_app = FastAPI(title="TaskHub API", version="0.1.0", lifespan=lifespan)

async def get_db_storage() -> Storage:
    if _storage_instance is None:
        raise HTTPException(status_code=500, detail="Storage not initialized")
    return _storage_instance

@api_app.get("/api/tasks", response_model=List[TaskRead])
async def list_tasks(storage: Storage = Depends(get_db_storage)):
    """获取所有任务定义"""
    async with storage.session_factory() as session:
        # 这里以后可以加入并发数统计的聚合查询
        from sqlalchemy import select
        result = await session.execute(select(Task))
        return result.scalars().all()

@api_app.post("/api/tasks/{task_id}/runs", response_model=RunRead)
async def create_run(task_id: str, req: RunCreate, storage: Storage = Depends(get_db_storage)):
    """发起一次任务运行"""
    task = await storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # TODO: 校验 req.params 是否符合 task.params_schema (使用 jsonschema)
    
    run_id = f"r-{uuid.uuid4().hex[:8]}"
    workdir = f"data/runs/{run_id}"
    
    new_run = Run(
        run_id=run_id,
        task_id=task_id,
        task_version=task.version,
        schema_hash=task.schema_hash,
        status=RunStatus.QUEUED,
        params=req.params,
        workdir=workdir,
        created_at=datetime.utcnow()
    )
    
    return await storage.create_run(new_run)

@api_app.get("/api/runs", response_model=List[RunRead])
async def list_runs(
    task_id: Optional[str] = None, 
    status: Optional[RunStatus] = None,
    limit: int = 50,
    storage: Storage = Depends(get_db_storage)
):
    """获取运行历史"""
    from sqlalchemy import select
    async with storage.session_factory() as session:
        stmt = select(Run).order_by(Run.created_at.desc()).limit(limit)
        if task_id:
            stmt = stmt.where(Run.task_id == task_id)
        if status:
            stmt = stmt.where(Run.status == status)
        
        result = await session.execute(stmt)
        return result.scalars().all()

@api_app.get("/api/runs/{run_id}", response_model=RunRead)
async def get_run(run_id: str, storage: Storage = Depends(get_db_storage)):
    """获取运行详情"""
    async with storage.session_factory() as session:
        run = await session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="运行记录不存在")
        return run

@api_app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str, storage: Storage = Depends(get_db_storage)):
    """申请取消运行"""
    from sqlalchemy import update
    async with storage.session_factory() as session:
        async with session.begin():
            await session.execute(
                update(Run)
                .where(Run.run_id == run_id)
                .values(cancel_requested_at=datetime.utcnow())
            )
    return {"status": "cancel_requested"}
