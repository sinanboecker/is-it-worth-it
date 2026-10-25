"""Derived values: costs, hours, cost per hour, break-even, category totals, yearly figures.

Everything here is computed on the fly from the stored rows (PLANNING.md §3, "Derived values").
Money in cents, hours as floats derived from stored minutes, cost per hour in cents per hour.
"""

from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date

from app.models import Copy, GameStatus, Item, ItemKind


def minutes_to_hours(minutes: int) -> float:
    return round(minutes / 60, 2)


def cost_per_hour(net_cost_cents: int, minutes: int) -> int | None:
    if minutes <= 0:
        return None
    return round(net_cost_cents * 60 / minutes)


def is_worth_it(net_cost_cents: int, minutes: int, threshold_cph: int) -> bool:
    if net_cost_cents <= 0:
        return True
    # net / hours <= threshold, without floats: net * 60 <= threshold * minutes
    return minutes > 0 and net_cost_cents * 60 <= threshold_cph * minutes


def hours_to_break_even(net_cost_cents: int, minutes: int, threshold_cph: int) -> float:
    if net_cost_cents <= 0:
        return 0.0
    return round(max(0.0, net_cost_cents / threshold_cph - minutes / 60), 1)


def threshold_for(item: Item, global_break_even_cph: int) -> int:
    override = item.category.break_even_cph if item.category is not None else None
    return override if override is not None else global_break_even_cph


@dataclass
class CopyStats:
    copies_count: int
    sold_copies: int
    owned_copies: int
    copies_paid_cents: int
    copies_received_cents: int
    first_bought_on: date | None
    sold: bool
    owned: bool


def copy_stats(copies: Iterable[Copy]) -> CopyStats:
    copies = list(copies)
    sold = [c for c in copies if c.is_sold]
    return CopyStats(
        copies_count=len(copies),
        sold_copies=len(sold),
        owned_copies=len(copies) - len(sold),
        copies_paid_cents=sum(c.buy_price_cents for c in copies),
        copies_received_cents=sum(c.sell_price_cents for c in sold),
        first_bought_on=min((c.buy_date for c in copies), default=None),
        sold=bool(copies) and len(sold) == len(copies),
        owned=len(sold) < len(copies),
    )


@dataclass
class Value:
    """Cost and value of one game or one piece of hardware."""

    minutes: int
    net_cost_cents: int
    cost_per_hour_cents: int | None
    worth_it: bool
    hours_to_break_even: float
    threshold_cph: int
    # games only
    dlc_cost_cents: int = 0
    total_paid_cents: int = 0
    times_finished: int = 0
    last_finished_on: date | None = None
    # hardware only
    games_played_on: int = 0
    emulated_games: int = 0

    @property
    def hours(self) -> float:
        return minutes_to_hours(self.minutes)


def game_minutes(game: Item) -> int:
    return sum(link.minutes for link in game.play_links)


def game_value(game: Item, global_break_even_cph: int) -> Value | None:
    """None for wishlist games (nothing bought yet)."""
    if game.status is GameStatus.wishlist:
        return None
    copies = copy_stats(game.copies)
    minutes = game_minutes(game)
    dlc_cost = sum(d.price_cents for d in game.dlcs)
    total_paid = copies.copies_paid_cents + dlc_cost
    net_cost = total_paid - copies.copies_received_cents
    threshold = threshold_for(game, global_break_even_cph)
    return Value(
        minutes=minutes,
        net_cost_cents=net_cost,
        cost_per_hour_cents=cost_per_hour(net_cost, minutes),
        worth_it=is_worth_it(net_cost, minutes, threshold),
        hours_to_break_even=hours_to_break_even(net_cost, minutes, threshold),
        threshold_cph=threshold,
        dlc_cost_cents=dlc_cost,
        total_paid_cents=total_paid,
        times_finished=len(game.completions),
        last_finished_on=max((c.finished_on for c in game.completions if c.finished_on), default=None),
    )


def hardware_value(hardware: Item, global_break_even_cph: int) -> Value:
    copies = copy_stats(hardware.copies)
    minutes = sum(link.minutes for link in hardware.device_links)
    net_cost = copies.copies_paid_cents - copies.copies_received_cents
    threshold = threshold_for(hardware, global_break_even_cph)
    return Value(
        minutes=minutes,
        net_cost_cents=net_cost,
        cost_per_hour_cents=cost_per_hour(net_cost, minutes),
        worth_it=is_worth_it(net_cost, minutes, threshold),
        hours_to_break_even=hours_to_break_even(net_cost, minutes, threshold),
        threshold_cph=threshold,
        total_paid_cents=copies.copies_paid_cents,
        # links without hours (e.g. a category's default device on a backlog game) don't count as played
        games_played_on=sum(1 for link in hardware.device_links if link.minutes > 0),
        emulated_games=sum(1 for link in hardware.device_links if link.emulated and link.minutes > 0),
    )


def item_value(item: Item, global_break_even_cph: int) -> Value | None:
    if item.kind is ItemKind.game:
        return game_value(item, global_break_even_cph)
    return hardware_value(item, global_break_even_cph)


@dataclass
class CategoryTotals:
    """Lifetime totals of a set of items. Includes hardware (PLANNING.md §3)."""

    total_cost_cents: int = 0
    games_cost_cents: int = 0  # incl. DLC
    dlc_cost_cents: int = 0
    hardware_cost_cents: int = 0
    minutes: int = 0
    all_in_cost_per_hour_cents: int | None = None
    games_cost_per_hour_cents: int | None = None
    status_counts: dict[str, int] = field(default_factory=dict)
    games_count: int = 0  # bought games (wishlist excluded)
    hardware_count: int = 0
    worth_it_rate: float | None = None
    backlog_value_cents: int = 0

    @property
    def hours(self) -> float:
        return minutes_to_hours(self.minutes)


def category_totals(items: Iterable[Item], global_break_even_cph: int) -> CategoryTotals:
    totals = CategoryTotals()
    statuses: Counter[str] = Counter()
    worth_it = 0
    for item in items:
        if item.kind is ItemKind.hardware:
            value = hardware_value(item, global_break_even_cph)
            totals.hardware_cost_cents += value.net_cost_cents
            totals.hardware_count += 1
            continue
        statuses[item.status.value] += 1
        value = game_value(item, global_break_even_cph)
        if value is None:
            continue
        totals.games_count += 1
        totals.games_cost_cents += value.net_cost_cents
        totals.dlc_cost_cents += value.dlc_cost_cents
        totals.minutes += value.minutes
        worth_it += value.worth_it
        if item.status is GameStatus.backlog:
            totals.backlog_value_cents += value.total_paid_cents
    totals.total_cost_cents = totals.games_cost_cents + totals.hardware_cost_cents
    totals.all_in_cost_per_hour_cents = cost_per_hour(totals.total_cost_cents, totals.minutes)
    totals.games_cost_per_hour_cents = cost_per_hour(totals.games_cost_cents, totals.minutes)
    totals.status_counts = dict(statuses)
    totals.worth_it_rate = round(worth_it / totals.games_count, 3) if totals.games_count else None
    return totals


@dataclass
class YearRow:
    """Yearly figures. Games (+ DLC) only, everything attributed to the buy year (PLANNING.md §3)."""

    year: int
    spent_cents: int = 0  # copies bought in the year (buy − sell) + DLC bought in the year
    dlc_spent_cents: int = 0
    games_bought: int = 0  # games whose first copy was bought in the year
    minutes: int = 0  # hours of games first bought in the year
    net_cost_of_year_games_cents: int = 0
    cost_per_hour_cents: int | None = None
    games_finished: int = 0
    average_rating: float | None = None  # in stars (0–5)
    worth_it_rate: float | None = None
    abandoned_count: int = 0
    abandoned_cost_cents: int = 0

    @property
    def hours(self) -> float:
        return minutes_to_hours(self.minutes)


def yearly_stats(items: Iterable[Item], global_break_even_cph: int) -> list[YearRow]:
    rows: dict[int, YearRow] = {}
    worth_it: Counter[int] = Counter()
    ratings: dict[int, list[int]] = defaultdict(list)

    def row(year: int) -> YearRow:
        return rows.setdefault(year, YearRow(year=year))

    for game in items:
        if game.kind is not ItemKind.game:
            continue
        for copy in game.copies:
            row(copy.buy_date.year).spent_cents += copy.buy_price_cents - (copy.sell_price_cents or 0)
        for dlc in game.dlcs:
            r = row(dlc.buy_date.year)
            r.spent_cents += dlc.price_cents
            r.dlc_spent_cents += dlc.price_cents
        for completion in game.completions:
            if completion.finished_on is None:
                continue
            r = row(completion.finished_on.year)
            r.games_finished += 1
            if game.rating is not None:
                ratings[r.year].append(game.rating)

        value = game_value(game, global_break_even_cph)
        first_bought = copy_stats(game.copies).first_bought_on
        if value is None or first_bought is None:
            continue
        r = row(first_bought.year)
        r.games_bought += 1
        r.minutes += value.minutes
        r.net_cost_of_year_games_cents += value.net_cost_cents
        worth_it[r.year] += value.worth_it
        if game.status is GameStatus.abandoned:
            r.abandoned_count += 1
            r.abandoned_cost_cents += value.net_cost_cents

    for r in rows.values():
        r.cost_per_hour_cents = cost_per_hour(r.net_cost_of_year_games_cents, r.minutes)
        r.worth_it_rate = round(worth_it[r.year] / r.games_bought, 3) if r.games_bought else None
        if ratings[r.year]:
            r.average_rating = round(sum(ratings[r.year]) / len(ratings[r.year]) / 2, 2)
    return sorted(rows.values(), key=lambda r: r.year)
