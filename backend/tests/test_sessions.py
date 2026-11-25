"""Play sessions: optional, logged with "+ hours", part of the device totals."""

from datetime import date

import pytest

from app.routers.deps import today


@pytest.fixture
def game(api, client):
    client.app.dependency_overrides[today] = lambda: date(2026, 11, 25)  # a Wednesday
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    lite = api.hardware(nintendo["id"], name="Switch Lite")
    game = api.game(nintendo["id"], price=6000)  # worth it at 3 €/h: 20 h
    yield {"id": game["id"], "switch": switch["id"], "lite": lite["id"]}
    client.app.dependency_overrides.pop(today, None)


def hours(api, game, amount, device, played_on=None, log=True):
    body = {"hours": amount, "hardware_id": game[device], "log_session": log}
    if played_on:
        body["played_on"] = played_on
    return api.post(f"/items/{game['id']}/hours", body)["item"]


def device_hours(item):
    return {d["hardware_name"]: d["hours"] for d in item["devices"]}


def test_adding_hours_logs_a_session_unless_told_not_to(api, game):
    item = hours(api, game, 2, "switch", "2026-11-20")
    item = hours(api, game, 1.5, "lite")  # today
    item = hours(api, game, 4, "switch", log=False)  # just the total, as before sessions
    assert [(s["played_on"], s["hardware_name"], s["hours"]) for s in item["sessions"]] == [
        ("2026-11-25", "Switch Lite", 1.5),
        ("2026-11-20", "Switch", 2),
    ]
    assert item["value"]["hours"] == 7.5 and item["unlogged_hours"] == 4


def test_editing_and_deleting_a_session_changes_the_totals(api, game):
    item = hours(api, game, 3, "switch", "2026-11-20")
    (session,) = item["sessions"]
    item = api.patch(f"/sessions/{session['id']}", {"hours": 5, "played_on": "2026-11-21"})
    assert device_hours(item) == {"Switch": 5} and item["sessions"][0]["played_on"] == "2026-11-21"
    item = api.patch(f"/sessions/{session['id']}", {"hardware_id": game["lite"]})  # played on the other device
    assert device_hours(item) == {"Switch": 0, "Switch Lite": 5}
    item = api.delete(f"/sessions/{session['id']}")
    assert item["sessions"] == [] and device_hours(item) == {"Switch": 0, "Switch Lite": 0}
    assert api.client.delete(f"/api/v1/sessions/{session['id']}").status_code == 404


def test_totals_set_directly_leave_sessions_alone_but_a_removed_device_takes_its_sessions(api, game):
    hours(api, game, 2, "switch", "2026-11-20")
    hours(api, game, 1, "lite", "2026-11-21")
    item = api.put(f"/items/{game['id']}/play-links", [{"hardware_id": game["switch"], "hours": 10}])
    assert [s["hardware_name"] for s in item["sessions"]] == ["Switch"]
    assert (item["value"]["hours"], item["unlogged_hours"]) == (10, 8)
    # set below the sessions' hours: nothing is "without a session", and nothing breaks
    item = api.put(f"/items/{game['id']}/play-links", [{"hardware_id": game["switch"], "hours": 1}])
    assert item["unlogged_hours"] == 0


def test_worth_it_since(api, game):
    item = hours(api, game, 15, "switch", log=False)  # 15 of the 20 h needed, before logging
    assert (item["worth_it_since"], item["worth_it_before_logging"]) == (None, False)  # no sessions yet
    item = hours(api, game, 3, "switch", "2026-11-10")
    assert (item["worth_it_since"], item["worth_it_before_logging"]) == (None, False)  # 18 h: not yet
    item = hours(api, game, 2, "lite", "2026-11-12")
    assert (item["worth_it_since"], item["worth_it_before_logging"]) == ("2026-11-12", False)
    item = hours(api, game, 1, "lite", "2026-11-01")  # an earlier session moves it forward
    assert item["worth_it_since"] == "2026-11-12"  # 15 + 1 + 3 = 19 h on the 10th, 21 h on the 12th

    other = api.game(api.category("PC")["id"], name="Old favourite", price=3000)
    other = {"id": other["id"], "switch": game["switch"]}
    hours(api, other, 30, "switch", log=False)
    item = hours(api, other, 1, "switch", "2026-11-20")
    assert (item["worth_it_since"], item["worth_it_before_logging"]) == (None, True)


def test_played_this_week_month_year(api, game):
    assert api.get("/stats/played") == {"week_hours": 0, "month_hours": 0, "year_hours": 0, "any_sessions": False}
    hours(api, game, 1, "switch", "2026-11-23")  # Monday: this week
    hours(api, game, 2, "switch", "2026-11-22")  # Sunday: last week, this month
    hours(api, game, 4, "switch", "2026-02-01")  # this year
    hours(api, game, 8, "switch", "2025-12-31")  # last year
    hours(api, game, 16, "switch", log=False)  # no date: not counted
    assert api.get("/stats/played") == {"week_hours": 1, "month_hours": 3, "year_hours": 7, "any_sessions": True}

    years = {r["year"]: r for r in api.get("/stats/yearly")}
    assert (years[2026]["hours_played"], years[2025]["hours_played"]) == (7, 8)
    assert years[2023]["hours_played"] == 0  # the year the game was bought, without sessions
    assert api.get("/stats/played-days", params={"year": 2026}) == [
        {"day": "2026-02-01", "hours": 4},
        {"day": "2026-11-22", "hours": 2},
        {"day": "2026-11-23", "hours": 1},
    ]
