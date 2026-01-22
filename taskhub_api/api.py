from fastapi import FastAPI

api_app = FastAPI(title="TaskHub API", version="0.1.0")

@api_app.get("/health")
async def health():
    """健康检查接口"""
    return {"status": "ok", "version": "0.1.0", "message": "服务运行正常"}