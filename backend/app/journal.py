"""Backloggd-style journal of finished games, and the calendar heatmap (PLANNING.md §4)."""

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date

from app import calc
from app.models import Completion, Item, ItemKind


@dataclass
class JournalEntry:
    completion_id: int
    item_id: int
    name: str
    category_id: int
    cover_path: str | None
    finished_on: date | None
    started_on: date | None
    hardware_id: int | None
    hardware_name: str | None
    emulated: bool
    hours: float
    rating: float | None  # stars; ratings belong to the game, not to a single finish
    review: str | None
    note: str | None
    mastered: bool
    replay: bool  # not the first finish of this game
    cost_per_hour_cents: int | None
    worth_it: bool | None


@dataclass
class JournalMonth:
    month: int
    entries: list[JournalEntry]


@dataclass
class JournalYear:
    year: int
    finished_count: int
    total_hours: float  # hours of the distinct games finished this year
    average_rating: float | None
    most_used_device: str | None
    months: list[JournalMonth]


@dataclass
class Journal:
    years: list[JournalYear]
    unknown_date: list[JournalEntry] = field(default_factory=list)


@dataclass
class JournalFilter:
    year: int | None = None
    category_id: int | None = None
    hardware_id: int | None = None
    rating_min: float | None = None
    mastered: bool | None = None

    def keep(self, entry: JournalEntry) -> bool:
        if self.year is not None and (entry.finished_on is None or entry.finished_on.year != self.year):
            return False
        if self.category_id is not None and entry.category_id != self.category_id:
            return False
        if self.hardware_id is not None and entry.hardware_id != self.hardware_id:
            return False
        if self.rating_min is not None and (entry.rating is None or entry.rating < self.rating_min):
            return False
        return self.mastered is None or entry.mastered == self.mastered


def _replay_ids(game: Item) -> set[int]:
    """Completions after the first one (by date; unknown dates count as earliest, then by id)."""
    ordered = sorted(game.completions, key=lambda c: (c.finished_on or date.min, c.id))
    return {c.id for c in ordered[1:]}


def _entry(game: Item, completion: Completion, value: calc.Value | None, replays: set[int]) -> JournalEntry:
    link = next((link for link in game.play_links if link.hardware_id == completion.hardware_id), None)
    return JournalEntry(
        completion_id=completion.id,
        item_id=game.id,
        name=game.name,
        category_id=game.category_id,
        cover_path=game.image_path or game.cover_path,  # own image wins over the RAWG image
        finished_on=completion.finished_on,
        started_on=completion.started_on,
        hardware_id=completion.hardware_id,
        hardware_name=completion.hardware.name if completion.hardware else None,
        emulated=bool(link and link.emulated),
        hours=value.hours if value else 0.0,
        rating=None if game.rating is None else game.rating / 2,
        review=completion.review,
        note=completion.note,
        mastered=completion.mastered,
        replay=completion.id in replays,
        cost_per_hour_cents=value.cost_per_hour_cents if value else None,
        worth_it=value.worth_it if value else None,
    )


def entries(items: Iterable[Item], global_break_even_cph: int) -> list[JournalEntry]:
    result = []
    for game in items:
        if game.kind is not ItemKind.game or not game.completions:
            continue
        value = calc.game_value(game, global_break_even_cph)
        replays = _replay_ids(game)
        result += [_entry(game, c, value, replays) for c in game.completions]
    return result


def build_journal(items: Iterable[Item], global_break_even_cph: int, filters: JournalFilter) -> Journal:
    all_entries = [e for e in entries(items, global_break_even_cph) if filters.keep(e)]
    dated = sorted(
        (e for e in all_entries if e.finished_on), key=lambda e: (e.finished_on, e.completion_id), reverse=True
    )
    years: list[JournalYear] = []
    for e in dated:
        if not years or years[-1].year != e.finished_on.year:
            years.append(JournalYear(e.finished_on.year, 0, 0.0, None, None, []))
        year = years[-1]
        if not year.months or year.months[-1].month != e.finished_on.month:
            year.months.append(JournalMonth(e.finished_on.month, []))
        year.months[-1].entries.append(e)

    for year in years:
        year_entries = [e for m in year.months for e in m.entries]
        year.finished_count = len(year_entries)
        year.total_hours = round(sum({e.item_id: e.hours for e in year_entries}.values()), 2)
        ratings = [e.rating for e in year_entries if e.rating is not None]
        year.average_rating = round(sum(ratings) / len(ratings), 2) if ratings else None
        devices = Counter(e.hardware_name for e in year_entries if e.hardware_name)
        year.most_used_device = devices.most_common(1)[0][0] if devices else None

    unknown = [] if filters.year is not None else [e for e in all_entries if e.finished_on is None]
    unknown.sort(key=lambda e: e.name.lower())
    return Journal(years=years, unknown_date=unknown)


@dataclass
class Heatmap:
    year: int
    days: dict[str, int]  # ISO date → games finished that day (only days with finishes)
    total: int
    max_per_day: int
    years_available: list[int]


def heatmap(items: Iterable[Item], year: int, filters: JournalFilter | None = None) -> Heatmap:
    finishes = [
        c.finished_on
        for game in items
        if game.kind is ItemKind.game and (filters is None or filters.category_id in (None, game.category_id))
        for c in game.completions
        if c.finished_on is not None
    ]
    days = Counter(d.isoformat() for d in finishes if d.year == year)
    return Heatmap(
        year=year,
        days=dict(sorted(days.items())),
        total=sum(days.values()),
        max_per_day=max(days.values(), default=0),
        years_available=sorted({d.year for d in finishes}, reverse=True),
    )
