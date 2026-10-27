"""Import of finish dates from a plain list (month headings, then "DD Game, Platform" lines)."""

LIST = """05 Too early, PC
February, 2024
19 Alan Wake II, PC
02 Gears 5, Xbox Series X|S

October, 2022
29 Hogwarts Legacy, PS5
15 Halo 2: Aniversary, PC

12 Unknown Game, PC
February, 2023
30 Bad day, PC
not a finished game
March, 2019
04 Journey, PS3
August, 2015
07 Journey, PS3
02 Marvel's Spider-Man
"""


def setup(api):
    pc, xbox, ps3 = api.category("PC"), api.category("Xbox Series"), api.category("PlayStation 3")
    games = {
        "alan": api.game(pc["id"], name="Alan Wake II"),
        "gears_pc": api.game(pc["id"], name="Gears 5"),
        "gears_xbox": api.game(xbox["id"], name="Gears 5"),
        "halo": api.game(pc["id"], name="Halo 2: Anniversary"),
        "journey": api.game(ps3["id"], name="Journey"),
        "spidey": api.game(ps3["id"], name="Marvel’s Spider-Man"),
        "hogwarts": api.game(ps3["id"], name="Hogwarts Legacy", price=None),  # wishlist
    }
    api.post(f"/items/{games['alan']['id']}/completions", {"finished_on": None})  # ✓ from a CSV import
    api.patch(f"/items/{games['spidey']['id']}", {"status": "playing"})
    return games


def preview(api, content=LIST):
    response = api.client.post("/api/v1/import/finish-dates/preview", files={"file": ("done_dates", content.encode())})
    assert response.status_code == 200, response.text
    return response.json()


def by_line(rows):
    return {r["line"]: r for r in rows}


def test_preview_parses_and_matches(api):
    games = setup(api)
    result = preview(api)
    rows = by_line(result["rows"])

    assert rows[1]["errors"] == ["no month heading above this line"]
    assert rows[12]["errors"] == ["there's no day 30 in February 2023"]
    assert rows[13]["errors"] == ["not a finished game (day, name) or a month heading"]

    assert (rows[3]["finished_on"], rows[3]["name"], rows[3]["platform"]) == ("2024-02-19", "Alan Wake II", "PC")
    assert (rows[3]["item_id"], rows[3]["match"], rows[3]["action"]) == (games["alan"]["id"], "exact", "fill")
    assert (rows[4]["item_id"], rows[4]["action"]) == (games["gears_xbox"]["id"], "add")  # the platform decides
    assert (rows[8]["item_id"], rows[8]["match"]) == (games["halo"]["id"], "suggested")  # typo
    assert (rows[10]["finished_on"], rows[10]["match"], rows[10]["action"]) == ("2022-10-12", "not_found", "skip")
    assert [rows[15]["action"], rows[17]["action"]] == ["add", "add"]  # Journey twice: a replay
    assert (rows[18]["platform"], rows[18]["item_id"]) == (None, games["spidey"]["id"])  # curly apostrophe
    assert "wishlist" in rows[7]["errors"][0]
    assert not result["can_commit"]
    assert (result["fill"], result["add"]) == (1, 5)


def test_commit_fills_adds_and_is_idempotent(api):
    games = setup(api)
    rows = preview(api)["rows"]
    for row in rows:
        if row["name"] == "Hogwarts Legacy":
            row.update(item_id=None, picked=True)  # skipped by the user
        if row["name"] == "Unknown Game":
            row.update(item_id=games["gears_pc"]["id"], picked=True)  # picked by the user
    planned = api.post("/import/finish-dates/plan", {"rows": rows})
    assert planned["can_commit"]
    assert by_line(planned["rows"])[10]["match"] == "picked" and by_line(planned["rows"])[10]["action"] == "add"

    result = api.post("/import/finish-dates/commit", {"rows": rows})
    assert result == {"filled": 1, "added": 6, "already": 0, "skipped": 4}  # 3 unreadable lines, Hogwarts

    alan = api.get(f"/items/{games['alan']['id']}")
    assert [c["finished_on"] for c in alan["completions"]] == ["2024-02-19"]  # the unknown date, filled
    journey = api.get(f"/items/{games['journey']['id']}")
    assert sorted(c["finished_on"] for c in journey["completions"]) == ["2015-08-07", "2019-03-04"]
    assert journey["status"] == "finished"
    assert api.get(f"/items/{games['spidey']['id']}")["status"] == "playing"  # being played now: stays
    assert api.get(f"/items/{games['gears_pc']['id']}")["value"]["last_finished_on"] == "2022-10-12"

    again = api.post("/import/finish-dates/plan", {"rows": rows})
    assert (again["fill"], again["add"], again["already"]) == (0, 0, 7)


def test_commit_refuses_wishlist_games(api):
    setup(api)
    rows = preview(api)["rows"]
    response = api.client.post("/api/v1/import/finish-dates/commit", json={"rows": rows})
    assert response.status_code == 422
    assert "wishlist" in response.json()["detail"][0]
    assert api.get("/items", params={"q": "Alan"})[0]["value"]["last_finished_on"] is None  # nothing saved


def test_empty_file(api):
    response = api.client.post("/api/v1/import/finish-dates/preview", files={"file": ("x", b"\n\n")})
    assert response.status_code == 422
