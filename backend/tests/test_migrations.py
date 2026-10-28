from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text
from sqlmodel import SQLModel

from app.migrations import BASELINE, OLD_HEAD, alembic_config, upgrade_database


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


def test_no_migration_reuses_the_old_head_revision(engine):
    """A database at OLD_HEAD is taken for one from the first history and migrated again from the baseline."""
    from alembic.script import ScriptDirectory

    revisions = {s.revision for s in ScriptDirectory.from_config(alembic_config(engine)).walk_revisions()}
    assert OLD_HEAD not in revisions


def test_0007_existing_pc_parts_get_category_other(engine):
    command.upgrade(alembic_config(engine), "0006")
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO pcpart (id, name, buy_date, buy_price_cents) VALUES (1, 'GPU', '2024-01-01', 100)")
        )
    command.upgrade(alembic_config(engine), "0007")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT category FROM pcpart")).scalar() == "other"


def test_0008_sold_pc_parts_leave_their_build(engine):
    command.upgrade(alembic_config(engine), "0007")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO pcbuild (id, name) VALUES (1, 'B')"))
        for id_, sold in [(1, "NULL"), (2, "100")]:
            conn.execute(
                text(f"INSERT INTO pcpart (id, name, category, build_id, buy_date, buy_price_cents, sell_price_cents)"
                     f" VALUES ({id_}, 'P', 'gpu', 1, '2024-01-01', 500, {sold})")
            )  # fmt: skip
    command.upgrade(alembic_config(engine), "0008")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT id, build_id FROM pcpart ORDER BY id")).all() == [(1, 1), (2, None)]


def test_0010_drops_mastered_and_keeps_finishes(engine):
    command.upgrade(alembic_config(engine), "0009")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))
        conn.execute(
            text("INSERT INTO item (id, category_id, kind, name, favorite, created_at, updated_at)"
                 " VALUES (1, 1, 'game', 'A', 0, '2024-01-01', '2024-01-01')")
        )  # fmt: skip
        conn.execute(text("INSERT INTO completion (id, item_id, finished_on, mastered) VALUES (1, 1, '2024-02-01', 1)"))
    command.upgrade(alembic_config(engine), "0010")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT finished_on FROM completion")).scalar() == "2024-02-01"
        assert "mastered" not in {c["name"] for c in inspect(engine).get_columns("completion")}
    command.downgrade(alembic_config(engine), "0009")  # back again: the finish is kept, not mastered
    with engine.connect() as conn:
        assert conn.execute(text("SELECT mastered FROM completion")).scalar() == 0


def test_0011_sold_bundle_keys_become_not_redeemed(engine):
    command.upgrade(alembic_config(engine), "0010")
    rows = {  # item: (status, [(bundle, sold)], hours, finished)
        1: ("backlog", [(1, True)], 0, False),  # sold key: not redeemed
        2: ("backlog", [(1, False)], 0, False),  # kept key
        3: ("backlog", [(1, True)], 30, False),  # played
        4: ("backlog", [(None, True)], 0, False),  # sold, but not from a bundle
        5: ("played", [(1, True)], 0, True),  # finished
    }
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))
        conn.execute(text("INSERT INTO item (id, category_id, kind, name, favorite, created_at, updated_at)"
                          " VALUES (99, 1, 'hardware', 'PC', 0, '2024-01-01', '2024-01-01')"))  # fmt: skip
        conn.execute(text("INSERT INTO bundle (id, name, buy_date, total_price_cents, split_mode, sold_as_bundle,"
                          " other_sales_cents) VALUES (1, 'B', '2024-01-01', 800, 'equal', 0, 0)"))  # fmt: skip
        for item_id, (status, copies, hours, finished) in rows.items():
            conn.execute(
                text("INSERT INTO item (id, category_id, kind, name, status, favorite, created_at, updated_at)"
                     " VALUES (:id, 1, 'game', 'G', :status, 0, '2024-01-01', '2024-01-01')"),
                {"id": item_id, "status": status},
            )  # fmt: skip
            for bundle_id, sold in copies:
                conn.execute(
                    text("INSERT INTO copy (item_id, buy_date, buy_price_cents, format, bundle_id, sell_price_cents)"
                         " VALUES (:id, '2024-01-01', 100, 'digital', :bundle, :sold)"),
                    {"id": item_id, "bundle": bundle_id, "sold": 150 if sold else None},
                )  # fmt: skip
            if hours:
                link = "INSERT INTO playlink (game_id, hardware_id, emulated, minutes) VALUES (:id, 99, 0, :m)"
                conn.execute(text(link), {"id": item_id, "m": hours * 60})
            if finished:
                conn.execute(text("INSERT INTO completion (item_id) VALUES (:id)"), {"id": item_id})
    command.upgrade(alembic_config(engine), "0011")
    with engine.connect() as conn:
        statuses = dict(conn.execute(text("SELECT id, status FROM item WHERE kind = 'game'")).all())
    assert statuses == {1: "not_redeemed", 2: "backlog", 3: "backlog", 4: "backlog", 5: "played"}
    command.downgrade(alembic_config(engine), "0010")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT status FROM item WHERE id = 1")).scalar() == "backlog"


def test_0012_existing_copies_are_neither_won_nor_traded(engine):
    command.upgrade(alembic_config(engine), "0011")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO category (id, name, type, sort_order) VALUES (1, 'PC', 'platform', 0)"))
        conn.execute(text("INSERT INTO item (id, category_id, kind, name, favorite, created_at, updated_at)"
                          " VALUES (1, 1, 'game', 'A', 0, '2024-01-01', '2024-01-01')"))  # fmt: skip
        conn.execute(
            text("INSERT INTO copy (item_id, buy_date, buy_price_cents, format) VALUES (1, '2024-01-01', 0, 'digital')")
        )
    command.upgrade(alembic_config(engine), "0012")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT won, traded FROM copy")).one() == (0, 0)
