"""Steam Store: list of a game's DLC with current prices (for the "Add DLC" dropdown).

Uses the public store endpoint `/api/appdetails` (no key; undocumented and rate-limited, so results are cached).
"""

from dataclasses import dataclass

import httpx

from app import cache, config, http

WEEK = 7 * 24 * 3600
MAX_DLC = 60


@dataclass
class SteamDlc:
    steam_app_id: int
    name: str
    price_cents: int | None  # current price in the store's currency; None = unknown / not sold
    currency: str | None


def _appdetails(client: httpx.Client, app_id: int, country: str, filters: str | None = None) -> dict | None:
    params = {"appids": app_id, "cc": country, "l": "english"}
    if filters:
        params["filters"] = filters
    try:
        response = client.get(f"{config.STEAM_STORE_URL}/api/appdetails", params=params)
        response.raise_for_status()
        entry = (response.json() or {}).get(str(app_id)) or {}
    except (httpx.HTTPError, ValueError):
        return None
    return entry.get("data") if entry.get("success") else None


def dlc_list(app_id: int, country: str = "de") -> list[SteamDlc]:
    def fetch() -> list[SteamDlc]:
        with http.client() as client:
            game = _appdetails(client, app_id, country)
            if not game:
                return []
            result = []
            for dlc_id in (game.get("dlc") or [])[:MAX_DLC]:
                data = _appdetails(client, dlc_id, country, filters="basic,price_overview")
                if not data or not data.get("name"):
                    continue
                price = data.get("price_overview") or {}
                result.append(
                    SteamDlc(
                        steam_app_id=dlc_id,
                        name=data["name"],
                        price_cents=0 if data.get("is_free") else price.get("final"),
                        currency=price.get("currency"),
                    )
                )
            return sorted(result, key=lambda d: d.name.casefold())

    return cache.cached(("steam-dlc", app_id, country), WEEK, fetch)
