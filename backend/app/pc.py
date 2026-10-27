"""PC builds and parts: how long a part was used and what it cost per day, and what a build's parts cost.

A part is used from its buy date until its "used until" date (or today while it's still in use). Its net cost is the
buy price minus the sell price. A sold part leaves its build, so a build only adds up what its parts cost; it runs from
its first part's buy date until all of them are out of use, and with a linked device it also shows that device's game
hours.
"""

from dataclasses import dataclass
from datetime import date

from app import calc
from app.models import PcBuild, PcPart

DAYS_PER_YEAR = 365.25


@dataclass
class Usage:
    days: int
    years: float
    net_cost_cents: int
    cost_per_day_cents: int | None  # None for less than a day


def usage(start: date, end: date, net_cost_cents: int) -> Usage:
    days = max((end - start).days, 0)
    return Usage(
        days=days,
        years=round(days / DAYS_PER_YEAR, 2),
        net_cost_cents=net_cost_cents,
        cost_per_day_cents=round(net_cost_cents / days) if days else None,
    )


def part_usage(part: PcPart, today: date) -> Usage:
    return usage(part.buy_date, part.used_until or today, part.buy_price_cents - (part.sell_price_cents or 0))


@dataclass
class BuildTotals:
    buy_price_cents: int
    first_bought_on: date | None
    used_until: date | None  # None while a part is still in use (or the build has no parts)
    in_use: bool
    hours: float | None  # game hours of the linked device
    cost_per_hour_cents: int | None


def build_totals(build: PcBuild, global_break_even_cph: int) -> BuildTotals:
    parts = build.parts
    buy = sum(p.buy_price_cents for p in parts)
    in_use = not parts or any(p.used_until is None for p in parts)
    hours = cost_per_hour = None
    if build.hardware is not None:
        minutes = calc.hardware_value(build.hardware, global_break_even_cph).minutes
        hours = calc.minutes_to_hours(minutes)
        cost_per_hour = calc.cost_per_hour(buy, minutes)
    return BuildTotals(
        buy_price_cents=buy,
        first_bought_on=min((p.buy_date for p in parts), default=None),
        used_until=None if in_use else max(p.used_until for p in parts),
        in_use=in_use,
        hours=hours,
        cost_per_hour_cents=cost_per_hour,
    )
