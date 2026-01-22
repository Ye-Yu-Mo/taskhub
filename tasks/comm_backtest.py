from enum import Enum
from pydantic import BaseModel, Field
from taskhub_api.registry import TaskSpec
from typing import List

class SignalType(Enum):
    online = 1
    offline = 2

class DemoParams(BaseModel):
    signals: List[int]
    signal_type: SignalType
    output_path: str
    is_incremental: bool
    hdfs_path_list: List[str]


def build_command(params: DemoParams) -> List[str]:
    # 将 Pydantic 对象转为 dict 后传给子进程
    # 这里我们利用 python -c 来模拟一个真实脚本
    p = params
    script = f"""

"""
    return ["python3", "-c", script]

task = TaskSpec(
    task_id="comm_backtest",
    name="商品期货回测",
    description="",
    params_model=DemoParams,
    build_command=build_command,
    version="1.0.0",
    concurrency_limit=2
)
