from alembic import command
from sqlalchemy import text

from app.migrations import alembic_config, upgrade_database


def test_batch_migrations_keep_child_rows(engine):
    """Migrations that recreate a parent table (0004 rebuilds `item`) must not cascade-delete child rows:
    foreign keys are off while migrating."""
    command.upgrade(alembic_config(engine), "0001")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))
        conn.execute(
            text(
                "INSERT INTO item (id, category_id, kind, name, status, created_at, updated_at) "
                "VALUES (1, 1, 'game', 'G', 'finished', '2026-01-01', '2026-01-01')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO copy (item_id, buy_date, buy_price_cents, format) VALUES (1, '2024-01-01', 100, 'digital')"
            )
        )
        conn.execute(text("INSERT INTO completion (item_id, finished_on, mastered) VALUES (1, '2024-02-01', 0)"))
        conn.execute(text("INSERT INTO dlc (game_id, name, buy_date, price_cents) VALUES (1, 'D', '2024-03-01', 500)"))

    upgrade_database(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM copy")).scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM completion")).scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM dlc")).scalar() == 1
        assert conn.execute(text("SELECT rawg_id, rawg_slug FROM item")).one() == (None, None)
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1  # switched back on


def test_favorite_column_on_existing_games(engine):
    command.upgrade(alembic_config(engine), "0004")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))
        conn.execute(
            text(
                "INSERT INTO item (id, category_id, kind, name, status, created_at, updated_at) "
                "VALUES (1, 1, 'game', 'G', 'played', '2026-01-01', '2026-01-01')"
            )
        )
    upgrade_database(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT favorite FROM item")).scalar() == 0
