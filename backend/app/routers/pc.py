"""PC builds and their parts (app/pc.py has the calculations)."""

from datetime import date

from fastapi import APIRouter
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app import pc
from app.models import Item, PcBuild, PcPart, PlayLink
from app.routers.deps import SessionDep, SettingsDep, TodayDep, invalid, load_hardware, not_found
from app.schemas import PcBuildCreate, PcBuildRead, PcBuildUpdate, PcPartCreate, PcPartRead, PcPartUpdate

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
        in_use=part.used_until is None,
        used_days=usage.days,
        used_years=usage.years,
        net_cost_cents=usage.net_cost_cents,
        cost_per_day_cents=usage.cost_per_day_cents,
    )


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
        select(PcPart).options(selectinload(PcPart.build)).order_by(PcPart.buy_date.desc(), PcPart.id.desc())
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
    session.delete(_load_part(session, part_id))
    session.commit()
