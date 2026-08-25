# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Any

from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.agentic.application.department_execution import DepartmentExecutionError
from app.agentic.domain.execution_descriptor import (
    DescriptorExecutionInput,
    DescriptorExecutionReference,
    PlanningExecutionInput,
    PlanningExecutionReference,
    SynthesisExecutionInput,
    SynthesisExecutionReference,
)


class OrchestrationActivities:
    def __init__(self, department_execution: Any, *, planning: Any | None = None,
                 synthesis: Any | None = None) -> None:
        self._department_execution = department_execution
        self._planning = planning
        self._synthesis = synthesis

    @activity.defn(name="plan_orchestration_v1")
    async def plan_orchestration_v1(
        self, value: PlanningExecutionInput
    ) -> PlanningExecutionReference:
        if self._planning is None:
            raise ApplicationError(
                "ORCHESTRATION_PLANNING_UNAVAILABLE",
                type="ORCHESTRATION_PLANNING_UNAVAILABLE", non_retryable=True,
            )
        try:
            return await self._planning.plan(value)
        except DepartmentExecutionError as error:
            raise ApplicationError(
                error.code, type=error.code, non_retryable=not error.retryable
            ) from error

    @activity.defn(name="execute_department_subtask_v1")
    async def execute_department_subtask_v1(
        self, command: DescriptorExecutionInput
    ) -> DescriptorExecutionReference:
        try:
            return await self._department_execution.execute(command)
        except DepartmentExecutionError as error:
            raise ApplicationError(
                error.code, type=error.code, non_retryable=not error.retryable
            ) from error

    @activity.defn(name="synthesize_executive_report_v1")
    async def synthesize_executive_report_v1(
        self, value: SynthesisExecutionInput
    ) -> SynthesisExecutionReference:
        if self._synthesis is None:
            raise ApplicationError(
                "ORCHESTRATION_SYNTHESIS_UNAVAILABLE",
                type="ORCHESTRATION_SYNTHESIS_UNAVAILABLE", non_retryable=True,
            )
        try:
            return await self._synthesis.synthesize(value)
        except DepartmentExecutionError as error:
            raise ApplicationError(
                error.code, type=error.code, non_retryable=not error.retryable
            ) from error

    @property
    def registered(self) -> list[object]:
        return [
            self.execute_department_subtask_v1,
            self.plan_orchestration_v1,
            self.synthesize_executive_report_v1,
        ]
