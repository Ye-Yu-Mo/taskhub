from pydantic import BaseModel, Field
from taskhub_api.registry import TaskSpec
from enum import Enum
from typing import List
import os
from pathlib import Path

# 获取脚本绝对路径
BASE_DIR = Path(__file__).resolve().parent.parent
SCRIPT_PATH = BASE_DIR / "tasks" / "scripts" / "showcase_impl.py"

class ReportTheme(str, Enum):
    LIGHT = "light"
    DARK = "dark"

class ShowcaseParams(BaseModel):
    title: str = Field(default="My Analysis", description="报告标题")
    data_points: int = Field(default=100, description="生成数据点数量")
    noise_level: float = Field(default=0.5, description="噪声水平 (0.0 - 1.0)")
    include_charts: bool = Field(default=True, description="是否生成图表")
    tags: List[str] = Field(default=["demo", "test"], description="标签 (逗号分隔)")
    theme: ReportTheme = Field(default=ReportTheme.LIGHT, description="报告主题")

def build_command(params: ShowcaseParams) -> List[str]:
    return [
        "python3", 
        str(SCRIPT_PATH),
        "--title", params.title,
        "--data-points", str(params.data_points),
        "--noise-level", str(params.noise_level),
        "--include-charts", str(params.include_charts),
        "--theme", params.theme.value,
        "--tags", ",".join(params.tags)
    ]

task = TaskSpec(
    task_id="showcase_v1",
    name="全能展示任务",
    description="生成 HTML 报告、SVG 图表和 CSV 数据的综合测试任务",
    params_model=ShowcaseParams,
    build_command=build_command,
    version="1.0.0",
    tags=["demo", "visual"]
)