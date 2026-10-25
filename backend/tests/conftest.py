import warnings
from collections.abc import Iterator

import pytest
from sqlmodel import Session, SQLModel

with warnings.catch_warnings():
    # Starlette asks for "httpx2"; plain httpx works fine for the test client.
    warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient`")
    from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.models import Category, CategoryType
from app.seed import HANDHELDS_CATEGORY

# Source address of test requests: inside the default allowed networks (see app/netguard.py).
LAN_CLIENT = ("192.168.178.20", 50000)


@pytest.fixture
def engine(tmp_path, monkeypatch):
    engine = db.make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setattr(db, "engine", engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine) -> Iterator[Session]:
    """Plain session on a fresh schema, for unit tests of the logic modules."""
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def client(engine) -> Iterator[TestClient]:
    """API client; startup runs the real migrations and seeding."""
    with TestClient(app, client=LAN_CLIENT) as client:
        yield client


class Api:
    """Small helpers to build test data through the API."""

    def __init__(self, client: TestClient):
        self.client = client

    def ok(self, response, status=(200, 201)):
        assert response.status_code in ((status,) if isinstance(status, int) else status), response.text
        return response.json() if response.content else None

    def get(self, url, **kw):
        return self.ok(self.client.get(f"/api/v1{url}", **kw))

    def post(self, url, json=None):
        return self.ok(self.client.post(f"/api/v1{url}", json=json))

    def patch(self, url, json):
        return self.ok(self.client.patch(f"/api/v1{url}", json=json))

    def put(self, url, json):
        return self.ok(self.client.put(f"/api/v1{url}", json=json))

    def delete(self, url):
        return self.ok(self.client.delete(f"/api/v1{url}"), (200, 204))

    def category(self, name="Nintendo", **fields):
        return self.post("/categories", {"name": name, **fields})

    def handhelds_id(self):
        return next(c["id"] for c in self.get("/categories") if c["name"] == HANDHELDS_CATEGORY)

    def hardware(self, category_id, name="Switch", price=30000, buy_date="2022-01-01"):
        return self.post(
            "/items",
            {
                "category_id": category_id,
                "kind": "hardware",
                "name": name,
                "first_copy": {"buy_date": buy_date, "buy_price_cents": price},
            },
        )

    def game(self, category_id, name="Zelda", price=6000, buy_date="2023-01-01", **fields):
        body = {"category_id": category_id, "kind": "game", "name": name, **fields}
        if price is not None:
            body["first_copy"] = {"buy_date": buy_date, "buy_price_cents": price}
        return self.post("/items", body)


@pytest.fixture
def api(client) -> Api:
    return Api(client)


@pytest.fixture
def handhelds(session) -> Category:
    category = Category(name=HANDHELDS_CATEGORY, type=CategoryType.hardware_only)
    session.add(category)
    session.commit()
    return category
