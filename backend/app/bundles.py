"""Splitting a bundle's price across its copies (PLANNING.md §3, "How a bundle is handled")."""

from datetime import date

from app.models import Bundle, SplitMode
from app.split import SplitError, split_amount


def cost_to_split(bundle: Bundle) -> int:
    """What the bundle's copies cost together: the price minus money from selling untracked parts (at least 0)."""
    return max(bundle.total_price_cents - bundle.other_sales_cents, 0)


def apply_split(bundle: Bundle, manual_shares: list[int | None] | None = None) -> None:
    """Recalculate buy (and, if sold as a bundle, sell) prices of all copies in the bundle.

    For `manual` mode the current buy prices are kept unless new `manual_shares` are given.
    """
    copies = bundle.copies
    if not copies:
        return  # nothing to split, e.g. an imported bundle whose games were all sold without being listed

    if bundle.split_mode is SplitMode.manual and manual_shares is None:
        manual_shares = [c.buy_price_cents for c in copies]
    buy_shares = split_amount(
        cost_to_split(bundle),
        bundle.split_mode,
        reference_prices=[c.reference_price_cents for c in copies],
        manual_shares=manual_shares,
        count=len(copies),
    )
    for copy, share in zip(copies, buy_shares, strict=True):
        copy.buy_price_cents = share
        copy.buy_date = bundle.buy_date
        if bundle.store is not None:
            copy.store = bundle.store

    if bundle.sold_as_bundle:
        if bundle.sell_total_cents is None:
            raise SplitError("a bundle sold as a whole needs a sell total")
        if bundle.split_mode is SplitMode.manual:
            # No separate manual sell shares: split the sale like the purchase.
            sell_shares = (
                split_amount(bundle.sell_total_cents, SplitMode.proportional, reference_prices=buy_shares)
                if sum(buy_shares) > 0
                else split_amount(bundle.sell_total_cents, SplitMode.equal, count=len(copies))
            )
        else:
            sell_shares = split_amount(
                bundle.sell_total_cents,
                bundle.split_mode,
                reference_prices=[c.reference_price_cents for c in copies],
                count=len(copies),
            )
        sell_date = bundle.sell_date or date.today()
        for copy, share in zip(copies, sell_shares, strict=True):
            copy.sell_price_cents = share
            copy.sell_date = sell_date
