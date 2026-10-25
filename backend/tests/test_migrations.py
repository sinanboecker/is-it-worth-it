from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlmodel import SQLModel

from app.migrations import upgrade_database


def test_migrations_match_models(engine):
    """Fails when a model changes without a new Alembic migration."""
    upgrade_database(engine)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), SQLModel.metadata)
    assert diff == []


def test_upgrade_is_idempotent(engine):
    upgrade_database(engine)
    upgrade_database(engine)
