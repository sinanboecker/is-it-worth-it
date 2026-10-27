"""Bundles: one purchase, several copies, price split across them (PLANNING.md §3)."""

from fastapi import APIRouter
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app import calc, status
from app.bundles import apply_split
from app.models import Bundle, Copy, Item, ItemKind, SplitMode
from app.routers.deps import (
    SessionDep,
    SettingsDep,
    check_copy,
    check_game_category,
    invalid,
    link_default_device,
    load_category,
    load_item,
    not_found,
    split_errors_as_invalid,
)
from app.schemas import (
    BundleCopyRead,
    BundleCreate,
    BundleEntryIn,
    BundleRead,
    BundleUpdate,
    SplitPreviewIn,
    SplitPreviewOut,
    ValueRead,
)
from app.split import split_amount

router = APIRouter(prefix="/bundles", tags=["bundles"])


def _load_bundle(session: Session, bundle_id: int) -> Bundle:
    bundle = session.exec(
        select(Bundle).where(Bundle.id == bundle_id).options(selectinload(Bundle.copies).selectinload(Copy.item))
    ).first()
    if bundle is None:
        raise not_found("bundle")
    return bundle


def _read(bundle: Bundle, global_break_even_cph: int) -> BundleRead:
    return BundleRead(
        **bundle.model_dump(exclude={"id"}),
        id=bundle.id,
        copies=[
            BundleCopyRead(
                copy_id=c.id,
                item_id=c.item_id,
                item_name=c.item.name,
                kind=c.item.kind,
                reference_price_cents=c.reference_price_cents,
                buy_price_cents=c.buy_price_cents,
                sell_price_cents=c.sell_price_cents,
                sell_date=c.sell_date,
                status=c.item.status,
                cover_path=c.item.cover_path,
                image_path=c.item.image_path,
                value=ValueRead.build(calc.item_value(c.item, global_break_even_cph)),
            )
            for c in bundle.copies
        ],
        sold_cents=sum(c.sell_price_cents for c in bundle.copies if c.is_sold) + bundle.other_sales_cents,
        value=ValueRead.build(calc.bundle_value(bundle, global_break_even_cph)),
    )


def _add_entry(session: Session, bundle: Bundle, entry: BundleEntryIn) -> Copy:
    if entry.item_id is not None:
        item = load_item(session, entry.item_id)
    else:
        category = load_category(session, entry.new_item.category_id)
        check_game_category(category, entry.new_item.kind)
        item = Item(**entry.new_item.model_dump(), category=category)
        session.add(item)
        if item.kind is ItemKind.game:
            item.status = status.GameStatus.wishlist  # becomes backlog below, via copy_added
    copy = Copy(
        buy_date=bundle.buy_date,
        buy_price_cents=entry.buy_price_cents or 0,
        store=bundle.store,
        format=entry.format,
        condition=entry.condition,
        note=entry.note,
        reference_price_cents=entry.reference_price_cents,
    )
    check_copy(item, copy)
    item.copies.append(copy)
    bundle.copies.append(copy)
    status.copy_added(item)
    if item.kind is ItemKind.game:
        link_default_device(session, item)
    return copy


@router.get("", response_model=list[BundleRead])
def list_bundles(session: SessionDep, settings: SettingsDep):
    bundles = session.exec(
        select(Bundle).options(selectinload(Bundle.copies).selectinload(Copy.item)).order_by(Bundle.buy_date.desc())
    ).all()
    return [_read(b, settings.break_even_cph) for b in bundles]


@router.post("/preview-split", response_model=SplitPreviewOut)
def preview_split(data: SplitPreviewIn):
    """Shares for a given total and mode, before saving (also for the "New bundle" form)."""
    with split_errors_as_invalid():
        shares = split_amount(
            data.total_price_cents,
            data.split_mode,
            reference_prices=data.reference_prices,
            manual_shares=data.manual_shares,
            count=data.count,
        )
    return SplitPreviewOut(shares_cents=shares)


@router.post("", response_model=BundleRead, status_code=201)
def create_bundle(data: BundleCreate, session: SessionDep, settings: SettingsDep):
    bundle = Bundle(
        **data.model_dump(exclude={"entries", "split_mode"}),
        split_mode=data.split_mode or settings.bundle_split_mode,
    )
    session.add(bundle)
    for entry in data.entries:
        _add_entry(session, bundle, entry)
    manual = [e.buy_price_cents for e in data.entries] if bundle.split_mode is SplitMode.manual else None
    with split_errors_as_invalid():
        apply_split(bundle, manual)
    session.commit()
    return _read(_load_bundle(session, bundle.id), settings.break_even_cph)


@router.get("/{bundle_id}", response_model=BundleRead)
def get_bundle(bundle_id: int, session: SessionDep, settings: SettingsDep):
    return _read(_load_bundle(session, bundle_id), settings.break_even_cph)


@router.patch("/{bundle_id}", response_model=BundleRead)
def update_bundle(bundle_id: int, data: BundleUpdate, session: SessionDep, settings: SettingsDep):
    bundle = _load_bundle(session, bundle_id)
    changes = data.model_dump(exclude_unset=True)
    reference_prices = changes.pop("reference_prices", None) or {}
    manual_shares = changes.pop("manual_shares", None)
    if "other_sales_cents" in changes and changes["other_sales_cents"] is None:
        changes["other_sales_cents"] = 0

    copy_ids = {c.id for c in bundle.copies}
    unknown = (set(reference_prices) | set(manual_shares or {})) - copy_ids
    if unknown:
        raise invalid(f"copies {sorted(unknown)} are not part of this bundle")

    was_sold_as_bundle = bundle.sold_as_bundle
    for key, value in changes.items():
        setattr(bundle, key, value)
    for copy in bundle.copies:
        if copy.id in reference_prices:
            copy.reference_price_cents = reference_prices[copy.id]
    if was_sold_as_bundle and not bundle.sold_as_bundle:
        bundle.sell_date = bundle.sell_total_cents = None
        for copy in bundle.copies:
            copy.sell_price_cents = copy.sell_date = None

    manual = None
    if manual_shares is not None:
        manual = [manual_shares.get(c.id, c.buy_price_cents) for c in bundle.copies]
    with split_errors_as_invalid():
        apply_split(bundle, manual)
    session.commit()
    return _read(_load_bundle(session, bundle_id), settings.break_even_cph)


@router.post("/{bundle_id}/entries", response_model=BundleRead, status_code=201)
def add_bundle_entry(bundle_id: int, entry: BundleEntryIn, session: SessionDep, settings: SettingsDep):
    bundle = _load_bundle(session, bundle_id)
    _add_entry(session, bundle, entry)
    with split_errors_as_invalid():
        apply_split(bundle)
    session.commit()
    return _read(_load_bundle(session, bundle_id), settings.break_even_cph)


@router.delete("/{bundle_id}/copies/{copy_id}", response_model=BundleRead)
def remove_bundle_copy(bundle_id: int, copy_id: int, session: SessionDep, settings: SettingsDep):
    """Removes the copy from the bundle and deletes it (it was bought as part of the bundle)."""
    bundle = _load_bundle(session, bundle_id)
    copy = next((c for c in bundle.copies if c.id == copy_id), None)
    if copy is None:
        raise not_found("copy")
    bundle.copies.remove(copy)
    session.delete(copy)
    with split_errors_as_invalid():
        apply_split(bundle)
    session.commit()
    return _read(_load_bundle(session, bundle_id), settings.break_even_cph)


@router.delete("/{bundle_id}", status_code=204)
def delete_bundle(bundle_id: int, session: SessionDep):
    """Deletes the bundle and its copies. The games/hardware themselves stay."""
    bundle = _load_bundle(session, bundle_id)
    for copy in list(bundle.copies):
        session.delete(copy)
    session.delete(bundle)
    session.commit()
