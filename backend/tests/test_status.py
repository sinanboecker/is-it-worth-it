from datetime import date

import pytest

from app import status
from app.models import Category, Completion, Copy, GameStatus, Item, ItemKind

TODAY = date(2026, 10, 22)


def game(status_=GameStatus.backlog, copies=1, **fields) -> Item:
    item = Item(category=Category(name="X"), kind=ItemKind.game, name="G", status=status_, **fields)
    item.copies = [Copy(buy_date=date(2026, 1, 1), buy_price_cents=1000) for _ in range(copies)]
    return item


def test_playing_sets_started_on_once():
    g = game()
    status.set_status(g, GameStatus.playing, TODAY)
    assert g.started_on == TODAY
    g.status = GameStatus.on_hold
    status.set_status(g, GameStatus.playing, date(2026, 12, 1))
    assert g.started_on == TODAY


def test_finished_without_completion_creates_one_and_moves_started_on():
    g = game(started_on=date(2026, 10, 1))
    status.set_status(g, GameStatus.finished, TODAY, finished_on=date(2026, 10, 20))
    (c,) = g.completions
    assert (c.started_on, c.finished_on) == (date(2026, 10, 1), date(2026, 10, 20))
    assert g.started_on is None
    assert g.status is GameStatus.finished


def test_wishlist_needs_copy_rules():
    wish = game(GameStatus.wishlist, copies=0)
    with pytest.raises(status.StatusError, match="add a copy first"):
        status.set_status(wish, GameStatus.backlog, TODAY)
    owned = game()
    with pytest.raises(status.StatusError, match="has copies"):
        status.set_status(owned, GameStatus.wishlist, TODAY)


def test_copy_added_moves_wishlist_to_backlog():
    wish = game(GameStatus.wishlist, copies=0)
    status.copy_added(wish)
    assert wish.status is GameStatus.backlog


def test_completion_sets_finished_and_moves_started_on():
    g = game(GameStatus.playing, started_on=date(2026, 9, 1), rating=7)
    status.add_completion(g, Completion(finished_on=TODAY))
    assert g.status is GameStatus.finished
    assert g.rating == 7  # finishing doesn't touch the game rating
    assert g.completions[0].started_on == date(2026, 9, 1)
    assert g.started_on is None


def test_replay_keeps_currently_playing():
    g = game(GameStatus.finished)
    status.add_completion(g, Completion(finished_on=date(2025, 1, 1)))
    status.set_status(g, GameStatus.playing, TODAY)  # replay starts
    status.add_completion(g, Completion(finished_on=date(2025, 6, 1)))
    assert g.status is GameStatus.playing


def test_endless_stays_endless():
    g = game(GameStatus.endless)
    status.add_completion(g, Completion(finished_on=TODAY))
    assert g.status is GameStatus.endless


def test_wishlist_game_cant_be_finished():
    with pytest.raises(status.StatusError):
        status.add_completion(game(GameStatus.wishlist, copies=0), Completion(finished_on=TODAY))


def test_removing_last_completion_reverts_finished_to_played():
    g = game(GameStatus.backlog)
    c = Completion(finished_on=TODAY)
    status.add_completion(g, c)
    status.remove_completion(g, c)
    assert g.status is GameStatus.played


@pytest.mark.parametrize(
    ("current", "suggested"),
    [
        (GameStatus.backlog, GameStatus.playing),
        (GameStatus.on_hold, GameStatus.playing),
        (GameStatus.played, None),
        (GameStatus.finished, None),
        (GameStatus.endless, None),
    ],
)
def test_hours_added_suggests_playing(current, suggested):
    g = game(current, last_played_on=date(2026, 10, 1))
    assert status.hours_added(g, TODAY) is suggested
    assert g.last_played_on == TODAY
    status.hours_added(g, date(2026, 1, 1))  # an older date doesn't move last_played_on back
    assert g.last_played_on == TODAY
