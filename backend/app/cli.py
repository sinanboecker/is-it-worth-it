"""Command line tools: `python -m app.cli --help`."""

import argparse
import sys
from datetime import date
from pathlib import Path

from sqlmodel import Session, select

from app import config, csv_import, json_io
from app.db import create_tables, get_engine
from app.models import Category, CopyFormat, Item, ItemKind
from app.seed import seed


def _session() -> Session:
    engine = get_engine()
    create_tables(engine)
    session = Session(engine)
    seed(session)
    return session


def _find(session: Session, model, name: str, **filters):
    query = select(model).where(model.name == name)
    for key, value in filters.items():
        query = query.where(getattr(model, key) == value)
    found = session.exec(query).first()
    if found is None:
        sys.exit(f"{model.__name__.lower()} {name!r} not found")
    return found


def cmd_import_csv(args) -> None:
    with _session() as session:
        category = _find(session, Category, args.category)
        device = _find(session, Item, args.device, kind=ItemKind.hardware) if args.device else None
        options = csv_import.ImportOptions(
            hardware_id=device.id if device else None,
            default_store=args.store,
            default_format=CopyFormat(args.format),
        )
        try:
            preview = csv_import.preview(session, category, Path(args.file).read_bytes(), options)
        except ValueError as e:
            sys.exit(f"error: {e}")

        print(f"Columns: {', '.join(f'{k} ← {v}' for k, v in preview.mapping.items() if v)}")
        if preview.ignored_columns:
            print(f"Ignored: {', '.join(preview.ignored_columns)}")
        for row in preview.rows:
            notes = "; ".join(row.errors + row.warnings)
            print(f"  line {row.line:>4}  {row.action:<8}  {row.name}{f'  ({notes})' if notes else ''}")
        t = preview.totals
        print(
            f"{t.create} new, {t.add_copy} extra copies, {t.wishlist} wishlist, {t.skip} skipped, "
            f"{t.with_errors} with errors — {t.spent_cents / 100:.2f} €, {t.hours:g} h"
        )
        if not preview.can_commit:
            sys.exit("not imported: fix the errors above (or change those rows to 'skip' in the web app)")
        if args.dry_run:
            print("dry run: nothing imported")
            return
        result = csv_import.commit(session, category, preview.rows)
        print(f"imported: {result.games_created} games, {result.copies_added} copies, {result.wishlist_added} wishlist")


def cmd_export(args) -> None:
    with _session() as session:
        extension = "zip" if args.images else "json"
        target = Path(args.output or f"is-it-worth-it-{date.today().isoformat()}.{extension}")
        content = json_io.export_zip(session, config.DATA_DIR) if args.images else json_io.export_json(session)
        target.write_bytes(content)
        print(f"exported to {target}")


def cmd_import_json(args) -> None:
    with _session() as session:
        try:
            data, media = json_io.read_upload(Path(args.file).read_bytes())
            counts = json_io.import_data(session, data, args.mode)
        except json_io.JsonImportError as e:
            sys.exit(f"error: {e}")
        json_io.write_media(config.DATA_DIR, media)
        print("imported: " + ", ".join(f"{n} {name}" for name, n in counts.items()))


def cmd_openapi(args) -> None:
    import json

    from app.main import app

    Path(args.output).write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n")
    print(f"OpenAPI schema written to {args.output}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Is It Worth It? command line tools")
    commands = parser.add_subparsers(required=True)

    p = commands.add_parser("import-csv", help="import games from a CSV file into a category")
    p.add_argument("file")
    p.add_argument("--category", required=True, help="category name, e.g. PC")
    p.add_argument("--device", help="hardware name the hours are booked on (default: the category's default device)")
    p.add_argument("--store", help="store for rows without a store column, e.g. Steam")
    p.add_argument("--format", choices=[f.value for f in CopyFormat], default="digital")
    p.add_argument("--dry-run", action="store_true", help="only show what would be imported")
    p.set_defaults(func=cmd_import_csv)

    p = commands.add_parser("export", help="export everything as JSON (or ZIP with images)")
    p.add_argument("-o", "--output")
    p.add_argument("--images", action="store_true", help="ZIP with data.json + covers/ + uploads/")
    p.set_defaults(func=cmd_export)

    p = commands.add_parser("import-json", help="restore a JSON/ZIP export")
    p.add_argument("file")
    p.add_argument("--mode", choices=["empty", "replace"], default="empty")
    p.set_defaults(func=cmd_import_json)

    p = commands.add_parser("openapi", help="write the OpenAPI schema (used to generate the frontend API types)")
    p.add_argument("-o", "--output", default="openapi.json")
    p.set_defaults(func=cmd_openapi)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
