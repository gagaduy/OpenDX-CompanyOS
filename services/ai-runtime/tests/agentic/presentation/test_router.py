# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from fastapi.testclient import TestClient

from app.agentic.application.workflow_control import (
    StartWorkflowResult,
    TemporalDescription,
    WorkflowControlError,
)
from app.agentic.domain.contracts import WorkloadPrincipal
from app.agentic.presentation.router import create_agentic_router
from app.create_app import create_app


class AuthenticatorFake:
    def authenticate(self, authorization: str | None) -> WorkloadPrincipal:
        if authorization != "Bearer control-token":
            raise ValueError("sensitive token")
        return WorkloadPrincipal("service-account-control", "opendx-agentic-control")


class ControlFake:
    def __init__(self) -> None:
        self.starts: list[object] = []
        self.approvals: list[object] = []
        self.cancellations: list[object] = []
        self.error: WorkflowControlError | None = None

    async def start(self, command: object) -> StartWorkflowResult:
        if self.error is not None:
            raise self.error
        self.starts.append(command)
        return StartWorkflowResult("temporal-run-1", False)

    async def describe(
        self, _workflow_id: str, _correlation_id: str
    ) -> TemporalDescription:
        if self.error is not None:
            raise self.error
        return TemporalDescription("running", "temporal-run-1")

    async def signal_approval(self, command: object) -> None:
        if self.error is not None:
            raise self.error
        self.approvals.append(command)

    async def signal_cancellation(self, command: object) -> None:
        if self.error is not None:
            raise self.error
        self.cancellations.append(command)

    async def probe(self) -> None:
        if self.error is not None:
            raise self.error


def test_exposes_the_four_authenticated_strict_routes() -> None:
    control = ControlFake()
    client = _client(control)
    headers = {
        "authorization": "Bearer control-token",
        "x-correlation-id": "correlation-1",
    }

    start = client.post("/internal/agentic/workflow-runs/start", headers=headers, json={
        "workflowRunId": "run-1",
        "temporalWorkflowId": "store-health-v1:run-1",
        "taskId": "task-1",
        "workflowVersion": 1,
        "planRevision": 2,
    })
    describe = client.get(
        "/internal/agentic/workflow-runs/store-health-v1%3Arun-1", headers=headers
    )
    approval = client.post(
        "/internal/agentic/workflow-runs/store-health-v1%3Arun-1/signals/approval",
        headers={**headers, "idempotency-key": "receipt-1"},
        json={
            "idempotencyKey": "receipt-1",
            "approvalId": "approval-1",
            "payloadDigest": "a" * 64,
            "decision": "approved",
            "applicationDecisionVersion": 2,
        },
    )
    cancellation = client.post(
        "/internal/agentic/workflow-runs/store-health-v1%3Arun-1/signals/cancellation",
        headers={**headers, "idempotency-key": "receipt-2"},
        json={
            "idempotencyKey": "receipt-2",
            "payloadDigest": "b" * 64,
            "reasonCode": "CANCELED_BY_OPERATOR",
        },
    )

    assert start.status_code == 200
    assert start.json() == {"temporalRunId": "temporal-run-1", "duplicate": False}
    assert describe.json() == {"status": "running", "temporalRunId": "temporal-run-1"}
    assert approval.status_code == 204
    assert cancellation.status_code == 204
    assert len(control.starts) == len(control.approvals) == len(control.cancellations) == 1


def test_rejects_auth_extra_fields_and_receipt_mismatch_without_echoing_input() -> None:
    control = ControlFake()
    client = _client(control)
    sensitive = "customer-payment-sensitive"
    body = {
        "workflowRunId": "run-1",
        "temporalWorkflowId": "store-health-v1:run-1",
        "taskId": "task-1",
        "workflowVersion": 1,
        "planRevision": 2,
        "unexpected": sensitive,
    }

    missing_auth = client.post("/internal/agentic/workflow-runs/start", json=body)
    invalid = client.post(
        "/internal/agentic/workflow-runs/start",
        headers={"authorization": "Bearer control-token"},
        json=body,
    )
    mismatch = client.post(
        "/internal/agentic/workflow-runs/store-health-v1%3Arun-1/signals/cancellation",
        headers={
            "authorization": "Bearer control-token",
            "x-correlation-id": "correlation-1",
            "idempotency-key": "receipt-header",
        },
        json={
            "idempotencyKey": "receipt-body",
            "payloadDigest": "b" * 64,
            "reasonCode": "CANCELED_BY_OPERATOR",
        },
    )

    assert missing_auth.status_code == 401
    assert invalid.status_code == 422
    assert sensitive not in invalid.text
    assert mismatch.status_code == 409
    assert control.starts == []


def test_maps_only_bounded_application_errors() -> None:
    control = ControlFake()
    control.error = WorkflowControlError("TEMPORAL_UNAVAILABLE", retryable=True)
    response = _client(control).get(
        "/internal/agentic/workflow-runs/store-health-v1%3Arun-1",
        headers={
            "authorization": "Bearer control-token",
            "x-correlation-id": "correlation-1",
        },
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "TEMPORAL_UNAVAILABLE"}


def _client(control: ControlFake) -> TestClient:
    router = create_agentic_router(control, AuthenticatorFake())
    return TestClient(create_app(agentic_router=router))
