"""Run Alembic migrations programmatically (on startup and from the CLI)."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

SCRIPT_LOCATION = Path(__file__).resolve().parent / "alembic"


def alembic_config(engine: Engine) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(SCRIPT_LOCATION))
    cfg.attributes["engine"] = engine
    return cfg


def upgrade_database(engine: Engine) -> None:
    command.upgrade(alembic_config(engine), "head")
