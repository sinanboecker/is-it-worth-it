from fastapi import APIRouter
from sqlmodel import select

from app.models import Category, CategoryType, Item, ItemKind
from app.routers.deps import SessionDep, conflict, invalid, load_category, load_hardware
from app.schemas import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


def _check_unique_name(session: SessionDep, name: str, own_id: int | None = None) -> None:
    existing = session.exec(select(Category).where(Category.name == name)).first()
    if existing is not None and existing.id != own_id:
        raise conflict(f'a category named "{name}" already exists')


@router.get("", response_model=list[CategoryRead])
def list_categories(session: SessionDep):
    return session.exec(select(Category).order_by(Category.sort_order, Category.name)).all()


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(data: CategoryCreate, session: SessionDep):
    _check_unique_name(session, data.name)
    if data.default_device_id is not None:
        load_hardware(session, data.default_device_id)
    category = Category(**data.model_dump())
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.get("/{category_id}", response_model=CategoryRead)
def get_category(category_id: int, session: SessionDep):
    return load_category(session, category_id)


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(category_id: int, data: CategoryUpdate, session: SessionDep):
    category = load_category(session, category_id)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes:
        _check_unique_name(session, changes["name"], category.id)
    if changes.get("default_device_id") is not None:
        load_hardware(session, changes["default_device_id"])
    if changes.get("type") is CategoryType.hardware_only:
        has_games = session.exec(
            select(Item.id).where(Item.category_id == category.id, Item.kind == ItemKind.game)
        ).first()
        if has_games is not None:
            raise invalid("this category has games; a hardware-only category can't hold games")
    for key, value in changes.items():
        setattr(category, key, value)
    session.commit()
    session.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, session: SessionDep):
    category = load_category(session, category_id)
    if session.exec(select(Item.id).where(Item.category_id == category.id)).first() is not None:
        raise conflict("the category isn't empty; move or delete its games and hardware first")
    session.delete(category)
    session.commit()
