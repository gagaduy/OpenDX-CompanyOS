# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import asyncio
import json

import httpx
import pytest

from app.agentic.infrastructure.agent_submission_client import (
    AgentSubmissionClient,
    AgentSubmissionError,
)


class AiCeoTokens:
    async def get_token(self) -> str:
        return "ai-ceo-token"


def test_submits_plan_with_only_the_ai_ceo_identity() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(202, json={"success": True, "data": {"accepted": True}})

    client = _client(handler)
    asyncio.run(client.accept_plan({"digest": "a" * 64}))

    assert requests[0].url.path == "/v1/internal/agentic/orchestration/plans"
    assert requests[0].headers["authorization"] == "Bearer ai-ceo-token"
    assert json.loads(requests[0].content) == {"digest": "a" * 64}


def test_plan_submission_bounds_and_redacts_provider_failures() -> None:
    client = _client(lambda _request: httpx.Response(503, text="private-provider-body"))
    with pytest.raises(AgentSubmissionError) as captured:
        asyncio.run(client.accept_plan({"private": "request-body"}))
    assert captured.value.retryable is True
    assert "private-provider-body" not in str(captured.value)
    assert "request-body" not in str(captured.value)

    oversized = _client(lambda _request: httpx.Response(202, text="x" * 2_000))
    with pytest.raises(AgentSubmissionError) as too_large:
        asyncio.run(oversized.accept_plan({"private": "request-body"}))
    assert too_large.value.code == "AGENT_SUBMISSION_RESPONSE_TOO_LARGE"


def _client(handler: object) -> AgentSubmissionClient:
    return AgentSubmissionClient(
        base_url="https://api.test/v1/internal/agentic", tokens=AiCeoTokens(),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),  # type: ignore[arg-type]
        timeout_seconds=1, maximum_response_bytes=1024,
    )
