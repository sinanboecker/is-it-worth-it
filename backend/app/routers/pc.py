"""PC builds, their parts, and parts bought or sold together (app/pc.py has the calculations)."""

from datetime import date

from fastapi import APIRouter
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app import pc
from app.models import Item, PcBuild, PcPart, PcPurchase, PcSale, PlayLink
from app.routers.deps import SessionDep, SettingsDep, TodayDep, invalid, load_hardware, not_found
from app.schemas import (
    PcBuildCreate,
    PcBuildRead,
    PcBuildUpdate,
    PcPartCreate,
    PcPartRead,
    PcPartUpdate,
    PcPurchaseIn,
    PcPurchaseRead,
    PcSaleIn,
    PcSaleRead,
)

router = APIRouter(prefix="/pc", tags=["pc builds"])

BUILD_LOAD_OPTIONS = (
    selectinload(PcBuild.parts),
    selectinload(PcBuild.hardware).selectinload(Item.device_links).selectinload(PlayLink.game),
    selectinload(PcBuild.hardware).selectinload(Item.copies),
)


def _part_read(part: PcPart, today: date) -> PcPartRead:
    usage = pc.part_usage(part, today)
    return PcPartRead(
        **part.model_dump(),
        build_name=part.build.name if part.build else None,
        purchase_name=part.purchase.name if part.purchase else None,
        sale_name=_sale_name(part.sale) if part.sale else None,
        in_use=part.used_until is None,
        used_days=usage.days,
        used_years=usage.years,
        net_cost_cents=usage.net_cost_cents,
        cost_per_day_cents=usage.cost_per_day_cents,
    )


def _sale_name(sale: PcSale) -> str:
    return sale.name or f"sale of {sale.sell_date:%d.%m.%Y}"


def _build_read(build: PcBuild, today: date, global_break_even_cph: int) -> PcBuildRead:
    totals = pc.build_totals(build, global_break_even_cph)
    return PcBuildRead(
        id=build.id,
        name=build.name,
        hardware_id=build.hardware_id,
        hardware_name=build.hardware.name if build.hardware else None,
        notes=build.notes,
        parts=[_part_read(p, today) for p in build.parts],
        buy_price_cents=totals.buy_price_cents,
        first_bought_on=totals.first_bought_on,
        used_until=totals.used_until,
        in_use=totals.in_use,
        hours=totals.hours,
        cost_per_hour_cents=totals.cost_per_hour_cents,
    )


def _load_build(session: Session, build_id: int) -> PcBuild:
    build = session.exec(select(PcBuild).where(PcBuild.id == build_id).options(*BUILD_LOAD_OPTIONS)).first()
    if build is None:
        raise not_found("PC build")
    return build


def _load_part(session: Session, part_id: int) -> PcPart:
    part = session.get(PcPart, part_id)
    if part is None:
        raise not_found("PC part")
    return part


def _leave_build_when_sold(part: PcPart) -> None:
    """A sold part isn't part of any build any more."""
    if part.sell_price_cents is not None:
        part.build_id = None


def _check_build(session: Session, build_id: int | None) -> None:
    if build_id is not None and session.get(PcBuild, build_id) is None:
        raise not_found("PC build")


# --- builds -----------------------------------------------------------------------------------


@router.get("/builds", response_model=list[PcBuildRead])
def list_builds(session: SessionDep, settings: SettingsDep, today: TodayDep):
    """All builds with their parts, the newest first."""
    builds = [
        _build_read(b, today, settings.break_even_cph)
        for b in session.exec(select(PcBuild).options(*BUILD_LOAD_OPTIONS)).all()
    ]
    return sorted(builds, key=lambda b: (b.first_bought_on or date.max, b.id), reverse=True)


@router.post("/builds", response_model=PcBuildRead, status_code=201)
def create_build(data: PcBuildCreate, session: SessionDep, settings: SettingsDep, today: TodayDep):
    if data.hardware_id is not None:
        load_hardware(session, data.hardware_id)
    build = PcBuild(**data.model_dump())
    session.add(build)
    session.commit()
    return _build_read(_load_build(session, build.id), today, settings.break_even_cph)


@router.patch("/builds/{build_id}", response_model=PcBuildRead)
def update_build(build_id: int, data: PcBuildUpdate, session: SessionDep, settings: SettingsDep, today: TodayDep):
    build = _load_build(session, build_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("hardware_id") is not None:
        load_hardware(session, changes["hardware_id"])
    for key, value in changes.items():
        setattr(build, key, value)
    session.commit()
    session.expire_all()
    return _build_read(_load_build(session, build_id), today, settings.break_even_cph)


@router.delete("/builds/{build_id}", status_code=204)
def delete_build(build_id: int, session: SessionDep):
    """Deletes the build; its parts stay, without a build."""
    build = _load_build(session, build_id)
    for part in list(build.parts):
        part.build_id = None
    session.delete(build)
    session.commit()


# --- parts ------------------------------------------------------------------------------------


@router.get("/parts", response_model=list[PcPartRead])
def list_parts(session: SessionDep, today: TodayDep):
    """All parts, the newest first."""
    parts = session.exec(
        select(PcPart)
        .options(selectinload(PcPart.build), selectinload(PcPart.purchase), selectinload(PcPart.sale))
        .order_by(PcPart.buy_date.desc(), PcPart.id.desc())
    ).all()
    return [_part_read(p, today) for p in parts]


@router.post("/parts", response_model=PcPartRead, status_code=201)
def create_part(data: PcPartCreate, session: SessionDep, today: TodayDep):
    _check_build(session, data.build_id)
    part = PcPart(**data.model_dump())
    _leave_build_when_sold(part)
    session.add(part)
    session.commit()
    session.refresh(part)
    return _part_read(part, today)


@router.patch("/parts/{part_id}", response_model=PcPartRead)
def update_part(part_id: int, data: PcPartUpdate, session: SessionDep, today: TodayDep):
    part = _load_part(session, part_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("build_id") is not None:
        _check_build(session, changes["build_id"])
    for key in ("name", "category", "buy_date", "buy_price_cents"):
        if key in changes and changes[key] is None:
            raise invalid(f"{key} can't be empty")
    for key in ("buy_price_cents", "buy_date"):
        if part.purchase_id is not None and changes.get(key, getattr(part, key)) != getattr(part, key):
            raise invalid("buy price and date of a part bought together are set by its purchase")
    if part.sale_id is not None and changes.get("sell_price_cents", part.sell_price_cents) != part.sell_price_cents:
        raise invalid("the sell price of a part sold together is set by its sale")
    for key, value in changes.items():
        setattr(part, key, value)
    if part.used_until is not None and part.used_until < part.buy_date:
        raise invalid("'used until' is before the buy date")
    _leave_build_when_sold(part)
    session.commit()
    session.refresh(part)
    return _part_read(part, today)


@router.delete("/parts/{part_id}", status_code=204)
def delete_part(part_id: int, session: SessionDep):
    """Deletes the part; its purchase and sale are split again across the other parts."""
    part = _load_part(session, part_id)
    purchase, sale = part.purchase, part.sale
    if purchase is not None:
        purchase.parts.remove(part)
        _split(pc.split_purchase, purchase)
    if sale is not None:
        sale.parts.remove(part)
        if sale.parts:
            _split(pc.split_sale, sale)
        else:
            session.delete(sale)
    session.delete(part)
    session.commit()


def _split(split, group) -> None:
    try:
        split(group)
    except pc.SplitError as e:
        raise invalid(str(e)) from e


# --- bought together --------------------------------------------------------------------------


def _load_purchase(session: Session, purchase_id: int) -> PcPurchase:
    purchase = session.get(PcPurchase, purchase_id)
    if purchase is None:
        raise not_found("PC purchase")
    return purchase


def _purchase_read(purchase: PcPurchase, today: date) -> PcPurchaseRead:
    sold = [p for p in purchase.parts if p.sell_price_cents is not None]
    sold_cents = sum(p.sell_price_cents for p in sold)
    return PcPurchaseRead(
        **purchase.model_dump(),
        parts=[_part_read(p, today) for p in purchase.parts],
        sold_parts=len(sold),
        sold_cents=sold_cents,
        left_cents=purchase.total_price_cents - sold_cents,
    )


def _apply_purchase(session: Session, purchase: PcPurchase, data: PcPurchaseIn) -> None:
    """Set the purchase's fields and parts (new rows become new parts; parts left out stay, without purchase)."""
    for key, value in data.model_dump(exclude={"parts"}).items():
        setattr(purchase, key, value)
    kept = []
    for row in data.parts:
        _check_build(session, row.build_id)
        if row.id is None:
            part = PcPart(name=row.name, buy_date=data.buy_date, buy_price_cents=0)
        else:
            part = _load_part(session, row.id)
            if part.purchase_id not in (None, purchase.id):
                raise invalid(f"{part.name} was bought together with other parts already")
        part.name, part.category, part.value_cents, part.notes = row.name, row.category, row.value_cents, row.notes
        part.build_id = None if part.sell_price_cents is not None else row.build_id
        if row.buy_price_cents is not None:
            part.buy_price_cents = row.buy_price_cents
        kept.append(part)
    purchase.parts = kept
    _split(pc.split_purchase, purchase)


@router.get("/purchases", response_model=list[PcPurchaseRead])
def list_purchases(session: SessionDep, today: TodayDep):
    """Parts bought together (e.g. whole PCs), the newest first."""
    purchases = session.exec(
        select(PcPurchase)
        .options(selectinload(PcPurchase.parts).selectinload(PcPart.build))
        .order_by(PcPurchase.buy_date.desc(), PcPurchase.id.desc())
    ).all()
    return [_purchase_read(p, today) for p in purchases]


@router.post("/purchases", response_model=PcPurchaseRead, status_code=201)
def create_purchase(data: PcPurchaseIn, session: SessionDep, today: TodayDep):
    purchase = PcPurchase(name=data.name, buy_date=data.buy_date, total_price_cents=data.total_price_cents)
    session.add(purchase)
    _apply_purchase(session, purchase, data)
    session.commit()
    session.refresh(purchase)
    return _purchase_read(purchase, today)


@router.put("/purchases/{purchase_id}", response_model=PcPurchaseRead)
def update_purchase(purchase_id: int, data: PcPurchaseIn, session: SessionDep, today: TodayDep):
    purchase = _load_purchase(session, purchase_id)
    _apply_purchase(session, purchase, data)
    session.commit()
    session.refresh(purchase)
    return _purchase_read(purchase, today)


@router.delete("/purchases/{purchase_id}", status_code=204)
def delete_purchase(purchase_id: int, session: SessionDep):
    """Deletes the purchase; its parts stay with the price and date they have now."""
    purchase = _load_purchase(session, purchase_id)
    purchase.parts = []
    session.delete(purchase)
    session.commit()


# --- sold together ----------------------------------------------------------------------------


def _load_sale(session: Session, sale_id: int) -> PcSale:
    sale = session.get(PcSale, sale_id)
    if sale is None:
        raise not_found("PC sale")
    return sale


def _sale_read(sale: PcSale, today: date) -> PcSaleRead:
    return PcSaleRead(**sale.model_dump(), parts=[_part_read(p, today) for p in sale.parts])


def _apply_sale(session: Session, sale: PcSale, data: PcSaleIn) -> None:
    """Set the sale's fields and parts; parts left out aren't sold any more."""
    old_date = sale.sell_date
    for key, value in data.model_dump(exclude={"parts"}).items():
        setattr(sale, key, value)
    wanted = []
    for row in data.parts:
        part = _load_part(session, row.id)
        if part.sale_id not in (None, sale.id):
            raise invalid(f"{part.name} was sold together with other parts already")
        if part.sale_id == sale.id and part.used_until == old_date:
            part.used_until = None  # set again from the (maybe new) sale date
        if row.sell_price_cents is not None:
            part.sell_price_cents = row.sell_price_cents
        wanted.append(part)
    for part in sale.parts:
        if part not in wanted:
            pc.unsell(part, old_date)
    sale.parts = wanted
    _split(pc.split_sale, sale)


@router.get("/sales/{sale_id}", response_model=PcSaleRead)
def get_sale(sale_id: int, session: SessionDep, today: TodayDep):
    return _sale_read(_load_sale(session, sale_id), today)


@router.post("/sales", response_model=PcSaleRead, status_code=201)
def create_sale(data: PcSaleIn, session: SessionDep, today: TodayDep):
    """Sell parts together for one price, split across them; they leave their builds."""
    sale = PcSale(sell_date=data.sell_date, total_price_cents=data.total_price_cents)
    session.add(sale)
    _apply_sale(session, sale, data)
    session.commit()
    session.refresh(sale)
    return _sale_read(sale, today)


@router.put("/sales/{sale_id}", response_model=PcSaleRead)
def update_sale(sale_id: int, data: PcSaleIn, session: SessionDep, today: TodayDep):
    sale = _load_sale(session, sale_id)
    _apply_sale(session, sale, data)
    session.commit()
    session.refresh(sale)
    return _sale_read(sale, today)


@router.delete("/sales/{sale_id}", status_code=204)
def delete_sale(sale_id: int, session: SessionDep):
    """Deletes the sale: its parts aren't sold any more."""
    sale = _load_sale(session, sale_id)
    for part in list(sale.parts):
        pc.unsell(part, sale.sell_date)
    sale.parts = []
    session.delete(sale)
    session.commit()
