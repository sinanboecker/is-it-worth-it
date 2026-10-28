"""Camera gear: bodies, lenses and other gear, with what they cost and sold for."""

from fastapi import APIRouter
from sqlmodel import Session, select

from app.models import CameraGear
from app.routers.deps import SessionDep, invalid, not_found
from app.schemas import CameraGearCreate, CameraGearRead, CameraGearUpdate, check_camera_dates

router = APIRouter(prefix="/camera", tags=["camera gear"])


def _load_gear(session: Session, gear_id: int) -> CameraGear:
    gear = session.get(CameraGear, gear_id)
    if gear is None:
        raise not_found("Camera gear")
    return gear


@router.get("/gear", response_model=list[CameraGearRead])
def list_gear(session: SessionDep):
    """All camera gear, the newest first (unknown buy dates last)."""
    gear = session.exec(select(CameraGear)).all()
    ordered = sorted(gear, key=lambda g: (g.buy_date is not None, g.buy_date, g.id), reverse=True)
    return [CameraGearRead.build(g) for g in ordered]


@router.post("/gear", response_model=CameraGearRead, status_code=201)
def create_gear(data: CameraGearCreate, session: SessionDep):
    gear = CameraGear(**data.model_dump())
    session.add(gear)
    session.commit()
    session.refresh(gear)
    return CameraGearRead.build(gear)


@router.patch("/gear/{gear_id}", response_model=CameraGearRead)
def update_gear(gear_id: int, data: CameraGearUpdate, session: SessionDep):
    gear = _load_gear(session, gear_id)
    changes = data.model_dump(exclude_unset=True)
    for key in ("name", "category", "buy_price_cents"):
        if key in changes and changes[key] is None:
            raise invalid(f"{key} can't be empty")
    for key, value in changes.items():
        setattr(gear, key, value)
    try:
        check_camera_dates(gear.buy_date, gear.sell_date)
    except ValueError as e:
        raise invalid(str(e)) from None
    session.commit()
    session.refresh(gear)
    return CameraGearRead.build(gear)


@router.delete("/gear/{gear_id}", status_code=204)
def delete_gear(gear_id: int, session: SessionDep):
    session.delete(_load_gear(session, gear_id))
    session.commit()
