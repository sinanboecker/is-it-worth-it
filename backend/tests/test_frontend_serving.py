import pytest
from fastapi.testclient import TestClient

from app import main
from tests.conftest import LAN_CLIENT


@pytest.fixture
def spa_client(engine, tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>app</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    routes = list(main.app.router.routes)
    # drop a real frontend build that may have been mounted at import time
    main.app.router.routes[:] = [r for r in routes if getattr(r, "path", "") not in ("/assets", "/{path:path}")]
    main.mount_frontend(dist)
    with TestClient(main.app, client=LAN_CLIENT) as client:
        yield client
    main.app.router.routes[:] = routes


def test_spa_routes(spa_client):
    assert spa_client.get("/").text == "<html>app</html>"
    assert spa_client.get("/items/12").text == "<html>app</html>"  # client-side route
    assert spa_client.get("/assets/app.js").text == "console.log(1)"
    assert spa_client.get("/favicon.svg").text == "<svg/>"
    assert spa_client.get("/api/v1/health").json() == {"status": "ok"}
    assert spa_client.get("/api/v1/nope").status_code == 404
    assert spa_client.get("/../../etc/passwd").text == "<html>app</html>"
