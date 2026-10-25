"""Derived values, with the hand-calculated examples from PLANNING.md §13."""

from datetime import date

import pytest
from sqlmodel import select

from app import calc
from app.models import Category, Completion, Copy, CopyFormat, Dlc, GameStatus, Item, ItemKind, PlayLink

BREAK_EVEN = 300  # 3 €/h


@pytest.fixture
def nintendo(session):
    category = Category(name="Nintendo")
    session.add(category)
    session.commit()
    return category


def make_hardware(session, category, name="Switch", copies=()):
    hardware = Item(category=category, kind=ItemKind.hardware, name=name, copies=list(copies))
    session.add(hardware)
    session.commit()
    return hardware


def make_game(session, category, *, copies=(), played=(), dlcs=(), status=GameStatus.played, **fields):
    game = Item(category=category, kind=ItemKind.game, name=fields.pop("name", "Game"), status=status, **fields)
    session.add(game)
    game.copies = list(copies)
    game.dlcs = list(dlcs)
    for device, minutes in played:
        game.play_links.append(PlayLink(hardware_id=device.id, minutes=minutes))
    session.commit()
    session.refresh(game)
    return game


def copy(price, year=2023, sold_for=None, fmt=CopyFormat.physical):
    return Copy(buy_date=date(year, 3, 1), buy_price_cents=price, sell_price_cents=sold_for, format=fmt)


# --- basic formulas ---------------------------------------------------------------------------


def test_cost_per_hour_and_worth_it():
    assert calc.cost_per_hour(6000, 30 * 60) == 200
    assert calc.cost_per_hour(6000, 0) is None
    assert calc.is_worth_it(6000, 20 * 60, 300)  # exactly 3 €/h
    assert not calc.is_worth_it(6001, 20 * 60, 300)
    assert not calc.is_worth_it(6000, 0, 300)
    assert calc.is_worth_it(0, 0, 300)  # free / sold at no loss
    assert calc.is_worth_it(-500, 0, 300)  # sold at a profit


def test_hours_to_break_even():
    assert calc.hours_to_break_even(6000, 15 * 60, 300) == 5.0
    assert calc.hours_to_break_even(6000, 25 * 60, 300) == 0.0
    assert calc.hours_to_break_even(-100, 0, 300) == 0.0


# --- copies -----------------------------------------------------------------------------------


def test_copies_example_from_plan(session, nintendo):
    switch = make_hardware(session, nintendo)
    game = make_game(
        session,
        nintendo,
        copies=[copy(6000, 2019, sold_for=3000), copy(2000, 2024, fmt=CopyFormat.digital)],
        played=[(switch, 25 * 60)],
    )
    stats = calc.copy_stats(game.copies)
    assert (stats.copies_count, stats.sold_copies, stats.owned_copies) == (2, 1, 1)
    assert stats.first_bought_on == date(2019, 3, 1)
    assert not stats.sold and stats.owned

    value = calc.game_value(game, BREAK_EVEN)
    assert value.net_cost_cents == 5000
    assert value.cost_per_hour_cents == 200
    assert value.hours == 25

    game.copies[1].sell_price_cents = 0  # given away
    stats = calc.copy_stats(game.copies)
    assert stats.sold and not stats.owned

    years = {r.year: r for r in calc.yearly_stats([game], BREAK_EVEN)}
    assert years[2019].spent_cents == 3000  # 60 − 30, sell price in the copy's buy year
    assert years[2024].spent_cents == 2000 - 0
    assert years[2019].minutes == 25 * 60  # hours go to the first copy's year
    assert years[2024].minutes == 0


def test_no_copies_is_neither_owned_nor_sold():
    stats = calc.copy_stats([])
    assert not stats.sold and not stats.owned and stats.first_bought_on is None


def test_wishlist_game_has_no_value(session, nintendo):
    game = make_game(session, nintendo, status=GameStatus.wishlist)
    assert calc.game_value(game, BREAK_EVEN) is None


# --- DLC --------------------------------------------------------------------------------------


def test_dlc_example_from_plan(session, nintendo):
    switch = make_hardware(session, nintendo)
    game = make_game(
        session,
        nintendo,
        copies=[copy(4000, 2023)],
        dlcs=[
            Dlc(name="Expansion", buy_date=date(2024, 5, 1), price_cents=2000),
            Dlc(name="Pass", buy_date=date(2023, 6, 1), price_cents=1000),
        ],
        played=[(switch, 35 * 60)],
    )
    value = calc.game_value(game, BREAK_EVEN)
    assert value.total_paid_cents == 7000
    assert value.dlc_cost_cents == 3000
    assert value.cost_per_hour_cents == 200

    game.copies[0].sell_price_cents = 2500
    assert calc.game_value(game, BREAK_EVEN).net_cost_cents == 4500  # DLC stays a cost

    years = {r.year: r for r in calc.yearly_stats([game], BREAK_EVEN)}
    assert years[2023].spent_cents == 4000 - 2500 + 1000
    assert years[2024].spent_cents == 2000  # DLC counts in its own year
    assert years[2024].dlc_spent_cents == 2000
    assert years[2023].net_cost_of_year_games_cents == 4500  # the game's cost/hr includes all DLC


# --- hardware ---------------------------------------------------------------------------------


def test_hardware_hours_are_sum_of_links(session, nintendo, handhelds):
    switch = make_hardware(session, nintendo, copies=[copy(30000, 2022)])
    brick = make_hardware(session, handhelds, name="Trimui Brick", copies=[copy(6000, 2024)])
    make_game(session, nintendo, name="A", copies=[copy(5000)], played=[(switch, 600), (brick, 120)])
    make_game(session, nintendo, name="B", copies=[copy(5000)], played=[(switch, 900)])
    game_c = make_game(session, nintendo, name="C", copies=[copy(5000)])
    game_c.play_links.append(PlayLink(hardware_id=brick.id, minutes=60, emulated=True))
    session.commit()
    session.refresh(switch)
    session.refresh(brick)

    switch_value = calc.hardware_value(switch, BREAK_EVEN)
    assert switch_value.minutes == 1500
    assert switch_value.games_played_on == 2
    assert switch_value.cost_per_hour_cents == 1200  # 300 € / 25 h

    brick_value = calc.hardware_value(brick, BREAK_EVEN)
    assert brick_value.minutes == 180
    assert brick_value.emulated_games == 1
    assert brick_value.hours_to_break_even == 17.0  # 60 € / 3 €/h = 20 h, 3 h played


def test_category_threshold_overrides_global(session):
    category = Category(name="PC", break_even_cph=100)
    session.add(category)
    session.commit()
    pc = make_hardware(session, category, name="PC")
    game = make_game(session, category, copies=[copy(6000)], played=[(pc, 30 * 60)])
    value = calc.game_value(game, BREAK_EVEN)
    assert value.threshold_cph == 100
    assert not value.worth_it  # 2 €/h > 1 €/h


# --- totals -----------------------------------------------------------------------------------


def test_cost_scope_example_from_plan(session, nintendo):
    """Category totals include hardware; yearly figures count games only."""
    switch = make_hardware(session, nintendo, copies=[copy(30000, 2023)])
    game = make_game(session, nintendo, copies=[copy(6000, 2023)], played=[(switch, 30 * 60)])
    session.refresh(switch)
    items = [switch, game]

    totals = calc.category_totals(items, BREAK_EVEN)
    assert totals.total_cost_cents == 36000
    assert totals.hardware_cost_cents == 30000
    assert totals.games_cost_cents == 6000
    assert totals.all_in_cost_per_hour_cents == 1200
    assert totals.games_cost_per_hour_cents == 200

    (year,) = calc.yearly_stats(items, BREAK_EVEN)
    assert (year.year, year.spent_cents) == (2023, 6000)  # console excluded


def test_category_totals_counts_and_backlog_value(session, nintendo):
    switch = make_hardware(session, nintendo)
    make_game(session, nintendo, name="Wish", status=GameStatus.wishlist)
    make_game(session, nintendo, name="Backlog 1", status=GameStatus.backlog, copies=[copy(4000)])
    make_game(
        session,
        nintendo,
        name="Backlog 2",
        status=GameStatus.backlog,
        copies=[copy(1000)],
        dlcs=[Dlc(name="D", buy_date=date(2023, 1, 1), price_cents=500)],
    )
    make_game(
        session, nintendo, name="Done", status=GameStatus.finished, copies=[copy(3000)], played=[(switch, 20 * 60)]
    )
    items = session.exec(select(Item)).all()

    totals = calc.category_totals(items, BREAK_EVEN)
    assert totals.status_counts == {"wishlist": 1, "backlog": 2, "finished": 1}
    assert totals.games_count == 3
    assert totals.backlog_value_cents == 5500
    assert totals.worth_it_rate == round(1 / 3, 3)
    assert totals.dlc_cost_cents == 500


def test_yearly_finished_ratings_and_abandoned(session, nintendo):
    switch = make_hardware(session, nintendo)
    game = make_game(
        session, nintendo, copies=[copy(4000, 2023)], played=[(switch, 10 * 60)], rating=8, status=GameStatus.finished
    )
    game.completions = [
        Completion(finished_on=date(2024, 2, 1)),
        Completion(finished_on=date(2024, 9, 1)),
    ]
    make_game(session, nintendo, name="Dropped", copies=[copy(2000, 2023)], status=GameStatus.abandoned)
    session.commit()

    years = {r.year: r for r in calc.yearly_stats(session.exec(select(Item)).all(), BREAK_EVEN)}
    assert years[2024].games_finished == 2
    assert years[2024].average_rating == 4.0  # game rating 8 half-stars, once per finish
    assert years[2023].abandoned_count == 1
    assert years[2023].abandoned_cost_cents == 2000
    assert years[2023].games_bought == 2
    assert years[2023].cost_per_hour_cents == 600  # (40 + 20) € / 10 h, weighted
    assert years[2023].worth_it_rate == 0.0
