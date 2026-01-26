from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import List, Optional
import uuid
import json
from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from .models import Run, RunStatus, Task, CronJob
from .schemas import (
    TaskRead,
    RunCreate,
    RunRead,
    EventList,
    EventRead,
    ArtifactsRead,
    ArtifactItem,
    CronJobCreate,
    CronJobRead,
)
from .storage import Storage, _storage_instance, DB_URL
from .registry import Registry, get_schema_hash
from croniter import croniter

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
                    session.add(
                        Task(
                            task_id=task_spec.task_id,
                            name=task_spec.name,
                            description=task_spec.description,
                            params_schema=schema,
                            schema_hash=schema_hash,
                            version=task_spec.version,
                            concurrency_limit=task_spec.concurrency_limit,
                            timeout_seconds=task_spec.timeout_seconds,
                            is_enabled=task_spec.is_enabled,
                        )
                    )
                else:
                    # 如果元信息变了，更新它
                    existing.name = task_spec.name
                    existing.params_schema = schema
                    existing.schema_hash = schema_hash
                    existing.version = task_spec.version
                    existing.concurrency_limit = task_spec.concurrency_limit
                    existing.is_enabled = task_spec.is_enabled

    yield
    # 关闭时清理（如有需要）


api_app = FastAPI(title="TaskHub API", version="0.1.0", lifespan=lifespan)


async def get_db_storage() -> Storage:
    if _storage_instance is None:
        raise HTTPException(status_code=500, detail="Storage not initialized")
    return _storage_instance


async def get_registry() -> Registry:
    if _registry_instance is None:
        raise HTTPException(status_code=500, detail="Registry not initialized")
    return _registry_instance


@api_app.get("/api/tasks", response_model=List[TaskRead])
async def list_tasks(storage: Storage = Depends(get_db_storage)):
    """获取所有任务定义"""
    async with storage.session_factory() as session:
        # 这里以后可以加入并发数统计的聚合查询
        from sqlalchemy import select

        result = await session.execute(select(Task))
        return result.scalars().all()


@api_app.get("/api/workers")
async def list_workers(storage: Storage = Depends(get_db_storage)):
    """获取活跃节点列表"""
    workers = await storage.get_active_workers()
    return [
        {
            "id": w.worker_id,
            "hostname": w.hostname,
            "pid": w.pid,
            "status": w.status,
            "run_id": w.current_run_id,
            "last_heartbeat": w.last_heartbeat,
        }
        for w in workers
    ]


@api_app.post("/api/tasks/{task_id}/runs", response_model=RunRead)
async def create_run(
    task_id: str,
    req: RunCreate,
    storage: Storage = Depends(get_db_storage),
    registry: Registry = Depends(get_registry),
):
    """发起一次任务运行"""
    task = await storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 校验 req.params 是否符合 task.params_schema
    task_spec = registry.get_task(task_id)
    if not task_spec:
        raise HTTPException(status_code=400, detail="任务实现已丢失或未加载")

    try:
        # 使用注册的 Pydantic 模型进行校验
        validated_params = task_spec.params_model(**req.params).model_dump()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"参数校验失败: {str(e)}")

    run_id = f"r-{uuid.uuid4().hex[:8]}"
    workdir = f"data/runs/{run_id}"

    new_run = Run(
        run_id=run_id,
        task_id=task_id,
        task_version=task.version,
        schema_hash=task.schema_hash,
        status=RunStatus.QUEUED,
        params=validated_params,
        workdir=workdir,
        created_at=datetime.now(timezone.utc),
    )

    return await storage.create_run(new_run)


@api_app.get("/api/runs", response_model=List[RunRead])
async def list_runs(
    task_id: Optional[str] = None,
    status: Optional[RunStatus] = None,
    limit: int = 50,
    storage: Storage = Depends(get_db_storage),
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

        # 简单计算 duration
        run_dto = RunRead.model_validate(run)
        if run.started_at and run.finished_at:
            delta = run.finished_at - run.started_at
            run_dto.duration = str(delta).split(".")[0]  # 去掉微秒
        elif run.started_at and run.status == RunStatus.RUNNING:
            delta = datetime.now(timezone.utc) - run.started_at.replace(
                tzinfo=timezone.utc
            )
            run_dto.duration = str(delta).split(".")[0]

        return run_dto


@api_app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str, storage: Storage = Depends(get_db_storage)):
    """申请取消运行"""
    from sqlalchemy import update

    async with storage.session_factory() as session:
        async with session.begin():
            await session.execute(
                update(Run)
                .where(Run.run_id == run_id)
                .values(cancel_requested_at=datetime.now(timezone.utc))
            )


@api_app.get("/api/runs/{run_id}/events", response_model=EventList)
async def get_run_events(
    run_id: str, cursor: int = 0, storage: Storage = Depends(get_db_storage)
):
    """获取增量事件流"""
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


@api_app.get("/api/runs/{run_id}/artifacts", response_model=ArtifactsRead)
async def get_run_artifacts(run_id: str, storage: Storage = Depends(get_db_storage)):
    """获取产物索引"""
    artifacts_path = Path(f"data/runs/{run_id}/artifacts.json")
    if not artifacts_path.exists():
        return {"run_id": run_id, "items": []}

    try:
        with open(artifacts_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data
    except:
        return {"run_id": run_id, "items": []}


@api_app.get("/api/runs/{run_id}/files/{file_id}")
async def download_file(
    run_id: str, file_id: str, storage: Storage = Depends(get_db_storage)
):
    """安全下载文件"""
    artifacts_path = Path(f"data/runs/{run_id}/artifacts.json")
    if not artifacts_path.exists():
        raise HTTPException(status_code=404, detail="Artifacts not found")

    # 1. 查找 file_id 对应的 path
    target_path = None
    filename = "download"
    media_type = None
    try:
        with open(artifacts_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for item in data.get("items", []):
                if item["file_id"] == file_id:
                    target_path = item["path"]
                    # 优先使用 title 作为文件名，如果有 mime 则补后缀
                    filename = item.get("title", file_id)
                    media_type = item.get("mime")
                    if media_type == "text/csv" and not filename.endswith(".csv"):
                        filename += ".csv"
                    elif media_type == "text/html" and not filename.endswith(".html"):
                        filename += ".html"
                    elif media_type == "image/svg+xml" and not filename.endswith(
                        ".svg"
                    ):
                        filename += ".svg"
                    elif media_type == "image/png" and not filename.endswith(".png"):
                        filename += ".png"
                    break
    except:
        raise HTTPException(status_code=500, detail="Index corruption")

    if not target_path:
        raise HTTPException(status_code=404, detail="File ID not found in index")

    # 2. 拼接真实路径并校验
    abs_path = (Path(f"data/runs/{run_id}") / target_path).resolve()
    base_dir = Path(f"data/runs/{run_id}").resolve()

    if not str(abs_path).startswith(str(base_dir)):
        raise HTTPException(status_code=403, detail="Access denied")

    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="File on disk missing")

    # 智能判断 Content-Disposition
    previewable_types = [
        "text/html",
        "text/plain",
        "image/svg+xml",
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "application/pdf",
    ]
    disposition = "inline" if media_type in previewable_types else "attachment"

    return FileResponse(
        abs_path,
        filename=filename,
        media_type=media_type,
        content_disposition_type=disposition,
    )


# --- Cron Jobs API ---


@api_app.get("/api/cron", response_model=List[CronJobRead])
async def list_cron_jobs(storage: Storage = Depends(get_db_storage)):
    """获取所有定时任务"""
    return await storage.list_cron_jobs()


@api_app.post("/api/cron", response_model=CronJobRead)
async def create_cron_job(
    req: CronJobCreate,
    storage: Storage = Depends(get_db_storage),
    registry: Registry = Depends(get_registry),
):
    """创建定时任务"""
    # 1. 校验 Task 存在
    task = await storage.get_task(req.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 2. 校验 Params
    task_spec = registry.get_task(req.task_id)
    if task_spec:
        try:
            task_spec.params_model(**req.params)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"参数校验失败: {e}")

    # 3. 校验 Cron 表达式
    if not croniter.is_valid(req.cron_expression):
        raise HTTPException(status_code=422, detail="无效的 Cron 表达式")

    # 4. 计算首次运行时间
    now = datetime.now(timezone.utc)
    next_run = croniter(req.cron_expression, now).get_next(datetime)

    job = CronJob(
        cron_id=f"cron-{uuid.uuid4().hex[:8]}",
        task_id=req.task_id,
        name=req.name,
        cron_expression=req.cron_expression,
        params=req.params,
        is_enabled=req.is_enabled,
        next_run_at=next_run,
    )

    return await storage.create_cron_job(job)


@api_app.delete("/api/cron/{cron_id}")
async def delete_cron_job(cron_id: str, storage: Storage = Depends(get_db_storage)):
    success = await storage.delete_cron_job(cron_id)
    if not success:
        raise HTTPException(status_code=404, detail="Cron Job not found")
    return {"status": "ok"}


# --- 静态文件托管 (SPA Support) ---

# 检查 dist 是否存在（开发模式下可能不存在）
DIST_DIR = Path("web/dist")
if DIST_DIR.exists():
    # 挂载 assets 目录 (Vite 打包默认输出到 assets)
    api_app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    # 处理 SPA 路由回退
    @api_app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # 保护 API 路由：如果以 api/ 开头但没匹配到上面定义的路由，直接 404
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API Endpoint Not Found")

        # 尝试直接服务根目录下的文件 (如 favicon.svg, robots.txt)
        file_path = DIST_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        # 所有其他路径 (如 /runs, /dashboard) 都返回 index.html
        return FileResponse(DIST_DIR / "index.html")

else:
    print("Warning: web/dist directory not found. Frontend will not be served.")
