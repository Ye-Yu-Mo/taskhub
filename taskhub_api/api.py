from fastapi import FastAPI, HTTPException, Depends, Query
from typing import List, Optional
import uuid
import json
from pathlib import Path
from datetime import datetime
from contextlib import asynccontextmanager

from .models import Run, RunStatus, Task
from .schemas import TaskRead, RunCreate, RunRead, EventList, EventRead
from .storage import Storage, _storage_instance
from .registry import Registry, get_schema_hash

# 这里的数据库路径之后应该从 config 加载
DB_URL = "sqlite+aiosqlite:///data/taskhub.db"
_registry_instance: Optional[Registry] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化
    global _storage_instance, _registry_instance
    _storage_instance = Storage(DB_URL)
    await _storage_instance.init_db()
    
    # 扫描并注册任务
    _registry_instance = Registry()
    _registry_instance.discover()
    
    async with _storage_instance.session_factory() as session:
        async with session.begin():
            for task_spec in _registry_instance.get_all_tasks():
                schema = task_spec.params_model.model_json_schema()
                schema_hash = get_schema_hash(schema)
                
                # Upsert 逻辑
                existing = await session.get(Task, task_spec.task_id)
                if not existing:
                    session.add(Task(
                        task_id=task_spec.task_id,
                        name=task_spec.name,
                        description=task_spec.description,
                        params_schema=schema,
                        schema_hash=schema_hash,
                        version=task_spec.version,
                        concurrency_limit=task_spec.concurrency_limit,
                        timeout_seconds=task_spec.timeout_seconds
                    ))
                else:
                    # 如果元信息变了，更新它
                    existing.name = task_spec.name
                    existing.params_schema = schema
                    existing.schema_hash = schema_hash
                    existing.version = task_spec.version
                    existing.concurrency_limit = task_spec.concurrency_limit
    
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
@api_app.get("/api/runs/{run_id}/events", response_model=EventList)
async def get_run_events(run_id: str, cursor: int = 0, storage: Storage = Depends(get_db_storage)):
    """获取增量事件流"""
    # 1. 简单校验 run 是否存在（也可跳过以提高性能）
    # async with storage.session_factory() as session:
    #     run = await session.get(Run, run_id)
    #     if not run:
    #         raise HTTPException(status_code=404, detail="Run not found")
            
    events_path = Path(f"data/runs/{run_id}/events.jsonl")
    if not events_path.exists():
        return {"items": [], "next_cursor": cursor}
    
    items = []
    max_seq = cursor
    
    try:
        # TODO: 对于大文件，这里应该优化为 seek + readline，或者只读最后 N 行
        # v0.1 简单全读
        with open(events_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    evt = json.loads(line)
                    if evt["seq"] > cursor:
                        items.append(evt)
                        if evt["seq"] > max_seq:
                            max_seq = evt["seq"]
                except:
                    continue
    except Exception as e:
        # 文件读写竞争时可能偶尔报错，忽略本次
        pass
        
    return {"items": items, "next_cursor": max_seq}
