# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
from typing import Any

from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.agentic.domain.execution_descriptor import (
    DescriptorExecutionInput,
    DescriptorExecutionReference,
    PlanningExecutionInput,
    PlanningExecutionReference,
    SynthesisExecutionInput,
    SynthesisExecutionReference,
    descriptor_json,
)
from app.agentic.domain.contracts import OrchestrationDispatchPlan


class OrchestrationActivities:
    def __init__(self, department_execution: Any, *, planning: Any | None = None,
                 synthesis: Any | None = None, controls: Any | None = None) -> None:
        self._department_execution = department_execution
        self._planning = planning
        self._synthesis = synthesis
        self._controls = controls

    @activity.defn(name="load_orchestration_dispatch_plan")
    async def load_orchestration_dispatch_plan(
        self, run_id: str
    ) -> OrchestrationDispatchPlan:
        if self._controls is None:
            raise ApplicationError(
                "ORCHESTRATION_DISPATCH_UNAVAILABLE",
                type="ORCHESTRATION_DISPATCH_UNAVAILABLE", non_retryable=True,
            )
        try:
            return await _with_heartbeat(self._controls.load_dispatch_plan(run_id))
        except Exception as error:
            raise _temporal_error(error) from error

    @activity.defn(name="plan_orchestration_v1")
    async def plan_orchestration_v1(
        self, value: dict[str, Any]
    ) -> dict[str, Any]:
        if self._planning is None:
            raise ApplicationError(
                "ORCHESTRATION_PLANNING_UNAVAILABLE",
                type="ORCHESTRATION_PLANNING_UNAVAILABLE", non_retryable=True,
            )
        try:
            command = PlanningExecutionInput.model_validate_json(json.dumps(value))
            return descriptor_json(await _with_heartbeat(self._planning.plan(command)))
        except Exception as error:
            raise _temporal_error(error) from error

    @activity.defn(name="execute_department_subtask_v1")
    async def execute_department_subtask_v1(
        self, value: dict[str, Any]
    ) -> dict[str, Any]:
        try:
            command = DescriptorExecutionInput.model_validate_json(json.dumps(value))
            result = await _with_heartbeat(self._department_execution.execute(command))
            return descriptor_json(result)
        except Exception as error:
            raise _temporal_error(error) from error

    @activity.defn(name="synthesize_executive_report_v1")
    async def synthesize_executive_report_v1(
        self, value: dict[str, Any]
    ) -> dict[str, Any]:
        if self._synthesis is None:
            raise ApplicationError(
                "ORCHESTRATION_SYNTHESIS_UNAVAILABLE",
                type="ORCHESTRATION_SYNTHESIS_UNAVAILABLE", non_retryable=True,
            )
        try:
            command = SynthesisExecutionInput.model_validate_json(json.dumps(value))
            return descriptor_json(await _with_heartbeat(self._synthesis.synthesize(command)))
        except Exception as error:
            raise _temporal_error(error) from error

    @property
    def registered(self) -> list[object]:
        return [
            self.load_orchestration_dispatch_plan,
            self.execute_department_subtask_v1,
            self.plan_orchestration_v1,
            self.synthesize_executive_report_v1,
        ]


def _temporal_error(error: Exception) -> ApplicationError:
    code = getattr(error, "code", None)
    retryable = getattr(error, "retryable", None)
    if type(code) is not str or type(retryable) is not bool:
        code, retryable = "ORCHESTRATION_EXECUTION_FAILED", False
    return ApplicationError(code, type=code, non_retryable=not retryable)


async def _with_heartbeat(awaitable: Any) -> Any:
    task = asyncio.create_task(awaitable)
    try:
        while True:
            done, _ = await asyncio.wait((task,), timeout=1)
            if task in done:
                return await task
            activity.heartbeat()
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except BaseException:
                pass
