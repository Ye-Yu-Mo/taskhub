from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any, Dict
from sqlalchemy import String, Integer, DateTime, JSON, Text, ForeignKey, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class RunStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"

class Base(DeclarativeBase):
    pass

class Task(Base):
    """任务元信息表：定义任务的行为约束"""
    __tablename__ = "tasks"

    task_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[Optional[list[str]]] = mapped_column(JSON)  # 存储为 JSON 数组
    
    # 参数约束
    params_schema: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    schema_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)

    # 运行策略
    concurrency_limit: Mapped[Optional[int]] = mapped_column(Integer)
    timeout_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    is_enabled: Mapped[bool] = mapped_column(default=True)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Run(Base):
    """运行记录表：记录每次执行的状态与生命周期"""
    __tablename__ = "runs"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(100), nullable=False)
    task_version: Mapped[str] = mapped_column(String(50), nullable=False)
    schema_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    
    status: Mapped[RunStatus] = mapped_column(String(20), default=RunStatus.QUEUED)
    
    # 时间线
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    deadline_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # 运行上下文
    params: Mapped[Dict[str, Any]] = mapped_column(JSON)
    workdir: Mapped[str] = mapped_column(Text, nullable=False)
    
    # 结果摘要
    exit_code: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(Text)  # 短错误摘要
    
    # 控制面
    cancel_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    # 租约管理（Worker 存活证明）
    lease_owner: Mapped[Optional[str]] = mapped_column(String(100))
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    worker_pid: Mapped[Optional[int]] = mapped_column(Integer) # 运行该任务的进程(组)ID

    # 索引优化查询
    __table_args__ = (
        Index("ix_runs_task_id_created_at", "task_id", "created_at"),
        Index("ix_runs_status_created_at", "status", "created_at"),
        Index("ix_runs_lease_expires_at", "lease_expires_at"),
    )

class RunQueue(Base):
    """运行队列：独立于状态机，确保调度效率"""
    __tablename__ = "run_queue"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    enqueued_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_queue_priority_time", "priority", "enqueued_at"),
    )
