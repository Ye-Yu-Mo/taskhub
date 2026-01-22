import typer
import uvicorn
import asyncio
import socket
import os
from pathlib import Path

# 延迟导入，避免启动 CLI 时就加载一堆库
from taskhub_api.api import DB_URL

app = typer.Typer(help="TaskHub: 一个可靠的单机任务运行平台。")

@app.command()
def api(
    host: str = "127.0.0.1",
    port: int = 8000,
    config: Path = typer.Option(Path("config.yaml"), help="配置文件路径")
):
    """启动 TaskHub API 服务器。"""
    typer.echo(f"正在启动 API 服务器：{host}:{port}，使用配置：{config}")
    uvicorn.run("taskhub_api.api:api_app", host=host, port=port, reload=True)

@app.command()
def worker(
    config: Path = typer.Option(Path("config.yaml"), help="配置文件路径")
):
    """启动 TaskHub Worker 进程。"""
    # 生成一个可读的 Worker ID
    worker_id = f"worker-{socket.gethostname()}-{os.getpid()}"
    typer.echo(f"正在启动 Worker ({worker_id})，使用配置：{config}")
    
    async def run_worker():
        from taskhub_api.storage import Storage
        from taskhub_worker.worker import Worker
        
        # 初始化数据库连接
        storage = Storage(DB_URL)
        await storage.init_db()
        
        worker_instance = Worker(storage, worker_id)
        
        # 优雅退出的处理交给了 asyncio.run 外部的 except，这里专注于 run
        await worker_instance.run()

    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        typer.echo("\nWorker 已停止。" )

if __name__ == "__main__":
    app()
