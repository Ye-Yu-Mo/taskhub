from pydantic import BaseModel, Field
from taskhub_api.registry import TaskSpec
from typing import List

class DemoParams(BaseModel):
    count: int = Field(default=5, description="循环次数")
    message: str = Field(default="Hello", description="要打印的消息")

def build_command(params: DemoParams) -> List[str]:
    # 将 Pydantic 对象转为 dict 后传给子进程
    # 这里我们利用 python -c 来模拟一个真实脚本
    p = params
    script = f"""
import time, json
print(f"任务启动，消息: {p.message}")
for i in range(1, {p.count} + 1):
    progress = int(i / {p.count} * 100)
    print(f"TASKHUB_EVENT {{json.dumps({{'type': 'progress', 'data': {{'pct': progress, 'stage': 'computing'}} }})}}")
    print(f"步骤 {{i}}: 正在处理...")
    time.sleep(1)
print("任务执行完毕")
"""
    return ["python3", "-c", script]

task = TaskSpec(
    task_id="demo_v2",
    name="演示任务 V2",
    description="这是一个通过模块注册的真实任务",
    params_model=DemoParams,
    build_command=build_command,
    version="1.0.0",
    concurrency_limit=2
)
