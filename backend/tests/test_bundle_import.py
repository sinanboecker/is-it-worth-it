"""Bundle import (a block of rows per bundle) through the API."""

import pytest

SHEET = """name;date;price;sold;hours;finished;comment
Humble Choice January 2023;;7,25;5,80;;;
Doom Eternal;03.01.2023;;;11;✓;
Tribes of Midgard;03.01.2023;;1,80;;;Verkauft
Conan Chop Chop;03.01.2023;;1,00;;;Verkauft
Conan Chop Chop;03.01.2023;;0,75;;;Verkauft

Humble Choice November 2022;01.11.2022;7,25;14,60;;;

Humble Choice October 2022;;9,99;;;;
Doom Eternal;04.10.2022;;;;;
Maid of Sker;04.10.2022;;;2,5;;
"""


@pytest.fixture
def pc(api):
    category = api.category("PC")
    device = api.hardware(category["id"], name="Gaming PC")
    return {"category": category, "device": device}


def run(api, step, category_id, content: str, **form):
    return api.client.post(
        f"/api/v1/bundles/import/{step}",
        files={"file": ("bundles.csv", content.encode(), "text/csv")},
        data={"category_id": category_id, **form},
    )


def test_preview_plans_bundles_games_and_other_sales(api, pc):
    existing = api.game(pc["category"]["id"], name="Doom Eternal", price=1999, buy_date="2023-01-05")
    response = run(api, "preview", pc["category"]["id"], SHEET, hardware_id=pc["device"]["id"])
    assert response.status_code == 200, response.text
    preview = response.json()
    assert (preview["new_bundles"], preview["new_games"], preview["moved_copies"], preview["added_copies"]) == (
        3,
        3,
        1,
        2,
    )
    january, november, october = preview["bundles"]
    assert january["buy_date"] == "2023-01-03"
    assert january["other_sales_cents"] == 580 - 180 - 100 - 75  # sold for 5,80 €, 3,55 € of it on game rows
    doom, tribes, conan, conan_again = january["games"]
    assert (doom["action"], doom["existing_item_id"]) == ("move", existing["id"])
    assert [tribes["action"], conan["action"], conan_again["action"]] == ["new", "new", "add_copy"]
    assert november["games"] == [] and november["other_sales_cents"] == 1460
    assert "no games listed" in november["warnings"][0]
    assert october["games"][0]["action"] == "add_copy"  # Doom's only copy went into the January bundle
    assert preview["can_commit"]


def test_commit_creates_bundles_and_keeps_existing_hours(api, pc):
    existing = api.game(pc["category"]["id"], name="Doom Eternal", price=1999, buy_date="2023-01-05")
    response = run(api, "commit", pc["category"]["id"], SHEET, hardware_id=pc["device"]["id"], store="Humble Bundle")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "bundles_created": 3,
        "games_created": 3,
        "copies_moved": 1,
        "copies_added": 2,
        "skipped_bundles": 0,
    }

    bundles = {b["name"]: b for b in api.get("/bundles")}
    january = bundles["Humble Choice January 2023"]
    assert [c["buy_price_cents"] for c in january["copies"]] == [125] * 4  # 7,25 € − 2,25 € other sales
    assert january["sold_cents"] == 580 and january["value"]["net_cost_cents"] == 725 - 580
    assert bundles["Humble Choice November 2022"]["value"]["net_cost_cents"] == 725 - 1460

    doom = api.get(f"/items/{existing['id']}")
    assert len(doom["copies"]) == 2  # the moved one (now in January's bundle) and October's
    moved = next(c for c in doom["copies"] if c["bundle_id"] == january["id"])
    assert (moved["buy_price_cents"], moved["store"]) == (125, "Humble Bundle")
    assert doom["value"]["hours"] == 0  # an existing game keeps its own hours
    assert doom["status"] == "finished"  # ✓ and no completion yet

    (maid,) = api.get("/items", params={"q": "Maid of Sker"})
    assert (maid["value"]["hours"], maid["status"]) == (2.5, "played")
    (conan,) = api.get("/items", params={"q": "Conan"})
    assert conan["copies_summary"]["copies_count"] == 2 and conan["copies_summary"]["sold"]

    again = run(api, "preview", pc["category"]["id"], SHEET, hardware_id=pc["device"]["id"]).json()
    assert (again["skipped_bundles"], again["new_bundles"]) == (3, 0)


def test_errors_block_the_commit(api, pc):
    sheet = "Bundle without price;01.01.2024;;;;;\nA game;;;;3;;\n\nNo date;;5;;;;\nB game;;;;;;\n"
    preview = run(api, "preview", pc["category"]["id"], sheet).json()
    first, second = preview["bundles"]
    assert first["errors"] == ["the bundle price is missing", "line 2: choose a device for the hours"]
    assert second["errors"] == ["no buy date: put one on the bundle row or the game rows"]
    assert not preview["can_commit"]
    response = run(api, "commit", pc["category"]["id"], sheet)
    assert response.status_code == 422
    assert api.get("/bundles") == []


def test_games_sold_for_more_than_the_bundle_total_is_an_error(api, pc):
    sheet = "B;01.01.2024;5;2;;;\nA;;;3;;;\n"
    (bundle,) = run(api, "preview", pc["category"]["id"], sheet).json()["bundles"]
    assert bundle["errors"] == ["the games were sold for more than the bundle's 'sold for'"]


def test_no_bundle_import_into_hardware_only_category(api):
    response = run(api, "preview", api.handhelds_id(), SHEET)
    assert response.status_code == 422
