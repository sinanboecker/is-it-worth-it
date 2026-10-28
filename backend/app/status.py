"""Game status rules (PLANNING.md §3, "Status rules"). The server applies them; clients just show the result."""

from datetime import date

from sqlalchemy import event
from sqlmodel import Session

from app.models import Completion, Copy, GameStatus, Item, ItemKind, PlayLink


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
    if item.status in (GameStatus.backlog, GameStatus.on_hold, GameStatus.not_redeemed):
        return GameStatus.playing
    return None


# --- not redeemed -----------------------------------------------------------------------------


def is_sold_unredeemed(item: Item, gone: frozenset[int] = frozenset()) -> bool:
    """All copies are bundle copies that were sold (keys sold on), and the game was never played or finished.
    `gone`: id() of rows being deleted in this save."""
    copies = [c for c in item.copies if id(c) not in gone]
    return (
        bool(copies)
        and all((c.bundle_id is not None or c.bundle is not None) and c.is_sold for c in copies)  # new: no id yet
        and not any(id(c) not in gone for c in item.completions)
        and not any(link.minutes for link in item.play_links if id(link) not in gone)
    )


def update_redeemed(item: Item, gone: frozenset[int] = frozenset()) -> None:
    """A backlog game that is only a sold bundle key becomes "not redeemed"; when that changes (sale undone, hours
    logged) it is back in the backlog. Other statuses, and statuses set by hand, are left alone."""
    if item.kind is not ItemKind.game:
        return
    sold_key = is_sold_unredeemed(item, gone)
    if item.status is GameStatus.backlog and sold_key:
        item.status = GameStatus.not_redeemed
    elif item.status is GameStatus.not_redeemed and not sold_key:
        item.status = GameStatus.backlog


@event.listens_for(Session, "before_flush")
def _update_redeemed_on_flush(session: Session, _flush_context, _instances) -> None:
    """Copies, hours and finishes change in many places (copies, bundles, imports, play links): check the games they
    belong to on every save, instead of in each endpoint."""
    gone = frozenset(id(obj) for obj in session.deleted)  # models aren't hashable: compare by identity
    games: dict[int, Item] = {}
    with session.no_autoflush:
        for obj in (*session.new, *session.dirty, *session.deleted):
            game = obj.item if isinstance(obj, Copy) else obj.game if isinstance(obj, PlayLink | Completion) else None
            if game is not None and id(game) not in gone:
                games[id(game)] = game
        for game in games.values():
            update_redeemed(game, gone)
