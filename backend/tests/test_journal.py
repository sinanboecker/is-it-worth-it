import pytest


@pytest.fixture
def journal_data(api):
    nintendo = api.category()
    pc = api.category("PC")
    switch = api.hardware(nintendo["id"])
    brick = api.hardware(api.handhelds_id(), name="Trimui Brick", price=6000)
    gaming_pc = api.hardware(pc["id"], name="Gaming PC")

    zelda = api.game(nintendo["id"], name="Zelda", rating=4)
    api.put(f"/items/{zelda['id']}/play-links", [{"hardware_id": switch["id"], "hours": 50}])
    metroid = api.game(nintendo["id"], name="Metroid", rating=3)
    api.put(f"/items/{metroid['id']}/play-links", [{"hardware_id": brick["id"], "hours": 10}])  # emulated
    hades = api.game(pc["id"], name="Hades", rating=5)
    api.put(f"/items/{hades['id']}/play-links", [{"hardware_id": gaming_pc["id"], "hours": 40}])

    def finish(game, finished_on, device=None, **fields):
        body = {"finished_on": finished_on, "hardware_id": device["id"] if device else None, **fields}
        api.post(f"/items/{game['id']}/completions", body)

    finish(zelda, "2025-03-10", switch, review="Great", started_on="2025-01-02")
    finish(zelda, "2026-08-01", switch, mastered=True)  # replay
    finish(metroid, "2026-08-15", brick)
    finish(hades, "2026-08-15", gaming_pc)
    finish(hades, "2026-02-01", gaming_pc)  # earlier than the previous one: that one becomes the replay
    finish(metroid, None)  # date unknown, replay
    return {"nintendo": nintendo, "pc": pc, "switch": switch, "brick": brick, "zelda": zelda, "hades": hades}


def flat(journal):
    return [(e["name"], e["finished_on"]) for y in journal["years"] for m in y["months"] for e in m["entries"]]


def test_grouping_newest_first(api, journal_data):
    journal = api.get("/journal")
    assert [y["year"] for y in journal["years"]] == [2026, 2025]
    assert [m["month"] for m in journal["years"][0]["months"]] == [8, 2]
    assert flat(journal) == [
        ("Hades", "2026-08-15"),
        ("Metroid", "2026-08-15"),
        ("Zelda", "2026-08-01"),
        ("Hades", "2026-02-01"),
        ("Zelda", "2025-03-10"),
    ]
    assert [e["name"] for e in journal["unknown_date"]] == ["Metroid"]


def test_entry_details(api, journal_data):
    journal = api.get("/journal")
    entries = {(e["name"], e["finished_on"]): e for y in journal["years"] for m in y["months"] for e in m["entries"]}

    first_zelda = entries[("Zelda", "2025-03-10")]
    assert first_zelda["rating"] == 4.0 and first_zelda["review"] == "Great"  # the game's rating
    assert first_zelda["started_on"] == "2025-01-02"
    assert not first_zelda["replay"] and first_zelda["hardware_name"] == "Switch"
    assert first_zelda["hours"] == 50 and first_zelda["cost_per_hour_cents"] == 120 and first_zelda["worth_it"]

    replay = entries[("Zelda", "2026-08-01")]
    assert replay["replay"] and replay["mastered"]
    assert replay["rating"] == 4.0

    metroid = entries[("Metroid", "2026-08-15")]
    assert metroid["emulated"] and metroid["hardware_name"] == "Trimui Brick"
    # a finish with unknown date (e.g. imported) counts as the first one, so the dated one is the replay
    assert metroid["replay"]
    assert journal["unknown_date"][0]["replay"] is False

    assert entries[("Hades", "2026-08-15")]["replay"] and not entries[("Hades", "2026-02-01")]["replay"]


def test_year_header(api, journal_data):
    year_2026 = api.get("/journal")["years"][0]
    assert year_2026["finished_count"] == 4
    assert year_2026["total_hours"] == 50 + 10 + 40  # distinct games
    assert year_2026["average_rating"] == round((5 + 3 + 4 + 5) / 4, 2)
    assert year_2026["most_used_device"] == "Gaming PC"


def test_filters(api, journal_data):
    assert flat(api.get("/journal", params={"year": 2025})) == [("Zelda", "2025-03-10")]
    assert api.get("/journal", params={"year": 2025})["unknown_date"] == []
    assert [n for n, _ in flat(api.get("/journal", params={"category": journal_data["pc"]["id"]}))] == ["Hades"] * 2
    by_device = api.get("/journal", params={"device": journal_data["brick"]["id"]})
    assert flat(by_device) == [("Metroid", "2026-08-15")]
    assert flat(api.get("/journal", params={"rating_min": 4.5})) == [("Hades", "2026-08-15"), ("Hades", "2026-02-01")]
    assert flat(api.get("/journal", params={"mastered": True})) == [("Zelda", "2026-08-01")]
