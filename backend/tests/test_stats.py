"""Stats endpoints (stores, format, resale, ratings, DLC, top lists, hardware, totals, yearly, now playing)."""

from datetime import date, timedelta

import pytest


@pytest.fixture
def world(api):
    """Nintendo: Switch (300 €) + three games; PC: a game with DLC; one sold physical copy."""
    nintendo = api.category()
    pc = api.category("PC")
    switch = api.hardware(nintendo["id"], price=30000)
    api.patch(f"/categories/{nintendo['id']}", {"default_device_id": switch["id"]})
    gaming_pc = api.hardware(pc["id"], name="Gaming PC", price=100000)
    api.patch(f"/categories/{pc['id']}", {"default_device_id": gaming_pc["id"]})

    def game(category, name, price, hours, rating=None, buy_date="2024-03-01", **copy):
        body = {
            "category_id": category["id"],
            "kind": "game",
            "name": name,
            "first_copy": {"buy_date": buy_date, "buy_price_cents": price, **copy},
        }
        if rating is not None:
            body["rating"] = rating
        item = api.post("/items", body)
        if hours:
            api.post(f"/items/{item['id']}/hours", {"hours": hours})
            api.patch(f"/items/{item['id']}", {"status": "played"})
        return api.get(f"/items/{item['id']}")

    zelda = game(nintendo, "Zelda", 6000, 60, rating=5, store="MediaMarkt", format="physical", condition="new")
    mario = game(nintendo, "Mario", 5000, 5, rating=3, store="eShop", format="digital")
    kirby = game(nintendo, "Kirby", 4000, 0, store="Amazon", format="physical", condition="used")
    witcher = game(pc, "Witcher 3", 3000, 100, rating=4.5, buy_date="2023-06-01", store="Steam", format="digital")
    api.post(f"/items/{witcher['id']}/dlc", {"name": "Blood and Wine", "buy_date": "2024-06-01", "price_cents": 2000})
    api.post(f"/items/{witcher['id']}/dlc", {"name": "Hearts of Stone", "buy_date": "2023-07-01", "price_cents": 1000})
    api.patch(f"/items/{kirby['id']}/copies/{kirby['copies'][0]['id']}", {"sell_price_cents": 2000})
    return {
        "nintendo": nintendo,
        "pc": pc,
        "switch": switch,
        "gaming_pc": gaming_pc,
        "zelda": zelda,
        "mario": mario,
        "kirby": kirby,
        "witcher": witcher,
    }


def test_summary_and_categories(api, world):
    summary = api.get("/stats/summary", params={"category": world["nintendo"]["id"]})
    assert summary["hardware_cost_cents"] == 30000
    assert summary["games_cost_cents"] == 6000 + 5000 + 2000  # Kirby sold for 20 of 40 €
    assert summary["total_cost_cents"] == 43000
    assert summary["hours"] == 65
    assert summary["all_in_cost_per_hour_cents"] == round(43000 / 65)

    everything = api.get("/stats/summary")
    assert everything["total_cost_cents"] == 43000 + 100000 + 3000 + 3000
    assert everything["dlc_cost_cents"] == 3000

    by_category = {c["name"]: c["totals"] for c in api.get("/stats/categories")}
    assert set(by_category) == {"Nintendo", "PC", "Handhelds & Other Hardware"}
    assert by_category["Nintendo"] == summary
    assert by_category["Handhelds & Other Hardware"]["total_cost_cents"] == 0

    assert api.client.get("/api/v1/stats/summary", params={"category": 999}).status_code == 404


def test_yearly(api, world):
    years = {r["year"]: r for r in api.get("/stats/yearly")}
    assert years[2023]["spent_cents"] == 3000 + 1000  # Witcher + Hearts of Stone
    assert years[2024]["spent_cents"] == 6000 + 5000 + 2000 + 2000  # games (Kirby net) + Blood and Wine
    assert years[2024]["dlc_spent_cents"] == 2000
    assert years[2023]["hours"] == 100
    assert years[2023]["cost_per_hour_cents"] == 60  # 60 € incl. all DLC / 100 h
    assert years[2024]["games_bought"] == 3


def test_top_lists(api, world):
    cheapest = api.get("/stats/top", params={"metric": "cost_per_hour", "limit": 2})
    assert [g["name"] for g in cheapest] == ["Witcher 3", "Zelda"]
    priciest = api.get("/stats/top", params={"metric": "cost_per_hour", "order": "desc", "limit": 1})
    assert [g["name"] for g in priciest] == ["Mario"]
    almost = api.get("/stats/top", params={"metric": "hours_to_break_even"})
    assert [g["name"] for g in almost] == ["Kirby", "Mario"]  # 20 €/3 → 6.7 h; 50 €/3 − 5 h → 11.7 h
    hardware = api.get("/stats/top", params={"kind": "hardware", "metric": "hours", "order": "desc"})
    assert [h["name"] for h in hardware] == ["Gaming PC", "Switch"]


def test_hardware_stats(api, world):
    devices = api.get("/stats/hardware")
    assert [d["name"] for d in devices] == ["Gaming PC", "Switch"]
    switch = devices[1]["value"]
    assert switch["hours"] == 65
    assert switch["games_played_on"] == 2  # Kirby is linked (default device) but has 0 hours
    assert switch["cost_per_hour_cents"] == round(30000 / 65)


def test_stores_format_resale(api, world):
    stores = {s["store"]: s for s in api.get("/stats/stores")}
    # DLC without a store gets the store of the game's latest copy (Steam)
    assert stores["Steam"]["spent_cents"] == 3000 + 2000 + 1000
    assert stores["Steam"]["dlcs"] == 2
    assert stores["Steam"]["by_year_cents"] == {"2023": 4000, "2024": 2000}
    assert stores["Amazon"]["spent_cents"] == 2000
    assert stores["(no store)"]["spent_cents"] == 30000 + 100000  # consoles…
    assert stores["(no store)"]["by_year_cents"] == {}  # …which don't count in the yearly figures

    formats = {f["format"]: f for f in api.get("/stats/format")}
    assert formats["physical"]["copies"] == 2 and formats["digital"]["copies"] == 2
    assert formats["physical"]["received_cents"] == 2000
    assert formats["physical"]["average_net_cost_cents"] == (6000 + 2000) // 2
    assert formats["digital"]["share"] == 0.5

    resale = {r["group"]: r for r in api.get("/stats/resale")}
    assert set(resale) == {"all", "used"}
    assert resale["used"]["resale_rate"] == 0.5


def test_ratings_and_dlc(api, world):
    ratings = api.get("/stats/ratings")
    assert ratings["rated_games"] == 3
    assert ratings["distribution"]["5.0"] == 1 and ratings["distribution"]["4.5"] == 1
    assert ratings["average_rating"] == round((5 + 3 + 4.5) / 3, 2)
    points = {p["name"]: p for p in ratings["value_vs_fun"]}
    assert points["Witcher 3"] == {
        "item_id": world["witcher"]["id"],
        "name": "Witcher 3",
        "rating": 4.5,
        "cost_per_hour_cents": 60,
        "hours": 100.0,
    }

    dlc = api.get("/stats/dlc")
    assert dlc["total_cents"] == 3000 and dlc["count"] == 2
    assert dlc["by_year_cents"] == {"2023": 1000, "2024": 2000}
    assert dlc["top_games"][0]["name"] == "Witcher 3"


def test_now_playing(api, world):
    today = date.today()
    zelda, mario, kirby = world["zelda"], world["mario"], world["kirby"]
    api.patch(f"/items/{zelda['id']}", {"status": "playing", "started_on": (today - timedelta(days=10)).isoformat()})
    api.patch(f"/items/{mario['id']}", {"status": "playing", "last_played_on": (today - timedelta(days=3)).isoformat()})
    api.post(f"/items/{zelda['id']}/hours", {"hours": 1})  # played today → first
    api.patch(f"/items/{kirby['id']}", {"status": "on_hold"})

    result = api.get("/now-playing")
    assert [c["item"]["name"] for c in result["playing"]] == ["Zelda", "Mario"]
    zelda_card = result["playing"][0]
    assert zelda_card["days_since_start"] == 10
    assert zelda_card["break_even"] == {"hours": 61.0, "target_hours": 20.0, "hours_left": 0.0, "progress": 1.0}
    mario_card = result["playing"][1]
    assert mario_card["break_even"]["target_hours"] == round(5000 / 300, 1)
    assert mario_card["break_even"]["progress"] == round(5 / (5000 / 300), 3)
    assert [c["item"]["name"] for c in result["on_hold"]] == ["Kirby"]
    assert result["up_next"] == []


def test_up_next_oldest_backlog_first(api):
    pc = api.category("PC")
    for name, bought in [("New", "2025-01-01"), ("Old", "2020-01-01"), ("Middle", "2022-01-01")]:
        api.game(pc["id"], name=name, buy_date=bought)
    api.game(pc["id"], name="Wish", price=None)
    assert [g["name"] for g in api.get("/now-playing")["up_next"]] == ["Old", "Middle", "New"]
