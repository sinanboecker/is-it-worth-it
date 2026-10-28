import io
import json
import zipfile

import pytest

from app import config


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    path = tmp_path / "data"
    path.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", path)
    return path


def fill(api):
    """A bit of everything: categories, default device, copies, hours, DLC, completion, bundle, PC build, camera."""
    nintendo = api.category()
    switch = api.hardware(nintendo["id"])
    api.patch(f"/categories/{nintendo['id']}", {"default_device_id": switch["id"]})
    game = api.game(nintendo["id"], rating=4)
    api.post(f"/items/{game['id']}/hours", {"hours": 12.5})
    api.post(f"/items/{game['id']}/dlc", {"name": "DLC", "buy_date": "2024-01-01", "price_cents": 999})
    api.post(f"/items/{game['id']}/completions", {"finished_on": None, "review": "Großartig"})
    api.post(
        "/bundles",
        {
            "name": "Bundle",
            "buy_date": "2025-01-01",
            "total_price_cents": 1000,
            "split_mode": "equal",
            "entries": [{"new_item": {"category_id": nintendo["id"], "kind": "game", "name": n}} for n in "AB"],
        },
    )
    build = api.post("/pc/builds", {"name": "2024 build", "hardware_id": switch["id"]})
    api.post("/pc/parts", {"name": "GPU", "build_id": build["id"], "buy_date": "2024-01-01", "buy_price_cents": 50000})
    purchase = api.post(
        "/pc/purchases",
        {
            "name": "Used PC",
            "buy_date": "2024-02-01",
            "total_price_cents": 30000,
            "parts": [{"name": "A"}, {"name": "B"}],
        },
    )
    parts = [{"id": p["id"]} for p in purchase["parts"]]
    api.post("/pc/sales", {"sell_date": "2024-05-01", "total_price_cents": 10000, "parts": parts})
    api.post("/camera/gear", {"name": "X-T4", "category": "body", "buy_date": "2021-03-01", "buy_price_cents": 150000})
    api.put("/settings", {"break_even_cph": 250})
    return game


def export(api, images=False):
    response = api.client.get("/api/v1/export/json", params={"images": images})
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    return response


def upload(api, content: bytes, mode="empty", name="export.json"):
    return api.client.post("/api/v1/import/json", params={"mode": mode}, files={"file": (name, content)})


def strip_time(data: dict) -> dict:
    return {k: v for k, v in data.items() if k != "exported_at"}


def test_round_trip(api, data_dir):
    game = fill(api)
    before_game = api.get(f"/items/{game['id']}")
    first = export(api).json()
    assert first["schema_version"] == 1
    assert len(first["tables"]["copies"]) == 4  # console, game, 2 bundle games
    assert [len(first["tables"][t]) for t in ("pc_builds", "pc_purchases", "pc_sales", "pc_parts")] == [1, 1, 1, 3]
    assert len(first["tables"]["camera_gear"]) == 1
    builds_before, parts_before = api.get("/pc/builds"), api.get("/pc/parts")
    camera_before = api.get("/camera/gear")

    response = upload(api, json.dumps(first).encode(), mode="replace")
    assert response.status_code == 200, response.text
    assert response.json()["items"] == 4

    second = export(api).json()
    assert strip_time(first) == strip_time(second)
    assert api.get(f"/items/{game['id']}") == before_game  # derived values identical too
    assert api.get("/settings")["break_even_cph"] == 250
    assert (api.get("/pc/builds"), api.get("/pc/parts")) == (builds_before, parts_before)
    assert api.get("/camera/gear") == camera_before


def test_empty_mode_refuses_existing_data(api, data_dir):
    fill(api)
    content = export(api).content
    response = upload(api, content, mode="empty")
    assert response.status_code == 422
    assert "isn't empty" in response.json()["detail"]


def test_restore_into_fresh_database(api, data_dir):
    game = fill(api)
    content = export(api).content
    expected = api.get(f"/items/{game['id']}")

    # wipe everything, as on a new server (the seeded handhelds category alone doesn't count as data)
    from sqlmodel import Session

    from app import db, json_io

    with Session(db.engine) as session:
        json_io.import_data(session, {"format": "is-it-worth-it", "schema_version": 1, "tables": {}}, "replace")
    assert api.get("/categories") == []
    assert upload(api, content, mode="empty").status_code == 200
    assert api.get(f"/items/{game['id']}") == expected


def test_zip_with_images(api, data_dir):
    fill(api)
    (data_dir / "covers").mkdir()
    (data_dir / "covers" / "1.jpg").write_bytes(b"cover")
    (data_dir / "uploads" / "sub").mkdir(parents=True)
    (data_dir / "uploads" / "sub" / "photo.png").write_bytes(b"photo")
    response = export(api, images=True)
    assert response.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert sorted(archive.namelist()) == ["covers/1.jpg", "data.json", "uploads/sub/photo.png"]

    (data_dir / "covers" / "1.jpg").unlink()
    assert upload(api, response.content, mode="replace", name="export.zip").status_code == 200
    assert (data_dir / "covers" / "1.jpg").read_bytes() == b"cover"


def test_zip_paths_outside_media_folders_are_ignored(api, data_dir):
    data = export(api).content
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("data.json", data)
        archive.writestr("covers/../../evil.txt", "x")
        archive.writestr("app.db", "x")
    assert upload(api, buffer.getvalue(), mode="replace", name="x.zip").status_code == 200
    assert not (data_dir.parent / "evil.txt").exists()
    assert not (data_dir / "app.db").exists()


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"not json", "not a valid JSON file"),
        (b"[]", "not an Is It Worth It? export file"),
        (json.dumps({"format": "other", "schema_version": 1, "tables": {}}).encode(), "not an Is It Worth It?"),
        (json.dumps({"format": "is-it-worth-it", "schema_version": 99, "tables": {}}).encode(), "newer app version"),
        (json.dumps({"format": "is-it-worth-it", "schema_version": 1}).encode(), "missing tables"),
    ],
)
def test_invalid_files(api, data_dir, content, message):
    response = upload(api, content, mode="replace")
    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_broken_file_keeps_existing_data(api, data_dir):
    game = fill(api)
    data = export(api).json()
    data["tables"]["copies"][0]["item_id"] = 9999  # reference to a missing item
    response = upload(api, json.dumps(data).encode(), mode="replace")
    assert response.status_code == 422
    assert api.get(f"/items/{game['id']}")["name"] == game["name"]  # rolled back

    data = export(api).json()
    data["tables"]["copies"][0]["buy_date"] = "not a date"
    response = upload(api, json.dumps(data).encode(), mode="replace")
    assert response.status_code == 422
    assert "invalid row in copies" in response.json()["detail"]
    assert len(api.get("/items")) == 4
