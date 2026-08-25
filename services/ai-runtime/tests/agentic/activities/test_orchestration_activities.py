# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import asyncio
from uuid import UUID

import pytest
from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.agentic.activities.orchestration_activities import (
    OrchestrationActivities,
    _with_heartbeat,
)
from app.agentic.application.department_execution import DepartmentExecutionError
from app.agentic.domain.execution_descriptor import (
    DescriptorExecutionInput,
    DescriptorExecutionReference,
    PlanningExecutionInput,
    descriptor_json,
)


def command() -> DescriptorExecutionInput:
    return DescriptorExecutionInput(
        descriptor_id=UUID("00000000-0000-4000-8000-000000000001"),
        descriptor_digest="a" * 64,
        task_id=UUID("00000000-0000-4000-8000-000000000002"), plan_version=1,
        subtask_id=UUID("00000000-0000-4000-8000-000000000003"),
        agent_kind="catalog", idempotency_key="department:catalog:1",
    )


def test_returns_only_the_bounded_descriptor_reference() -> None:
    expected = DescriptorExecutionReference(
        status="usable",
        result_id=UUID("00000000-0000-4000-8000-000000000005"),
        result_digest="b" * 64,
        provenance_ids=(UUID("00000000-0000-4000-8000-000000000004"),),
    )

    class Execution:
        async def execute(self, value: DescriptorExecutionInput) -> DescriptorExecutionReference:
            assert value == command()
            return expected

    activities = OrchestrationActivities(Execution())
    assert asyncio.run(activities.execute_department_subtask_v1(
        descriptor_json(command())
    )) == descriptor_json(expected)
    assert activities.registered[1].__temporal_activity_definition.name == "execute_department_subtask_v1"


def test_maps_binding_failures_to_non_retryable_temporal_errors() -> None:
    class Execution:
        async def execute(self, _value: DescriptorExecutionInput) -> DescriptorExecutionReference:
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")

    with pytest.raises(ApplicationError) as captured:
        asyncio.run(OrchestrationActivities(Execution()).execute_department_subtask_v1(
            descriptor_json(command())
        ))
    assert captured.value.type == "DESCRIPTOR_BINDING_INVALID"
    assert captured.value.non_retryable is True


@pytest.mark.parametrize("retryable", [False, True])
def test_preserves_governed_dependency_error_code_and_retryability(retryable: bool) -> None:
    class GovernedFailure(RuntimeError):
        def __init__(self) -> None:
            super().__init__("private dependency body")
            self.code = "AGENTIC_CONTROL_UNAVAILABLE"
            self.retryable = retryable

    class Planning:
        async def plan(self, _value: object) -> None:
            raise GovernedFailure()

    activities = OrchestrationActivities(object(), planning=Planning())
    planning = PlanningExecutionInput(
        task_id=UUID("00000000-0000-4000-8000-000000000002"),
        idempotency_key="planning:1",
    )

    with pytest.raises(ApplicationError) as captured:
        asyncio.run(activities.plan_orchestration_v1(descriptor_json(planning)))

    assert captured.value.type == "AGENTIC_CONTROL_UNAVAILABLE"
    assert captured.value.non_retryable is not retryable


def test_registers_all_phase_f_activity_names() -> None:
    class Planning:
        async def plan(self, _value: object) -> None:
            return None

    class Synthesis:
        async def synthesize(self, _value: object) -> None:
            return None

    class Controls:
        async def load_dispatch_plan(self, _run_id: str) -> None:
            return None

    names = {
        item.__temporal_activity_definition.name
        for item in OrchestrationActivities(
            object(), planning=Planning(), synthesis=Synthesis(), controls=Controls()
        ).registered
    }

    assert names == {
        "load_orchestration_dispatch_plan",
        "plan_orchestration_v1",
        "execute_department_subtask_v1",
        "synthesize_executive_report_v1",
    }


def test_long_running_phase_f_activity_heartbeats(monkeypatch: pytest.MonkeyPatch) -> None:
    heartbeats: list[None] = []
    monkeypatch.setattr(activity, "heartbeat", lambda: heartbeats.append(None))

    async def slow_result() -> str:
        await asyncio.sleep(1.05)
        return "done"

    assert asyncio.run(_with_heartbeat(slow_result())) == "done"
    assert heartbeats
