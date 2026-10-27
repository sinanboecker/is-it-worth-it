"""Shared helpers for the routers: loading rows with their relations, 404/422/409 errors."""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.db import get_session
from app.models import Category, CategoryType, Completion, Copy, CopyFormat, GameStatus, Item, ItemKind, PlayLink
from app.settings import AppSettings, load_settings
from app.split import SplitError

SessionDep = Annotated[Session, Depends(get_session)]


def get_app_settings(session: SessionDep) -> AppSettings:
    return load_settings(session)


SettingsDep = Annotated[AppSettings, Depends(get_app_settings)]


def today() -> date:
    return date.today()


TodayDep = Annotated[date, Depends(today)]


def not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{what} not found")


def invalid(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


def conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=409, detail=detail)


@contextmanager
def split_errors_as_invalid() -> Iterator[None]:
    """A price that can't be split (e.g. manual shares that don't add up) is a 422 with the reason."""
    try:
        yield
    except SplitError as e:
        raise invalid(str(e)) from e


ITEM_LOAD_OPTIONS = (
    selectinload(Item.category),
    selectinload(Item.copies),
    selectinload(Item.play_links).selectinload(PlayLink.hardware),
    selectinload(Item.device_links).selectinload(PlayLink.game),
    selectinload(Item.dlcs),
    selectinload(Item.completions).selectinload(Completion.hardware),
)


def load_item(session: Session, item_id: int) -> Item:
    item = session.exec(select(Item).where(Item.id == item_id).options(*ITEM_LOAD_OPTIONS)).first()
    if item is None:
        raise not_found("item")
    return item


def load_game(session: Session, item_id: int) -> Item:
    item = load_item(session, item_id)
    if item.kind is not ItemKind.game:
        raise invalid("this endpoint is for games only")
    return item


def load_category(session: Session, category_id: int) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise not_found("category")
    return category


def load_hardware(session: Session, hardware_id: int) -> Item:
    hardware = session.get(Item, hardware_id)
    if hardware is None or hardware.kind is not ItemKind.hardware:
        raise invalid(f"hardware {hardware_id} not found")
    return hardware


def check_game_category(category: Category, kind: ItemKind) -> None:
    if kind is ItemKind.game and category.type is CategoryType.hardware_only:
        raise invalid(f'"{category.name}" holds hardware only; games belong to a platform category')


def check_copy(item: Item, copy: Copy) -> None:
    """Validate a copy after create/update and fill implied values."""
    if item.kind is ItemKind.hardware:
        copy.format = CopyFormat.physical
    if copy.condition is not None and copy.format is not CopyFormat.physical:
        raise invalid("condition is only for physical copies")
    if copy.sell_price_cents is None:
        if copy.sell_date is not None:
            raise invalid("a sell date needs a sell price")
    elif copy.sell_date is None:
        copy.sell_date = date.today()


def default_emulated(hardware: Item) -> bool:
    return hardware.category.type is CategoryType.hardware_only


def link_default_device(session: Session, game: Item) -> None:
    """Link the category's default device to a bought game that has no device yet (not to wishlist games)."""
    category = game.category
    if category.default_device_id is None or game.play_links or game.status is GameStatus.wishlist:
        return
    device = session.get(Item, category.default_device_id)
    if device is not None and device.kind is ItemKind.hardware:
        game.play_links.append(PlayLink(hardware_id=device.id, emulated=default_emulated(device)))
