import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.netguard import DEFAULT_NETWORKS, is_allowed, parse_networks

HOME = parse_networks("192.168.178.0/24, 10.253.0.0/24")


@pytest.mark.parametrize(
    ("host", "allowed"),
    [
        ("192.168.178.20", True),
        ("10.253.0.2", True),  # WireGuard peer
        ("127.0.0.1", True),  # loopback is always allowed (healthcheck)
        ("::1", True),
        ("::ffff:192.168.178.20", True),  # IPv4-mapped IPv6
        ("192.168.1.20", False),  # guest Wi-Fi in another subnet
        ("8.8.8.8", False),
        ("2001:db8::1", False),
        ("testclient", False),  # not an address
        (None, False),
    ],
)
def test_is_allowed(host, allowed):
    assert is_allowed(host, HOME) is allowed


def test_default_networks_are_private_ranges():
    networks = parse_networks(DEFAULT_NETWORKS)
    assert is_allowed("172.17.0.1", networks)  # Docker bridge gateway
    assert is_allowed("192.168.0.5", networks)
    assert not is_allowed("172.32.0.1", networks)
    assert not is_allowed("1.1.1.1", networks)


def test_parse_networks():
    assert [str(n) for n in parse_networks("192.168.178.7, ,10.0.0.1/8")] == ["192.168.178.7/32", "10.0.0.0/8"]
    with pytest.raises(ValueError, match="'192.168.300.0/24'"):
        parse_networks("192.168.300.0/24")
    with pytest.raises(ValueError, match="empty"):
        parse_networks(" , ")


def test_request_from_outside_is_rejected(engine):
    with TestClient(app, client=("8.8.8.8", 50000)) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 403
        assert response.json() == {"detail": "access is limited to the home network"}
        assert client.get("/").status_code == 403
    with TestClient(app, client=("192.168.178.20", 50000)) as client:
        assert client.get("/api/v1/health").status_code == 200
