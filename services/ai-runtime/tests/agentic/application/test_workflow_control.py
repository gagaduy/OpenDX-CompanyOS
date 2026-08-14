# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from temporalio.api.enums.v1 import WorkflowExecutionStatus
from temporalio.common import WorkflowIDConflictPolicy, WorkflowIDReusePolicy

from app.agentic.application.workflow_control import (
    ApprovalCommand,
    CancellationCommand,
    StartWorkflowCommand,
    StartWorkflowResult,
    TemporalAlreadyStarted,
    TemporalControlFailure,
    TemporalDescription,
    WorkflowControl,
    WorkflowControlError,
)
from app.agentic.domain.contracts import ApprovalDecision, StoreHealthReviewInput
from app.agentic.infrastructure.temporal_client import (
    DeferredTemporalClient,
    TemporalClientAdapter,
    connect_temporal,
)
from app.agentic.observability import StructuredEventLogger
from app.shared.config import TemporalSettings, TemporalTlsSettings


class TemporalFake:
    def __init__(self) -> None:
        self.started: list[tuple[str, object]] = []
        self.signals: list[tuple[str, str, object]] = []
        self.descriptions: dict[str, TemporalDescription] = {}
        self.start_error: Exception | None = None

    async def start(self, workflow_id: str, value: object) -> str:
        self.started.append((workflow_id, value))
        if self.start_error is not None:
            raise self.start_error
        return "temporal-run-1"

    async def describe(self, workflow_id: str) -> TemporalDescription:
        return self.descriptions[workflow_id]

    async def signal(self, workflow_id: str, name: str, value: object) -> None:
        self.signals.append((workflow_id, name, value))

    async def probe(self) -> None:
        return None


def test_starts_with_stable_id_and_converges_when_already_started() -> None:
    temporal = TemporalFake()
    control = WorkflowControl(
        temporal, activity_start_to_close_seconds=30,
        activity_schedule_to_close_seconds=180,
    )
    command = StartWorkflowCommand(
        workflow_run_id="run-1",
        temporal_workflow_id="store-health-v1:run-1",
        task_id="task-1",
        workflow_version=1,
        plan_revision=2,
        correlation_id="correlation-1",
    )

    first = asyncio.run(control.start(command))
    temporal.start_error = TemporalAlreadyStarted("temporal-run-1")
    temporal.descriptions[command.temporal_workflow_id] = TemporalDescription(
        "running", "temporal-run-1"
    )
    duplicate = asyncio.run(control.start(command))

    assert first.temporal_run_id == "temporal-run-1"
    assert first.duplicate is False
    assert duplicate.temporal_run_id == "temporal-run-1"
    assert duplicate.duplicate is True
    workflow_id, value = temporal.started[0]
    assert workflow_id == "store-health-v1:run-1"
    assert vars(value) == {
        "task_id": "task-1",
        "workflow_version": 1,
        "plan_revision": 2,
        "activity_start_to_close_seconds": 30,
        "activity_schedule_to_close_seconds": 180,
    }


def test_rejects_a_noncanonical_workflow_id_before_temporal_io() -> None:
    temporal = TemporalFake()
    control = WorkflowControl(temporal, 30, 180)

    with pytest.raises(WorkflowControlError) as captured:
        asyncio.run(control.start(StartWorkflowCommand(
            workflow_run_id="run-1",
            temporal_workflow_id="attacker-controlled",
            task_id="task-1",
            workflow_version=1,
            plan_revision=2,
            correlation_id="correlation-1",
        )))

    assert captured.value.code == "WORKFLOW_ID_INVALID"
    assert temporal.started == []
    with pytest.raises(WorkflowControlError):
        asyncio.run(control.describe("other-workflow:run-1", "correlation-1"))
    with pytest.raises(WorkflowControlError):
        asyncio.run(control.signal_cancellation(CancellationCommand(
            temporal_workflow_id="other-workflow:run-1",
            idempotency_key="receipt-1",
            payload_digest="b" * 64,
            reason_code="CANCELED_BY_OPERATOR",
            correlation_id="correlation-1",
        )))
    assert temporal.signals == []


def test_maps_describe_and_exact_signal_receipts() -> None:
    temporal = TemporalFake()
    workflow_id = "store-health-v1:run-1"
    temporal.descriptions[workflow_id] = TemporalDescription(
        "completed", "temporal-run-1"
    )
    control = WorkflowControl(temporal, 30, 180)

    description = asyncio.run(control.describe(workflow_id, "correlation-1"))
    asyncio.run(control.signal_approval(ApprovalCommand(
        temporal_workflow_id=workflow_id,
        idempotency_key="receipt-1",
        approval_id="approval-1",
        payload_digest="a" * 64,
        decision=ApprovalDecision.APPROVED,
        application_decision_version=2,
        correlation_id="correlation-1",
    )))
    asyncio.run(control.signal_cancellation(CancellationCommand(
        temporal_workflow_id=workflow_id,
        idempotency_key="receipt-2",
        payload_digest="b" * 64,
        reason_code="CANCELED_BY_OPERATOR",
        correlation_id="correlation-2",
    )))

    assert description == TemporalDescription("completed", "temporal-run-1")
    assert [item[:2] for item in temporal.signals] == [
        (workflow_id, "approve"),
        (workflow_id, "cancel"),
    ]
    assert temporal.signals[0][2].idempotency_key == "receipt-1"  # type: ignore[attr-defined]
    assert temporal.signals[1][2].idempotency_key == "receipt-2"  # type: ignore[attr-defined]


def test_classifies_temporal_unavailability_without_leaking_provider_detail() -> None:
    class UnavailableTemporal(TemporalFake):
        async def start(self, _workflow_id: str, _value: object) -> str:
            raise TemporalControlFailure(
                "TEMPORAL_UNAVAILABLE", retryable=True,
                detail="certificate token sensitive payload",
            )

    control = WorkflowControl(UnavailableTemporal(), 30, 180)
    with pytest.raises(WorkflowControlError) as captured:
        asyncio.run(control.start(StartWorkflowCommand(
            workflow_run_id="run-1",
            temporal_workflow_id="store-health-v1:run-1",
            task_id="task-1",
            workflow_version=1,
            plan_revision=2,
            correlation_id="correlation-1",
        )))

    assert captured.value.code == "TEMPORAL_UNAVAILABLE"
    assert captured.value.retryable is True
    assert "certificate" not in str(captured.value)


def test_temporal_adapter_uses_fixed_execution_policy_and_readiness_rpcs() -> None:
    class Handle:
        result_run_id = "temporal-run-1"
        run_id = "temporal-run-1"

        async def describe(self) -> object:
            return SimpleNamespace(raw_description=SimpleNamespace(
                workflow_execution_info=SimpleNamespace(
                    status=WorkflowExecutionStatus.WORKFLOW_EXECUTION_STATUS_COMPLETED,
                    execution=SimpleNamespace(run_id="temporal-run-1"),
                )
            ))

        async def signal(self, name: str, value: object) -> None:
            signals.append((name, value))

    class WorkflowService:
        async def describe_namespace(
            self, request: object, **_options: object
        ) -> None:
            probes.append(("namespace", request))

        async def describe_task_queue(
            self, request: object, **_options: object
        ) -> None:
            probes.append(("task_queue", request))

    class ServiceClient:
        async def check_health(self, **_options: object) -> None:
            probes.append(("health", None))

    class RawClient:
        namespace = "opendx"
        workflow_service = WorkflowService()
        service_client = ServiceClient()

        async def start_workflow(self, *_args: object, **kwargs: object) -> Handle:
            starts.append(kwargs)
            return Handle()

        def get_workflow_handle(self, _workflow_id: str) -> Handle:
            return Handle()

    starts: list[dict[str, object]] = []
    signals: list[tuple[str, object]] = []
    probes: list[tuple[str, object]] = []
    adapter = TemporalClientAdapter(RawClient(), "store-health-v1")  # type: ignore[arg-type]
    value = StoreHealthReviewInput("task-1", 1, 2)

    assert asyncio.run(adapter.start("store-health-v1:run-1", value)) == "temporal-run-1"
    assert asyncio.run(adapter.describe("store-health-v1:run-1")) == TemporalDescription(
        "completed", "temporal-run-1"
    )
    asyncio.run(adapter.signal("store-health-v1:run-1", "approve", object()))
    asyncio.run(adapter.probe())

    assert starts[0]["task_queue"] == "store-health-v1"
    assert starts[0]["id_reuse_policy"] is WorkflowIDReusePolicy.REJECT_DUPLICATE
    assert starts[0]["id_conflict_policy"] is WorkflowIDConflictPolicy.FAIL
    assert signals[0][0] == "approve"
    assert [name for name, _ in probes] == ["health", "namespace", "task_queue"]


def test_temporal_connection_loads_mounted_tls_material(tmp_path: Path) -> None:
    ca = tmp_path / "ca.pem"
    certificate = tmp_path / "client.pem"
    key = tmp_path / "client.key"
    ca.write_bytes(b"ca")
    certificate.write_bytes(b"certificate")
    key.write_bytes(b"private-key")
    captured: dict[str, object] = {}
    raw_client = object()

    async def connect(address: str, **options: object) -> object:
        captured.update({"address": address, **options})
        return raw_client

    settings = TemporalSettings(
        address="temporal:7233",
        namespace="opendx",
        task_queue="store-health-v1",
        tls=TemporalTlsSettings(
            str(ca), str(certificate), str(key), "temporal.internal"
        ),
    )
    adapter = asyncio.run(connect_temporal(settings, connect=connect))  # type: ignore[arg-type]

    assert adapter.raw_client is raw_client
    tls = captured["tls"]
    assert tls.server_root_ca_cert == b"ca"  # type: ignore[attr-defined]
    assert tls.client_cert == b"certificate"  # type: ignore[attr-defined]
    assert tls.client_private_key == b"private-key"  # type: ignore[attr-defined]
    assert tls.domain == "temporal.internal"  # type: ignore[attr-defined]
    assert captured["namespace"] == "opendx"


def test_temporal_adapter_confirms_its_worker_poller_and_releases_client() -> None:
    requests: list[object] = []

    class WorkflowService:
        async def describe_task_queue(
            self, request: object, **_options: object
        ) -> object:
            requests.append(request)
            return SimpleNamespace(pollers=[
                SimpleNamespace(identity="other-worker"),
                SimpleNamespace(identity="opendx-ai-worker"),
            ])

    raw_client = SimpleNamespace(
        namespace="opendx",
        workflow_service=WorkflowService(),
    )
    adapter = TemporalClientAdapter(  # type: ignore[arg-type]
        raw_client, "store-health-v1", "opendx-ai-worker"
    )

    asyncio.run(adapter.wait_until_polling(timeout_seconds=1))
    assert requests[0].report_pollers is True  # type: ignore[attr-defined]
    asyncio.run(adapter.aclose())

    with pytest.raises(TemporalControlFailure) as captured:
        _ = adapter.raw_client
    assert captured.value.code == "TEMPORAL_CLIENT_CLOSED"


def test_deferred_temporal_connection_releases_the_adapter_on_shutdown() -> None:
    class Adapter:
        def __init__(self) -> None:
            self.probes = 0
            self.closed = False

        async def probe(self) -> None:
            self.probes += 1

        async def aclose(self) -> None:
            self.closed = True

    adapter = Adapter()
    connections = 0

    async def connect(_settings: TemporalSettings) -> object:
        nonlocal connections
        connections += 1
        return adapter

    deferred = DeferredTemporalClient(
        TemporalSettings("temporal:7233", "opendx", "store-health-v1", None),
        connect=connect,  # type: ignore[arg-type]
    )

    asyncio.run(deferred.probe())
    asyncio.run(deferred.aclose())

    assert connections == 1
    assert adapter.probes == 1
    assert adapter.closed is True


def test_observability_failure_never_changes_a_temporal_acknowledgement() -> None:
    class BrokenMetrics:
        def increment(self, _name: str, _labels: object) -> None:
            raise RuntimeError("metrics unavailable")

    temporal = TemporalFake()
    control = WorkflowControl(temporal, 30, 180, metrics=BrokenMetrics())
    result = asyncio.run(control.start(StartWorkflowCommand(
        workflow_run_id="run-1",
        temporal_workflow_id="store-health-v1:run-1",
        task_id="task-1",
        workflow_version=1,
        plan_revision=2,
        correlation_id="correlation-1",
    )))

    assert result == StartWorkflowResult("temporal-run-1", False)


def test_control_logs_hashed_trace_context_and_successful_signals() -> None:
    lines: list[str] = []
    temporal = TemporalFake()
    control = WorkflowControl(
        temporal,
        30,
        180,
        logger=StructuredEventLogger(lines.append),
    )

    asyncio.run(control.start(StartWorkflowCommand(
        workflow_run_id="run-1",
        temporal_workflow_id="store-health-v1:run-1",
        task_id="task-1",
        workflow_version=1,
        plan_revision=2,
        correlation_id="correlation-1",
    )))
    asyncio.run(control.signal_approval(ApprovalCommand(
        temporal_workflow_id="store-health-v1:run-1",
        idempotency_key="receipt-1",
        approval_id="approval-1",
        payload_digest="a" * 64,
        decision=ApprovalDecision.APPROVED,
        application_decision_version=2,
        correlation_id="correlation-2",
    )))

    started, signaled = [json.loads(line) for line in lines]
    assert set(started) >= {
        "workflowIdHash", "taskIdHash", "correlationIdHash", "causationIdHash"
    }
    assert signaled["event"] == "workflow_signaled"
    assert set(signaled) >= {
        "workflowIdHash", "correlationIdHash", "causationIdHash", "signal"
    }
    assert all("run-1" not in line and "task-1" not in line for line in lines)
