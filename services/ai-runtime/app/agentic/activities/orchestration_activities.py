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
)


class OrchestrationActivities:
    def __init__(self, department_execution: Any) -> None:
        self._department_execution = department_execution

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

    @property
    def registered(self) -> list[object]:
        return [self.execute_department_subtask_v1]
