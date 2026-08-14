# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.agentic.domain.contracts import (
    ApprovalDecision,
    ApprovalSignal,
    ActivityKind,
    ActivityOutcome,
    ActivityReservationRequest,
    StateProjection,
    WorkflowState,
)
from app.agentic.infrastructure.agentic_control_client import (
    AgenticControlClient,
    AgenticControlError,
)


class Tokens:
    async def get_token(self) -> str:
        return "worker-token"


def test_rejects_unbounded_and_unknown_domain_values() -> None:
    with pytest.raises(ValueError):
        ActivityReservationRequest(
            invocation_key="x" * 1_001, run_id="run-1",
            activity_kind=ActivityKind.EXECUTE_FAKE_ANALYSIS,
            input_digest="a" * 64,
        )
    with pytest.raises(ValueError):
        ApprovalSignal(
            approval_id="approval-1", payload_digest="not-a-digest",
            decision=ApprovalDecision.APPROVED,
            application_decision_version=1, idempotency_key="receipt-1",
        )
    with pytest.raises(ValueError):
        WorkflowState("unknown")


def test_maps_plan_projection_and_reservation_requests_exactly() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={
                "success": True,
                "data": {
                    "taskId": "task-1", "workflowRunId": "run-1",
                    "workflowVersion": 1, "planRevision": 2,
                    "configurationRevisionId": "revision-1",
                    "subtasks": [{"id": "branch-1", "agentKind": "catalog", "version": 1}],
                    "dependencies": [],
                },
            })
        return httpx.Response(200, json={"success": True, "data": {"status": "reserved"}})

    client = _client(handler)
    plan = asyncio.run(client.load_plan("run-1"))
    asyncio.run(client.project_state("run-1", StateProjection(1, WorkflowState.PLANNING)))
    reservation = ActivityReservationRequest(
        invocation_key="run-1:1:execute_fake_analysis:branch-1:" + "a" * 64,
        run_id="run-1", activity_kind=ActivityKind.EXECUTE_FAKE_ANALYSIS,
        branch_id="branch-1", input_digest="a" * 64,
    )
    asyncio.run(client.reserve_activity(reservation))
    asyncio.run(client.complete_activity(
        reservation.invocation_key,
        ActivityOutcome(1, "FAKE_ANALYSIS_COMPLETED", {"status": "usable"}),
    ))
    asyncio.run(client.fail_activity(
        reservation.invocation_key,
        ActivityOutcome(1, "RETRY_EXHAUSTED"),
    ))

    assert plan.workflow_run_id == "run-1"
    assert requests[0].headers["authorization"] == "Bearer worker-token"
    assert json.loads(requests[1].content) == {"projectionSequence": 1, "state": "planning"}
    assert requests[2].headers["idempotency-key"] == reservation.invocation_key
    assert json.loads(requests[2].content)["inputDigest"] == "a" * 64
    assert json.loads(requests[3].content) == {
        "expectedVersion": 1,
        "outcomeCode": "FAKE_ANALYSIS_COMPLETED",
        "safeResult": {"status": "usable"},
    }
    assert json.loads(requests[4].content) == {
        "expectedVersion": 1, "outcomeCode": "RETRY_EXHAUSTED"
    }


@pytest.mark.parametrize("status,retryable", [(503, True), (400, False)])
def test_classifies_and_redacts_http_failures(status: int, retryable: bool) -> None:
    client = _client(lambda _request: httpx.Response(status, text="sensitive-body"))
    with pytest.raises(AgenticControlError) as captured:
        asyncio.run(client.load_plan("run-1"))
    assert captured.value.retryable is retryable
    assert "sensitive-body" not in str(captured.value)


def test_rejects_oversized_response() -> None:
    client = _client(lambda _request: httpx.Response(200, text="x" * 2_000), 1_024)
    with pytest.raises(AgenticControlError):
        asyncio.run(client.load_plan("run-1"))


def test_classifies_timeout_as_retryable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("sensitive timeout", request=request)

    with pytest.raises(AgenticControlError) as captured:
        asyncio.run(_client(handler).load_plan("run-1"))
    assert captured.value.retryable is True
    assert "sensitive timeout" not in str(captured.value)


def _client(handler: object, maximum_response_bytes: int = 16_384) -> AgenticControlClient:
    return AgenticControlClient(
        base_url="https://api.test/v1/internal/agentic",
        tokens=Tokens(),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),  # type: ignore[arg-type]
        timeout_seconds=1,
        maximum_response_bytes=maximum_response_bytes,
    )
