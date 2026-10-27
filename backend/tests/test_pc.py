"""PC builds and parts."""

from datetime import date

import pytest

from app.routers.deps import today


@pytest.fixture
def fixed_today(client):
    client.app.dependency_overrides[today] = lambda: date(2026, 10, 27)
    yield
    client.app.dependency_overrides.pop(today, None)


def test_part_usage_and_cost_per_day(api, fixed_today):
    gpu = api.post(
        "/pc/parts",
        {"name": "RTX 3080", "buy_date": "2021-01-01", "used_until": "2023-01-01", "buy_price_cents": 80000,
         "sell_price_cents": 43000},
    )  # fmt: skip
    assert (gpu["used_days"], gpu["used_years"], gpu["in_use"]) == (730, 2.0, False)
    assert (gpu["net_cost_cents"], gpu["cost_per_day_cents"]) == (37000, 51)  # 370 € / 730 days

    assert gpu["category"] == "other"  # when none is given
    ssd = api.post(
        "/pc/parts", {"name": "SSD", "category": "storage", "buy_date": "2026-10-17", "buy_price_cents": 10000}
    )
    assert (ssd["used_days"], ssd["in_use"], ssd["cost_per_day_cents"]) == (10, True, 1000)  # in use until today
    assert ssd["category"] == "storage"
    assert api.patch(f"/pc/parts/{ssd['id']}", {"category": "cooling"})["category"] == "cooling"
    bad = {"name": "X", "category": "monitor", "buy_date": "2024-01-01", "buy_price_cents": 1}
    assert api.client.post("/api/v1/pc/parts", json=bad).status_code == 422

    same_day = api.post("/pc/parts", {"name": "Cable", "buy_date": "2026-10-27", "buy_price_cents": 500})
    assert same_day["cost_per_day_cents"] is None

    response = api.client.post(
        "/api/v1/pc/parts",
        json={"name": "X", "buy_date": "2024-01-02", "used_until": "2024-01-01", "buy_price_cents": 1},
    )
    assert response.status_code == 422


def test_build_totals_device_hours_and_deleting(api, fixed_today):
    category = api.category("PC")
    device = api.hardware(category["id"], name="Gaming PC", price=0)
    game = api.game(category["id"], name="Hades", price=2000)
    api.post(f"/items/{game['id']}/hours", {"hours": 100, "hardware_id": device["id"]})

    build = api.post("/pc/builds", {"name": "2021 build", "hardware_id": device["id"]})
    assert (build["parts"], build["in_use"], build["hardware_name"]) == ([], True, "Gaming PC")
    for name, bought, until, price, sold in [
        ("CPU", "2021-01-01", "2024-12-31", 30000, 10000),
        ("GPU", "2021-03-01", "2025-01-01", 70000, 30000),
    ]:
        api.post(
            "/pc/parts",
            {"name": name, "build_id": build["id"], "buy_date": bought, "used_until": until, "buy_price_cents": price,
             "sell_price_cents": sold},
        )  # fmt: skip
    api.post("/pc/parts", {"name": "Spare fan", "buy_date": "2022-01-01", "buy_price_cents": 1500})

    (build,) = api.get("/pc/builds")
    assert [p["name"] for p in build["parts"]] == ["CPU", "GPU"]
    assert (build["buy_price_cents"], build["sell_price_cents"], build["net_cost_cents"]) == (100000, 40000, 60000)
    assert (build["first_bought_on"], build["used_until"], build["in_use"]) == ("2021-01-01", "2025-01-01", False)
    assert (build["used_days"], build["cost_per_day_cents"]) == (1461, 41)  # 600 € / 1461 days
    assert (build["hours"], build["cost_per_hour_cents"]) == (100, 600)  # 600 € / 100 h on the linked device

    parts = api.get("/pc/parts")
    assert [(p["name"], p["build_name"]) for p in parts] == [
        ("Spare fan", None),
        ("GPU", "2021 build"),
        ("CPU", "2021 build"),
    ]

    gpu = next(p for p in parts if p["name"] == "GPU")
    assert api.patch(f"/pc/parts/{gpu['id']}", {"build_id": None})["build_id"] is None
    assert api.patch(f"/pc/builds/{build['id']}", {"hardware_id": None})["hours"] is None

    api.delete(f"/pc/builds/{build['id']}")
    assert api.get("/pc/builds") == []
    assert {p["name"] for p in api.get("/pc/parts")} == {"CPU", "GPU", "Spare fan"}  # parts stay
    api.delete(f"/pc/parts/{gpu['id']}")
    assert len(api.get("/pc/parts")) == 2


def test_unknown_build_or_device(api):
    assert api.client.post("/api/v1/pc/builds", json={"name": "B", "hardware_id": 999}).status_code == 422
    part = {"name": "P", "build_id": 999, "buy_date": "2024-01-01", "buy_price_cents": 1}
    assert api.client.post("/api/v1/pc/parts", json=part).status_code == 404
