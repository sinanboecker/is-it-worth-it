"""API flows through the real app (migrations + seeding on startup)."""

from datetime import date


def test_health_and_seed(api):
    assert api.get("/health") == {"status": "ok"}
    (category,) = api.get("/categories")
    assert category["type"] == "hardware_only"
    assert api.get("/settings") == {"break_even_cph": 300, "bundle_split_mode": "proportional", "ggdeals_region": "de"}


def test_settings_update(api):
    assert api.put("/settings", {"break_even_cph": 250, "bundle_split_mode": "equal"})["break_even_cph"] == 250
    assert api.get("/settings")["bundle_split_mode"] == "equal"
    assert api.client.put("/api/v1/settings", json={"break_even_cph": 0}).status_code == 422


# --- categories -------------------------------------------------------------------------------


def test_category_rules(api):
    nintendo = api.category()
    assert api.client.post("/api/v1/categories", json={"name": "Nintendo"}).status_code == 409
    game = api.game(nintendo["id"])
    # can't delete a category with items, can't make it hardware-only while it has games
    assert api.client.delete(f"/api/v1/categories/{nintendo['id']}").status_code == 409
    assert api.client.patch(f"/api/v1/categories/{nintendo['id']}", json={"type": "hardware_only"}).status_code == 422
    # default device must be hardware
    assert (
        api.client.patch(f"/api/v1/categories/{nintendo['id']}", json={"default_device_id": game["id"]}).status_code
        == 422
    )
    # no games in the handhelds category
    response = api.client.post("/api/v1/items", json={"category_id": api.handhelds_id(), "kind": "game", "name": "X"})
    assert response.status_code == 422


# --- items & copies ---------------------------------------------------------------------------


def test_category_icon(api):
    plain = api.category("PC")
    assert plain["icon"] is None  # shown as the folder
    ps = api.category("Konsole", icon="playstation")
    assert ps["icon"] == "playstation"
    assert api.patch(f"/categories/{ps['id']}", {"icon": "xbox"})["icon"] == "xbox"
    assert api.patch(f"/categories/{ps['id']}", {"name": "Xbox"})["icon"] == "xbox"  # untouched when not sent
    assert api.patch(f"/categories/{ps['id']}", {"icon": None})["icon"] is None
    assert api.client.patch(f"/api/v1/categories/{ps['id']}", json={"icon": "toaster"}).status_code == 422


def test_new_game_links_category_default_device(api):
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    api.patch(f"/categories/{nintendo['id']}", {"default_device_id": switch["id"]})
    game = api.game(nintendo["id"])
    assert [d["hardware_id"] for d in game["devices"]] == [switch["id"]]
    assert game["status"] == "backlog"


def test_wishlist_game_and_bought_it(api):
    nintendo = api.category()
    wish = api.game(nintendo["id"], price=None, target_price_cents=3000)
    assert wish["status"] == "wishlist"
    assert wish["value"] is None
    assert not wish["copies_summary"]["owned"] and not wish["copies_summary"]["sold"]
    # can't rate or finish a wishlist game, or set it to backlog without a copy
    assert api.client.patch(f"/api/v1/items/{wish['id']}", json={"rating": 4}).status_code == 422
    assert api.client.patch(f"/api/v1/items/{wish['id']}", json={"status": "backlog"}).status_code == 422

    bought = api.post(
        f"/items/{wish['id']}/copies", {"buy_date": "2026-10-01", "buy_price_cents": 2999, "format": "digital"}
    )
    assert bought["status"] == "backlog"
    assert bought["value"]["net_cost_cents"] == 2999


def test_copies_sold_logic(api):
    nintendo = api.category()
    game = api.game(nintendo["id"], price=6000, buy_date="2019-03-01")
    copy_a = game["copies"][0]["id"]
    game = api.post(
        f"/items/{game['id']}/copies", {"buy_date": "2024-03-01", "buy_price_cents": 2000, "format": "digital"}
    )
    copy_b = game["copies"][1]["id"]

    game = api.patch(f"/items/{game['id']}/copies/{copy_a}", {"sell_price_cents": 3000})
    sold_copy = game["copies"][0]
    assert sold_copy["is_sold"] and sold_copy["sell_date"] == date.today().isoformat()
    assert game["copies_summary"] == {
        **game["copies_summary"],
        "copies_count": 2,
        "sold_copies": 1,
        "sold": False,
        "owned": True,
    }
    assert game["value"]["net_cost_cents"] == 5000

    game = api.patch(f"/items/{game['id']}/copies/{copy_b}", {"sell_price_cents": 0, "sell_date": "2025-01-01"})
    assert game["copies_summary"]["sold"] and not game["copies_summary"]["owned"]

    # un-selling clears the sell date
    game = api.patch(f"/items/{game['id']}/copies/{copy_b}", {"sell_price_cents": None})
    assert game["copies"][1]["sell_date"] is None and not game["copies_summary"]["sold"]


def test_copy_validation(api):
    nintendo = api.category()
    game = api.game(nintendo["id"])
    url = f"/api/v1/items/{game['id']}/copies"
    assert (
        api.client.post(
            url, json={"buy_date": "2024-01-01", "buy_price_cents": 1, "format": "digital", "condition": "new"}
        ).status_code
        == 422
    )
    assert (
        api.client.post(
            url, json={"buy_date": "2024-01-01", "buy_price_cents": 1, "sell_date": "2024-02-01"}
        ).status_code
        == 422
    )
    assert api.client.post(url, json={"buy_date": "2024-01-01", "buy_price_cents": -1}).status_code == 422
    # hardware copies are always physical
    switch = api.hardware(nintendo["id"])
    hw = api.post(
        f"/items/{switch['id']}/copies", {"buy_date": "2024-01-01", "buy_price_cents": 6000, "format": "digital"}
    )
    assert {c["format"] for c in hw["copies"]} == {"physical"}


def test_list_filters_and_sort(api):
    nintendo = api.category()
    pc = api.category("PC")
    api.game(nintendo["id"], name="Alpha", price=1000, buy_date="2022-05-01")
    api.game(nintendo["id"], name="Beta", price=None)
    api.game(pc["id"], name="Gamma", price=500, buy_date="2023-05-01")

    names = lambda **params: [i["name"] for i in api.get("/items", params=params)]  # noqa: E731
    assert names(category=nintendo["id"]) == ["Alpha", "Beta"]
    assert names(status="wishlist") == ["Beta"]
    assert names(year=2023) == ["Gamma"]
    assert names(owned=True, sort="-name") == ["Gamma", "Alpha"]
    assert names(q="amm") == ["Gamma"]
    assert api.client.get("/api/v1/items", params={"sort": "nope"}).status_code == 422


# --- devices & hours --------------------------------------------------------------------------


def test_hours_per_device_and_total(api):
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    brick = api.hardware(api.handhelds_id(), name="Trimui Brick", price=6000)
    game = api.game(nintendo["id"])

    game = api.put(
        f"/items/{game['id']}/play-links",
        [{"hardware_id": switch["id"], "hours": 10}, {"hardware_id": brick["id"], "hours": 2.5}],
    )
    devices = {d["hardware_name"]: d for d in game["devices"]}
    assert devices["Trimui Brick"]["emulated"] is True  # handheld category → emulated by default
    assert devices["Switch"]["emulated"] is False
    assert game["value"]["hours"] == 12.5

    result = api.post(f"/items/{game['id']}/hours", {"hours": 1.5, "hardware_id": brick["id"]})
    assert result["suggested_status"] == "playing"  # was backlog
    assert result["item"]["value"]["hours"] == 14.0
    assert result["item"]["last_played_on"] == date.today().isoformat()

    # without a device: the one used last
    result = api.post(f"/items/{game['id']}/hours", {"hours": 1})
    assert {d["hardware_name"]: d["hours"] for d in result["item"]["devices"]}["Trimui Brick"] == 5.0

    brick_detail = api.get(f"/items/{brick['id']}")
    assert brick_detail["value"]["hours"] == 5.0
    assert brick_detail["value"]["emulated_games"] == 1
    assert brick_detail["played_games"][0]["hardware_name"] == "Zelda"

    # a device with games can't be deleted
    assert api.client.delete(f"/api/v1/items/{brick['id']}").status_code == 409


def test_hours_validation(api):
    nintendo = api.category()
    game = api.game(nintendo["id"])
    assert api.client.post(f"/api/v1/items/{game['id']}/hours", json={"hours": 1}).status_code == 422  # no device
    assert api.client.post(f"/api/v1/items/{game['id']}/hours", json={"hours": 0}).status_code == 422
    assert (
        api.client.put(f"/api/v1/items/{game['id']}/play-links", json=[{"hardware_id": game["id"]}]).status_code == 422
    )
    switch = api.hardware(nintendo["id"])
    twice = [{"hardware_id": switch["id"]}, {"hardware_id": switch["id"]}]
    assert api.client.put(f"/api/v1/items/{game['id']}/play-links", json=twice).status_code == 422


# --- DLC & completions ------------------------------------------------------------------------


def test_dlc_adds_to_game_cost(api):
    nintendo = api.category()
    game = api.game(nintendo["id"], price=4000)
    game = api.post(
        f"/items/{game['id']}/dlc", {"name": "Expansion Pass", "buy_date": "2024-01-01", "price_cents": 2000}
    )
    assert game["value"]["total_paid_cents"] == 6000
    dlc_id = game["dlcs"][0]["id"]
    game = api.patch(f"/items/{game['id']}/dlc/{dlc_id}", {"price_cents": 1500})
    assert game["value"]["dlc_cost_cents"] == 1500
    game = api.delete(f"/items/{game['id']}/dlc/{dlc_id}")
    assert game["value"]["dlc_cost_cents"] == 0


def test_completions_and_status(api):
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    game = api.game(nintendo["id"])
    game = api.patch(f"/items/{game['id']}", {"status": "playing"})
    assert game["started_on"] == date.today().isoformat()

    game = api.post(
        f"/items/{game['id']}/completions",
        {"finished_on": "2026-10-01", "hardware_id": switch["id"], "review": "Great"},
    )
    assert game["status"] == "finished"
    (completion,) = game["completions"]
    assert "rating" not in completion  # ratings belong to the game
    assert completion["review"] == "Great"
    assert completion["hardware_name"] == "Switch"
    assert completion["started_on"] == date.today().isoformat()
    assert game["started_on"] is None
    assert game["value"]["times_finished"] == 1

    assert api.patch(f"/items/{game['id']}", {"rating": 4.5})["rating"] == 4.5
    assert api.client.patch(f"/api/v1/items/{game['id']}", json={"rating": 4.3}).status_code == 422

    game = api.delete(f"/items/{game['id']}/completions/{completion['id']}")
    assert game["status"] == "played"


def test_finished_status_creates_completion(api):
    nintendo = api.category()
    game = api.game(nintendo["id"])
    game = api.patch(f"/items/{game['id']}", {"status": "finished", "finished_on": "2026-05-05"})
    assert [c["finished_on"] for c in game["completions"]] == ["2026-05-05"]


def test_hardware_has_no_status_or_rating(api):
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    assert switch["status"] is None
    assert api.client.patch(f"/api/v1/items/{switch['id']}", json={"rating": 3}).status_code == 422
    assert (
        api.client.post(f"/api/v1/items/{switch['id']}/completions", json={"finished_on": "2026-01-01"}).status_code
        == 422
    )


# --- bundles ----------------------------------------------------------------------------------


def test_bundle_flow(api):
    playstation = api.category("PlayStation")
    existing_wish = api.game(playstation["id"], name="Astro Bot", price=None)
    bundle = api.post(
        "/bundles",
        {
            "name": "PS5 Slim + Astro Bot",
            "buy_date": "2024-11-29",
            "total_price_cents": 44900,
            "store": "Amazon",
            "entries": [
                {
                    "new_item": {"category_id": playstation["id"], "kind": "hardware", "name": "PS5 Slim"},
                    "reference_price_cents": 49900,
                },
                {
                    "item_id": existing_wish["id"],
                    "reference_price_cents": 5900,
                    "format": "physical",
                    "condition": "new",
                },
            ],
        },
    )
    assert bundle["split_mode"] == "proportional"  # default from settings
    assert [c["buy_price_cents"] for c in bundle["copies"]] == [40153, 4747]

    astro = api.get(f"/items/{existing_wish['id']}")
    assert astro["status"] == "backlog"  # wishlist → bought via the bundle
    assert astro["copies"][0]["store"] == "Amazon"
    assert astro["copies_summary"]["in_bundle"]

    # bundle copies: buy price is controlled by the bundle
    copy_id = astro["copies"][0]["id"]
    response = api.client.patch(f"/api/v1/items/{astro['id']}/copies/{copy_id}", json={"buy_price_cents": 1})
    assert response.status_code == 422

    # switch to equal split, then sell as a whole
    bundle = api.patch(f"/bundles/{bundle['id']}", {"split_mode": "equal"})
    assert [c["buy_price_cents"] for c in bundle["copies"]] == [22450, 22450]
    bundle = api.patch(
        f"/bundles/{bundle['id']}", {"sold_as_bundle": True, "sell_total_cents": 30001, "sell_date": "2026-01-01"}
    )
    assert [c["sell_price_cents"] for c in bundle["copies"]] == [15001, 15000]
    assert api.get(f"/items/{astro['id']}")["copies_summary"]["sold"]

    # undoing the sale clears the copies' sell prices
    bundle = api.patch(f"/bundles/{bundle['id']}", {"sold_as_bundle": False})
    assert {c["sell_price_cents"] for c in bundle["copies"]} == {None}

    # manual split must add up
    response = api.client.patch(
        f"/api/v1/bundles/{bundle['id']}",
        json={"split_mode": "manual", "manual_shares": {str(bundle["copies"][0]["copy_id"]): 40000}},
    )
    assert response.status_code == 422
    assert "left to assign" in response.json()["detail"]


def test_bundle_uses_default_split_mode_from_settings(api):
    api.put("/settings", {"bundle_split_mode": "equal"})
    pc = api.category("PC")
    bundle = api.post(
        "/bundles",
        {
            "name": "Humble Bundle",
            "buy_date": "2025-01-01",
            "total_price_cents": 1000,
            "entries": [
                {"new_item": {"category_id": pc["id"], "kind": "game", "name": n}, "format": "digital"} for n in "ABC"
            ],
        },
    )
    assert bundle["split_mode"] == "equal"
    assert [c["buy_price_cents"] for c in bundle["copies"]] == [334, 333, 333]


def test_bundle_entries_and_delete(api):
    pc = api.category("PC")
    entry = lambda name: {"new_item": {"category_id": pc["id"], "kind": "game", "name": name}, "format": "digital"}  # noqa: E731
    bundle = api.post(
        "/bundles",
        {
            "name": "B",
            "buy_date": "2025-01-01",
            "total_price_cents": 900,
            "split_mode": "equal",
            "entries": [entry("A")],
        },
    )
    bundle = api.post(f"/bundles/{bundle['id']}/entries", entry("B"))
    assert [c["buy_price_cents"] for c in bundle["copies"]] == [450, 450]

    game_a = bundle["copies"][0]["item_id"]
    assert api.client.delete(f"/api/v1/items/{game_a}").status_code == 409  # copy in a bundle

    bundle = api.delete(f"/bundles/{bundle['id']}/copies/{bundle['copies'][1]['copy_id']}")
    assert [c["buy_price_cents"] for c in bundle["copies"]] == [900]
    assert (
        api.client.delete(f"/api/v1/bundles/{bundle['id']}/copies/{bundle['copies'][0]['copy_id']}").status_code == 409
    )

    api.delete(f"/bundles/{bundle['id']}")
    assert api.get(f"/items/{game_a}")["copies"] == []


def test_preview_split(api):
    result = api.post(
        "/bundles/preview-split",
        {"total_price_cents": 44900, "split_mode": "proportional", "reference_prices": [49900, 5900]},
    )
    assert result == {"shares_cents": [40153, 4747]}


def test_stores_autocomplete(api):
    nintendo = api.category()
    game = api.game(nintendo["id"])
    api.post(
        f"/items/{game['id']}/copies",
        {"buy_date": "2024-01-01", "buy_price_cents": 100, "store": "eShop", "format": "digital"},
    )
    api.post(f"/items/{game['id']}/dlc", {"name": "D", "buy_date": "2024-01-01", "price_cents": 100, "store": "amazon"})
    assert api.get("/stores") == ["amazon", "eShop"]


def test_hours_on_finished_game_keep_it_finished(api):
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    game = api.game(nintendo["id"])
    api.post(f"/items/{game['id']}/completions", {"finished_on": "2026-01-01", "hardware_id": switch["id"]})
    result = api.post(f"/items/{game['id']}/hours", {"hours": 3, "hardware_id": switch["id"]})
    assert result["item"]["status"] == "finished"
    assert result["suggested_status"] is None


def test_wishlist_game_gets_default_device_when_bought(api):
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    api.patch(f"/categories/{nintendo['id']}", {"default_device_id": switch["id"]})
    wish = api.game(nintendo["id"], price=None)
    assert wish["devices"] == []
    bought = api.post(f"/items/{wish['id']}/copies", {"buy_date": "2026-01-01", "buy_price_cents": 100})
    assert [d["hardware_id"] for d in bought["devices"]] == [switch["id"]]
    again = api.post(f"/items/{wish['id']}/copies", {"buy_date": "2026-02-01", "buy_price_cents": 100})
    assert len(again["devices"]) == 1


def test_favorites(api):
    nintendo = api.category()
    zelda = api.game(nintendo["id"], name="Zelda")
    api.game(nintendo["id"], name="Mario")
    assert zelda["favorite"] is False
    assert api.patch(f"/items/{zelda['id']}", {"favorite": True})["favorite"] is True
    assert [g["name"] for g in api.get("/items", params={"favorite": True})] == ["Zelda"]
    assert api.patch(f"/items/{zelda['id']}", {"name": "Zelda TotK"})["favorite"] is True  # untouched by other edits
    assert api.patch(f"/items/{zelda['id']}", {"favorite": False})["favorite"] is False
    switch = api.hardware(nintendo["id"])
    assert api.client.patch(f"/api/v1/items/{switch['id']}", json={"favorite": True}).status_code == 422
