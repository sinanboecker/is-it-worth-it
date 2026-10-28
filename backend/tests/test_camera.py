"""Camera gear."""


def test_add_edit_and_sell_gear(api):
    body = api.post(
        "/camera/gear",
        {"name": "X-T4", "category": "body", "manufacturer": "Fujifilm", "buy_date": "2021-03-01",
         "buy_price_cents": 150000},
    )  # fmt: skip
    assert (body["sold"], body["net_cost_cents"], body["notes"]) == (False, 150000, None)

    sold = api.patch(f"/camera/gear/{body['id']}", {"sell_date": "2024-05-01", "sell_price_cents": 90000})
    assert (sold["sold"], sold["net_cost_cents"], sold["manufacturer"]) == (True, 60000, "Fujifilm")

    lens = api.post("/camera/gear", {"name": "XF 35mm", "category": "lens", "buy_price_cents": 40000})
    assert lens["buy_date"] is None  # unknown
    adapter = api.post("/camera/gear", {"name": "EF-FX", "category": "adapter", "buy_price_cents": 15000})
    assert adapter["category"] == "adapter"
    api.delete(f"/camera/gear/{adapter['id']}")
    other = api.post("/camera/gear", {"name": "Tripod", "buy_date": "2022-01-01", "buy_price_cents": 5000})
    assert other["category"] == "other"  # when none is given
    # newest first, unknown buy dates last
    assert [g["name"] for g in api.get("/camera/gear")] == ["Tripod", "X-T4", "XF 35mm"]

    api.delete(f"/camera/gear/{other['id']}")
    assert [g["name"] for g in api.get("/camera/gear")] == ["X-T4", "XF 35mm"]


def test_invalid_gear(api):
    sold_before_bought = {"name": "A", "buy_date": "2024-01-01", "sell_date": "2023-01-01", "buy_price_cents": 100}
    assert api.client.post("/api/v1/camera/gear", json=sold_before_bought).status_code == 422
    gear = api.post("/camera/gear", {"name": "A", "buy_date": "2024-01-01", "buy_price_cents": 100})
    for change in ({"sell_date": "2023-12-31"}, {"name": None}, {"buy_price_cents": None}):
        assert api.client.patch(f"/api/v1/camera/gear/{gear['id']}", json=change).status_code == 422
    assert api.client.patch("/api/v1/camera/gear/999", json={"name": "B"}).status_code == 404
