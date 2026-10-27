"""Complete JSON export and import/restore (PLANNING.md §10).

The file holds every table with its IDs, so relations survive a round trip. Derived values are not exported;
they are recomputed. Optionally a ZIP with `data.json` plus the `covers/` and `uploads/` folders.
"""

import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from types import SimpleNamespace
from typing import Literal

from sqlalchemy import delete, func
from sqlmodel import Session, SQLModel, select

from app import media
from app.models import (
    Bundle,
    Category,
    Completion,
    Copy,
    Dlc,
    Item,
    PcBuild,
    PcPart,
    PcPurchase,
    PcSale,
    PlayLink,
    Setting,
)

FORMAT_NAME = "is-it-worth-it"
SCHEMA_VERSION = 1
MEDIA_DIRS = media.FOLDERS

# Insert order respects foreign keys; category.default_device_id is set after items exist.
TABLES: list[tuple[str, type[SQLModel]]] = [
    ("settings", Setting),
    ("categories", Category),
    ("bundles", Bundle),
    ("items", Item),
    ("copies", Copy),
    ("play_links", PlayLink),
    ("dlcs", Dlc),
    ("completions", Completion),
    ("pc_builds", PcBuild),
    ("pc_purchases", PcPurchase),
    ("pc_sales", PcSale),
    ("pc_parts", PcPart),
]


class JsonImportError(ValueError):
    pass


def export_data(session: Session) -> dict:
    tables = {}
    for name, model in TABLES:
        primary_keys = [col.name for col in model.__table__.primary_key.columns]
        rows = session.exec(select(model).order_by(*[getattr(model, pk) for pk in primary_keys])).all()
        tables[name] = [row.model_dump(mode="json") for row in rows]
    return {
        "format": FORMAT_NAME,
        "schema_version": SCHEMA_VERSION,
        "exported_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "tables": tables,
    }


def export_json(session: Session) -> bytes:
    return json.dumps(export_data(session), ensure_ascii=False, indent=2).encode()


def export_zip(session: Session, data_dir: Path) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("data.json", export_json(session))
        for folder in MEDIA_DIRS:
            root = data_dir / folder
            if root.is_dir():
                for path in sorted(root.rglob("*")):
                    if path.is_file():
                        archive.write(path, f"{folder}/{path.relative_to(root).as_posix()}")
    return buffer.getvalue()


def _migrate(data: dict) -> dict:
    """Bring older export files up to SCHEMA_VERSION (one step per version, none needed yet)."""
    version = data.get("schema_version")
    if not isinstance(version, int):
        raise JsonImportError("missing schema_version")
    if version > SCHEMA_VERSION:
        raise JsonImportError(f"the file is from a newer app version (schema {version}); update the app first")
    return data


def _is_empty(session: Session) -> bool:
    return all(session.exec(select(func.count()).select_from(model)).one() == 0 for model in (Item, Bundle))


def import_data(session: Session, data: dict, mode: Literal["empty", "replace"]) -> dict[str, int]:
    """Replace the whole database content with `data`. Returns the number of rows per table."""
    if data.get("format") != FORMAT_NAME:
        raise JsonImportError("not an Is It Worth It? export file")
    data = _migrate(data)
    tables = data.get("tables")
    if not isinstance(tables, dict):
        raise JsonImportError("missing tables")
    if mode == "empty" and not _is_empty(session):
        raise JsonImportError("the database isn't empty; use mode 'replace' to overwrite everything")

    counts = {}
    try:
        for _name, model in reversed(TABLES):
            session.exec(delete(model))
        default_devices: dict[int, int] = {}
        for name, model in TABLES:
            rows = tables.get(name, [])
            if not isinstance(rows, list):
                raise JsonImportError(f"table {name} must be a list")
            for raw in rows:
                if model is Category and raw.get("default_device_id") is not None:
                    default_devices[raw["id"]] = raw["default_device_id"]
                    raw = {**raw, "default_device_id": None}
                if not isinstance(raw, dict):
                    raise JsonImportError(f"rows in {name} must be objects")
                try:
                    # Attribute object instead of dict: SQLModel would read relationship names such as
                    # Category.items off a dict (dict.items).
                    session.add(model.model_validate(SimpleNamespace(**raw)))
                except ValueError as e:
                    raise JsonImportError(f"invalid row in {name}: {e}") from e
            session.flush()
            counts[name] = len(rows)
        for category_id, device_id in default_devices.items():
            session.get(Category, category_id).default_device_id = device_id
        session.commit()
    except JsonImportError:
        session.rollback()
        raise
    except Exception as e:  # e.g. broken references between tables
        session.rollback()
        raise JsonImportError(f"the file couldn't be imported: {e.__class__.__name__}: {e}") from e
    return counts


def read_upload(content: bytes) -> tuple[dict, dict[str, bytes]]:
    """Accepts a .json file or a .zip export. Returns the data and media files (path → bytes)."""
    media: dict[str, bytes] = {}
    if zipfile.is_zipfile(io.BytesIO(content)):
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if "data.json" not in archive.namelist():
                raise JsonImportError("the ZIP file has no data.json")
            raw = archive.read("data.json")
            for name in archive.namelist():
                path = PurePosixPath(name)
                if name.endswith("/") or path.parts[0] not in MEDIA_DIRS or ".." in path.parts or path.is_absolute():
                    continue
                media[name] = archive.read(name)
    else:
        raw = content
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise JsonImportError(f"not a valid JSON file: {e}") from e
    if not isinstance(data, dict):
        raise JsonImportError("not an Is It Worth It? export file")
    return data, media


def write_media(data_dir: Path, media: dict[str, bytes]) -> None:
    for name, content in media.items():
        target = data_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
