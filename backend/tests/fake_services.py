"""Fake RAWG, Steam Store and image host for tests (served through httpx.MockTransport)."""

import io
import re
from collections import Counter

import httpx
from PIL import Image

RAWG = "https://rawg.test/api"
STEAM = "https://steam.test"
IMAGES = "https://media.rawg.test"


def png(width=1920, height=1080, color=(200, 30, 30)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, "PNG")
    return buffer.getvalue()


def game(id_, name, released="2023-05-12", platforms=("Nintendo Switch",), image=True):
    return {
        "id": id_,
        "slug": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
        "name": name,
        "released": released,
        "background_image": f"{IMAGES}/games/{id_}.jpg" if image else None,
        "platforms": [{"platform": {"id": i, "slug": p.lower(), "name": p}} for i, p in enumerate(platforms)],
    }


GAMES = {
    1: game(1, "The Legend of Zelda: Tears of the Kingdom"),
    2: game(2, "Hades", "2020-09-17", ("PC", "Nintendo Switch")),
    3: game(3, "The Witcher 3: Wild Hunt", "2015-05-18", ("PC",)),
    4: game(4, "Tetris", "1984-06-06"),
    5: game(5, "Tetris", "1989-06-14"),
    6: game(6, "Hades II", "2025-09-25", ("PC",)),
    10: game(10, "The Witcher 3: Wild Hunt – Hearts of Stone", "2015-10-13", ("PC",)),
    11: game(11, "The Witcher 3: Wild Hunt – Blood and Wine", "2016-05-31", ("PC",)),
}
DETAILS = {
    1: {"description_raw": "Explore the skies of Hyrule.", "genres": [{"name": "Adventure"}, {"name": "Action"}],
        "developers": [{"name": "Nintendo EPD"}]},
    2: {"description_raw": "Defy the god of the dead.", "genres": [{"name": "Roguelike"}],
        "developers": [{"name": "Supergiant Games"}]},
    3: {"description_raw": "Geralt.", "genres": [{"name": "RPG"}], "developers": [{"name": "CD PROJEKT RED"}]},
}  # fmt: skip
STORES = {
    2: [{"id": 1, "store_id": 1, "url": "https://store.steampowered.com/app/1145360/Hades/"}],
    3: [
        {"id": 2, "store_id": 5, "url": "https://www.gog.com/game/the_witcher_3"},
        {"id": 3, "store_id": 1, "url": "https://store.steampowered.com/app/292030/"},
    ],
}
ADDITIONS = {3: [10, 11], 1: []}
STEAM_APPS = {
    292030: {"name": "The Witcher 3", "dlc": [378648, 378649, 999]},
    378648: {"name": "Hearts of Stone", "price_overview": {"currency": "EUR", "final": 999}},
    378649: {"name": "Blood and Wine", "price_overview": {"currency": "EUR", "final": 1999}},
    999: {"name": "Free Bonus Content", "is_free": True},
    1145360: {"name": "Hades", "dlc": []},
}


class FakeServices:
    def __init__(self, images_base: str = IMAGES):
        self.calls: Counter[str] = Counter()
        self.api_key_ok = True
        self.images_base = images_base

    def __call__(self, request: httpx.Request) -> httpx.Response:
        response = self._handle(request)
        if self.images_base != IMAGES and response.headers.get("content-type", "").startswith("application/json"):
            body = response.content.replace(IMAGES.encode(), self.images_base.encode())
            return httpx.Response(response.status_code, content=body, headers={"content-type": "application/json"})
        return response

    def _handle(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        path = request.url.path
        self.calls[path] += 1
        if url.startswith(IMAGES):
            return httpx.Response(200, content=png(), headers={"content-type": "image/png"})
        if url.startswith(STEAM):
            app_id = int(request.url.params["appids"])
            data = STEAM_APPS.get(app_id)
            return httpx.Response(200, json={str(app_id): {"success": bool(data), "data": data}})
        if not url.startswith(RAWG):
            return httpx.Response(404)
        if not self.api_key_ok:
            return httpx.Response(401, json={"error": "The key parameter is not provided"})
        assert request.url.params["key"] == "test-key"
        if path == "/api/games":
            query = request.url.params["search"].casefold()
            words = re.findall(r"\w+", query)  # like RAWG: punctuation in the query doesn't matter
            hits = [g for g in GAMES.values() if all(w in g["name"].casefold() for w in words) and g["id"] < 10]
            return httpx.Response(200, json={"count": len(hits), "results": hits})
        if m := re.fullmatch(r"/api/games/(\d+)", path):
            id_ = int(m.group(1))
            if id_ not in GAMES:
                return httpx.Response(404, json={"detail": "Not found."})
            return httpx.Response(200, json={**GAMES[id_], **DETAILS.get(id_, {})})
        if m := re.fullmatch(r"/api/games/(\d+)/stores", path):
            results = STORES.get(int(m.group(1)), [])
            return httpx.Response(200, json={"count": len(results), "results": results})
        if m := re.fullmatch(r"/api/games/(\d+)/additions", path):
            results = [GAMES[i] for i in ADDITIONS.get(int(m.group(1)), [])]
            return httpx.Response(200, json={"count": len(results), "results": results})
        return httpx.Response(404)
