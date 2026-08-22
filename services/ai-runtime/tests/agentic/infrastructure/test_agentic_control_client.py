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
from app.agentic.application.ports import (
    CompleteModelRunRequest,
    FailModelRunRequest,
    ReserveModelRunRequest,
    StartModelRunRequest,
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
                    "approval": {
                        "id": "approval-1", "payloadDigest": "b" * 64,
                        "expiresAt": "2026-08-15T00:00:00.000Z", "policyVersion": 4,
                        "applicationDecisionVersion": 2,
                    },
                    "partialCompletionAllowed": False,
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
    assert plan.approval is not None
    assert plan.approval.policy_version == 4
    assert plan.approval.application_decision_version == 2
    assert plan.partial_completion_allowed is False
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


def test_maps_digest_only_model_run_control_requests() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        data: dict[str, object] = {"runId": "00000000-0000-4000-8000-000000000001", "version": 1, "status": "running"}
        if request.url.path.endswith("/reserve"):
            data.update({"primaryModel": "google/gemma-4-26b-a4b-it:free", "fallbackModel": "liquid/lfm-2.5-2.6b:free", "maxInputTokens": 1000, "maxOutputTokens": 500, "timeoutMs": 1000, "schemaVersion": 1, "inputCostMicrosPerMillion": 0, "outputCostMicrosPerMillion": 0, "maxReservedCostMicros": 0})
        return httpx.Response(200, json={"success": True, "data": data})

    client = _client(handler)
    run_id = "00000000-0000-4000-8000-000000000001"
    reservation = asyncio.run(client.reserve_model_run(ReserveModelRunRequest(
        task_id="00000000-0000-4000-8000-000000000002", agent_kind="catalog",
        generation_round=0, idempotency_key="model:catalog:0", input_digest="a" * 64,
        primary_model="google/gemma-4-26b-a4b-it:free", fallback_model="liquid/lfm-2.5-2.6b:free",
    )))
    asyncio.run(client.start_model_run(StartModelRunRequest(run_id, 1, reservation.primary_model, 0)))
    asyncio.run(client.complete_model_run(CompleteModelRunRequest(
        run_id, 2, "model:catalog:complete", "completed", "b" * 64, 10, 20,
        "c" * 64, 12, "MODEL_COMPLETED", "accepted", (), (run_id,), "d" * 64,
    )))
    asyncio.run(client.fail_model_run(FailModelRunRequest(
        run_id, 2, "model:catalog:fail", None, 0, 0, None, 12,
        "MODEL_FAILED", "OPENROUTER_SCHEMA_INVALID", "correct", (), (run_id,), "e" * 64,
    )))

    assert [request.url.path for request in requests] == [
        "/v1/internal/agentic/model-runs/reserve",
        f"/v1/internal/agentic/model-runs/{run_id}/start",
        f"/v1/internal/agentic/model-runs/{run_id}/complete",
        f"/v1/internal/agentic/model-runs/{run_id}/fail",
    ]
    assert all(b"content" not in request.content for request in requests)


def test_maps_descriptor_control_and_digest_only_settlement_requests() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"success": True, "data": {"kind": "private"}})
        return httpx.Response(202, json={"success": True, "data": {"digest": "a" * 64}})

    client = _client(handler)
    identity = "00000000-0000-4000-8000-000000000001"
    assert asyncio.run(client.load_task_brief(identity)) == {"kind": "private"}
    assert asyncio.run(client.load_dispatch_plan(identity)) == {"kind": "private"}
    assert asyncio.run(client.load_execution_descriptor(identity, "b" * 64)) == {"kind": "private"}
    for operation in (
        client.accept_orchestration_result,
        client.mediate_collaboration,
        client.accept_executive_report,
    ):
        assert asyncio.run(operation({"resultDigest": "a" * 64})) == "a" * 64

    assert [request.url.path for request in requests] == [
        f"/v1/internal/agentic/orchestration/task-briefs/{identity}",
        f"/v1/internal/agentic/orchestration/dispatch-plans/{identity}",
        f"/v1/internal/agentic/orchestration/descriptors/{identity}",
        "/v1/internal/agentic/orchestration/results",
        "/v1/internal/agentic/orchestration/collaborations",
        "/v1/internal/agentic/orchestration/reports",
    ]
    assert requests[2].headers["x-opendx-descriptor-digest"] == "b" * 64
    assert all(request.headers["authorization"] == "Bearer worker-token" for request in requests)


@pytest.mark.parametrize("status,retryable", [(503, True), (400, False)])
def test_classifies_and_redacts_http_failures(status: int, retryable: bool) -> None:
    client = _client(lambda _request: httpx.Response(status, text="sensitive-body"))
    with pytest.raises(AgenticControlError) as captured:
        asyncio.run(client.load_plan("run-1"))
    assert captured.value.retryable is retryable
    assert "sensitive-body" not in str(captured.value)


def test_preserves_only_the_authoritative_invalid_plan_error_code() -> None:
    client = _client(lambda _request: httpx.Response(422, json={
        "success": False,
        "message": "sensitive plan detail",
        "errorCode": "INVALID_FROZEN_PLAN",
        "errors": [],
    }))

    with pytest.raises(AgenticControlError) as captured:
        asyncio.run(client.load_plan("run-1"))

    assert captured.value.code == "INVALID_FROZEN_PLAN"
    assert captured.value.retryable is False
    assert "sensitive plan detail" not in str(captured.value)


@pytest.mark.parametrize(
    "code", ["DESCRIPTOR_BINDING_INVALID", "DESCRIPTOR_EXPIRED", "DESCRIPTOR_REVOKED"]
)
def test_preserves_safe_authoritative_descriptor_rejections(code: str) -> None:
    client = _client(lambda _request: httpx.Response(409, json={
        "success": False, "errorCode": code, "message": "private descriptor detail",
    }))

    with pytest.raises(AgenticControlError) as captured:
        asyncio.run(client.load_execution_descriptor(
            "00000000-0000-4000-8000-000000000001", "a" * 64
        ))

    assert captured.value.code == code
    assert captured.value.retryable is False
    assert "private descriptor detail" not in str(captured.value)


def test_rejects_oversized_response() -> None:
    client = _client(lambda _request: httpx.Response(200, text="x" * 2_000), 1_024)
    with pytest.raises(AgenticControlError):
        asyncio.run(client.load_plan("run-1"))


def test_rejects_malformed_model_run_receipts() -> None:
    client = _client(lambda _request: httpx.Response(200, json={
        "success": True,
        "data": {
            "runId": "not-a-uuid", "primaryModel": "model", "fallbackModel": "fallback",
            "maxInputTokens": -1, "maxOutputTokens": 500, "timeoutMs": 1,
            "schemaVersion": 2, "inputCostMicrosPerMillion": 0,
            "outputCostMicrosPerMillion": 0, "maxReservedCostMicros": 0, "version": 1,
        },
    }))

    with pytest.raises(AgenticControlError) as captured:
        asyncio.run(client.reserve_model_run(ReserveModelRunRequest(
            task_id="00000000-0000-4000-8000-000000000002", agent_kind="catalog",
            generation_round=0, idempotency_key="model:catalog:0", input_digest="a" * 64,
            primary_model="google/gemma-4-26b-a4b-it:free", fallback_model="liquid/lfm-2.5-2.6b:free",
        )))

    assert captured.value.code == "AGENTIC_RESPONSE_INVALID"


def test_classifies_timeout_as_retryable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("sensitive timeout", request=request)

    with pytest.raises(AgenticControlError) as captured:
        asyncio.run(_client(handler).load_plan("run-1"))
    assert captured.value.retryable is True
    assert "sensitive timeout" not in str(captured.value)


@pytest.mark.parametrize(
    "missing",
    ["partialCompletionAllowed", "applicationDecisionVersion"],
)
def test_rejects_missing_authoritative_plan_decisions(missing: str) -> None:
    data = {
        "taskId": "task-1",
        "workflowRunId": "run-1",
        "workflowVersion": 1,
        "planRevision": 2,
        "configurationRevisionId": "revision-1",
        "subtasks": [{"id": "branch-1", "agentKind": "catalog", "version": 1}],
        "dependencies": [],
        "partialCompletionAllowed": True,
        "approval": {
            "id": "approval-1",
            "payloadDigest": "a" * 64,
            "expiresAt": "2099-08-14T00:00:00.000Z",
            "policyVersion": 4,
            "applicationDecisionVersion": 2,
        },
    }
    if missing == "applicationDecisionVersion":
        data["approval"].pop(missing)
    else:
        data.pop(missing)
    client = _client(lambda _request: httpx.Response(
        200, json={"success": True, "data": data}
    ))

    with pytest.raises(AgenticControlError) as captured:
        asyncio.run(client.load_plan("run-1"))
    assert captured.value.retryable is False


def _client(handler: object, maximum_response_bytes: int = 16_384) -> AgenticControlClient:
    return AgenticControlClient(
        base_url="https://api.test/v1/internal/agentic",
        tokens=Tokens(),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),  # type: ignore[arg-type]
        timeout_seconds=1,
        maximum_response_bytes=maximum_response_bytes,
    )
