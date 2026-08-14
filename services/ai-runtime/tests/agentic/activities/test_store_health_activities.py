# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest
from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.agentic.application.ports import AgenticControlFailure
from app.agentic.activities.store_health_activities import StoreHealthActivities
from app.agentic.domain.contracts import (
    ActivityOutcome,
    ActivityReservationRequest,
    FrozenWorkflowPlan,
    PlanNode,
    StateProjection,
    WorkflowState,
)
from app.agentic.observability import StructuredEventLogger
from app.agentic.observability import BoundedMetrics
from app.agentic.workflows.store_health_review_v1 import (
    ActivityExecutionInput,
    StateProjectionInput,
)


class Control:
    def __init__(
        self,
        reservation: dict[str, Any] | None = None,
        failure: AgenticControlFailure | None = None,
        completion_failure: AgenticControlFailure | None = None,
    ) -> None:
        self.reservation = reservation or {"status": "reserved", "invocation": {"version": 1}}
        self.reservations: list[ActivityReservationRequest] = []
        self.completed: list[tuple[str, ActivityOutcome]] = []
        self.failed: list[tuple[str, ActivityOutcome]] = []
        self.projections: list[tuple[str, StateProjection]] = []
        self.failure = failure
        self.completion_failure = completion_failure

    async def load_plan(self, _run_id: str) -> FrozenWorkflowPlan:
        return FrozenWorkflowPlan(
            task_id="task-1", workflow_run_id="run-1", workflow_version=1,
            plan_revision=2, configuration_revision_id="revision-1",
            subtasks=(PlanNode("catalog", "catalog", 1),), dependencies=(),
        )

    async def project_state(self, run_id: str, projection: StateProjection) -> object:
        self.projections.append((run_id, projection))
        return {}

    async def reserve_activity(self, reservation: ActivityReservationRequest) -> object:
        if self.failure is not None:
            raise self.failure
        self.reservations.append(reservation)
        return self.reservation

    async def complete_activity(self, key: str, outcome: ActivityOutcome) -> object:
        if self.completion_failure is not None:
            raise self.completion_failure
        self.completed.append((key, outcome))
        return {}

    async def fail_activity(self, key: str, outcome: ActivityOutcome) -> object:
        self.failed.append((key, outcome))
        return {}


def test_reserves_stable_key_and_persists_a_bounded_fake_result() -> None:
    control = Control()
    activities = StoreHealthActivities(control)
    value = ActivityExecutionInput("run-1", 1, branch_id="catalog")

    first = asyncio.run(activities.execute_fake_analysis(value))
    second_control = Control({
        "status": "duplicate",
        "invocation": {"state": "completed", "safeResult": first},
    })
    recovered = asyncio.run(StoreHealthActivities(second_control).execute_fake_analysis(value))

    assert recovered == first == {
        "status": "usable",
        "activityKind": "execute_fake_analysis",
        "branchId": "catalog",
    }
    reservation = control.reservations[0]
    assert reservation.invocation_key == (
        f"run-1:1:execute_fake_analysis:catalog:{reservation.input_digest}"
    )
    assert len(reservation.input_digest) == 64
    assert control.completed[0][0] == reservation.invocation_key
    assert second_control.completed == []


def test_replays_stored_failure_without_performing_the_fake_operation() -> None:
    control = Control({
        "status": "duplicate",
        "invocation": {"state": "failed", "outcomeCode": "POLICY_DENIED"},
    })
    with pytest.raises(ApplicationError) as captured:
        asyncio.run(StoreHealthActivities(control).execute_fake_synthesis(
            ActivityExecutionInput("run-1", 1, source_branches=("catalog",))
        ))
    assert captured.value.type == "POLICY_DENIED"
    assert control.completed == []


def test_projects_the_exact_authoritative_sequence() -> None:
    control = Control()
    asyncio.run(StoreHealthActivities(control).project_state(
        StateProjectionInput("run-1", 4, WorkflowState.QUALITY_REVIEW)
    ))
    assert control.projections == [(
        "run-1", StateProjection(4, WorkflowState.QUALITY_REVIEW)
    )]


@pytest.mark.parametrize("retryable", [False, True])
def test_maps_control_failure_retryability_to_temporal(retryable: bool) -> None:
    control = Control(failure=AgenticControlFailure(
        "AGENTIC_CONTROL_REJECTED", retryable=retryable
    ))
    with pytest.raises(ApplicationError) as captured:
        asyncio.run(StoreHealthActivities(control).execute_fake_analysis(
            ActivityExecutionInput("run-1", 1, branch_id="catalog")
        ))
    assert captured.value.type == "AGENTIC_CONTROL_REJECTED"
    assert captured.value.non_retryable is not retryable


def test_terminalizes_a_reserved_invocation_when_completion_fails() -> None:
    control = Control(completion_failure=AgenticControlFailure(
        "BUSINESS_REJECTED", retryable=False
    ))

    with pytest.raises(ApplicationError):
        asyncio.run(StoreHealthActivities(control).execute_fake_analysis(
            ActivityExecutionInput("run-1", 1, branch_id="catalog")
        ))

    assert control.failed[0][0] == control.reservations[0].invocation_key
    assert control.failed[0][1].outcome_code == "BUSINESS_REJECTED"


def test_terminalizes_only_the_final_retryable_completion_failure() -> None:
    early = Control(completion_failure=AgenticControlFailure(
        "AGENTIC_CONTROL_TRANSPORT_FAILED", retryable=True
    ))
    final = Control(completion_failure=AgenticControlFailure(
        "AGENTIC_CONTROL_TRANSPORT_FAILED", retryable=True
    ))

    with pytest.raises(ApplicationError):
        asyncio.run(StoreHealthActivities(early).execute_fake_analysis(
            ActivityExecutionInput("run-1", 1, branch_id="catalog")
        ))
    with pytest.raises(ApplicationError):
        asyncio.run(StoreHealthActivities(final).execute_fake_analysis(
            ActivityExecutionInput(
                "run-1", 1, branch_id="catalog", execution_attempt=3
            )
        ))

    assert early.failed == []
    assert final.failed[0][1].outcome_code == "AGENTIC_CONTROL_TRANSPORT_FAILED"


def test_retry_exhaustion_metrics_failure_does_not_mask_control_failure() -> None:
    class BrokenMetrics:
        def increment(self, _name: str, _labels: object) -> None:
            raise RuntimeError("metrics unavailable")

        def observe(self, _name: str, _value: float, _labels: object) -> None:
            raise RuntimeError("metrics unavailable")

    control = Control(completion_failure=AgenticControlFailure(
        "AGENTIC_CONTROL_TRANSPORT_FAILED", retryable=True
    ))

    with pytest.raises(ApplicationError) as captured:
        asyncio.run(StoreHealthActivities(
            control, metrics=BrokenMetrics()
        ).execute_fake_analysis(ActivityExecutionInput(
            "run-1", 1, branch_id="catalog", execution_attempt=3
        )))

    assert captured.value.type == "AGENTIC_CONTROL_TRANSPORT_FAILED"


def test_activity_failure_log_contains_hashed_trace_and_safe_error_code() -> None:
    lines: list[str] = []
    control = Control(completion_failure=AgenticControlFailure(
        "BUSINESS_REJECTED", retryable=False
    ))

    with pytest.raises(ApplicationError):
        asyncio.run(StoreHealthActivities(
            control,
            logger=StructuredEventLogger(lines.append),
        ).execute_fake_analysis(ActivityExecutionInput(
            "run-1", 1, branch_id="catalog"
        )))

    event = json.loads(lines[0])
    assert event["event"] == "activity_finished"
    assert event["errorCode"] == "BUSINESS_REJECTED"
    assert set(event) >= {"workflowIdHash", "correlationIdHash", "causationIdHash"}
    assert "run-1" not in lines[0]


def test_plan_and_projection_activities_emit_duration_and_outcome_metrics() -> None:
    metrics = BoundedMetrics()
    activities = StoreHealthActivities(Control(), metrics=metrics)

    asyncio.run(activities.load_frozen_plan("run-1"))
    asyncio.run(activities.project_state(StateProjectionInput(
        "run-1", 1, WorkflowState.PLANNING
    )))

    observations = metrics.snapshot()["activity_duration_seconds"]
    assert {item["labels"]["activity"] for item in observations} >= {
        "load_frozen_plan", "project_state"
    }
    assert all(item["labels"]["outcome"] == "completed" for item in observations)


def test_control_activity_logs_temporal_attempt_and_cancellation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class BlockingControl(Control):
        def __init__(self) -> None:
            super().__init__()
            self.started = asyncio.Event()

        async def load_plan(self, _run_id: str) -> FrozenWorkflowPlan:
            self.started.set()
            await asyncio.Future()

    lines: list[str] = []
    control = BlockingControl()
    monkeypatch.setattr(activity, "in_activity", lambda: True)
    monkeypatch.setattr(activity, "info", lambda: type("Info", (), {"attempt": 3})())
    monkeypatch.setattr(activity, "heartbeat", lambda: None)

    async def scenario() -> None:
        execution = asyncio.create_task(StoreHealthActivities(
            control,
            logger=StructuredEventLogger(lines.append),
        ).load_frozen_plan("run-1"))
        await control.started.wait()
        execution.cancel()
        with pytest.raises(asyncio.CancelledError):
            await execution

    asyncio.run(scenario())

    event = json.loads(lines[0])
    assert event["attempt"] == 3
    assert event["outcome"] == "canceled"
    assert event["errorCode"] == "ACTIVITY_CANCELED"


def test_terminalizes_a_reserved_invocation_before_acknowledging_cancellation() -> None:
    class BlockingControl(Control):
        def __init__(self) -> None:
            super().__init__()
            self.completion_started = asyncio.Event()

        async def complete_activity(
            self, key: str, outcome: ActivityOutcome
        ) -> object:
            self.completion_started.set()
            await asyncio.Future()

    async def scenario() -> BlockingControl:
        control = BlockingControl()
        execution = asyncio.create_task(
            StoreHealthActivities(control).execute_fake_analysis(
                ActivityExecutionInput("run-1", 1, branch_id="catalog")
            )
        )
        await control.completion_started.wait()
        execution.cancel()
        with pytest.raises(asyncio.CancelledError):
            await execution
        return control

    control = asyncio.run(scenario())
    assert control.failed[0][0] == control.reservations[0].invocation_key
    assert control.failed[0][1].outcome_code == "ACTIVITY_CANCELED"


def test_terminalizes_an_acknowledged_lost_reservation_during_cancellation() -> None:
    class BlockingReserveControl(Control):
        def __init__(self) -> None:
            super().__init__()
            self.reservation_committed = asyncio.Event()

        async def reserve_activity(
            self, reservation: ActivityReservationRequest
        ) -> object:
            self.reservations.append(reservation)
            self.reservation_committed.set()
            await asyncio.Future()

    async def scenario() -> BlockingReserveControl:
        control = BlockingReserveControl()
        execution = asyncio.create_task(
            StoreHealthActivities(control).execute_fake_analysis(
                ActivityExecutionInput("run-1", 1, branch_id="catalog")
            )
        )
        await control.reservation_committed.wait()
        execution.cancel()
        with pytest.raises(asyncio.CancelledError):
            await execution
        return control

    control = asyncio.run(scenario())
    assert control.failed[0][0] == control.reservations[0].invocation_key
    assert control.failed[0][1].outcome_code == "ACTIVITY_CANCELED"
