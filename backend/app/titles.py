"""The same game on several platforms: separate items (one per category) that are grouped in the UI."""

from sqlmodel import Session, select

from app.models import Item, ItemKind
from app.names import name_key


def title_key(item: Item) -> str | None:
    """What makes two games the same title: their names compared with `name_key`. None for hardware."""
    return name_key(item.name) if item.kind is ItemKind.game else None


def same_game(session: Session, item: Item, load_options=()) -> list[Item]:
    """The other games with the same name (see `title_key`) or the same RAWG game, by category order."""
    if item.kind is not ItemKind.game:
        return []
    key = title_key(item)
    rows = session.exec(select(Item.id, Item.name, Item.rawg_id).where(Item.kind == ItemKind.game, Item.id != item.id))
    ids = [i for i, name, rawg_id in rows if name_key(name) == key or (item.rawg_id and rawg_id == item.rawg_id)]
    if not ids:
        return []
    others = session.exec(select(Item).where(Item.id.in_(ids)).options(*load_options)).all()
    return sorted(others, key=lambda i: (i.category.sort_order, i.category.name.lower(), i.id))
