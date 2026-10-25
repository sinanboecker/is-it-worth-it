from alembic import context
from sqlmodel import SQLModel

import app.models  # noqa: F401  (registers the tables on SQLModel.metadata)

target_metadata = SQLModel.metadata


def run_migrations() -> None:
    engine = context.config.attributes["engine"]
    with engine.connect() as connection:
        # Batch mode recreates tables (copy, drop, rename). With foreign keys on, dropping a parent
        # table would cascade-delete its children, so they're off while migrating. The pragma only
        # takes effect outside a transaction.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite can't ALTER most things; batch mode recreates tables
        )
        with context.begin_transaction():
            context.run_migrations()
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")


run_migrations()
