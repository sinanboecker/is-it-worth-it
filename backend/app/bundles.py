"""Splitting a bundle's price across its copies (PLANNING.md §3, "How a bundle is handled")."""

from datetime import date

from app.models import Bundle, SplitMode


class BundleSplitError(ValueError):
    pass


def split_amount(
    total_cents: int,
    mode: SplitMode,
    *,
    reference_prices: list[int | None] | None = None,
    manual_shares: list[int | None] | None = None,
    count: int | None = None,
) -> list[int]:
    """Split `total_cents` into shares that always add up exactly to the total.

    Rounding remainders go to the largest share (proportional) or the first one (equal).
    """
    n = count if count is not None else len(reference_prices or manual_shares or [])
    if n == 0:
        raise BundleSplitError("a bundle needs at least one copy")
    if total_cents < 0:
        raise BundleSplitError("the total must not be negative")

    if mode is SplitMode.manual:
        if manual_shares is None or len(manual_shares) != n or any(s is None or s < 0 for s in manual_shares):
            raise BundleSplitError("manual split: every copy needs a price ≥ 0")
        left = total_cents - sum(manual_shares)
        if left != 0:
            raise BundleSplitError(f"manual split: {left / 100:.2f} € left to assign")
        return list(manual_shares)

    if mode is SplitMode.equal:
        base, remainder = divmod(total_cents, n)
        shares = [base] * n
        shares[0] += remainder
        return shares

    # proportional
    if reference_prices is None or len(reference_prices) != n or any(p is None or p < 0 for p in reference_prices):
        raise BundleSplitError("proportional split: every copy needs a reference price ≥ 0")
    weight_sum = sum(reference_prices)
    if weight_sum == 0:
        raise BundleSplitError("proportional split: the reference prices must not all be 0")
    shares = [total_cents * p // weight_sum for p in reference_prices]
    largest = max(range(n), key=lambda i: reference_prices[i])
    shares[largest] += total_cents - sum(shares)
    return shares


def apply_split(bundle: Bundle, manual_shares: list[int | None] | None = None) -> None:
    """Recalculate buy (and, if sold as a bundle, sell) prices of all copies in the bundle.

    For `manual` mode the current buy prices are kept unless new `manual_shares` are given.
    """
    copies = bundle.copies
    if not copies:
        raise BundleSplitError("a bundle needs at least one copy")

    if bundle.split_mode is SplitMode.manual and manual_shares is None:
        manual_shares = [c.buy_price_cents for c in copies]
    buy_shares = split_amount(
        bundle.total_price_cents,
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
            raise BundleSplitError("a bundle sold as a whole needs a sell total")
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
