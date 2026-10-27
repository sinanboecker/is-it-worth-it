"""Bundle import from a spreadsheet saved as CSV: one block of rows per bundle.

Each block starts with the bundle row, followed by one row per game in the bundle; an empty row separates the
blocks. All rows have the same columns: name, buy date, price, sold for, hours, finished, comment. A header row is
skipped. On the bundle row, "sold for" is everything the bundle brought in; the part that isn't on a game row counts
as money from other sales (games or keys that aren't listed). The bundle row's hours and the games' prices are not
read: hours belong to the games, and the price is split equally across the games. The buy date comes from the games
(or the bundle row when it has no games).

Games are matched by name within the category. An existing game's copy that isn't in a bundle yet becomes the
bundle copy (its price is replaced by the bundle share, its hours and completions stay); otherwise a new copy is added.
Like the CSV import there are two steps: `preview()` shows the plan, `commit()` plans again and saves it all at once.
"""

import csv
import io
from datetime import date
from typing import Literal

from pydantic import BaseModel
from sqlmodel import Session, select

from app.bundles import apply_split
from app.models import (
    Bundle,
    Category,
    CategoryType,
    Completion,
    Copy,
    CopyFormat,
    GameStatus,
    Item,
    ItemKind,
    PlayLink,
    SplitMode,
)
from app.names import name_key
from app.parsing import decode, norm, parse_date, parse_finished, parse_hours, parse_money, sniff_delimiter
from app.schemas import hours_to_minutes

COLUMNS = ["name", "date", "price", "sold", "hours", "finished", "comment"]
HEADER_NAMES = {"name", "bundle", "bundle name", "spiel", "titel", "title"}
# "sold for" on the bundle row may be a little below the games' sales (rounded in the sheet)
ROUNDING_TOLERANCE_CENTS = 50


class GamePlan(BaseModel):
    line: int
    name: str
    action: Literal["new", "move", "add_copy", "skip"]
    existing_item_id: int | None = None
    copy_id: int | None = None  # move: the existing copy that becomes the bundle copy
    hours: float = 0
    finished: bool = False
    sold_cents: int | None = None
    note: str | None = None


class BundlePlan(BaseModel):
    line: int
    name: str
    buy_date: date | None = None
    total_price_cents: int | None = None
    sold_cents: int = 0
    other_sales_cents: int = 0
    games: list[GamePlan] = []
    skip: bool = False  # a bundle with this name exists already
    warnings: list[str] = []
    errors: list[str] = []


class BundleImportOptions(BaseModel):
    hardware_id: int | None = None  # device for the hours of new games (default: the category's default device)
    store: str | None = None
    format: CopyFormat = CopyFormat.digital


class BundleImportPreview(BaseModel):
    bundles: list[BundlePlan]
    new_bundles: int
    new_games: int
    moved_copies: int
    added_copies: int
    skipped_bundles: int
    with_errors: int
    can_commit: bool


class BundleImportResult(BaseModel):
    bundles_created: int
    games_created: int
    copies_moved: int
    copies_added: int
    skipped_bundles: int


class BundleImportError(ValueError):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


# --- parsing ----------------------------------------------------------------------------------


def _blocks(text: str) -> list[list[tuple[int, list[str]]]]:
    """Rows grouped by empty lines: [(line number, cells padded to COLUMNS)]."""
    blocks: list[list[tuple[int, list[str]]]] = []
    current: list[tuple[int, list[str]]] = []
    for line, cells in enumerate(csv.reader(io.StringIO(text), delimiter=sniff_delimiter(text)), start=1):
        cells = [c.strip() for c in cells]
        if not any(cells):
            if current:
                blocks.append(current)
                current = []
            continue
        current.append((line, cells + [""] * (len(COLUMNS) - len(cells))))
    if current:
        blocks.append(current)
    if blocks and norm(blocks[0][0][1][0]) in HEADER_NAMES:
        blocks[0] = blocks[0][1:]
        if not blocks[0]:
            blocks.pop(0)
    return blocks


def _cell(errors: list[str], parse, raw: str, default=None):
    try:
        value = parse(raw)
    except ValueError as e:
        errors.append(str(e))
        return default
    return default if value is None else value


def _device(session: Session, category: Category, options: BundleImportOptions) -> Item | None:
    device_id = options.hardware_id if options.hardware_id is not None else category.default_device_id
    device = session.get(Item, device_id) if device_id is not None else None
    return device if device is not None and device.kind is ItemKind.hardware else None


# --- planning ---------------------------------------------------------------------------------


def plan(session: Session, category: Category, data: bytes, options: BundleImportOptions) -> BundleImportPreview:
    if category.type is CategoryType.hardware_only:
        raise ValueError(f'"{category.name}" holds hardware only; import bundles into a platform category')
    text, _encoding = decode(data)
    blocks = _blocks(text)
    if not blocks:
        raise ValueError("the file has no bundles")

    known_bundles = {name_key(b.name) for b in session.exec(select(Bundle)).all()}
    games = {
        name_key(g.name): g
        for g in session.exec(select(Item).where(Item.category_id == category.id, Item.kind == ItemKind.game)).all()
    }
    # copies of existing games that can become bundle copies, used up in file order
    movable = {g.id: [c for c in g.copies if c.bundle_id is None] for g in games.values()}
    created: set[str] = set()  # games this file creates; later rows of the same game add copies
    has_device = _device(session, category, options) is not None

    plans = []
    for (line, cells), *game_rows in blocks:
        bundle = BundlePlan(line=line, name=cells[0])
        errors = bundle.errors
        if not bundle.name:
            errors.append("the bundle row has no name")
        bundle.total_price_cents = _cell(errors, parse_money, cells[2])
        if bundle.total_price_cents is None and not errors:
            errors.append("the bundle price is missing")
        bundle.sold_cents = _cell(errors, parse_money, cells[3], 0)
        bundle.skip = name_key(bundle.name) in known_bundles
        if bundle.skip:
            bundle.warnings.append("a bundle with this name exists already: skipped")
        known_bundles.add(name_key(bundle.name))

        dates = []
        for game_line, game_cells in game_rows:
            game_errors: list[str] = []
            game = GamePlan(line=game_line, name=game_cells[0], action="skip")
            if (game_date := _cell(game_errors, parse_date, game_cells[1])) is not None:
                dates.append(game_date)
            game.sold_cents = _cell(game_errors, parse_money, game_cells[3])
            game.hours = round(_cell(game_errors, parse_hours, game_cells[4], 0.0), 2)
            game.finished, _finished_on = _cell(game_errors, parse_finished, game_cells[5], (False, None))
            game.note = game_cells[6] or None
            errors += [f"line {game_line}: {e}" for e in game_errors]
            if not game.name:
                errors.append(f"line {game_line}: the game has no name")
            bundle.games.append(game)
            if bundle.skip or not game.name:
                continue

            key = name_key(game.name)
            existing = games.get(key)
            if existing is not None and movable[existing.id]:
                game.action, game.existing_item_id = "move", existing.id
                game.copy_id = movable[existing.id].pop(0).id
            elif existing is not None or key in created:
                game.action, game.existing_item_id = "add_copy", existing.id if existing else None
            else:
                game.action = "new"
                created.add(key)
            if game.hours > 0 and existing is None and not has_device:
                errors.append(f"line {game_line}: choose a device for the hours")

        bundle_date = _cell(errors, parse_date, cells[1])
        bundle.buy_date = dates[0] if dates else bundle_date
        if bundle.buy_date is None:
            errors.append("no buy date: put one on the bundle row or the game rows")
        elif len(set(dates)) > 1:
            bundle.warnings.append(f"the games have different dates; using {bundle.buy_date:%d.%m.%Y}")

        other_sales = bundle.sold_cents - sum(g.sold_cents or 0 for g in bundle.games)
        if other_sales < -ROUNDING_TOLERANCE_CENTS:
            errors.append("the games were sold for more than the bundle's 'sold for'")
        bundle.other_sales_cents = max(other_sales, 0)
        if not game_rows:
            bundle.warnings.append("no games listed: only the price and the sales are imported")
        plans.append(bundle)

    active = [b for b in plans if not b.skip]
    actions = [g.action for b in active for g in b.games]
    return BundleImportPreview(
        bundles=plans,
        new_bundles=len(active),
        new_games=actions.count("new"),
        moved_copies=actions.count("move"),
        added_copies=actions.count("add_copy"),
        skipped_bundles=len(plans) - len(active),
        with_errors=sum(1 for b in plans if b.errors),
        can_commit=not any(b.errors for b in active),
    )


# --- commit -----------------------------------------------------------------------------------


def _book_hours(game: Item, device: Item | None, hours: float) -> None:
    if hours <= 0 or device is None:
        return
    link = next((link for link in game.play_links if link.hardware_id == device.id), None)
    if link is None:
        link = PlayLink(hardware_id=device.id, emulated=device.category.type is CategoryType.hardware_only)
        game.play_links.append(link)
    link.minutes += hours_to_minutes(hours)
    if game.status is GameStatus.backlog:
        game.status = GameStatus.played


def _finish(game: Item) -> None:
    if not game.completions:
        game.completions.append(Completion(finished_on=None))
    game.status = GameStatus.finished


def commit(session: Session, category: Category, data: bytes, options: BundleImportOptions) -> BundleImportResult:
    planned = plan(session, category, data, options)
    if not planned.can_commit:
        raise BundleImportError(
            [f"{b.name or f'line {b.line}'}: {e}" for b in planned.bundles if not b.skip for e in b.errors]
        )
    device = _device(session, category, options)
    created: dict[str, Item] = {}
    result = BundleImportResult(
        bundles_created=0, games_created=0, copies_moved=0, copies_added=0, skipped_bundles=planned.skipped_bundles
    )
    try:
        for plan_ in planned.bundles:
            if plan_.skip:
                continue
            bundle = Bundle(
                name=plan_.name,
                buy_date=plan_.buy_date,
                total_price_cents=plan_.total_price_cents,
                other_sales_cents=plan_.other_sales_cents,
                store=options.store,
                split_mode=SplitMode.equal,
            )
            session.add(bundle)
            for g in plan_.games:
                if g.action == "move":
                    copy = session.get(Copy, g.copy_id)
                    game = copy.item
                    result.copies_moved += 1
                else:
                    if g.action == "new":
                        game = Item(category=category, kind=ItemKind.game, name=g.name, status=GameStatus.backlog)
                        session.add(game)
                        created[name_key(g.name)] = game
                        result.games_created += 1
                    else:
                        game = session.get(Item, g.existing_item_id) if g.existing_item_id else None
                        game = game or created[name_key(g.name)]
                        result.copies_added += 1
                    copy = Copy(buy_date=plan_.buy_date, buy_price_cents=0, format=options.format)
                    game.copies.append(copy)
                    if game.status is GameStatus.wishlist:
                        game.status = GameStatus.backlog
                    # hours only for games this file creates; existing games keep theirs
                    if g.existing_item_id is None:
                        _book_hours(game, device, g.hours)
                if g.sold_cents is not None:
                    copy.sell_price_cents = g.sold_cents
                if g.note:
                    copy.note = g.note
                if g.finished and (g.existing_item_id is None or not game.completions):
                    _finish(game)
                bundle.copies.append(copy)
            apply_split(bundle)
            result.bundles_created += 1
        session.commit()
    except Exception:
        session.rollback()
        raise
    return result
