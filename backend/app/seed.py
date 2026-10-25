"""First-start data: default settings and the "Handhelds & Other Hardware" category."""

from sqlmodel import Session

from app.models import Category, CategoryType
from app.settings import get_flag, load_settings, save_settings, set_flag

HANDHELDS_CATEGORY = "Handhelds & Other Hardware"


def seed(session: Session) -> None:
    # Persist defaults for settings that were never saved, so they show up in exports.
    save_settings(session, load_settings(session).model_dump(mode="json"))

    # Only once: if the user renames or deletes the category later, it stays that way.
    if not get_flag(session, "seeded_handhelds_category"):
        session.add(Category(name=HANDHELDS_CATEGORY, type=CategoryType.hardware_only, sort_order=1000))
        set_flag(session, "seeded_handhelds_category")
    session.commit()
