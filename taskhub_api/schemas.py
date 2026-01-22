from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any, Dict, List
from datetime import datetime, timezone
from .models import RunStatus

class TaskBase(BaseModel):
    task_id: str
    name: str
    description: Optional[str] = None
    tags: Optional[List[str]] = []
    version: str
    concurrency_limit: Optional[int] = None
    timeout_seconds: Optional[int] = None
    is_enabled: bool = True

class TaskRead(TaskBase):
    params_schema: Dict[str, Any]
    # 增加一个实时字段，用于前端显示
    concurrency_current: int = 0

    class Config:
        from_attributes = True

class RunCreate(BaseModel):
    params: Dict[str, Any]

class RunRead(BaseModel):
    run_id: str
    task_id: str
    task_version: str
    status: RunStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    deadline_at: Optional[datetime] = None
    params: Dict[str, Any]
    exit_code: Optional[int] = None
    error: Optional[str] = None
    lease_owner: Optional[str] = None
    
    # 辅助前端显示
    duration: Optional[str] = None 

    @field_validator('created_at', 'started_at', 'finished_at', 'deadline_at', mode='before')
    def ensure_utc(cls, v):
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    class Config:
        from_attributes = True

class EventRead(BaseModel):
    seq: int
    ts: datetime
    type: str
    run_id: str
    data: Dict[str, Any]

    @field_validator('ts', mode='before')
    def ensure_utc(cls, v):
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

class EventList(BaseModel):
    items: List[EventRead]
    next_cursor: int

class ArtifactItem(BaseModel):
    artifact_id: str
    kind: str
    title: str
    file_id: Optional[str] = None
    path: Optional[str] = None
    mime: Optional[str] = None
    size_bytes: Optional[int] = None

class ArtifactsRead(BaseModel):
    run_id: str
    items: List[ArtifactItem]