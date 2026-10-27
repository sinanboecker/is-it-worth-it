"""CSV import through the API, with a sheet export (made-up games) in tests/fixtures/test_pc.csv."""

import csv
import io
import json
from pathlib import Path

import pytest

from app.parsing import parse_hours, parse_money

FIXTURE = Path(__file__).parent / "fixtures" / "test_pc.csv"


@pytest.fixture
def pc(api):
    category = api.category("PC")
    device = api.hardware(category["id"], name="Gaming PC", price=150000)
    return {"category": category, "device": device}


def preview(api, category_id, content: bytes, **form):
    if "mapping" in form:
        form["mapping"] = json.dumps(form["mapping"])
    response = api.client.post(
        f"/api/v1/categories/{category_id}/import-csv/preview",
        files={"file": ("games.csv", content, "text/csv")},
        data=form,
    )
    return response


def ok_preview(api, category_id, content: bytes, **form):
    response = preview(api, category_id, content, **form)
    assert response.status_code == 200, response.text
    return response.json()


def commit(api, category_id, rows):
    return api.client.post(f"/api/v1/categories/{category_id}/import-csv/commit", json={"rows": rows})


def test_real_sheet_numbers_match_spreadsheet(api, pc):
    """Every imported game's cost per hour equals the sheet's own 'Stundenpreis' column."""
    content = FIXTURE.read_bytes()
    result = ok_preview(api, pc["category"]["id"], content, hardware_id=pc["device"]["id"], default_store="Steam")
    assert result["delimiter"] == ";"
    assert result["mapping"]["name"] == "Spiel" and result["mapping"]["finished"] == "Durchgespielt"
    assert result["ignored_columns"] == ["Stundenpreis"]
    assert result["can_commit"]
    totals = result["totals"]
    assert (totals["create"], totals["with_errors"]) == (24, 0)

    imported = commit(api, pc["category"]["id"], result["rows"])
    assert imported.status_code == 200, imported.text
    assert imported.json()["games_created"] == 24

    sheet = list(csv.DictReader(io.StringIO(content.decode()), delimiter=";"))
    games = {g["name"]: g for g in api.get("/items", params={"category": pc["category"]["id"], "kind": "game"})}
    assert len(games) == len(sheet)
    for line in sheet:
        game = games[line["Spiel"].strip()]
        price = parse_money(line["Preis"])
        hours = parse_hours(line["Spielzeit"])
        assert game["value"]["net_cost_cents"] == price
        assert game["value"]["hours"] == hours
        assert game["copies_summary"]["stores"] == ["Steam"]
        expected_cph = parse_money(line["Stundenpreis"])  # the sheet shows the price when hours are empty
        if hours:
            assert abs(game["value"]["cost_per_hour_cents"] - expected_cph) <= 1, line["Spiel"]
        else:
            assert game["value"]["cost_per_hour_cents"] is None and expected_cph == price
        finished = line["Durchgespielt"].strip() == "✓"
        assert game["status"] == ("finished" if finished else "played" if hours else "backlog")
        assert game["value"]["times_finished"] == int(finished)

    total_spent = sum(parse_money(line["Preis"]) for line in sheet)
    assert totals["spent_cents"] == total_spent
    assert sum(g["value"]["net_cost_cents"] for g in games.values()) == total_spent


def test_finished_without_date_has_unknown_date(api, pc):
    result = ok_preview(api, pc["category"]["id"], FIXTURE.read_bytes(), hardware_id=pc["device"]["id"])
    commit(api, pc["category"]["id"], result["rows"])
    (game,) = api.get("/items", params={"q": "Lighthouse Keeper"})
    detail = api.get(f"/items/{game['id']}")
    assert [c["finished_on"] for c in detail["completions"]] == [None]
    assert detail["devices"][0]["hardware_name"] == "Gaming PC"


def test_reimport_skips_duplicates(api, pc):
    content = FIXTURE.read_bytes()
    first = ok_preview(api, pc["category"]["id"], content, hardware_id=pc["device"]["id"])
    commit(api, pc["category"]["id"], first["rows"])
    second = ok_preview(api, pc["category"]["id"], content, hardware_id=pc["device"]["id"])
    assert second["totals"]["skip"] == 24
    assert all(r["duplicate"] for r in second["rows"])
    assert commit(api, pc["category"]["id"], second["rows"]).json()["skipped"] == 24


SHEET = """Name,Buy date,Price,Sold for,Sell date,Hours,Format,Condition,Rating,Finished,Notes,Cost per hour
Zelda,2023-05-12,"59,99","30,00",2024-01-01,"85,5",physical,used,"4,5",03.05.2024,CE,"0,70"
Zelda,2024-02-01,"19,99",,,"2",digital,,,,,"10,00"
Mario,2023-01-01,"49,99",,,,physical,new,,,,
Wish Game,,,,,,,,,,möchte ich,
Summe,,"129,97",,,,,,,,,
"""


def test_copies_wishlist_and_extra_columns(api):
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    result = ok_preview(api, nintendo["id"], SHEET.encode("cp1252"), hardware_id=switch["id"])
    assert result["encoding"] == "cp1252"
    assert result["delimiter"] == ","
    rows = {r["line"]: r for r in result["rows"]}
    assert rows[3]["action"] == "add_copy" and rows[3]["copy_of_line"] == 2
    assert rows[5]["action"] == "wishlist"
    assert rows[6]["action"] == "skip"  # total row
    assert rows[2]["finished_on"] == "2024-05-03" and rows[2]["condition"] == "used"

    assert commit(api, nintendo["id"], result["rows"]).json() == {
        "games_created": 2,
        "copies_added": 1,
        "wishlist_added": 1,
        "skipped": 1,
    }
    (zelda,) = api.get("/items", params={"q": "Zelda"})
    zelda = api.get(f"/items/{zelda['id']}")
    assert len(zelda["copies"]) == 2
    assert zelda["copies"][0]["sell_price_cents"] == 3000 and zelda["copies"][0]["sell_date"] == "2024-01-01"
    assert zelda["value"]["hours"] == 87.5
    assert zelda["rating"] == 4.5
    assert zelda["status"] == "finished"
    assert zelda["notes"] == "CE"
    assert zelda["value"]["net_cost_cents"] == 5999 - 3000 + 1999

    (wish,) = api.get("/items", params={"status": "wishlist"})
    assert wish["name"] == "Wish Game"

    # importing again: a new copy of an existing game is offered as add_copy, known ones are skipped
    again = ok_preview(
        api, nintendo["id"], (SHEET + 'Mario,2025-01-01,"10,00",,,,,,,,,\n').encode(), hardware_id=switch["id"]
    )
    assert [r["action"] for r in again["rows"]] == ["skip", "skip", "skip", "skip", "skip", "add_copy"]


def test_errors_block_commit_until_row_is_skipped(api, pc):
    content = "Spiel;Kaufdatum;Preis;Spielzeit\nGood;01.01.2024;5,00;2\nBad;31.02.2024;5,00;\nNo price;01.01.2024;;\n"
    result = ok_preview(api, pc["category"]["id"], content.encode(), hardware_id=pc["device"]["id"])
    assert not result["can_commit"]
    rows = {r["name"]: r for r in result["rows"]}
    assert "unreadable date" in rows["Bad"]["errors"][0]
    assert rows["No price"]["errors"] == ["buy price is missing"]

    response = commit(api, pc["category"]["id"], result["rows"])
    assert response.status_code == 422
    assert api.get("/items", params={"kind": "game"}) == []  # nothing saved

    rows["Bad"]["action"] = "skip"
    rows["No price"]["buy_price_cents"] = 0  # edited in the preview, e.g. a free game
    rows["No price"]["errors"] = []
    response = commit(api, pc["category"]["id"], list(rows.values()))
    assert response.status_code == 200, response.text
    assert response.json()["games_created"] == 2


def test_missing_buy_date_is_stored_as_unknown(api, pc):
    content = "Spiel;Preis;Spielzeit\nNo date;5,00;2\nSecond copy;3,00;\nSecond copy;4,00;\nWish;;\n"
    result = ok_preview(api, pc["category"]["id"], content.encode(), hardware_id=pc["device"]["id"])
    assert result["can_commit"]
    rows = {r["line"]: r for r in result["rows"]}
    assert rows[2]["buy_date"] is None and rows[2]["action"] == "create"
    assert rows[2]["warnings"] == ["no buy date, stored as unknown"]
    assert rows[4]["action"] == "skip" and rows[4]["duplicate"]  # same game, same (unknown) date
    assert rows[5]["action"] == "wishlist"

    assert commit(api, pc["category"]["id"], result["rows"]).status_code == 200
    (game,) = api.get("/items", params={"q": "No date"})
    assert game["copies_summary"]["first_bought_on"] is None
    assert game["value"]["net_cost_cents"] == 500
    (copy,) = api.get(f"/items/{game['id']}")["copies"]
    assert copy["buy_date"] is None and copy["days_owned"] is None
    assert all(api.client.get(f"/api/v1/stats/{s}").status_code == 200 for s in ("yearly", "stores", "summary"))


def test_accounting_zero_price_is_a_free_copy(api, pc):
    content = "Name;Kaufdatum;Preis;Spielstunden;Durchgespielt\nBorrowed;; - € ;24;✓\n"
    result = ok_preview(api, pc["category"]["id"], content.encode(), hardware_id=pc["device"]["id"])
    (row,) = result["rows"]
    assert (row["action"], row["buy_price_cents"], row["status"], row["errors"]) == ("create", 0, "finished", [])


def test_existing_game_found_despite_other_punctuation(api, pc):
    api.game(pc["category"]["id"], name="Marvel’s Spider-Man")
    content = "Spiel;Kaufdatum;Preis\nMarvel's Spider-Man;01.01.2024;20\n"
    (row,) = ok_preview(api, pc["category"]["id"], content.encode())["rows"]
    assert row["action"] == "add_copy"


def test_hours_need_a_device(api):
    pc = api.category("PC")
    result = ok_preview(api, pc["id"], b"Spiel;Kaufdatum;Preis;Spielzeit\nA;01.01.2024;5;3\nB;01.01.2024;5;\n")
    errors = {r["name"]: r["errors"] for r in result["rows"]}
    assert errors == {"A": ["choose a device for the hours"], "B": []}


def test_category_default_device_is_used(api, pc):
    api.patch(f"/categories/{pc['category']['id']}", {"default_device_id": pc["device"]["id"]})
    result = ok_preview(api, pc["category"]["id"], b"Spiel;Kaufdatum;Preis;Spielzeit\nA;01.01.2024;5;3\n")
    assert result["rows"][0]["hardware_id"] == pc["device"]["id"]
    assert result["can_commit"]


def test_mapping_override_and_errors(api, pc):
    content = b"Titel;Datum;Betrag\nA;01.01.2024;5\n"
    response = preview(api, pc["category"]["id"], content)
    assert response.status_code == 200  # Titel → name, Datum → buy_date; Betrag unknown
    assert response.json()["rows"][0]["errors"] == ["buy price is missing"]

    result = ok_preview(api, pc["category"]["id"], content, mapping={"buy_price": "Betrag"})
    assert result["can_commit"] and result["rows"][0]["buy_price_cents"] == 500

    assert preview(api, pc["category"]["id"], content, mapping={"buy_price": "Nope"}).status_code == 422
    assert preview(api, pc["category"]["id"], content, mapping={"name": None}).status_code == 422
    assert preview(api, pc["category"]["id"], b"").status_code == 422


def test_no_games_in_hardware_only_category(api):
    response = preview(api, api.handhelds_id(), FIXTURE.read_bytes())
    assert response.status_code == 422


def test_template(api):
    response = api.client.get("/api/v1/import-csv/template")
    assert response.status_code == 200
    assert response.text.startswith("name;buy_date;buy_price;")
    assert "attachment" in response.headers["content-disposition"]
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    result = ok_preview(api, nintendo["id"], response.content, hardware_id=switch["id"])
    assert result["can_commit"] and len(result["rows"]) == 1 and all(v for v in result["mapping"].values())
