from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text
from sqlmodel import SQLModel

from app.migrations import BASELINE, alembic_config, upgrade_database


def baseline_tables(engine) -> None:
    """The v0.1.0 schema (migration 0001) without the record of which migration created it."""
    command.upgrade(alembic_config(engine), BASELINE)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE alembic_version"))


def test_migrations_match_models(engine):
    """Fails when a model changes without a new Alembic migration."""
    upgrade_database(engine)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), SQLModel.metadata)
    assert diff == []


def test_upgrade_is_idempotent(engine):
    upgrade_database(engine)
    upgrade_database(engine)


def test_foreign_keys_back_on_after_migrating(engine):
    upgrade_database(engine)
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_database_from_v0_1_0_is_adopted(engine):
    """v0.1.0 created its tables without migrations: they are kept (with their rows) and marked as the baseline."""
    baseline_tables(engine)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))

    upgrade_database(engine)
    assert "alembic_version" in inspect(engine).get_table_names()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() >= BASELINE
        assert conn.execute(text("SELECT name FROM category")).scalar() == "PC"


def test_database_from_old_migration_history_is_adopted(engine):
    """Databases migrated by the first history (head 0005, same schema as the baseline) are re-marked, not rebuilt."""
    baseline_tables(engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
        conn.execute(text("INSERT INTO alembic_version VALUES ('0005')"))
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))

    upgrade_database(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() >= BASELINE
        assert conn.execute(text("SELECT name FROM category")).scalar() == "PC"


def test_0002_adds_category_icon_to_existing_categories(engine):
    command.upgrade(alembic_config(engine), BASELINE)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))
    command.upgrade(alembic_config(engine), "0002")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT name, icon FROM category")).one() == ("PC", None)


def test_0003_makes_copy_buy_date_optional(engine):
    def buy_date_nullable() -> bool:
        return next(c for c in inspect(engine).get_columns("copy") if c["name"] == "buy_date")["nullable"]

    command.upgrade(alembic_config(engine), "0002")
    assert not buy_date_nullable()
    command.upgrade(alembic_config(engine), "0003")
    assert buy_date_nullable()
    command.downgrade(alembic_config(engine), "0002")
    assert not buy_date_nullable()


def test_0004_adds_bundle_url_and_other_sales(engine):
    command.upgrade(alembic_config(engine), "0003")
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO bundle (id, name, buy_date, total_price_cents, split_mode, sold_as_bundle)"
                 " VALUES (1, 'B', '2024-01-01', 1000, 'equal', 0)")
        )  # fmt: skip
    command.upgrade(alembic_config(engine), "0004")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT url, other_sales_cents FROM bundle")).one() == (None, 0)
