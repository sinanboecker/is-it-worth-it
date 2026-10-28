"""RAWG metadata, images and DLC suggestions, against fake services."""

import httpx
import pytest
from PIL import Image

from app import cache, config, http, rawg
from tests.fake_services import IMAGES, RAWG, STEAM, FakeServices, png


@pytest.fixture
def fake(monkeypatch, tmp_path):
    services = FakeServices()
    monkeypatch.setattr(http, "transport", httpx.MockTransport(services))
    monkeypatch.setattr(config, "RAWG_API_KEY", "test-key")
    monkeypatch.setattr(config, "RAWG_BASE_URL", RAWG)
    monkeypatch.setattr(config, "STEAM_STORE_URL", STEAM)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    cache.clear()
    yield services
    cache.clear()


def test_status(api, fake, monkeypatch):
    assert api.get("/metadata/status") == {"rawg": True}
    monkeypatch.setattr(config, "RAWG_API_KEY", "")
    assert api.get("/metadata/status") == {"rawg": False}
    response = api.client.get("/api/v1/metadata/search", params={"q": "Hades"})
    assert response.status_code == 503
    assert "RAWG_API_KEY" in response.json()["detail"]


def test_search_is_cached(api, fake):
    results = api.get("/metadata/search", params={"q": "Hades"})
    assert [r["name"] for r in results] == ["Hades", "Hades II"]
    assert results[0]["platforms"] == ["PC", "Nintendo Switch"]
    assert results[0]["image_url"] == f"{IMAGES}/games/2.jpg"
    api.get("/metadata/search", params={"q": "hades"})
    assert fake.calls["/api/games"] == 1


def test_bad_api_key(api, fake):
    fake.api_key_ok = False
    response = api.client.get("/api/v1/metadata/search", params={"q": "Hades"})
    assert response.status_code == 502
    assert "rejected the API key" in response.json()["detail"]


def test_apply_metadata_with_image_and_steam_id(api, fake):
    pc = api.category("PC")
    game = api.game(pc["id"], name="hades")
    result = api.post(f"/items/{game['id']}/metadata", {"rawg_id": 2})
    assert result["rawg_id"] == 2 and result["rawg_slug"] == "hades"
    assert result["summary"] == "Defy the god of the dead."
    assert result["genres"] == "Roguelike" and result["developer"] == "Supergiant Games"
    assert result["release_date"] == "2020-09-17"
    assert result["steam_app_id"] == 1145360
    assert result["name"] == "hades"  # own name kept unless rename=True

    cover = result["cover_path"]
    assert cover.startswith(f"covers/{game['id']}-") and cover.endswith(".jpg")
    with Image.open(config.DATA_DIR / cover) as image:
        assert image.size == (1280, 720)  # shrunk from 1920×1080
    response = api.client.get(f"/api/v1/media/{cover}")
    assert response.status_code == 200 and response.headers["content-type"] == "image/jpeg"
    assert "immutable" in response.headers["cache-control"]

    renamed = api.post(f"/items/{game['id']}/metadata", {"rawg_id": 2, "rename": True})
    assert renamed["name"] == "Hades"

    cleared = api.delete(f"/items/{game['id']}/metadata")
    assert cleared["rawg_id"] is None and cleared["cover_path"] is None
    assert cleared["steam_app_id"] == 1145360  # kept
    assert not (config.DATA_DIR / cover).exists()


def test_apply_unknown_game(api, fake):
    pc = api.category("PC")
    game = api.game(pc["id"])
    assert api.client.post(f"/api/v1/items/{game['id']}/metadata", json={"rawg_id": 404}).status_code == 404


def test_metadata_only_for_games(api, fake):
    pc = api.category("PC")
    device = api.hardware(pc["id"])
    assert api.client.post(f"/api/v1/items/{device['id']}/metadata", json={"rawg_id": 2}).status_code == 422


def test_fetch_missing_applies_confident_matches(api, fake):
    nintendo = api.category()
    zelda = api.game(nintendo["id"], name="The Legend of Zelda – Tears of the Kingdom")
    tetris = api.game(nintendo["id"], name="Tetris")  # two different games with that name
    unknown = api.game(nintendo["id"], name="Some Homebrew Thing")
    hades = api.game(nintendo["id"], name="Hades")
    hades = api.post(f"/items/{hades['id']}/metadata", {"rawg_id": 2})  # already matched: not touched

    first = api.post("/metadata/fetch-missing", {"limit": 2})
    assert [a["item_id"] for a in first["applied"]] == [zelda["id"]]
    assert first["applied"][0]["rawg_name"] == "The Legend of Zelda: Tears of the Kingdom"
    assert [r["item_id"] for r in first["review"]] == [tetris["id"]]
    assert [c["rawg_id"] for c in first["review"][0]["candidates"]] == [4, 5]
    assert first["remaining"] == 1

    second = api.post("/metadata/fetch-missing", {"limit": 2, "skip": [tetris["id"]]})
    assert second["applied"] == []
    assert [r["item_id"] for r in second["review"]] == [unknown["id"]]
    assert second["review"][0]["candidates"] == []
    assert second["remaining"] == 0

    assert api.get(f"/items/{zelda['id']}")["genres"] == "Adventure, Action"


def test_fetch_missing_goes_on_when_rawgs_best_match_is_gone(api, fake):
    """RAWG's search can return a game whose details are gone (404): the run must not stop there."""
    pc = api.category("PC")
    gone = api.game(pc["id"], name="Ghost Recon Phantoms")
    zelda = api.game(pc["id"], name="The Legend of Zelda: Tears of the Kingdom")

    result = api.post("/metadata/fetch-missing", {"limit": 8})
    assert [a["item_id"] for a in result["applied"]] == [zelda["id"]]
    (review,) = result["review"]
    assert (review["item_id"], review["candidates"]) == (gone["id"], [])  # its only candidate is gone
    assert "isn't on RAWG any more" in review["note"]
    assert api.get(f"/items/{gone['id']}")["rawg_id"] is None


def test_best_match_rules():
    def c(id_, name):
        return rawg.Candidate(rawg_id=id_, slug="", name=name, released=None)

    assert rawg.best_match("Hades", [c(2, "Hades"), c(6, "Hades II")]).rawg_id == 2
    assert rawg.best_match("FINAL FANTASY XV", [c(1, "Final Fantasy XV")]).rawg_id == 1
    assert rawg.best_match("Anno 1800™", [c(1, "Anno 1800")]).rawg_id == 1
    assert rawg.best_match("Tetris", [c(4, "Tetris"), c(5, "Tetris")]) is None
    assert rawg.best_match("Battlefield 1", [c(1, "Battlefield 4"), c(2, "Battlefield 3")]) is None
    assert rawg.best_match("Dying Light 2", [c(1, "Dying Light 2 Stay Human")]) is None  # user decides


def test_upload_and_delete_own_image(api, fake):
    pc = api.category("PC")
    device = api.hardware(pc["id"])
    response = api.client.post(
        f"/api/v1/items/{device['id']}/image", files={"file": ("photo.png", png(400, 300), "image/png")}
    )
    assert response.status_code == 200, response.text
    path = response.json()["image_path"]
    assert path.startswith("uploads/") and (config.DATA_DIR / path).exists()

    bad = api.client.post(
        f"/api/v1/items/{device['id']}/image", files={"file": ("x.png", b"not an image", "image/png")}
    )
    assert bad.status_code == 422

    assert api.delete(f"/items/{device['id']}/image")["image_path"] is None
    assert not (config.DATA_DIR / path).exists()


def test_media_paths_are_confined(api, fake):
    (config.DATA_DIR).mkdir(parents=True, exist_ok=True)
    (config.DATA_DIR / "app.db").write_text("secret")
    assert api.client.get("/api/v1/media/app.db").status_code == 404
    assert api.client.get("/api/v1/media/covers/../app.db").status_code == 404
    assert api.client.get("/api/v1/media/covers/missing.jpg").status_code == 404


def test_dlc_suggestions_from_steam(api, fake):
    pc = api.category("PC")
    witcher = api.game(pc["id"], name="Witcher 3")
    api.post(f"/items/{witcher['id']}/metadata", {"rawg_id": 3})
    api.post(f"/items/{witcher['id']}/dlc", {"name": "Hearts of Stone", "buy_date": "2024-01-01", "price_cents": 500})

    suggestions = api.get(f"/items/{witcher['id']}/dlc/available")
    assert [(s["name"], s["price_cents"], s["owned"]) for s in suggestions] == [
        ("Blood and Wine", 1999, False),
        ("Free Bonus Content", 0, False),
        ("Hearts of Stone", 999, True),
    ]
    assert {s["source"] for s in suggestions} == {"steam"}
    assert api.get(f"/items/{witcher['id']}/dlc/available", params={"q": "blood"})[0]["steam_app_id"] == 378649

    calls = fake.calls["/api/appdetails"]
    api.get(f"/items/{witcher['id']}/dlc/available")
    assert fake.calls["/api/appdetails"] == calls  # cached


def test_dlc_suggestions_fall_back_to_rawg(api, fake):
    pc = api.category("PC")
    witcher = api.game(pc["id"], name="Witcher 3")
    api.post(f"/items/{witcher['id']}/metadata", {"rawg_id": 3})
    api.patch(f"/items/{witcher['id']}", {"steam_app_id": None})
    suggestions = api.get(f"/items/{witcher['id']}/dlc/available")
    assert [(s["name"], s["source"], s["price_cents"]) for s in suggestions] == [
        ("The Witcher 3: Wild Hunt – Hearts of Stone", "rawg", None),
        ("The Witcher 3: Wild Hunt – Blood and Wine", "rawg", None),
    ]


def test_dlc_suggestions_without_any_source(api, fake):
    pc = api.category("PC")
    game = api.game(pc["id"])
    assert api.get(f"/items/{game['id']}/dlc/available") == []


def test_info_is_saved_when_the_steam_link_cant_be_loaded(api, fake, monkeypatch):
    def broken(rawg_id):
        raise rawg.RawgError("RAWG request limit reached, try again later", 429)

    monkeypatch.setattr(rawg, "steam_app_id", broken)
    pc = api.category("PC")
    hades = api.game(pc["id"], name="Hades")
    hades = api.post(f"/items/{hades['id']}/metadata", {"rawg_id": 2})
    assert (hades["rawg_id"], hades["steam_app_id"], hades["genres"]) == (2, None, "Roguelike")


def test_lists_include_the_release_date(api, fake):
    pc = api.category("PC")
    hades = api.game(pc["id"], name="Hades")
    api.post(f"/items/{hades['id']}/metadata", {"rawg_id": 2})
    (listed,) = api.get("/items", params={"q": "Hades"})
    assert listed["release_date"] == "2020-09-17"
