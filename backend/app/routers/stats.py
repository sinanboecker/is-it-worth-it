"""Statistics, journal, calendar heatmap and Now Playing (PLANNING.md §3, §4, §8)."""

from dataclasses import asdict
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app import calc, journal, stats
from app.models import Category, GameStatus, Item, ItemKind
from app.routers.deps import ITEM_LOAD_OPTIONS, SessionDep, SettingsDep, TodayDep, load_category
from app.schemas import ItemSummary

router = APIRouter(tags=["stats"])


def load_items(session: Session, category_id: int | None = None) -> list[Item]:
    query = select(Item).options(*ITEM_LOAD_OPTIONS)
    if category_id is not None:
        load_category(session, category_id)
        query = query.where(Item.category_id == category_id)
    return list(session.exec(query).all())


CategoryParam = Annotated[int | None, Query(alias="category")]


# --- totals & yearly --------------------------------------------------------------------------


class Totals(BaseModel):
    total_cost_cents: int
    games_cost_cents: int
    dlc_cost_cents: int
    hardware_cost_cents: int
    hours: float
    all_in_cost_per_hour_cents: int | None
    games_cost_per_hour_cents: int | None
    status_counts: dict[str, int]
    games_count: int
    hardware_count: int
    worth_it_rate: float | None
    backlog_value_cents: int

    @classmethod
    def build(cls, totals: calc.CategoryTotals) -> "Totals":
        return cls(hours=totals.hours, **{k: v for k, v in asdict(totals).items() if k != "minutes"})


class CategoryTotalsOut(BaseModel):
    category_id: int
    name: str
    type: str
    totals: Totals


class YearOut(BaseModel):
    year: int
    spent_cents: int
    dlc_spent_cents: int
    games_bought: int
    hours: float
    net_cost_of_year_games_cents: int
    cost_per_hour_cents: int | None
    games_finished: int
    average_rating: float | None
    worth_it_rate: float | None
    abandoned_count: int
    abandoned_cost_cents: int


@router.get("/stats/summary", response_model=Totals)
def summary(session: SessionDep, settings: SettingsDep, category_id: CategoryParam = None):
    """Lifetime totals, including hardware. Without `category`: everything."""
    return Totals.build(calc.category_totals(load_items(session, category_id), settings.break_even_cph))


@router.get("/stats/categories", response_model=list[CategoryTotalsOut])
def categories(session: SessionDep, settings: SettingsDep):
    grouped = stats.by_category(load_items(session))
    result = []
    for category in session.exec(select(Category).order_by(Category.sort_order, Category.name)):
        totals = calc.category_totals(grouped.get(category.id, []), settings.break_even_cph)
        result.append(
            CategoryTotalsOut(
                category_id=category.id, name=category.name, type=category.type, totals=Totals.build(totals)
            )
        )
    return result


@router.get("/stats/yearly", response_model=list[YearOut])
def yearly(session: SessionDep, settings: SettingsDep, category_id: CategoryParam = None):
    """Per-year figures: games + DLC only, everything attributed to the buy year."""
    rows = calc.yearly_stats(load_items(session, category_id), settings.break_even_cph)
    return [YearOut(hours=r.hours, **{k: v for k, v in asdict(r).items() if k != "minutes"}) for r in rows]


# --- top lists & hardware ---------------------------------------------------------------------


@router.get("/stats/top", response_model=list[ItemSummary])
def top(
    session: SessionDep,
    settings: SettingsDep,
    metric: Literal["cost_per_hour", "hours_to_break_even", "hours", "net_cost", "gain"] = "cost_per_hour",
    kind: ItemKind = ItemKind.game,
    order: Literal["asc", "desc"] = "asc",
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    category_id: CategoryParam = None,
):
    """Best/worst value (`cost_per_hour`, only items with a net cost above 0 €). `hours_to_break_even` lists only items
    not yet worth it with at least 0.1 h left ("almost worth it"). `gain` lists items sold for more than they cost,
    by the money gained (use `order=desc` for the biggest gains first)."""
    items = [i for i in load_items(session, category_id) if i.kind is kind]
    ranked = stats.top_items(items, settings.break_even_cph, metric, order == "asc", limit)
    return [ItemSummary.build(item, settings.break_even_cph) for item, _value in ranked]


@router.get("/stats/hardware", response_model=list[ItemSummary])
def hardware(session: SessionDep, settings: SettingsDep, category_id: CategoryParam = None):
    """All devices with net cost, cost per hour, hours, games played, emulated count; most played first."""
    devices = [i for i in load_items(session, category_id) if i.kind is ItemKind.hardware]
    summaries = [ItemSummary.build(d, settings.break_even_cph) for d in devices]
    return sorted(summaries, key=lambda s: (-s.value.hours, s.name.lower()))


# --- stores, format, resale, ratings, DLC -----------------------------------------------------


class StoreOut(BaseModel):
    store: str
    spent_cents: int
    copies: int
    dlcs: int
    by_year_cents: dict[int, int]


class FormatOut(BaseModel):
    format: str
    copies: int
    share: float
    spent_cents: int
    received_cents: int
    net_cost_cents: int
    average_net_cost_cents: int | None


class ResaleOut(BaseModel):
    group: str
    sold_copies: int
    bought_cents: int
    received_cents: int
    resale_rate: float | None


class ValueFunOut(BaseModel):
    item_id: int
    name: str
    rating: float
    cost_per_hour_cents: int
    hours: float


class RatingsOut(BaseModel):
    distribution: dict[str, int]
    rated_games: int
    average_rating: float | None
    value_vs_fun: list[ValueFunOut]


class DlcGameOut(BaseModel):
    item_id: int
    name: str
    dlc_count: int
    dlc_cost_cents: int


class DlcOut(BaseModel):
    total_cents: int
    count: int
    by_year_cents: dict[int, int]
    top_games: list[DlcGameOut]


@router.get("/stats/stores", response_model=list[StoreOut])
def stores(session: SessionDep, category_id: CategoryParam = None):
    """Lifetime spending per store (incl. hardware); `by_year_cents` counts games + DLC only."""
    return [asdict(r) for r in stats.store_stats(load_items(session, category_id))]


@router.get("/stats/format", response_model=list[FormatOut])
def formats(session: SessionDep, category_id: CategoryParam = None):
    """Physical vs digital, per game copy."""
    return [asdict(r) for r in stats.format_stats(load_items(session, category_id))]


@router.get("/stats/resale", response_model=list[ResaleOut])
def resale(session: SessionDep, category_id: CategoryParam = None):
    """Sold copies: money back in % of the buy price, overall and by condition."""
    return [asdict(r) for r in stats.resale_stats(load_items(session, category_id))]


@router.get("/stats/ratings", response_model=RatingsOut)
def ratings(session: SessionDep, settings: SettingsDep, category_id: CategoryParam = None):
    return asdict(stats.rating_stats(load_items(session, category_id), settings.break_even_cph))


@router.get("/stats/dlc", response_model=DlcOut)
def dlc(session: SessionDep, category_id: CategoryParam = None, limit: Annotated[int, Query(ge=1, le=100)] = 10):
    return asdict(stats.dlc_stats(load_items(session, category_id), limit))


# --- journal & heatmap ------------------------------------------------------------------------


@router.get("/journal")
def get_journal(
    session: SessionDep,
    settings: SettingsDep,
    year: int | None = None,
    category_id: CategoryParam = None,
    device: Annotated[int | None, Query(description="hardware id the game was finished on")] = None,
    rating_min: Annotated[float | None, Query(ge=0, le=5)] = None,
    mastered: bool | None = None,
) -> journal.Journal:
    """Finished games grouped by year → month, newest first. Finishes without date come in `unknown_date`."""
    filters = journal.JournalFilter(year, category_id, device, rating_min, mastered)
    return journal.build_journal(load_items(session, category_id), settings.break_even_cph, filters)


@router.get("/journal/heatmap")
def get_heatmap(
    session: SessionDep, today: TodayDep, year: int | None = None, category_id: CategoryParam = None
) -> journal.Heatmap:
    """Games finished per day of `year` (default: this year)."""
    return journal.heatmap(load_items(session, category_id), year or today.year)


# --- now playing ------------------------------------------------------------------------------


class BreakEvenOut(BaseModel):
    hours: float
    target_hours: float
    hours_left: float
    progress: float


class NowPlayingCard(BaseModel):
    item: ItemSummary
    days_since_start: int | None
    break_even: BreakEvenOut | None


class NowPlayingOut(BaseModel):
    playing: list[NowPlayingCard]
    on_hold: list[NowPlayingCard]
    up_next: list[ItemSummary]


@router.get("/now-playing", response_model=NowPlayingOut)
def now_playing(session: SessionDep, settings: SettingsDep, today: TodayDep):
    games = [i for i in load_items(session) if i.kind is ItemKind.game]

    def card(game: Item) -> NowPlayingCard:
        value = calc.game_value(game, settings.break_even_cph)
        return NowPlayingCard(
            item=ItemSummary.build(game, settings.break_even_cph),
            days_since_start=(today - game.started_on).days if game.started_on else None,
            break_even=asdict(stats.break_even_progress(value)) if value else None,
        )

    def cards(status: GameStatus) -> list[NowPlayingCard]:
        return [card(g) for g in sorted((g for g in games if g.status is status), key=stats.now_playing_order)]

    return NowPlayingOut(
        playing=cards(GameStatus.playing),
        on_hold=cards(GameStatus.on_hold),
        up_next=[ItemSummary.build(g, settings.break_even_cph) for g in stats.up_next(games)],
    )
