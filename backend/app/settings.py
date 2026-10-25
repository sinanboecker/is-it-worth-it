"""App settings stored as key/value rows in the `setting` table (values JSON-encoded)."""

import json

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.models import Setting, SplitMode


class AppSettings(BaseModel):
    break_even_cph: int = Field(300, gt=0, description="Global default break-even in cents per hour")
    bundle_split_mode: SplitMode = SplitMode.proportional
    ggdeals_region: str = "de"


class AppSettingsUpdate(BaseModel):
    break_even_cph: int | None = Field(None, gt=0)
    bundle_split_mode: SplitMode | None = None
    ggdeals_region: str | None = None


def load_settings(session: Session) -> AppSettings:
    stored = {row.key: json.loads(row.value) for row in session.exec(select(Setting))}
    known = {k: v for k, v in stored.items() if k in AppSettings.model_fields}
    return AppSettings(**known)


def save_settings(session: Session, values: dict) -> None:
    for key, value in values.items():
        encoded = json.dumps(value.value if isinstance(value, SplitMode) else value)
        row = session.get(Setting, key)
        if row is None:
            session.add(Setting(key=key, value=encoded))
        else:
            row.value = encoded


def get_flag(session: Session, key: str) -> bool:
    row = session.get(Setting, key)
    return row is not None and json.loads(row.value) is True


def set_flag(session: Session, key: str) -> None:
    save_settings(session, {key: True})
