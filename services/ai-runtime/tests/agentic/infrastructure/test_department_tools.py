# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import asyncio

import httpx
import pytest

from app.agentic.infrastructure.department_tools import (
    DepartmentToolClient,
    DepartmentToolError,
)


class Tokens:
    def __init__(self, value: str) -> None:
        self._value = value

    async def get_token(self) -> str:
        return self._value


def test_selects_only_the_explicit_department_identity() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"success": True, "data": {"resultDigest": "a" * 64}})

    client = _client(handler)
    result = asyncio.run(client.invoke("inventory", {"toolName": "inventory.stock_risk"}))

    assert result == {"resultDigest": "a" * 64}
    assert requests[0].url.path == "/v1/internal/agentic/tools/invoke"
    assert requests[0].headers["authorization"] == "Bearer inventory-token"
    assert b"catalog-token" not in requests[0].content
    assert b"worker-token" not in requests[0].content


def test_refuses_identity_substitution_for_an_unavailable_department() -> None:
    client = _client(lambda _request: httpx.Response(200), include_support=False)

    with pytest.raises(DepartmentToolError) as captured:
        asyncio.run(client.invoke("support", {"toolName": "support.sla_risk"}))

    assert captured.value.code == "DEPARTMENT_IDENTITY_UNAVAILABLE"
    assert captured.value.retryable is False


def test_bounds_and_redacts_tool_provider_failures() -> None:
    client = _client(lambda _request: httpx.Response(400, text="private-tool-body"))
    with pytest.raises(DepartmentToolError) as captured:
        asyncio.run(client.invoke("catalog", {"parameters": {"private": "payload"}}))
    assert captured.value.retryable is False
    assert "private-tool-body" not in str(captured.value)
    assert "payload" not in str(captured.value)

    oversized = _client(lambda _request: httpx.Response(200, text="x" * 2_000))
    with pytest.raises(DepartmentToolError) as too_large:
        asyncio.run(oversized.invoke("catalog", {"parameters": {}}))
    assert too_large.value.code == "DEPARTMENT_TOOL_RESPONSE_TOO_LARGE"


def _client(handler: object, *, include_support: bool = True) -> DepartmentToolClient:
    identities = {
        "catalog": Tokens("catalog-token"), "inventory": Tokens("inventory-token"),
        "order": Tokens("order-token"), "finance": Tokens("finance-token"),
        "crm": Tokens("crm-token"),
    }
    if include_support:
        identities["support"] = Tokens("support-token")
    return DepartmentToolClient(
        base_url="https://api.test/v1/internal/agentic", tokens=identities,  # type: ignore[arg-type]
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),  # type: ignore[arg-type]
        timeout_seconds=1, maximum_response_bytes=1024,
    )
