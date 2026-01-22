import importlib.util
import os
from pathlib import Path
from typing import Dict, Any, Type, List, Callable, Optional
from pydantic import BaseModel
import hashlib
import json

class TaskSpec(BaseModel):
    task_id: str
    name: str
    description: str = ""
    tags: List[str] = []
    params_model: Type[BaseModel]
    # build_command 接收 params dict 并返回命令列表
    build_command: Callable[[Dict[str, Any]], List[str]]
    version: str = "0.1.0"
    concurrency_limit: Optional[int] = None
    timeout_seconds: Optional[int] = None
    is_enabled: bool = True

class Registry:
    def __init__(self, tasks_dir: str = "tasks"):
        self.tasks_dir = Path(tasks_dir)
        self.tasks: Dict[str, TaskSpec] = {}

    def discover(self):
        """扫描目录并加载任务"""
        self.tasks = {}
        if not self.tasks_dir.exists():
            return
            
        for file in self.tasks_dir.glob("*.py"):
            if file.name.startswith("_"):
                continue
                
            spec_name = file.stem
            try:
                module_spec = importlib.util.spec_from_file_location(spec_name, file)
                module = importlib.util.module_from_spec(module_spec)
                module_spec.loader.exec_module(module)
                
                # 每个任务文件必须暴露一个 'task' 变量，类型为 TaskSpec
                if hasattr(module, "task") and isinstance(module.task, TaskSpec):
                    self.tasks[module.task.task_id] = module.task
            except Exception as e:
                print(f"加载任务失败 {file}: {e}")

    def get_task(self, task_id: str) -> Optional[TaskSpec]:
        return self.tasks.get(task_id)

    def get_all_tasks(self) -> List[TaskSpec]:
        return list(self.tasks.values())

def get_schema_hash(schema: Dict[str, Any]) -> str:
    s = json.dumps(schema, sort_keys=True)
    return hashlib.sha256(s.encode()).hexdigest()
