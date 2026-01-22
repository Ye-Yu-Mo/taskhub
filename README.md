# TaskHub

TaskHub 是一个稳健、单机版、基于 SQLite 的异步任务运行平台。它专为可靠性和极简主义设计，采用进程组隔离任务，并具备僵尸进程自动清理的自愈能力。

## 核心架构

系统由三个独立组件组成，通过 SQLite 数据库和文件系统进行协调：

1.  **API Server (FastAPI)**
    - 提供任务管理的 REST 接口。
    - 托管编译后的 React 前端 (单页应用)，无需额外部署 Nginx。
    - 管理任务定义和运行状态。

2.  **Worker (Asyncio)**
    - 抢占式轮询 SQLite 队列。
    - 使用独立的进程组 (Process Group/setsid) 执行任务，确保资源隔离。
    - 实时流式传输标准输出/错误日志，并解析结构化事件。
    - 严格执行任务并发限制。

3.  **Reaper (收割者)**
    - 系统的守夜人。
    - 监控僵尸进程：当 Worker 意外崩溃时，根据租约 (Lease) 清理孤儿进程组。
    - 标记失联任务为失败，防止状态死锁。

## 目录结构

- `taskhub_api/`: 后端 API 逻辑。
- `taskhub_worker/`: Worker 和 Reaper 核心逻辑。
- `tasks/`: 任务定义文件 (`.py` 模块)。
- `web/`: React 前端源码。
- `data/`: 运行时存储 (SQLite 数据库, 日志, 产物文件)。
- `logs/`: 系统服务日志。
- `main.py`: CLI 入口。

## 环境要求

- Python 3.10+
- uv (推荐的 Python 包管理器)
- npm (仅用于构建前端)

## 安装与部署

### 1. 构建前端
在首次运行前，需要编译 React 前端。这会生成 `web/dist` 目录，Python API 将直接托管该目录。

```bash
cd web
npm install
npm run build
cd ..
```

*注意：一旦构建完成，`web/dist` 目录是完全可移植的。运行时环境不需要 Node.js。*

### 2. 启动系统
使用提供的一键脚本启动所有服务（守护进程模式）：

```bash
# 启动 1 个 Worker
./start.sh

# 启动 5 个 Worker (并发处理)
./start.sh 5
```

该脚本将启动：
- API 服务器: `http://127.0.0.1:8000`
- 指定数量的 Worker 进程
- Reaper 进程

所有进程将在后台运行，日志输出至 `logs/` 目录。

### 3. 停止系统
优雅地停止所有服务并清理进程：

```bash
./stop.sh
```

## 开发指南

### 添加新任务

1. 在 `tasks/` 目录下新建一个 Python 文件 (例如 `my_task.py`)。
2. 定义一个 Pydantic 模型来描述参数。
3. 实现 `build_command(params)` 函数，返回要执行的 Shell 命令列表。
4. 导出名为 `task` 的 `TaskSpec` 对象。

示例 `tasks/hello.py`:

```python
from pydantic import BaseModel
from taskhub_api.registry import TaskSpec

class Params(BaseModel):
    target: str

def build_command(params: Params):
    # 推荐调用独立的脚本文件，而不是在字符串里拼接代码
    return ["python3", "tasks/scripts/my_script.py", "--target", params.target]

task = TaskSpec(
    task_id="hello_world",
    name="Hello Task",
    params_model=Params,
    build_command=build_command
)
```

## 故障排查

- **日志**: 查看 `logs/` 下的系统日志，或 `data/runs/r-{id}/stdout.log` 查看具体任务输出。
- **僵尸进程**: 如果 Worker 被 `kill -9` 强杀，Reaper 会在租约过期后 (默认 30秒) 自动清理残留的子进程。
- **重置**: 如果需要彻底重置，停止服务并删除 `data/taskhub.db`。

## License

MIT