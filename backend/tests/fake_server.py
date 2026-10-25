"""The fake RAWG / Steam / image services as a real HTTP server, for the browser (Playwright) tests.

    python -m uvicorn tests.fake_server:app --port 8811

Backend env:
    RAWG_BASE_URL=http://localhost:8811/rawg/api STEAM_STORE_URL=http://localhost:8811/steam RAWG_API_KEY=test-key
"""

import os

import httpx
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from tests.fake_services import IMAGES, RAWG, STEAM, FakeServices

BASE = os.environ.get("FAKE_BASE", "http://localhost:8811")
services = FakeServices(images_base=f"{BASE}/images")
TARGETS = {"rawg/api": RAWG, "steam": STEAM, "images": IMAGES}


async def proxy(request: Request) -> Response:
    prefix, _, rest = request.url.path.lstrip("/").partition("/")
    if prefix == "rawg":
        prefix, _, rest = "rawg/api", None, request.url.path.removeprefix("/rawg/api/")
    target = TARGETS.get(prefix)
    if target is None:
        return Response(status_code=404)
    url = f"{target}/{rest}" + (f"?{request.url.query}" if request.url.query else "")
    result = services(httpx.Request("GET", url))
    return Response(result.content, status_code=result.status_code, media_type=result.headers.get("content-type"))


app = Starlette(routes=[Route("/{path:path}", proxy)])
