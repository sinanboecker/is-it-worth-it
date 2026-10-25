"""Statistics beyond single items: stores, formats, resale, ratings, DLC, top lists (PLANNING.md §3).

All functions take already-loaded items (with copies, links, DLC, completions) and return plain dataclasses.
"""

from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date

from app import calc
from app.models import CopyFormat, GameStatus, Item, ItemKind

NO_STORE = "(no store)"


def games(items: Iterable[Item]) -> list[Item]:
    return [i for i in items if i.kind is ItemKind.game]


# --- stores -----------------------------------------------------------------------------------


@dataclass
class StoreRow:
    store: str
    spent_cents: int = 0  # lifetime: copies (buy − sell, games and hardware) + DLC
    copies: int = 0
    dlcs: int = 0
    by_year_cents: dict[int, int] = field(default_factory=dict)  # games + DLC only, by buy year


def store_stats(items: Iterable[Item]) -> list[StoreRow]:
    rows: dict[str, StoreRow] = {}

    def row(store: str | None) -> StoreRow:
        name = store or NO_STORE
        return rows.setdefault(name, StoreRow(store=name))

    def add_year(r: StoreRow, year: int, cents: int) -> None:
        r.by_year_cents[year] = r.by_year_cents.get(year, 0) + cents

    for item in items:
        for copy in item.copies:
            r = row(copy.store)
            net = copy.buy_price_cents - (copy.sell_price_cents or 0)
            r.spent_cents += net
            r.copies += 1
            if item.kind is ItemKind.game:
                add_year(r, copy.buy_date.year, net)
        for dlc in item.dlcs:
            r = row(dlc.store)
            r.spent_cents += dlc.price_cents
            r.dlcs += 1
            add_year(r, dlc.buy_date.year, dlc.price_cents)
    return sorted(rows.values(), key=lambda r: -r.spent_cents)


# --- physical vs digital ----------------------------------------------------------------------


@dataclass
class FormatRow:
    format: CopyFormat
    copies: int = 0
    share: float = 0.0
    spent_cents: int = 0
    received_cents: int = 0
    net_cost_cents: int = 0
    average_net_cost_cents: int | None = None


def format_stats(items: Iterable[Item]) -> list[FormatRow]:
    """Game copies only (hardware is always physical)."""
    rows = {f: FormatRow(format=f) for f in CopyFormat}
    for game in games(items):
        for copy in game.copies:
            r = rows[copy.format]
            r.copies += 1
            r.spent_cents += copy.buy_price_cents
            r.received_cents += copy.sell_price_cents or 0
    total = sum(r.copies for r in rows.values())
    for r in rows.values():
        r.net_cost_cents = r.spent_cents - r.received_cents
        r.share = round(r.copies / total, 3) if total else 0.0
        r.average_net_cost_cents = round(r.net_cost_cents / r.copies) if r.copies else None
    return list(rows.values())


# --- resale -----------------------------------------------------------------------------------


@dataclass
class ResaleRow:
    group: str  # "all", "new", "used", "unknown condition", "digital"
    sold_copies: int = 0
    bought_cents: int = 0
    received_cents: int = 0
    resale_rate: float | None = None  # received ÷ bought, e.g. 0.45 = 45 % of the buy price back


def resale_stats(items: Iterable[Item]) -> list[ResaleRow]:
    rows: dict[str, ResaleRow] = {}
    for item in items:
        for copy in item.copies:
            if not copy.is_sold:
                continue
            if copy.format is CopyFormat.digital:
                group = "digital"
            else:
                group = copy.condition.value if copy.condition else "unknown condition"
            for name in ("all", group):
                r = rows.setdefault(name, ResaleRow(group=name))
                r.sold_copies += 1
                r.bought_cents += copy.buy_price_cents
                r.received_cents += copy.sell_price_cents
    for r in rows.values():
        r.resale_rate = round(r.received_cents / r.bought_cents, 3) if r.bought_cents else None
    order = ["all", "new", "used", "unknown condition", "digital"]
    return sorted(rows.values(), key=lambda r: order.index(r.group))


# --- ratings ----------------------------------------------------------------------------------


@dataclass
class ValueFunPoint:
    item_id: int
    name: str
    rating: float
    cost_per_hour_cents: int
    hours: float


@dataclass
class RatingStats:
    distribution: dict[str, int]  # "0.5" … "5.0" → number of games
    rated_games: int
    average_rating: float | None
    value_vs_fun: list[ValueFunPoint]


def rating_stats(items: Iterable[Item], global_break_even_cph: int) -> RatingStats:
    distribution = {f"{half / 2:.1f}": 0 for half in range(0, 11)}
    points = []
    ratings = []
    for game in games(items):
        if game.rating is None:
            continue
        ratings.append(game.rating)
        distribution[f"{game.rating / 2:.1f}"] += 1
        value = calc.game_value(game, global_break_even_cph)
        if value is not None and value.cost_per_hour_cents is not None:
            points.append(ValueFunPoint(game.id, game.name, game.rating / 2, value.cost_per_hour_cents, value.hours))
    return RatingStats(
        distribution=distribution,
        rated_games=len(ratings),
        average_rating=round(sum(ratings) / len(ratings) / 2, 2) if ratings else None,
        value_vs_fun=points,
    )


# --- DLC --------------------------------------------------------------------------------------


@dataclass
class DlcGame:
    item_id: int
    name: str
    dlc_count: int
    dlc_cost_cents: int


@dataclass
class DlcStats:
    total_cents: int
    count: int
    by_year_cents: dict[int, int]
    top_games: list[DlcGame]


def dlc_stats(items: Iterable[Item], limit: int = 10) -> DlcStats:
    by_year: Counter[int] = Counter()
    per_game = []
    for game in games(items):
        if not game.dlcs:
            continue
        for dlc in game.dlcs:
            by_year[dlc.buy_date.year] += dlc.price_cents
        per_game.append(DlcGame(game.id, game.name, len(game.dlcs), sum(d.price_cents for d in game.dlcs)))
    per_game.sort(key=lambda g: -g.dlc_cost_cents)
    return DlcStats(
        total_cents=sum(g.dlc_cost_cents for g in per_game),
        count=sum(g.dlc_count for g in per_game),
        by_year_cents=dict(sorted(by_year.items())),
        top_games=per_game[:limit],
    )


# --- top lists --------------------------------------------------------------------------------


@dataclass
class TopMetric:
    key: Callable[[calc.Value], float | None]
    include: Callable[[calc.Value], bool] = lambda v: True


TOP_METRICS: dict[str, TopMetric] = {
    "cost_per_hour": TopMetric(
        key=lambda v: v.cost_per_hour_cents, include=lambda v: v.cost_per_hour_cents is not None
    ),
    # "almost worth it": not yet at break-even, sorted by the hours still needed
    "hours_to_break_even": TopMetric(key=lambda v: v.hours_to_break_even, include=lambda v: not v.worth_it),
    "hours": TopMetric(key=lambda v: v.minutes),
    "net_cost": TopMetric(key=lambda v: v.net_cost_cents),
}


def top_items(
    items: Iterable[Item], global_break_even_cph: int, metric: str, ascending: bool, limit: int
) -> list[tuple[Item, calc.Value]]:
    spec = TOP_METRICS[metric]
    candidates = []
    for item in items:
        value = calc.item_value(item, global_break_even_cph)
        if value is not None and spec.include(value):
            candidates.append((item, value))
    candidates.sort(key=lambda pair: spec.key(pair[1]), reverse=not ascending)
    return candidates[:limit]


# --- now playing ------------------------------------------------------------------------------


@dataclass
class BreakEvenProgress:
    hours: float
    target_hours: float  # hours needed to reach the threshold (net cost ÷ threshold)
    hours_left: float
    progress: float  # 0–1


def break_even_progress(value: calc.Value) -> BreakEvenProgress:
    target = max(value.net_cost_cents, 0) / value.threshold_cph
    progress = 1.0 if target == 0 else min(1.0, value.hours / target)
    return BreakEvenProgress(
        hours=value.hours,
        target_hours=round(target, 1),
        hours_left=value.hours_to_break_even,
        progress=round(progress, 3),
    )


def now_playing_order(game: Item) -> tuple:
    """Most recently played first; never played (but started) after that, newest start first."""
    return (
        -(game.last_played_on or date.min).toordinal(),
        -(game.started_on or date.min).toordinal(),
        game.name.lower(),
    )


def up_next(items: Iterable[Item], limit: int = 5) -> list[Item]:
    backlog = [g for g in games(items) if g.status is GameStatus.backlog]
    backlog.sort(key=lambda g: (calc.copy_stats(g.copies).first_bought_on or date.max, g.name.lower()))
    return backlog[:limit]


def by_category(items: Iterable[Item]) -> dict[int, list[Item]]:
    grouped: dict[int, list[Item]] = defaultdict(list)
    for item in items:
        grouped[item.category_id].append(item)
    return grouped
