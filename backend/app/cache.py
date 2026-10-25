"""Tiny in-memory TTL cache for external API responses (saves RAWG quota and Steam rate limits)."""

import time
from collections.abc import Callable
from typing import Any

_store: dict[tuple, tuple[float, Any]] = {}


def cached(key: tuple, ttl_seconds: float, compute: Callable[[], Any]) -> Any:
    now = time.monotonic()
    hit = _store.get(key)
    if hit is not None and hit[0] > now:
        return hit[1]
    value = compute()
    _store[key] = (now + ttl_seconds, value)
    return value


def clear() -> None:
    _store.clear()
