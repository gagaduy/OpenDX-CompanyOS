# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import asyncio
from uuid import UUID

import pytest
from temporalio.exceptions import ApplicationError

from app.agentic.activities.orchestration_activities import OrchestrationActivities
from app.agentic.application.department_execution import DepartmentExecutionError
from app.agentic.domain.execution_descriptor import (
    DescriptorExecutionInput,
    DescriptorExecutionReference,
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
        status="usable", result_digest="b" * 64,
        provenance_ids=(UUID("00000000-0000-4000-8000-000000000004"),),
    )

    class Execution:
        async def execute(self, value: DescriptorExecutionInput) -> DescriptorExecutionReference:
            assert value == command()
            return expected

    activities = OrchestrationActivities(Execution())
    assert asyncio.run(activities.execute_department_subtask_v1(command())) == expected
    assert activities.registered[0].__temporal_activity_definition.name == "execute_department_subtask_v1"


def test_maps_binding_failures_to_non_retryable_temporal_errors() -> None:
    class Execution:
        async def execute(self, _value: DescriptorExecutionInput) -> DescriptorExecutionReference:
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")

    with pytest.raises(ApplicationError) as captured:
        asyncio.run(OrchestrationActivities(Execution()).execute_department_subtask_v1(command()))
    assert captured.value.type == "DESCRIPTOR_BINDING_INVALID"
    assert captured.value.non_retryable is True
