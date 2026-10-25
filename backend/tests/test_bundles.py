from datetime import date

import pytest

from app.bundles import BundleSplitError, apply_split, split_amount
from app.models import Bundle, Copy, SplitMode


def test_proportional_example_from_plan():
    # 449 € bundle, PS5 alone 499 €, game alone 59 €
    assert split_amount(44900, SplitMode.proportional, reference_prices=[49900, 5900]) == [40153, 4747]


@pytest.mark.parametrize(
    ("total", "refs"),
    [(10000, [1, 1, 1]), (99, [5, 7, 11]), (1, [100, 1]), (0, [3, 4]), (123457, [999, 1, 50, 50])],
)
def test_proportional_always_adds_up(total, refs):
    shares = split_amount(total, SplitMode.proportional, reference_prices=refs)
    assert sum(shares) == total
    assert all(s >= 0 for s in shares)


def test_proportional_remainder_goes_to_largest_item():
    assert split_amount(100, SplitMode.proportional, reference_prices=[1, 2]) == [33, 67]


def test_equal_split_with_odd_cents():
    assert split_amount(1000, SplitMode.equal, count=3) == [334, 333, 333]


def test_manual_split_must_match_total():
    assert split_amount(1000, SplitMode.manual, manual_shares=[600, 400]) == [600, 400]
    with pytest.raises(BundleSplitError, match="1.00 € left to assign"):
        split_amount(1000, SplitMode.manual, manual_shares=[600, 300])


@pytest.mark.parametrize(
    "kwargs",
    [
        {"reference_prices": [100, None]},
        {"reference_prices": [0, 0]},
        {"reference_prices": []},
    ],
)
def test_proportional_needs_reference_prices(kwargs):
    with pytest.raises(BundleSplitError):
        split_amount(1000, SplitMode.proportional, **kwargs)


def _bundle(mode=SplitMode.proportional, **fields):
    bundle = Bundle(
        name="PS5 + Astro Bot", buy_date=date(2024, 11, 1), total_price_cents=44900, split_mode=mode, **fields
    )
    bundle.copies = [
        Copy(item_id=1, buy_date=date(2000, 1, 1), buy_price_cents=0, reference_price_cents=49900),
        Copy(item_id=2, buy_date=date(2000, 1, 1), buy_price_cents=0, reference_price_cents=5900),
    ]
    return bundle


def test_apply_split_sets_buy_prices_and_date():
    bundle = _bundle(store="Amazon")
    apply_split(bundle)
    assert [c.buy_price_cents for c in bundle.copies] == [40153, 4747]
    assert {c.buy_date for c in bundle.copies} == {date(2024, 11, 1)}
    assert {c.store for c in bundle.copies} == {"Amazon"}
    assert all(c.sell_price_cents is None for c in bundle.copies)


def test_apply_split_re_split_after_changing_total_and_mode():
    bundle = _bundle()
    apply_split(bundle)
    bundle.total_price_cents = 40000
    bundle.split_mode = SplitMode.equal
    apply_split(bundle)
    assert [c.buy_price_cents for c in bundle.copies] == [20000, 20000]


def test_apply_split_manual_keeps_current_prices_unless_given():
    bundle = _bundle(SplitMode.manual)
    bundle.copies[0].buy_price_cents, bundle.copies[1].buy_price_cents = 40000, 4900
    apply_split(bundle)
    assert [c.buy_price_cents for c in bundle.copies] == [40000, 4900]
    apply_split(bundle, [42000, 2900])
    assert [c.buy_price_cents for c in bundle.copies] == [42000, 2900]


def test_sold_as_bundle_splits_the_sale_too():
    bundle = _bundle(sold_as_bundle=True, sell_total_cents=30000, sell_date=date(2025, 6, 1))
    apply_split(bundle)
    assert sum(c.sell_price_cents for c in bundle.copies) == 30000
    assert [c.sell_price_cents for c in bundle.copies] == [26828, 3172]
    assert {c.sell_date for c in bundle.copies} == {date(2025, 6, 1)}


def test_sold_as_bundle_manual_mode_splits_sale_like_purchase():
    bundle = _bundle(SplitMode.manual, sold_as_bundle=True, sell_total_cents=1000)
    apply_split(bundle, [33675, 11225])  # 75 % / 25 %
    assert [c.sell_price_cents for c in bundle.copies] == [750, 250]


def test_sold_as_bundle_needs_sell_total():
    with pytest.raises(BundleSplitError):
        apply_split(_bundle(sold_as_bundle=True))
