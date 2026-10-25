"""Defense in depth: only answer requests from the home LAN / WireGuard tunnel (env var ALLOWED_NETWORKS)."""

import ipaddress
import json

IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network

# Private ranges (incl. IPv6 unique local / link-local) when ALLOWED_NETWORKS is not set.
DEFAULT_NETWORKS = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7,fe80::/10"
# Always allowed: the container healthcheck and local development talk to the server over loopback.
LOOPBACK = (ipaddress.ip_network("127.0.0.0/8"), ipaddress.ip_network("::1/128"))


def parse_networks(value: str) -> list[IPNetwork]:
    """Parse a comma-separated list of networks or single addresses; raises ValueError on a bad entry."""
    networks = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            networks.append(ipaddress.ip_network(part, strict=False))
        except ValueError as error:
            raise ValueError(f"ALLOWED_NETWORKS: invalid network {part!r}") from error
    if not networks:
        raise ValueError("ALLOWED_NETWORKS is empty")
    return networks


def is_allowed(host: str | None, networks: list[IPNetwork]) -> bool:
    try:
        address = ipaddress.ip_address(host or "")
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return any(address in network for network in (*LOOPBACK, *networks))


class NetworkGuard:
    """ASGI middleware: 403 for HTTP/WebSocket requests whose source address is outside the allowed networks."""

    def __init__(self, app, networks: list[IPNetwork]):
        self.app = app
        self.networks = networks

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            client = scope.get("client")
            if not is_allowed(client[0] if client else None, self.networks):
                if scope["type"] == "websocket":
                    await send({"type": "websocket.close", "code": 1008})
                    return
                body = json.dumps({"detail": "access is limited to the home network"}).encode()
                headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
                await send({"type": "http.response.start", "status": 403, "headers": headers})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)
