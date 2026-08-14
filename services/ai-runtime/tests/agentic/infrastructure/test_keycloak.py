# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.agentic.infrastructure.keycloak import (
    KeycloakClientCredentialsProvider,
    KeycloakTokenError,
)


def test_acquires_encoded_token_and_caches_until_skew() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={
            "access_token": "worker-token", "token_type": "Bearer", "expires_in": 60
        })

    now = [1_000.0]
    provider = _provider(handler, lambda: now[0])
    assert asyncio.run(provider.get_token()) == "worker-token"
    assert asyncio.run(provider.get_token()) == "worker-token"
    assert len(calls) == 1
    assert calls[0].headers["content-type"].startswith(
        "application/x-www-form-urlencoded"
    )
    assert calls[0].content.decode() == (
        "grant_type=client_credentials&client_id=opendx-agentic-worker&"
        "client_secret=private-worker-secret&audience=opendx-api"
    )
    now[0] += 51
    assert asyncio.run(provider.get_token()) == "worker-token"
    assert len(calls) == 2


def test_coalesces_concurrent_refresh() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return httpx.Response(200, json={
            "access_token": "shared-token", "token_type": "Bearer", "expires_in": 60
        })

    async def scenario() -> list[str]:
        provider = _provider(handler, lambda: 1_000.0)
        return list(await asyncio.gather(provider.get_token(), provider.get_token()))

    assert asyncio.run(scenario()) == ["shared-token", "shared-token"]
    assert calls == 1


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, text="sensitive-provider-body"),
        httpx.Response(200, json={"access_token": "", "expires_in": 0}),
    ],
)
def test_redacts_provider_failures(response: httpx.Response) -> None:
    provider = _provider(lambda _request: response, lambda: 1_000.0)
    with pytest.raises(KeycloakTokenError) as captured:
        asyncio.run(provider.get_token())
    assert "private-worker-secret" not in str(captured.value)
    assert "sensitive-provider-body" not in str(captured.value)


def _provider(handler: object, now: object) -> KeycloakClientCredentialsProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))  # type: ignore[arg-type]
    return KeycloakClientCredentialsProvider(
        token_url="https://identity.test/token",
        client_id="opendx-agentic-worker",
        client_secret="private-worker-secret",
        audience="opendx-api",
        client=client,
        now=now,  # type: ignore[arg-type]
        expiry_skew_seconds=10,
    )
