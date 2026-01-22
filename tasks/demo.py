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
import time, json, os

print(f"任务启动，消息: {p.message}")

# 1. 模拟计算
for i in range(1, {p.count} + 1):
    progress = int(i / {p.count} * 100)
    print(f"TASKHUB_EVENT {{json.dumps({{'type': 'progress', 'data': {{'pct': progress, 'stage': 'computing'}} }})}}")
    print(f"步骤 {{i}}: 正在处理...")
    time.sleep(1)

# 2. 生成产物
os.makedirs("files", exist_ok=True)
csv_path = "files/result.csv"
with open(csv_path, "w") as f:
    f.write("id,value\\n")
    for i in range({p.count}):
        f.write(f"{{i}},{{i*10}}\\n")

# 3. 生成索引
artifacts = {{
    "run_id": os.environ.get("TASKHUB_RUN_ID", "unknown"),
    "items": [
        {{
            "artifact_id": "res_csv",
            "kind": "file",
            "title": "计算结果 CSV",
            "file_id": "f_result_csv", 
            "path": csv_path,
            "mime": "text/csv",
            "size_bytes": os.path.getsize(csv_path)
        }}
    ]
}}
with open("artifacts.json", "w") as f:
    json.dump(artifacts, f)

print(f"TASKHUB_EVENT {{json.dumps({{'type': 'artifact', 'data': {{'title': '计算结果 CSV'}} }})}}")
print("产物生成完毕")
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
