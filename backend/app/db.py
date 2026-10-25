from collections.abc import Iterator

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app import config


def make_engine(url: str) -> Engine:
    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record):
        # SQLite ignores foreign keys (incl. ON DELETE CASCADE) unless enabled per connection.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def create_tables(engine: Engine) -> None:
    """Create missing tables from the models. No migrations: existing tables are left as they are."""
    import app.models  # noqa: F401  (registers the tables on SQLModel.metadata)

    SQLModel.metadata.create_all(engine)


engine: Engine | None = None


def get_engine() -> Engine:
    global engine
    if engine is None:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        engine = make_engine(config.DATABASE_URL)
    return engine


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
