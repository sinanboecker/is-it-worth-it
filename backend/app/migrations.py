"""Run Alembic migrations programmatically (on startup and from the CLI)."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

SCRIPT_LOCATION = Path(__file__).resolve().parent / "alembic"
# Schema of v0.1.0, which created its tables without migrations.
BASELINE = "0001"
# Head of the first migration history (removed before v0.1.0); its schema is the same as BASELINE.
OLD_HEAD = "0005"


def alembic_config(engine: Engine) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(SCRIPT_LOCATION))
    cfg.attributes["engine"] = engine
    return cfg


def upgrade_database(engine: Engine) -> None:
    cfg = alembic_config(engine)
    tables = set(inspect(engine).get_table_names())
    if "item" in tables and "alembic_version" not in tables:
        # created by v0.1.0 (no migrations yet): its tables are the baseline, so only record that
        command.stamp(cfg, BASELINE)
    elif "alembic_version" in tables:
        with engine.connect() as connection:
            version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if version == OLD_HEAD:
            command.stamp(cfg, BASELINE, purge=True)  # unknown to the current history, same schema
    command.upgrade(cfg, "head")
