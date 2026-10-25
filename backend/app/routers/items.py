"""Games and hardware, with their copies, devices/hours, DLC and completions."""

from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Query
from sqlmodel import Session, select

from app import status
from app.models import Completion, Copy, Dlc, GameStatus, Item, ItemKind, PlayLink
from app.routers.deps import (
    ITEM_LOAD_OPTIONS,
    SessionDep,
    SettingsDep,
    TodayDep,
    check_copy,
    check_game_category,
    conflict,
    default_emulated,
    invalid,
    link_default_device,
    load_category,
    load_game,
    load_hardware,
    load_item,
    not_found,
)
from app.schemas import (
    CompletionCreate,
    CompletionRead,
    CompletionUpdate,
    CopyCreate,
    CopyRead,
    CopyUpdate,
    DlcCreate,
    DlcRead,
    DlcUpdate,
    HoursAdd,
    HoursResult,
    ItemCreate,
    ItemRead,
    ItemSummary,
    ItemUpdate,
    PlayLinkIn,
    hours_to_minutes,
    stars_to_half,
)
from app.settings import AppSettings

router = APIRouter(tags=["items"])


def read_item(session: Session, item_id: int, settings: AppSettings, today: date) -> ItemRead:
    session.expire_all()
    return ItemRead.build(load_item(session, item_id), settings.break_even_cph, today)


def _apply_status_error(func, *args, **kwargs):
    try:
        return func(*args, **kwargs)
    except status.StatusError as e:
        raise invalid(str(e)) from e


# --- items ------------------------------------------------------------------------------------

SORT_KEYS = {
    "name": lambda s: s.name.lower(),
    "first_bought": lambda s: s.copies_summary.first_bought_on or date.max,
    "last_played": lambda s: s.last_played_on or date.min,
    "cost_per_hour": lambda s: (
        s.value.cost_per_hour_cents if s.value and s.value.cost_per_hour_cents is not None else float("inf")
    ),
    "hours": lambda s: s.value.hours if s.value else 0,
    "rating": lambda s: s.rating if s.rating is not None else -1,
    "net_cost": lambda s: s.value.net_cost_cents if s.value else 0,
}


@router.get("/items", response_model=list[ItemSummary])
def list_items(
    session: SessionDep,
    settings: SettingsDep,
    category: int | None = None,
    kind: ItemKind | None = None,
    status_: Annotated[GameStatus | None, Query(alias="status")] = None,
    owned: bool | None = None,
    sold: bool | None = None,
    worth_it: bool | None = None,
    store: str | None = None,
    format: str | None = None,
    condition: str | None = None,
    rating_min: float | None = None,
    favorite: bool | None = None,
    bundle: int | None = None,
    year: Annotated[int | None, Query(description="year of the first copy's buy date")] = None,
    q: str | None = None,
    sort: Annotated[str, Query(description=f"one of {sorted(SORT_KEYS)}; prefix with - for descending")] = "name",
):
    query = select(Item).options(*ITEM_LOAD_OPTIONS)
    if category is not None:
        query = query.where(Item.category_id == category)
    if kind is not None:
        query = query.where(Item.kind == kind)
    if status_ is not None:
        query = query.where(Item.status == status_)
    if q:
        query = query.where(Item.name.ilike(f"%{q}%"))
    if favorite is not None:
        query = query.where(Item.favorite == favorite)
    items = session.exec(query).all()

    def keep(item: Item) -> bool:
        copies = item.copies
        if store is not None and not any(c.store == store for c in copies):
            return False
        if format is not None and not any(c.format == format for c in copies):
            return False
        if condition is not None and not any(c.condition == condition for c in copies):
            return False
        if bundle is not None and not any(c.bundle_id == bundle for c in copies):
            return False
        return True

    summaries = [ItemSummary.build(i, settings.break_even_cph) for i in items if keep(i)]

    def keep_summary(s: ItemSummary) -> bool:
        if owned is not None and s.copies_summary.owned != owned:
            return False
        if sold is not None and s.copies_summary.sold != sold:
            return False
        if worth_it is not None and (s.value is None or s.value.worth_it != worth_it):
            return False
        if rating_min is not None and (s.rating is None or s.rating < rating_min):
            return False
        if year is not None and (
            s.copies_summary.first_bought_on is None or s.copies_summary.first_bought_on.year != year
        ):
            return False
        return True

    summaries = [s for s in summaries if keep_summary(s)]
    key = sort.lstrip("-")
    if key not in SORT_KEYS:
        raise invalid(f"unknown sort key {key!r}")
    summaries.sort(key=SORT_KEYS[key], reverse=sort.startswith("-"))
    return summaries


@router.post("/items", response_model=ItemRead, status_code=201)
def create_item(data: ItemCreate, session: SessionDep, settings: SettingsDep, today: TodayDep):
    category = load_category(session, data.category_id)
    check_game_category(category, data.kind)
    fields = data.model_dump(exclude={"first_copy", "rating", "status"})
    item = Item(**fields, rating=stars_to_half(data.rating), category=category)
    session.add(item)

    if data.kind is ItemKind.hardware:
        if data.status is not None or data.rating is not None:
            raise invalid("hardware has no status or rating")
    else:
        item.status = GameStatus.backlog if data.first_copy else GameStatus.wishlist
    if data.first_copy is not None:
        copy = Copy(**data.first_copy.model_dump())
        check_copy(item, copy)
        item.copies.append(copy)
    if data.kind is ItemKind.game:
        if data.status is not None:
            _apply_status_error(status.set_status, item, data.status, today)
        if item.status is GameStatus.wishlist and item.rating is not None:
            raise invalid("wishlist games can't be rated")
        link_default_device(session, item)

    session.commit()
    return read_item(session, item.id, settings, today)


@router.get("/items/{item_id}", response_model=ItemRead)
def get_item(item_id: int, session: SessionDep, settings: SettingsDep, today: TodayDep):
    return ItemRead.build(load_item(session, item_id), settings.break_even_cph, today)


@router.patch("/items/{item_id}", response_model=ItemRead)
def update_item(item_id: int, data: ItemUpdate, session: SessionDep, settings: SettingsDep, today: TodayDep):
    item = load_item(session, item_id)
    changes = data.model_dump(exclude_unset=True)
    new_status = changes.pop("status", None)
    finished_on = changes.pop("finished_on", None)

    if "category_id" in changes:
        category = load_category(session, changes["category_id"])
        check_game_category(category, item.kind)
    if item.kind is ItemKind.hardware and (
        new_status is not None or changes.get("rating") is not None or changes.get("favorite")
    ):
        raise invalid("hardware has no status, rating or favorite")
    if "rating" in changes:
        changes["rating"] = stars_to_half(changes["rating"])
    if changes.get("favorite") is None:
        changes.pop("favorite", None)
    for key, value in changes.items():
        setattr(item, key, value)
    if new_status is not None:
        _apply_status_error(status.set_status, item, new_status, today, finished_on)
    if item.status is GameStatus.wishlist and item.rating is not None:
        raise invalid("wishlist games can't be rated")

    session.commit()
    return read_item(session, item_id, settings, today)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, session: SessionDep):
    item = load_item(session, item_id)
    if item.kind is ItemKind.hardware and item.device_links:
        raise conflict(f"{len(item.device_links)} game(s) were played on this device; remove it from those games first")
    if any(c.bundle_id for c in item.copies):
        raise conflict("this item has copies in a bundle; remove them from the bundle first")
    session.delete(item)
    session.commit()


# --- copies -----------------------------------------------------------------------------------


def _load_copy(item: Item, copy_id: int) -> Copy:
    for copy in item.copies:
        if copy.id == copy_id:
            return copy
    raise not_found("copy")


@router.get("/items/{item_id}/copies", response_model=list[CopyRead])
def list_copies(item_id: int, session: SessionDep, today: TodayDep):
    return [CopyRead.build(c, today) for c in load_item(session, item_id).copies]


@router.post("/items/{item_id}/copies", response_model=ItemRead, status_code=201)
def add_copy(item_id: int, data: CopyCreate, session: SessionDep, settings: SettingsDep, today: TodayDep):
    item = load_item(session, item_id)
    copy = Copy(**data.model_dump())
    check_copy(item, copy)
    item.copies.append(copy)
    status.copy_added(item)
    if item.kind is ItemKind.game:
        link_default_device(session, item)
    session.commit()
    return read_item(session, item_id, settings, today)


@router.patch("/items/{item_id}/copies/{copy_id}", response_model=ItemRead)
def update_copy(
    item_id: int, copy_id: int, data: CopyUpdate, session: SessionDep, settings: SettingsDep, today: TodayDep
):
    item = load_item(session, item_id)
    copy = _load_copy(item, copy_id)
    changes = data.model_dump(exclude_unset=True)
    if copy.bundle_id is not None:
        if {"buy_date", "buy_price_cents"} & changes.keys():
            raise invalid("buy date and price of a bundle copy are set by the bundle")
        if copy.bundle.sold_as_bundle and {"sell_price_cents", "sell_date"} & changes.keys():
            raise invalid("this copy was sold with its bundle; change the sale on the bundle")
    for key, value in changes.items():
        setattr(copy, key, value)
    if "sell_price_cents" in changes and changes["sell_price_cents"] is None:
        copy.sell_date = None
    check_copy(item, copy)
    session.commit()
    return read_item(session, item_id, settings, today)


@router.delete("/items/{item_id}/copies/{copy_id}", response_model=ItemRead)
def delete_copy(item_id: int, copy_id: int, session: SessionDep, settings: SettingsDep, today: TodayDep):
    item = load_item(session, item_id)
    copy = _load_copy(item, copy_id)
    if copy.bundle_id is not None:
        raise conflict("this copy belongs to a bundle; remove it via the bundle")
    item.copies.remove(copy)
    session.commit()
    return read_item(session, item_id, settings, today)


# --- devices & hours --------------------------------------------------------------------------


@router.put("/items/{item_id}/play-links", response_model=ItemRead)
def set_play_links(item_id: int, links: list[PlayLinkIn], session: SessionDep, settings: SettingsDep, today: TodayDep):
    game = load_game(session, item_id)
    ids = [link.hardware_id for link in links]
    if len(ids) != len(set(ids)):
        raise invalid("each device can only be listed once")
    existing = {link.hardware_id: link for link in game.play_links}
    new_links = []
    for data in links:
        hardware = load_hardware(session, data.hardware_id)
        link = existing.get(data.hardware_id) or PlayLink(hardware_id=hardware.id)
        link.emulated = default_emulated(hardware) if data.emulated is None else data.emulated
        link.minutes = hours_to_minutes(data.hours)
        new_links.append(link)
    game.play_links = new_links
    session.commit()
    return read_item(session, item_id, settings, today)


@router.post("/items/{item_id}/hours", response_model=HoursResult)
def add_hours(item_id: int, data: HoursAdd, session: SessionDep, settings: SettingsDep, today: TodayDep):
    game = load_game(session, item_id)
    if game.status is GameStatus.wishlist:
        raise invalid("a wishlist game has no hours; add a copy first")

    if data.hardware_id is not None:
        hardware = load_hardware(session, data.hardware_id)
        link = next((link for link in game.play_links if link.hardware_id == hardware.id), None)
        if link is None:
            link = PlayLink(hardware_id=hardware.id, emulated=default_emulated(hardware))
            game.play_links.append(link)
    elif game.play_links:
        aware_min = datetime.min.replace(tzinfo=UTC)
        link = max(game.play_links, key=lambda link: (link.last_played_at or aware_min, link.minutes))
    else:
        raise invalid("no device linked to this game; choose a device")

    link.minutes += hours_to_minutes(data.hours)
    link.last_played_at = datetime.now(UTC)
    suggestion = status.hours_added(game, data.played_on or today)
    session.commit()
    return HoursResult(item=read_item(session, item_id, settings, today), suggested_status=suggestion)


# --- DLC --------------------------------------------------------------------------------------


def _load_dlc(game: Item, dlc_id: int) -> Dlc:
    for dlc in game.dlcs:
        if dlc.id == dlc_id:
            return dlc
    raise not_found("DLC")


@router.get("/items/{item_id}/dlc", response_model=list[DlcRead])
def list_dlc(item_id: int, session: SessionDep):
    return [DlcRead.build(d) for d in load_game(session, item_id).dlcs]


@router.post("/items/{item_id}/dlc", response_model=ItemRead, status_code=201)
def add_dlc(item_id: int, data: DlcCreate, session: SessionDep, settings: SettingsDep, today: TodayDep):
    game = load_game(session, item_id)
    if game.status is GameStatus.wishlist:
        raise invalid("add a copy of the game before adding DLC")
    dlc = Dlc(**data.model_dump())
    if dlc.store is None and game.copies:
        dlc.store = max(game.copies, key=lambda c: c.buy_date or date.min).store
    game.dlcs.append(dlc)
    session.commit()
    return read_item(session, item_id, settings, today)


@router.patch("/items/{item_id}/dlc/{dlc_id}", response_model=ItemRead)
def update_dlc(item_id: int, dlc_id: int, data: DlcUpdate, session: SessionDep, settings: SettingsDep, today: TodayDep):
    dlc = _load_dlc(load_game(session, item_id), dlc_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(dlc, key, value)
    session.commit()
    return read_item(session, item_id, settings, today)


@router.delete("/items/{item_id}/dlc/{dlc_id}", response_model=ItemRead)
def delete_dlc(item_id: int, dlc_id: int, session: SessionDep, settings: SettingsDep, today: TodayDep):
    game = load_game(session, item_id)
    game.dlcs.remove(_load_dlc(game, dlc_id))
    session.commit()
    return read_item(session, item_id, settings, today)


# --- completions ------------------------------------------------------------------------------


def _load_completion(game: Item, completion_id: int) -> Completion:
    for completion in game.completions:
        if completion.id == completion_id:
            return completion
    raise not_found("completion")


@router.get("/items/{item_id}/completions", response_model=list[CompletionRead])
def list_completions(item_id: int, session: SessionDep):
    return [CompletionRead.build(c) for c in load_game(session, item_id).completions]


@router.post("/items/{item_id}/completions", response_model=ItemRead, status_code=201)
def add_completion(item_id: int, data: CompletionCreate, session: SessionDep, settings: SettingsDep, today: TodayDep):
    game = load_game(session, item_id)
    if data.hardware_id is not None:
        load_hardware(session, data.hardware_id)
    completion = Completion(**data.model_dump())
    _apply_status_error(status.add_completion, game, completion)
    session.commit()
    return read_item(session, item_id, settings, today)


@router.patch("/items/{item_id}/completions/{completion_id}", response_model=ItemRead)
def update_completion(
    item_id: int,
    completion_id: int,
    data: CompletionUpdate,
    session: SessionDep,
    settings: SettingsDep,
    today: TodayDep,
):
    completion = _load_completion(load_game(session, item_id), completion_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("hardware_id") is not None:
        load_hardware(session, changes["hardware_id"])
    for key, value in changes.items():
        setattr(completion, key, value)
    session.commit()
    return read_item(session, item_id, settings, today)


@router.delete("/items/{item_id}/completions/{completion_id}", response_model=ItemRead)
def delete_completion(item_id: int, completion_id: int, session: SessionDep, settings: SettingsDep, today: TodayDep):
    game = load_game(session, item_id)
    status.remove_completion(game, _load_completion(game, completion_id))
    session.commit()
    return read_item(session, item_id, settings, today)


# --- lookups ----------------------------------------------------------------------------------


@router.get("/hardware", response_model=list[ItemSummary])
def list_hardware(session: SessionDep, settings: SettingsDep, q: str | None = None):
    """All devices across categories, for the device picker."""
    query = select(Item).where(Item.kind == ItemKind.hardware).options(*ITEM_LOAD_OPTIONS).order_by(Item.name)
    if q:
        query = query.where(Item.name.ilike(f"%{q}%"))
    return [ItemSummary.build(i, settings.break_even_cph) for i in session.exec(query)]


@router.get("/stores", response_model=list[str])
def list_stores(session: SessionDep):
    """Store names used so far (for autocomplete)."""
    names = set(session.exec(select(Copy.store).where(Copy.store.is_not(None))))
    names |= set(session.exec(select(Dlc.store).where(Dlc.store.is_not(None))))
    return sorted(names, key=str.lower)
