"""Game status rules (PLANNING.md §3, "Status rules"). The server applies them; clients just show the result."""

from datetime import date

from app.models import Completion, GameStatus, Item, ItemKind


class StatusError(ValueError):
    pass


def _require_game(item: Item) -> None:
    if item.kind is not ItemKind.game:
        raise StatusError("only games have a status")


def set_status(item: Item, new: GameStatus, today: date, finished_on: date | None = None) -> None:
    _require_game(item)
    if new is item.status:
        return
    if new is GameStatus.wishlist and item.copies:
        raise StatusError("this game has copies; delete them to move it back to the wishlist")
    if new is not GameStatus.wishlist and not item.copies:
        raise StatusError('add a copy first ("Bought it?")')

    if new is GameStatus.playing and item.started_on is None:
        item.started_on = today
    if new is GameStatus.finished and not item.completions:
        item.completions.append(Completion(finished_on=finished_on or today, started_on=item.started_on))
        item.started_on = None
    item.status = new


def add_completion(item: Item, completion: Completion) -> None:
    _require_game(item)
    if item.status is GameStatus.wishlist:
        raise StatusError("a wishlist game can't be finished; add a copy first")

    is_replay = bool(item.completions)
    if completion.started_on is None:
        completion.started_on = item.started_on
    item.started_on = None
    item.completions.append(completion)

    keep_status = item.status is GameStatus.endless or (item.status is GameStatus.playing and is_replay)
    if not keep_status:
        item.status = GameStatus.finished


def remove_completion(item: Item, completion: Completion) -> None:
    item.completions.remove(completion)
    if not item.completions and item.status is GameStatus.finished:
        item.status = GameStatus.played


def copy_added(item: Item) -> None:
    """A wishlist game that gets a copy has been bought."""
    if item.kind is ItemKind.game and item.status is GameStatus.wishlist:
        item.status = GameStatus.backlog
        item.deal_since = None


def hours_added(item: Item, played_on: date) -> GameStatus | None:
    """Returns a suggested new status (the client offers it), or None."""
    if item.last_played_on is None or played_on > item.last_played_on:
        item.last_played_on = played_on
    if item.status in (GameStatus.backlog, GameStatus.on_hold):
        return GameStatus.playing
    return None
