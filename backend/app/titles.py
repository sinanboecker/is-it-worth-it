"""The same game on several platforms: separate items (one per category) that are grouped in the UI."""

from sqlmodel import Session, select

from app.models import Item, ItemKind
from app.names import name_key


def title_key(item: Item) -> str | None:
    """What makes two games the same title: their names compared with `name_key`. None for hardware."""
    return name_key(item.name) if item.kind is ItemKind.game else None


def rawg_title_key(item: Item) -> str | None:
    """The same for the game's name on RAWG, so a game matched on RAWG is found by RAWG's name too (e.g. an
    unmatched "Mafia: The Old Country" and "Mafia – Old Country (PS5)" matched to that RAWG game)."""
    return name_key(item.rawg_name) if item.kind is ItemKind.game and item.rawg_name else None


def _keys(name: str, rawg_name: str | None) -> set[str]:
    return {name_key(name)} | ({name_key(rawg_name)} if rawg_name else set())


def same_game(session: Session, item: Item, load_options=()) -> list[Item]:
    """The other games with a name in common (their own or RAWG's, see `title_key`) or the same RAWG game, by
    category order."""
    if item.kind is not ItemKind.game:
        return []
    keys = _keys(item.name, item.rawg_name)
    rows = session.exec(
        select(Item.id, Item.name, Item.rawg_name, Item.rawg_id).where(Item.kind == ItemKind.game, Item.id != item.id)
    )
    ids = [
        i
        for i, name, rawg_name, rawg_id in rows
        if keys & _keys(name, rawg_name) or (item.rawg_id and rawg_id == item.rawg_id)
    ]
    if not ids:
        return []
    others = session.exec(select(Item).where(Item.id.in_(ids)).options(*load_options)).all()
    return sorted(others, key=lambda i: (i.category.sort_order, i.category.name.lower(), i.id))
