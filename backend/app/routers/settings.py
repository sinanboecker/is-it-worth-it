from fastapi import APIRouter

from app.routers.deps import SessionDep
from app.settings import AppSettings, AppSettingsUpdate, load_settings, save_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettings)
def get_settings(session: SessionDep):
    return load_settings(session)


@router.put("", response_model=AppSettings)
def update_settings(data: AppSettingsUpdate, session: SessionDep):
    save_settings(session, data.model_dump(exclude_unset=True, exclude_none=True, mode="json"))
    session.commit()
    return load_settings(session)
