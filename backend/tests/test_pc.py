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
    for name, bought, until, price in [
        ("CPU", "2021-01-01", "2024-12-31", 30000),
        ("GPU", "2021-03-01", "2025-01-01", 70000),
    ]:
        api.post(
            "/pc/parts",
            {"name": name, "build_id": build["id"], "buy_date": bought, "used_until": until, "buy_price_cents": price},
        )
    api.post("/pc/parts", {"name": "Spare fan", "buy_date": "2022-01-01", "buy_price_cents": 1500})

    (build,) = api.get("/pc/builds")
    assert [p["name"] for p in build["parts"]] == ["CPU", "GPU"]
    assert build["buy_price_cents"] == 100000
    assert (build["first_bought_on"], build["used_until"], build["in_use"]) == ("2021-01-01", "2025-01-01", False)
    assert (build["hours"], build["cost_per_hour_cents"]) == (100, 1000)  # 1000 € / 100 h on the linked device

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


def test_sold_parts_leave_their_build(api):
    build = api.post("/pc/builds", {"name": "B"})
    part = {"name": "GPU", "build_id": build["id"], "buy_date": "2021-01-01", "buy_price_cents": 50000}
    gpu = api.post("/pc/parts", part)
    assert gpu["build_id"] == build["id"]

    sold = api.patch(f"/pc/parts/{gpu['id']}", {"sell_price_cents": 20000, "used_until": "2024-01-01"})
    assert (sold["build_id"], sold["build_name"]) == (None, None)
    assert api.get("/pc/builds")[0]["parts"] == []
    assert api.patch(f"/pc/parts/{gpu['id']}", {"build_id": build["id"]})["build_id"] is None  # can't go back

    assert api.post("/pc/parts", {**part, "sell_price_cents": 100})["build_id"] is None  # sold right away


def part_body(name, price=0, **fields):
    return {"name": name, "buy_date": "2024-01-01", "buy_price_cents": price, **fields}


def test_purchase_splits_its_price_across_its_parts(api):
    build = api.post("/pc/builds", {"name": "B"})
    purchase = api.post(
        "/pc/purchases",
        {
            "name": "Used PC",
            "buy_date": "2024-03-01",
            "total_price_cents": 40000,
            "split_mode": "proportional",
            "parts": [
                {"name": "GPU", "category": "gpu", "value_cents": 24000, "build_id": build["id"]},
                {"name": "CPU", "category": "cpu", "value_cents": 8000},
                {"name": "Case", "category": "case", "value_cents": 8000},
            ],
        },
    )
    gpu, cpu, case = purchase["parts"]
    assert [(p["name"], p["buy_price_cents"], p["buy_date"]) for p in purchase["parts"]] == [
        ("GPU", 24000, "2024-03-01"),
        ("CPU", 8000, "2024-03-01"),
        ("Case", 8000, "2024-03-01"),
    ]
    assert (gpu["build_id"], gpu["purchase_name"]) == (build["id"], "Used PC")
    assert (purchase["sold_cents"], purchase["left_cents"]) == (0, 40000)

    # price and date come from the purchase; other fields can change
    response = api.client.patch(f"/api/v1/pc/parts/{cpu['id']}", json={"buy_price_cents": 1})
    assert response.status_code == 422
    assert api.patch(f"/pc/parts/{cpu['id']}", {"name": "Ryzen", "buy_price_cents": 8000})["name"] == "Ryzen"
    api.patch(f"/pc/parts/{cpu['id']}", {"sell_price_cents": 9000, "used_until": "2025-01-01"})
    (purchase,) = api.get("/pc/purchases")
    assert (purchase["sold_parts"], purchase["sold_cents"], purchase["left_cents"]) == (1, 9000, 31000)

    # equal split, the case left out (it stays with its price), a new part added
    purchase = api.put(
        f"/pc/purchases/{purchase['id']}",
        {
            "name": "Used PC",
            "buy_date": "2024-03-01",
            "total_price_cents": 40000,
            "split_mode": "equal",
            "parts": [
                {"id": gpu["id"], "name": "GPU", "category": "gpu", "build_id": build["id"]},
                {"id": cpu["id"], "name": "Ryzen", "category": "cpu"},
                {"name": "RAM", "category": "memory"},
            ],
        },
    )
    assert [(p["name"], p["buy_price_cents"]) for p in purchase["parts"]] == [
        ("GPU", 13334),
        ("Ryzen", 13333),
        ("RAM", 13333),
    ]
    case = next(p for p in api.get("/pc/parts") if p["name"] == "Case")
    assert (case["purchase_id"], case["buy_price_cents"]) == (None, 8000)

    api.delete(f"/pc/parts/{purchase['parts'][2]['id']}")  # RAM: split again across the other two
    assert [p["buy_price_cents"] for p in api.get("/pc/purchases")[0]["parts"]] == [20000, 20000]

    api.delete(f"/pc/purchases/{purchase['id']}")
    assert api.get("/pc/purchases") == []
    parts = {p["name"]: p for p in api.get("/pc/parts")}
    assert (parts["GPU"]["purchase_id"], parts["GPU"]["buy_price_cents"]) == (None, 20000)  # parts stay


def test_purchase_errors(api):
    body = {"name": "PC", "buy_date": "2024-03-01", "total_price_cents": 1000, "split_mode": "manual"}
    rows = [{"name": "A", "buy_price_cents": 600}, {"name": "B", "buy_price_cents": 300}]
    response = api.client.post("/api/v1/pc/purchases", json={**body, "parts": rows})
    assert response.status_code == 422 and "left to assign" in response.json()["detail"]
    purchase = api.post("/pc/purchases", {**body, "parts": [rows[0], {"name": "B", "buy_price_cents": 400}]})
    other = {**body, "split_mode": "equal", "parts": [{"id": purchase["parts"][0]["id"], "name": "A"}]}
    response = api.client.post("/api/v1/pc/purchases", json=other)
    assert response.status_code == 422 and "bought together" in response.json()["detail"]


def test_sale_splits_its_price_and_takes_parts_out_of_builds(api):
    build = api.post("/pc/builds", {"name": "B"})
    gpu = api.post("/pc/parts", part_body("GPU", 30000, build_id=build["id"]))
    cpu = api.post("/pc/parts", part_body("CPU", 10000))
    fan = api.post("/pc/parts", part_body("Fan", 0, used_until="2024-06-01"))

    sale = api.post(
        "/pc/sales",
        {
            "name": "Kleinanzeigen",
            "sell_date": "2025-02-01",
            "total_price_cents": 20000,
            "parts": [{"id": gpu["id"]}, {"id": cpu["id"]}],
        },
    )
    assert [(p["name"], p["sell_price_cents"], p["used_until"], p["build_id"]) for p in sale["parts"]] == [
        ("GPU", 15000, "2025-02-01", None),  # by buy price: 30000 : 10000
        ("CPU", 5000, "2025-02-01", None),
    ]
    assert sale["parts"][0]["sale_name"] == "Kleinanzeigen"
    assert api.get("/pc/builds")[0]["parts"] == []
    response = api.client.patch(f"/api/v1/pc/parts/{gpu['id']}", json={"sell_price_cents": 1})
    assert response.status_code == 422

    # the fan is added (it was retired before: its used-until date stays), the CPU taken out
    sale = api.put(
        f"/pc/sales/{sale['id']}",
        {
            "sell_date": "2025-03-01",
            "total_price_cents": 20000,
            "split_mode": "equal",
            "parts": [{"id": gpu["id"]}, {"id": fan["id"]}],
        },
    )
    assert [(p["name"], p["sell_price_cents"], p["used_until"]) for p in sale["parts"]] == [
        ("GPU", 10000, "2025-03-01"),
        ("Fan", 10000, "2024-06-01"),
    ]
    assert sale["parts"][0]["sale_name"] == "sale of 01.03.2025"  # no name given this time
    cpu = next(p for p in api.get("/pc/parts") if p["name"] == "CPU")
    assert (cpu["sale_id"], cpu["sell_price_cents"], cpu["used_until"]) == (None, None, None)  # in use again

    api.delete(f"/pc/parts/{gpu['id']}")  # the fan gets the whole price
    assert [p["sell_price_cents"] for p in api.get(f"/pc/sales/{sale['id']}")["parts"]] == [20000]
    api.delete(f"/pc/sales/{sale['id']}")
    fan = next(p for p in api.get("/pc/parts") if p["name"] == "Fan")
    assert (fan["sale_id"], fan["sell_price_cents"], fan["used_until"]) == (None, None, "2024-06-01")


def test_sale_errors_and_free_parts(api):
    a = api.post("/pc/parts", part_body("A"))
    b = api.post("/pc/parts", part_body("B"))
    sale = api.post(
        "/pc/sales", {"sell_date": "2024-02-01", "total_price_cents": 1001, "parts": [{"id": a["id"]}, {"id": b["id"]}]}
    )
    assert [p["sell_price_cents"] for p in sale["parts"]] == [501, 500]  # bought for 0 €: split equally
    again = {"sell_date": "2024-02-01", "total_price_cents": 5, "parts": [{"id": a["id"]}]}
    response = api.client.post("/api/v1/pc/sales", json=again)
    assert response.status_code == 422 and "sold together" in response.json()["detail"]
    c = api.post("/pc/parts", part_body("C"))
    early = {"sell_date": "2023-01-01", "total_price_cents": 5, "parts": [{"id": c["id"]}]}
    response = api.client.post("/api/v1/pc/sales", json=early)
    assert response.status_code == 422 and "sold before it was bought" in response.json()["detail"]
    assert api.get("/pc/parts")[0]["sale_id"] is None  # nothing saved


def test_lists_load_parts_with_a_fixed_number_of_queries(api, engine):
    """A part's purchase and sale are loaded together with the parts, not one query per part."""
    from sqlalchemy import event

    build = api.post("/pc/builds", {"name": "B"})

    def add_parts(count):
        purchase = api.post(
            "/pc/purchases",
            {
                "name": "PC",
                "buy_date": "2024-01-01",
                "total_price_cents": 1000,
                "parts": [{"name": f"P{i}", "build_id": build["id"]} for i in range(count)],
            },
        )
        api.post(
            "/pc/sales",
            {"sell_date": "2024-02-01", "total_price_cents": 10, "parts": [{"id": purchase["parts"][0]["id"]}]},
        )

    def queries(url):
        statements = []
        listener = lambda *args: statements.append(args[2])  # noqa: E731
        event.listen(engine, "before_cursor_execute", listener)
        try:
            api.get(url)
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        return len(statements)

    add_parts(2)
    few = {url: queries(url) for url in ("/pc/builds", "/pc/parts", "/pc/purchases")}
    add_parts(6)
    assert {url: queries(url) for url in few} == few
