"""Import finish dates from a plain list: month headings, then one finished game per line.

    September, 2026
    29 Resonance: A Plague Tale Legacy, PC
    21 Call of Duty: Modern Warfare II, PC

An entry is the day, the game's name and, after the last ", ", the platform (optional). Entries without their own
heading (e.g. after an empty line) belong to the heading above. Games are matched by name (punctuation and case
don't matter); when a name exists in several categories, the platform picks the one whose category or devices match.

Per game, oldest date first: a finish on the same date is there already; a finish with an unknown date gets the date;
otherwise a new finish (a replay) is added. Like the CSV import there are two steps, and the user can pick the game
for lines that weren't matched; the server always plans the actions itself. A finish in the past doesn't end a game
that's being played (or is endless) right now.
"""

import calendar
import difflib
import re
from collections import defaultdict
from datetime import date
from typing import Literal

from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.csv_import import decode
from app.models import Completion, GameStatus, Item, ItemKind, PlayLink
from app.rawg import normalize

MONTHS = {name.lower(): number for number, name in enumerate(calendar.month_name) if name}
HEADING = re.compile(r"^([A-Za-z]+),?\s+(\d{4})$")
ENTRY = re.compile(r"^(\d{1,2})\.?\s+(.+)$")
# platform spellings → one key, e.g. "PlayStation 5" and "PS5" → "ps5", "Xbox Series X|S" → "xbox series"
PLATFORM_WORDS = [
    (r"\bplaystation\s*", "ps"),
    (r"\bnintendo\s+", ""),
    (r"\bgame\s*boy\b", "gameboy"),
    (r"\bseries\s+[xs](\s+[xs])?\b", "series"),
]


class FinishRowIn(BaseModel):
    line: int
    finished_on: date | None
    name: str
    platform: str | None = None
    item_id: int | None = None
    picked: bool = False  # the user chose item_id (or cleared it to skip); otherwise it's matched by name
    errors: list[str] = []  # kept only for unreadable lines (without a date); planned again for the others


class Candidate(BaseModel):
    id: int
    name: str
    category: str


class FinishRow(FinishRowIn):
    item_name: str | None = None
    match: Literal["exact", "suggested", "ambiguous", "not_found", "picked"] = "not_found"
    action: Literal["fill", "add", "already", "skip"] = "skip"
    candidates: list[Candidate] = []


class FinishImportPreview(BaseModel):
    rows: list[FinishRow]
    fill: int
    add: int
    already: int
    skip: int
    can_commit: bool


class FinishImportResult(BaseModel):
    filled: int
    added: int
    already: int
    skipped: int


class FinishImportError(ValueError):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


# --- parsing ----------------------------------------------------------------------------------


def parse(data: bytes) -> list[FinishRow]:
    text, _encoding = decode(data)
    rows: list[FinishRow] = []
    month: tuple[int, int] | None = None
    for line_number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if (heading := HEADING.match(line)) and heading.group(1).lower() in MONTHS:
            month = (int(heading.group(2)), MONTHS[heading.group(1).lower()])
            continue
        row = FinishRow(line=line_number, finished_on=None, name=line)
        entry = ENTRY.match(line)
        if entry is None:
            row.errors.append("not a finished game (day, name) or a month heading")
        else:
            name, _, platform = entry.group(2).rpartition(", ")
            row.name, row.platform = (name, platform) if name else (platform, None)
            if month is None:
                row.errors.append("no month heading above this line")
            else:
                try:
                    row.finished_on = date(*month, int(entry.group(1)))
                except ValueError:
                    row.errors.append(f"there's no day {entry.group(1)} in {calendar.month_name[month[1]]} {month[0]}")
        rows.append(row)
    if not rows:
        raise ValueError("the file has no finished games")
    return rows


# --- matching ---------------------------------------------------------------------------------


def platform_key(text: str) -> str:
    key = normalize(text)
    for pattern, replacement in PLATFORM_WORDS:
        key = re.sub(pattern, replacement, key)
    return re.sub(r"\s+", " ", key).strip()


def _on_platform(game: Item, platform: str) -> bool:
    wanted = f" {platform_key(platform)} "
    names = [game.category.name] + [link.hardware.name for link in game.play_links]
    return any(wanted in f" {platform_key(n)} " or f" {platform_key(n)} " in wanted for n in names)


def _load_games(session: Session) -> list[Item]:
    return list(
        session.exec(
            select(Item)
            .where(Item.kind == ItemKind.game)
            .options(
                selectinload(Item.category),
                selectinload(Item.completions),
                selectinload(Item.play_links).selectinload(PlayLink.hardware),
            )
        ).all()
    )


def _match(row: FinishRow, by_name: dict[str, list[Item]]) -> None:
    full = f"{row.name}, {row.platform}" if row.platform else row.name
    for name in (row.name, full):
        found = by_name.get(normalize(name), [])
        if len(found) > 1 and row.platform:
            found = [g for g in found if _on_platform(g, row.platform)] or found
        if len(found) == 1:
            row.item_id, row.match = found[0].id, "exact"
            return
        if found:
            row.match = "ambiguous"
            row.candidates = [Candidate(id=g.id, name=g.name, category=g.category.name) for g in found]
            return
    target = normalize(row.name)
    scored = [(difflib.SequenceMatcher(None, target, key).ratio(), key) for key in by_name]
    close = [key for ratio, key in scored if ratio >= 0.85]
    ratio, key = max(scored, default=(0.0, ""))
    if len(close) == 1 and ratio >= 0.92 and len(by_name[key]) == 1:
        row.item_id, row.match = by_name[key][0].id, "suggested"


def plan(session: Session, rows_in: list[FinishRowIn]) -> FinishImportPreview:
    games = _load_games(session)
    by_id = {g.id: g for g in games}
    by_name: dict[str, list[Item]] = defaultdict(list)
    for game in games:
        by_name[normalize(game.name)].append(game)

    rows = []
    for row_in in rows_in:
        row = FinishRow(**row_in.model_dump())
        if row.finished_on is None:
            row.item_id = None
            row.errors = row.errors or ["unreadable line"]
            rows.append(row)
            continue
        row.errors = []
        if row.picked:
            row.match = "picked" if row.item_id is not None else "not_found"
            if row.item_id is not None and row.item_id not in by_id:
                row.errors.append("game not found")
        else:
            row.item_id = None
            _match(row, by_name)
        rows.append(row)

    # per game, oldest first: same date there already / fill an unknown date / add a finish
    dates = {g.id: {c.finished_on for c in g.completions if c.finished_on} for g in games}
    unknown = {g.id: sum(1 for c in g.completions if c.finished_on is None) for g in games}
    for row in sorted(rows, key=lambda r: (r.finished_on or date.min, r.line)):
        game = by_id.get(row.item_id)
        if game is None or row.errors:
            row.action = "skip"
            continue
        row.item_name = game.name
        if game.status is GameStatus.wishlist:
            row.errors.append(f"“{game.name}” is on your wishlist; add a copy first (or skip this line)")
            row.action = "skip"
        elif row.finished_on in dates[game.id]:
            row.action = "already"
        elif unknown[game.id]:
            unknown[game.id] -= 1
            row.action = "fill"
        else:
            row.action = "add"
        dates[game.id].add(row.finished_on)

    actions = [r.action for r in rows]
    return FinishImportPreview(
        rows=rows,
        fill=actions.count("fill"),
        add=actions.count("add"),
        already=actions.count("already"),
        skip=actions.count("skip"),
        can_commit=not any(r.errors for r in rows if r.item_id is not None),
    )


def preview(session: Session, data: bytes) -> FinishImportPreview:
    return plan(session, [FinishRowIn(**r.model_dump()) for r in parse(data)])


# --- commit -----------------------------------------------------------------------------------


def commit(session: Session, rows_in: list[FinishRowIn]) -> FinishImportResult:
    planned = plan(session, rows_in)
    problems = [f"line {r.line}: {e}" for r in planned.rows if r.item_id is not None for e in r.errors]
    if problems:
        raise FinishImportError(problems)
    games = {g.id: g for g in _load_games(session)}
    try:
        for row in sorted(planned.rows, key=lambda r: (r.finished_on or date.min, r.line)):
            game = games.get(row.item_id)
            if row.action == "fill":
                next(c for c in game.completions if c.finished_on is None).finished_on = row.finished_on
            elif row.action == "add":
                # a finish in the past: unlike finishing now, the current play-through (started on, playing) stays
                game.completions.append(Completion(finished_on=row.finished_on))
                if game.status not in (GameStatus.playing, GameStatus.endless):
                    game.status = GameStatus.finished
        session.commit()
    except Exception:
        session.rollback()
        raise
    return FinishImportResult(filled=planned.fill, added=planned.add, already=planned.already, skipped=planned.skip)
