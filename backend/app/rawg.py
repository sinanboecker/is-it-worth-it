"""RAWG (rawg.io) game metadata: search, details, store links (→ Steam app ID), DLC/editions.

Free API key for personal use; the app must show a link to RAWG wherever its data appears (PLANNING.md §5b).
"""

import difflib
import re
from dataclasses import dataclass, field
from datetime import date

import httpx

from app import cache, config, http
from app.names import name_key

DAY = 24 * 3600
STEAM_APP_URL = re.compile(r"store\.steampowered\.com/app/(\d+)")


class RawgError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


@dataclass
class Candidate:
    rawg_id: int
    slug: str
    name: str
    released: date | None
    platforms: list[str] = field(default_factory=list)
    image_url: str | None = None


@dataclass
class Details:
    rawg_id: int
    slug: str
    name: str
    description: str | None
    released: date | None
    genres: str | None
    developers: str | None
    image_url: str | None


def configured() -> bool:
    return bool(config.RAWG_API_KEY)


def _get(path: str, **params) -> dict:
    if not configured():
        raise RawgError("RAWG is not set up: add RAWG_API_KEY to the server's environment", 503)
    try:
        with http.client() as client:
            response = client.get(f"{config.RAWG_BASE_URL}{path}", params={"key": config.RAWG_API_KEY, **params})
    except httpx.HTTPError as e:
        raise RawgError(f"RAWG is not reachable: {e.__class__.__name__}") from e
    if response.status_code in (401, 403):
        raise RawgError("RAWG rejected the API key (RAWG_API_KEY)", 502)
    if response.status_code == 404:
        raise RawgError("game not found on RAWG", 404)
    if response.status_code == 429:
        raise RawgError("RAWG request limit reached, try again later", 429)
    if response.status_code >= 400:
        raise RawgError(f"RAWG answered with HTTP {response.status_code}")
    return response.json()


def _date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


def _candidate(raw: dict) -> Candidate:
    return Candidate(
        rawg_id=raw["id"],
        slug=raw.get("slug") or "",
        name=raw.get("name") or "",
        released=_date(raw.get("released")),
        platforms=[p["platform"]["name"] for p in raw.get("platforms") or [] if p.get("platform")],
        image_url=raw.get("background_image"),
    )


def _names(entries: list[dict] | None) -> str | None:
    names = [e["name"] for e in entries or [] if e.get("name")]
    return ", ".join(names) or None


def search(query: str, page_size: int = 10) -> list[Candidate]:
    query = query.strip()
    if not query:
        return []

    def fetch():
        data = _get("/games", search=query, page_size=page_size, search_precise="true")
        return [_candidate(raw) for raw in data.get("results") or []]

    return cache.cached(("rawg-search", query.casefold(), page_size), DAY, fetch)


def details(rawg_id: int) -> Details:
    def fetch():
        raw = _get(f"/games/{rawg_id}")
        return Details(
            rawg_id=raw["id"],
            slug=raw.get("slug") or "",
            name=raw.get("name") or "",
            description=(raw.get("description_raw") or "").strip() or None,
            released=_date(raw.get("released")),
            genres=_names(raw.get("genres")),
            developers=_names(raw.get("developers")),
            image_url=raw.get("background_image"),
        )

    return cache.cached(("rawg-details", rawg_id), DAY, fetch)


def steam_app_id(rawg_id: int) -> int | None:
    """Steam app ID from the game's Steam store link, if it is sold on Steam."""

    def fetch():
        for store in _get(f"/games/{rawg_id}/stores").get("results") or []:
            match = STEAM_APP_URL.search(store.get("url") or "")
            if match:
                return int(match.group(1))
        return None

    return cache.cached(("rawg-steam", rawg_id), DAY, fetch)


def additions(rawg_id: int) -> list[Candidate]:
    """DLC, expansions and editions of a game."""

    def fetch():
        data = _get(f"/games/{rawg_id}/additions", page_size=40)
        return [_candidate(raw) for raw in data.get("results") or []]

    return cache.cached(("rawg-additions", rawg_id), DAY, fetch)


# --- matching ---------------------------------------------------------------------------------


def best_match(name: str, candidates: list[Candidate]) -> Candidate | None:
    """A confident match for automatic use, or None (then the user picks)."""
    target = name_key(name)
    exact = [c for c in candidates if name_key(c.name) == target]
    if len(exact) == 1:
        return exact[0]
    if exact:  # same name several times (remakes): too ambiguous
        return None
    scored = [(difflib.SequenceMatcher(None, target, name_key(c.name)).ratio(), c) for c in candidates]
    close = [c for ratio, c in scored if ratio >= 0.85]
    best = max(scored, key=lambda pair: pair[0], default=(0, None))
    return best[1] if len(close) == 1 and best[0] >= 0.92 else None
