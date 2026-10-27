"""CSV game import per category (PLANNING.md §10).

Two steps: `preview()` parses the file and returns one `ImportRow` per line (with the action that would be taken,
warnings and errors); the client may edit those rows; `commit()` validates them again and writes everything in
one transaction. Calculated spreadsheet columns (cost, cost per hour, …) are simply not mapped and thus ignored.
"""

import csv
import io
import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.models import (
    Category,
    CategoryType,
    Completion,
    Copy,
    CopyCondition,
    CopyFormat,
    GameStatus,
    Item,
    ItemKind,
    PlayLink,
)
from app.names import name_key
from app.parsing import (
    decode,
    norm,
    parse_date,
    parse_finished,
    parse_hours,
    parse_money,
    parse_rating,
    sniff_delimiter,
)
from app.schemas import Stars, hours_to_minutes, stars_to_half

FIELDS = [
    "name",
    "buy_date",
    "buy_price",
    "sell_date",
    "sell_price",
    "hours",
    "store",
    "format",
    "condition",
    "status",
    "rating",
    "finished",
    "notes",
]

# Normalized header (see _norm) → field. German and English variants.
HEADER_SYNONYMS = {
    "name": ["name", "spiel", "spielname", "titel", "title", "game", "spiele"],
    "buy_date": [
        "kaufdatum",
        "gekauft",
        "gekauft am",
        "datum",
        "buy date",
        "purchase date",
        "bought",
        "bought on",
        "date",
    ],
    "buy_price": ["preis", "kaufpreis", "einkaufspreis", "buy price", "price", "purchase price", "kosten"],
    "sell_date": ["verkaufsdatum", "verkauft am", "sell date", "sold on", "sale date"],
    "sell_price": ["verkaufspreis", "verkauft fur", "verkauft", "sell price", "sold for", "sale price", "erlos"],
    "hours": ["spielzeit", "stunden", "spielstunden", "gespielt", "hours", "playtime", "hours played", "h"],
    "store": ["shop", "store", "handler", "gekauft bei", "laden", "plattform store"],
    "format": ["format", "physisch digital", "physical digital", "medium", "typ", "type"],
    "condition": ["zustand", "condition"],
    "status": ["status"],
    "rating": ["bewertung", "rating", "sterne", "stars", "wertung"],
    "finished": [
        "durchgespielt",
        "beendet",
        "abgeschlossen",
        "finished",
        "completed",
        "durchgespielt am",
        "finished on",
    ],
    "notes": ["kommentar", "kommentare", "notiz", "notizen", "bemerkung", "anmerkung", "notes", "note", "comment"],
}

TOTAL_ROW_NAMES = {"summe", "gesamt", "total", "sum", "insgesamt"}
FORMAT_VALUES = {
    "physisch": CopyFormat.physical, "physical": CopyFormat.physical, "disc": CopyFormat.physical,
    "disk": CopyFormat.physical, "retail": CopyFormat.physical, "box": CopyFormat.physical,
    "modul": CopyFormat.physical, "cartridge": CopyFormat.physical,
    "digital": CopyFormat.digital, "download": CopyFormat.digital, "key": CopyFormat.digital,
}  # fmt: skip
CONDITION_VALUES = {
    "neu": CopyCondition.new,
    "new": CopyCondition.new,
    "gebraucht": CopyCondition.used,
    "used": CopyCondition.used,
}
STATUS_VALUES = {
    "wishlist": GameStatus.wishlist, "wunschliste": GameStatus.wishlist,
    "backlog": GameStatus.backlog, "ungespielt": GameStatus.backlog,
    "playing": GameStatus.playing, "spiele gerade": GameStatus.playing, "currently playing": GameStatus.playing,
    "on hold": GameStatus.on_hold, "pausiert": GameStatus.on_hold,
    "played": GameStatus.played, "gespielt": GameStatus.played,
    "finished": GameStatus.finished, "durchgespielt": GameStatus.finished, "beendet": GameStatus.finished,
    "abandoned": GameStatus.abandoned, "abgebrochen": GameStatus.abandoned,
    "endless": GameStatus.endless, "endlos": GameStatus.endless,
}  # fmt: skip


class ImportError_(ValueError):
    """Raised by commit(); `problems` lists the offending lines."""

    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


class ImportRow(BaseModel):
    line: int = Field(description="line number in the CSV file (header = 1)")
    name: str = ""
    buy_date: date | None = None
    buy_price_cents: int | None = None
    sell_date: date | None = None
    sell_price_cents: int | None = None
    hours: float = 0
    store: str | None = None
    format: CopyFormat = CopyFormat.digital
    condition: CopyCondition | None = None
    status: GameStatus | None = None
    rating: Stars | None = None
    finished: bool = False
    finished_on: date | None = None
    notes: str | None = None
    hardware_id: int | None = None
    action: Literal["create", "add_copy", "wishlist", "skip"] = "create"
    existing_item_id: int | None = Field(None, description="add_copy: game that gets the copy")
    copy_of_line: int | None = Field(None, description="add_copy: game created by an earlier line of this file")
    duplicate: bool = False
    warnings: list[str] = []
    errors: list[str] = []


class ImportTotals(BaseModel):
    rows: int = 0
    create: int = 0
    add_copy: int = 0
    wishlist: int = 0
    skip: int = 0
    with_errors: int = 0
    spent_cents: int = 0
    hours: float = 0


class ImportPreview(BaseModel):
    encoding: str
    delimiter: str
    headers: list[str]
    mapping: dict[str, str | None] = Field(description="field → CSV header (null = not in the file)")
    ignored_columns: list[str]
    rows: list[ImportRow]
    totals: ImportTotals
    can_commit: bool


class ImportOptions(BaseModel):
    hardware_id: int | None = None  # device for the hours (default: the category's default device)
    default_store: str | None = None
    default_format: CopyFormat = CopyFormat.digital
    mapping: dict[str, str | None] = {}  # overrides: field → header name (null = don't import this field)


class CommitResult(BaseModel):
    games_created: int
    copies_added: int
    wishlist_added: int
    skipped: int


# --- preview ----------------------------------------------------------------------------------


def auto_mapping(headers: list[str]) -> dict[str, int]:
    lookup = {syn: field for field, syns in HEADER_SYNONYMS.items() for syn in syns}
    mapping: dict[str, int] = {}
    for index, header in enumerate(headers):
        field = lookup.get(norm(header))
        if field is not None and field not in mapping:
            mapping[field] = index
    return mapping


def _apply_overrides(headers: list[str], mapping: dict[str, int], overrides: dict[str, str | None]) -> dict[str, int]:
    mapping = dict(mapping)
    for field, header in overrides.items():
        if field not in FIELDS:
            raise ValueError(f"unknown field {field!r}; known fields: {', '.join(FIELDS)}")
        if header is None:
            mapping.pop(field, None)
        elif header in headers:
            mapping[field] = headers.index(header)
        else:
            raise ValueError(f"column {header!r} not found in the file")
    return mapping


def _parse_row(line: int, cells: list[str], mapping: dict[str, int], options: ImportOptions) -> ImportRow | None:
    def cell(field: str) -> str:
        index = mapping.get(field)
        return cells[index].strip() if index is not None and index < len(cells) else ""

    if not any(c.strip() for c in cells):
        return None
    row = ImportRow(line=line, name=re.sub(r"\s+", " ", cell("name")).strip(), format=options.default_format)
    row.store = cell("store") or options.default_store
    row.notes = cell("notes") or None

    parsers = {
        "buy_date": lambda: setattr(row, "buy_date", parse_date(cell("buy_date"))),
        "buy_price": lambda: setattr(row, "buy_price_cents", parse_money(cell("buy_price"))),
        "sell_date": lambda: setattr(row, "sell_date", parse_date(cell("sell_date"))),
        "sell_price": lambda: setattr(row, "sell_price_cents", parse_money(cell("sell_price"))),
        "hours": lambda: setattr(row, "hours", round(parse_hours(cell("hours")), 2)),
        "rating": lambda: setattr(row, "rating", parse_rating(cell("rating"))),
    }
    for parse in parsers.values():
        try:
            parse()
        except ValueError as e:
            row.errors.append(str(e))
    try:
        row.finished, row.finished_on = parse_finished(cell("finished"))
    except ValueError as e:
        row.errors.append(str(e))

    if raw := cell("format"):
        if norm(raw) in FORMAT_VALUES:
            row.format = FORMAT_VALUES[norm(raw)]
        else:
            row.warnings.append(f"unknown format {raw!r}, using {row.format.value}")
    if raw := cell("condition"):
        if norm(raw) in CONDITION_VALUES:
            row.condition = CONDITION_VALUES[norm(raw)]
        else:
            row.warnings.append(f"unknown condition {raw!r}, ignored")
    if raw := cell("status"):
        if norm(raw) in STATUS_VALUES:
            row.status = STATUS_VALUES[norm(raw)]
        else:
            row.warnings.append(f"unknown status {raw!r}, derived from playtime instead")
    return row


def _derive(row: ImportRow) -> None:
    """Fill status/action defaults for a parsed row."""
    if norm(row.name) in TOTAL_ROW_NAMES:
        row.action = "skip"
        row.warnings.append("looks like a total row, skipped")
        return
    if row.buy_date is None and row.buy_price_cents is None and not row.errors:
        row.action = "wishlist"
        row.status = GameStatus.wishlist
        return
    if row.buy_date is None and not row.errors:
        row.warnings.append("no buy date, stored as unknown")
    if row.status is None:
        if row.finished:
            row.status = GameStatus.finished
        elif row.hours > 0:
            row.status = GameStatus.played
        else:
            row.status = GameStatus.backlog
    if row.condition is not None and row.format is CopyFormat.digital:
        row.condition = None
        row.warnings.append("condition is only for physical copies, ignored")


def validate_row(session: Session, row: ImportRow) -> list[str]:
    """Problems that block importing this row (also used again on commit)."""
    if row.action == "skip":
        return []
    errors = []
    if not row.name:
        errors.append("name is missing")
    if row.action == "wishlist":
        if row.hours > 0:
            errors.append("a wishlist game (no buy date/price) can't have hours")
        if row.finished:
            errors.append("a wishlist game (no buy date/price) can't be finished")
        return errors
    if row.buy_price_cents is None:
        errors.append("buy price is missing")
    if row.sell_date is not None and row.sell_price_cents is None:
        errors.append("sell date without sell price")
    if row.status is GameStatus.wishlist:
        errors.append("status wishlist, but the row has a purchase")
    if row.hardware_id is not None:
        hardware = session.get(Item, row.hardware_id)
        if hardware is None or hardware.kind is not ItemKind.hardware:
            errors.append(f"device {row.hardware_id} not found")
    elif row.hours > 0:
        errors.append("choose a device for the hours")
    if row.action == "add_copy" and row.existing_item_id is None and row.copy_of_line is None:
        errors.append("add_copy needs existing_item_id or copy_of_line")
    return errors


def _existing_games(session: Session, category: Category) -> dict[str, Item]:
    games = session.exec(select(Item).where(Item.category_id == category.id, Item.kind == ItemKind.game)).all()
    return {name_key(g.name): g for g in games}


def _assign_actions(session: Session, category: Category, rows: list[ImportRow]) -> None:
    existing = _existing_games(session, category)
    first_line: dict[str, ImportRow] = {}
    for row in rows:
        if row.action == "skip" or not row.name:
            continue
        key = name_key(row.name)
        game = existing.get(key)
        if game is not None:
            if row.action == "wishlist" or any(c.buy_date == row.buy_date for c in game.copies):
                row.action, row.duplicate = "skip", True
                row.warnings.append(f'already in "{category.name}", skipped')
            else:
                row.action, row.existing_item_id = "add_copy", game.id
                row.warnings.append("game already exists: added as another copy")
        elif key in first_line:
            earlier = first_line[key]
            if row.action == "wishlist" or earlier.action == "wishlist" or row.buy_date == earlier.buy_date:
                row.action, row.duplicate = "skip", True
                row.warnings.append(f"same game as line {earlier.line}, skipped")
            else:
                row.action, row.copy_of_line = "add_copy", earlier.line
                row.warnings.append(f"same game as line {earlier.line}: added as another copy")
        else:
            first_line[key] = row


def _totals(rows: list[ImportRow]) -> ImportTotals:
    totals = ImportTotals(rows=len(rows))
    for row in rows:
        setattr(totals, row.action, getattr(totals, row.action) + 1)
        if row.errors:
            totals.with_errors += 1
        elif row.action in ("create", "add_copy"):
            totals.spent_cents += (row.buy_price_cents or 0) - (row.sell_price_cents or 0)
            totals.hours += row.hours
    totals.hours = round(totals.hours, 2)
    return totals


def preview(session: Session, category: Category, data: bytes, options: ImportOptions) -> ImportPreview:
    if category.type is CategoryType.hardware_only:
        raise ValueError(f'"{category.name}" holds hardware only; import games into a platform category')
    text, encoding = decode(data)
    delimiter = sniff_delimiter(text)
    lines = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not lines:
        raise ValueError("the file is empty")
    headers = [h.strip() for h in lines[0]]
    mapping = _apply_overrides(headers, auto_mapping(headers), options.mapping)
    if "name" not in mapping:
        raise ValueError("no name column found; map one of the columns to 'name'")

    hardware_id = options.hardware_id if options.hardware_id is not None else category.default_device_id
    rows = []
    for line_number, cells in enumerate(lines[1:], start=2):
        row = _parse_row(line_number, cells, mapping, options)
        if row is None:
            continue
        row.hardware_id = hardware_id
        _derive(row)
        rows.append(row)
    _assign_actions(session, category, rows)
    for row in rows:
        row.errors += validate_row(session, row)

    used = set(mapping.values())
    return ImportPreview(
        encoding=encoding,
        delimiter=delimiter,
        headers=headers,
        mapping={field: headers[mapping[field]] if field in mapping else None for field in FIELDS},
        ignored_columns=[h for i, h in enumerate(headers) if i not in used and h],
        rows=rows,
        totals=_totals(rows),
        can_commit=not any(r.errors for r in rows if r.action != "skip"),
    )


# --- commit -----------------------------------------------------------------------------------


def _add_purchase(session: Session, game: Item, row: ImportRow) -> None:
    game.copies.append(
        Copy(
            buy_date=row.buy_date,
            buy_price_cents=row.buy_price_cents,
            store=row.store,
            format=row.format,
            condition=row.condition if row.format is CopyFormat.physical else None,
            sell_price_cents=row.sell_price_cents,
            sell_date=row.sell_date,
        )
    )
    if row.hardware_id is not None:
        link = next((link for link in game.play_links if link.hardware_id == row.hardware_id), None)
        if link is None:
            hardware = session.get(Item, row.hardware_id)
            link = PlayLink(hardware_id=hardware.id, emulated=hardware.category.type is CategoryType.hardware_only)
            game.play_links.append(link)
        link.minutes += hours_to_minutes(row.hours)
    if row.finished and (row.finished_on is not None or not game.completions):
        game.completions.append(Completion(finished_on=row.finished_on))
    if row.status is GameStatus.finished and not game.completions:
        game.completions.append(Completion(finished_on=None))
    if row.rating is not None and game.rating is None:
        game.rating = stars_to_half(row.rating)
    if row.notes and row.notes not in (game.notes or ""):
        game.notes = f"{game.notes}\n{row.notes}" if game.notes else row.notes


def commit(session: Session, category: Category, rows: list[ImportRow]) -> CommitResult:
    if category.type is CategoryType.hardware_only:
        raise ImportError_([f'"{category.name}" holds hardware only'])
    problems = [f"line {row.line}: {err}" for row in rows for err in validate_row(session, row)]
    lines = {row.line for row in rows}
    problems += [
        f"line {row.line}: copy_of_line {row.copy_of_line} isn't part of the import"
        for row in rows
        if row.action == "add_copy" and row.copy_of_line is not None and row.copy_of_line not in lines
    ]
    if problems:
        raise ImportError_(problems)

    result = CommitResult(games_created=0, copies_added=0, wishlist_added=0, skipped=0)
    created: dict[int, Item] = {}
    try:
        for row in sorted(rows, key=lambda r: r.line):
            if row.action == "skip":
                result.skipped += 1
                continue
            if row.action == "add_copy":
                game = created.get(row.copy_of_line) if row.copy_of_line is not None else None
                if game is None:
                    game = session.get(Item, row.existing_item_id)
                if game is None or game.kind is not ItemKind.game or game.category_id != category.id:
                    raise ImportError_([f"line {row.line}: game to add the copy to not found in this category"])
                if game.status is GameStatus.wishlist:
                    game.status = row.status
                _add_purchase(session, game, row)
                result.copies_added += 1
                continue

            game = Item(category=category, kind=ItemKind.game, name=row.name, status=row.status, notes=row.notes)
            session.add(game)
            created[row.line] = game
            if row.action == "wishlist":
                result.wishlist_added += 1
                continue
            game.notes = None  # set again (without duplicates) by _add_purchase
            _add_purchase(session, game, row)
            result.games_created += 1
        session.commit()
    except Exception:
        session.rollback()
        raise
    return result


TEMPLATE_HEADERS = ["name", "buy_date", "buy_price", "sell_date", "sell_price", "hours", "store", "format",
                    "condition", "status", "rating", "finished", "notes"]  # fmt: skip
TEMPLATE_EXAMPLE = ["Zelda: Tears of the Kingdom", "12.05.2023", "59,99", "", "", "85,5", "MediaMarkt", "physical",
                    "new", "", "4,5", "✓", "Collector's Edition"]  # fmt: skip


def template_csv() -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(TEMPLATE_HEADERS)
    writer.writerow(TEMPLATE_EXAMPLE)
    return buffer.getvalue()
