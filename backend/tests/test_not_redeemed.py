"""Bundle keys that were sold without playing are "not redeemed"."""

import pytest


@pytest.fixture
def keys(api):
    pc = api.category("PC")
    device = api.hardware(pc["id"], name="Gaming PC")
    bundle = api.post(
        "/bundles",
        {
            "name": "Humble Choice",
            "buy_date": "2025-01-01",
            "total_price_cents": 1200,
            "split_mode": "equal",
            "entries": [
                {"new_item": {"category_id": pc["id"], "kind": "game", "name": n}, "format": "digital"} for n in "AB"
            ],
        },
    )
    a, b = bundle["copies"]
    return {"pc": pc, "device": device, "bundle": bundle, "a": a, "b": b}


def status(api, copy):
    return api.get(f"/items/{copy['item_id']}")["status"]


def sell(api, copy, price):
    body = {"sell_price_cents": price, "sell_date": "2025-02-01" if price is not None else None}
    api.patch(f"/items/{copy['item_id']}/copies/{copy['copy_id']}", body)


def test_selling_a_key_makes_it_not_redeemed_and_undoing_brings_it_back(api, keys):
    a, b = keys["a"], keys["b"]
    sell(api, b, 300)
    assert (status(api, a), status(api, b)) == ("backlog", "not_redeemed")
    sell(api, b, None)  # the sale is undone
    assert status(api, b) == "backlog"


def test_a_played_or_finished_key_stays_as_it_is(api, keys):
    a, b = keys["a"], keys["b"]
    api.post(f"/items/{a['item_id']}/hours", {"hours": 2, "hardware_id": keys["device"]["id"]})
    sell(api, a, 300)
    assert status(api, a) == "backlog"  # played: not "not redeemed"
    sell(api, b, 300)
    assert status(api, b) == "not_redeemed"
    api.post(f"/items/{b['item_id']}/hours", {"hours": 1, "hardware_id": keys["device"]["id"]})  # redeemed after all
    assert status(api, b) == "backlog"


def test_bundle_sold_as_a_whole_and_imported_sold_keys(api, keys):
    api.patch(
        f"/bundles/{keys['bundle']['id']}",
        {"sold_as_bundle": True, "sell_total_cents": 1000, "sell_date": "2025-03-01"},
    )
    assert (status(api, keys["a"]), status(api, keys["b"])) == ("not_redeemed", "not_redeemed")

    sheet = "Choice;01.04.2025;8;3;;;\nKept;;;;;;\nSold key;;;3;;;Verkauft\n"
    response = api.client.post(
        "/api/v1/bundles/import/commit",
        files={"file": ("b.csv", sheet.encode(), "text/csv")},
        data={"category_id": keys["pc"]["id"]},
    )
    assert response.status_code == 200, response.text
    by_name = {g["name"]: g["status"] for g in api.get("/items", params={"kind": "game"})}
    assert (by_name["Kept"], by_name["Sold key"]) == ("backlog", "not_redeemed")


def test_the_status_can_be_set_by_hand(api, keys):
    game = api.game(keys["pc"]["id"], name="Physical game")  # not from a bundle
    assert api.patch(f"/items/{game['id']}", {"status": "not_redeemed"})["status"] == "not_redeemed"
    assert api.patch(f"/items/{game['id']}", {"notes": "x"})["status"] == "not_redeemed"  # stays


def test_not_redeemed_games_count_as_money_only(api, keys):
    b = keys["b"]  # A and B cost 6 € each
    sell(api, b, 900)  # sold for 9 €: a 3 € gain
    summary = api.get("/stats/summary")
    assert summary["games_count"] == 1
    assert "not_redeemed" not in summary["status_counts"]
    assert summary["games_cost_cents"] == 600 + 600 - 900  # the key's money counts
    assert summary["backlog_value_cents"] == 600  # only A
    (year,) = api.get("/stats/yearly")
    assert (year["games_bought"], year["spent_cents"]) == (1, 1200 - 900)

    assert [g["name"] for g in api.get("/stats/top", params={"metric": "gain", "order": "desc"})] == ["B"]
    assert "B" not in {g["name"] for g in api.get("/stats/top", params={"metric": "hours_to_break_even"})}
    assert [g["name"] for g in api.get("/items", params={"status": "backlog"})] == ["A"]
