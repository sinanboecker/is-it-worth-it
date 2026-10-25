from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from app import config
from app.db import create_tables, get_engine
from app.netguard import DEFAULT_NETWORKS, NetworkGuard, parse_networks
from app.routers import bundles, categories, items, metadata, settings, stats, transfer
from app.seed import seed


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_tables(get_engine())
    with Session(get_engine()) as session:
        seed(session)
    yield


app = FastAPI(
    title="Is It Worth It?",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(NetworkGuard, networks=parse_networks(config.ALLOWED_NETWORKS or DEFAULT_NETWORKS))

api = APIRouter(prefix="/api/v1")
api.include_router(categories.router)
api.include_router(items.router)
api.include_router(bundles.router)
api.include_router(settings.router)
api.include_router(transfer.router)
api.include_router(stats.router)
api.include_router(metadata.router)


@api.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


app.include_router(api)


def mount_frontend(frontend_dir) -> None:
    """Serve the built single-page app: static assets, and index.html for every other non-API path."""
    if not (frontend_dir / "index.html").is_file():
        return
    if (frontend_dir / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=frontend_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        file = (frontend_dir / path).resolve()
        if path and file.is_file() and file.is_relative_to(frontend_dir.resolve()):
            return FileResponse(file)
        return FileResponse(frontend_dir / "index.html")


mount_frontend(config.FRONTEND_DIR)
