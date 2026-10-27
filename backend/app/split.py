"""Splitting one price across several things bought or sold together: game bundles, PC purchases and PC sales."""

from app.models import SplitMode


class SplitError(ValueError):
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
        raise SplitError("a bundle needs at least one copy")
    if total_cents < 0:
        raise SplitError("the total must not be negative")

    if mode is SplitMode.manual:
        if manual_shares is None or len(manual_shares) != n or any(s is None or s < 0 for s in manual_shares):
            raise SplitError("manual split: every item needs a price ≥ 0")
        left = total_cents - sum(manual_shares)
        if left != 0:
            raise SplitError(f"manual split: {left / 100:.2f} € left to assign")
        return list(manual_shares)

    if mode is SplitMode.equal:
        base, remainder = divmod(total_cents, n)
        shares = [base] * n
        shares[0] += remainder
        return shares

    # proportional
    if reference_prices is None or len(reference_prices) != n or any(p is None or p < 0 for p in reference_prices):
        raise SplitError("proportional split: every item needs a reference price ≥ 0")
    weight_sum = sum(reference_prices)
    if weight_sum == 0:
        raise SplitError("proportional split: the reference prices must not all be 0")
    shares = [total_cents * p // weight_sum for p in reference_prices]
    largest = max(range(n), key=lambda i: reference_prices[i])
    shares[largest] += total_cents - sum(shares)
    return shares
