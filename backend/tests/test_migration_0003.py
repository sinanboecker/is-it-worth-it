from alembic import command
from sqlalchemy import text

from app.migrations import alembic_config, upgrade_database


def test_finish_ratings_move_to_the_game(engine):
    cfg = alembic_config(engine)
    command.upgrade(cfg, "0002")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))
        for item_id, rating in [(1, None), (2, 6)]:
            conn.execute(
                text(
                    "INSERT INTO item (id, category_id, kind, name, status, rating, created_at, updated_at) "
                    "VALUES (:id, 1, 'game', 'G', 'finished', :rating, '2026-01-01', '2026-01-01')"
                ),
                {"id": item_id, "rating": rating},
            )
        rows = [(1, "2024-01-01", 4), (1, "2025-01-01", 8), (1, None, 2), (2, "2025-01-01", 10)]
        for item_id, finished_on, rating in rows:
            conn.execute(
                text("INSERT INTO completion (item_id, finished_on, mastered, rating) VALUES (:i, :f, 0, :r)"),
                {"i": item_id, "f": finished_on, "r": rating},
            )

    upgrade_database(engine)
    with engine.connect() as conn:
        ratings = dict(conn.execute(text("SELECT id, rating FROM item")).all())
        columns = [row[1] for row in conn.execute(text("PRAGMA table_info(completion)"))]
    assert ratings == {1: 8, 2: 6}  # latest dated finish; an existing game rating is kept
    assert "rating" not in columns
