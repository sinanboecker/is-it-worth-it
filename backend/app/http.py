"""Outbound HTTP. Tests replace `transport` with an httpx.MockTransport."""

import httpx

transport: httpx.BaseTransport | None = None

USER_AGENT = "is-it-worth-it/0.1 (self-hosted game tracker)"


def client() -> httpx.Client:
    return httpx.Client(
        timeout=httpx.Timeout(15.0, connect=5.0),
        transport=transport,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )
