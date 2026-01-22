import typer
import uvicorn
import asyncio
from pathlib import Path

app = typer.Typer(help="TaskHub: 一个可靠的单机任务运行平台。")

@app.command()
def api(
    host: str = "127.0.0.1",
    port: int = 8000,
    config: Path = typer.Option(Path("config.yaml"), help="配置文件路径")
):
    """启动 TaskHub API 服务器。"""
    typer.echo(f"正在启动 API 服务器：{host}:{port}，使用配置：{config}")
    # TODO: 加载配置并传递给 FastAPI
    uvicorn.run("taskhub_api.api:api_app", host=host, port=port, reload=True)

@app.command()
def worker(
    config: Path = typer.Option(Path("config.yaml"), help="配置文件路径")
):
    """启动 TaskHub Worker 进程。"""
    typer.echo(f"正在启动 Worker，使用配置：{config}")
    
    async def run_worker():
        # TODO: 初始化数据库和共享状态
        # TODO: 启动 Worker 主循环
        while True:
            typer.echo("Worker 心跳检测中...")
            await asyncio.sleep(10)

    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        typer.echo("Worker 已被用户停止。")

if __name__ == "__main__":
    app()