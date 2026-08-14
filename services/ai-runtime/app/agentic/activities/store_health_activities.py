# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import hashlib
import json
from contextlib import suppress
from typing import Any

from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.agentic.application.ports import AgenticControlFailure, AgenticControlPort
from app.agentic.domain.contracts import (
    ActivityKind,
    ActivityOutcome,
    ActivityReservationRequest,
    FrozenWorkflowPlan,
    StateProjection,
)
from app.agentic.workflows.store_health_review_v1 import (
    ActivityExecutionInput,
    StateProjectionInput,
)


class StoreHealthActivities:
    def __init__(self, control: AgenticControlPort) -> None:
        self._control = control

    @activity.defn(name="load_frozen_plan")
    async def load_frozen_plan(self, run_id: str) -> FrozenWorkflowPlan:
        try:
            return await self._with_heartbeat(self._control.load_plan(run_id))
        except AgenticControlFailure as error:
            self._raise_control(error)

    @activity.defn(name="project_state")
    async def project_state(self, value: StateProjectionInput) -> None:
        try:
            await self._control.project_state(
                value.run_id,
                StateProjection(value.projection_sequence, value.state, value.outcome_code),
            )
        except AgenticControlFailure as error:
            self._raise_control(error)

    @activity.defn(name="execute_fake_analysis")
    async def execute_fake_analysis(self, value: ActivityExecutionInput) -> dict[str, Any]:
        return await self._execute(ActivityKind.EXECUTE_FAKE_ANALYSIS, value)

    @activity.defn(name="execute_fake_quality_review")
    async def execute_fake_quality_review(self, value: ActivityExecutionInput) -> dict[str, Any]:
        return await self._execute(ActivityKind.EXECUTE_FAKE_QUALITY_REVIEW, value)

    @activity.defn(name="execute_fake_collaboration")
    async def execute_fake_collaboration(self, value: ActivityExecutionInput) -> dict[str, Any]:
        return await self._execute(ActivityKind.EXECUTE_FAKE_COLLABORATION, value)

    @activity.defn(name="execute_fake_synthesis")
    async def execute_fake_synthesis(self, value: ActivityExecutionInput) -> dict[str, Any]:
        return await self._execute(ActivityKind.EXECUTE_FAKE_SYNTHESIS, value)

    async def _execute(
        self, kind: ActivityKind, value: ActivityExecutionInput
    ) -> dict[str, Any]:
        return await self._with_heartbeat(self._execute_reserved(kind, value))

    async def _execute_reserved(
        self, kind: ActivityKind, value: ActivityExecutionInput
    ) -> dict[str, Any]:
        digest = self._digest(value)
        branch = value.branch_id or "root"
        invocation_key = f"{value.run_id}:{value.workflow_version}:{kind.value}:{branch}:{digest}"
        request = ActivityReservationRequest(
            invocation_key=invocation_key,
            run_id=value.run_id,
            activity_kind=kind,
            branch_id=value.branch_id,
            input_digest=digest,
        )
        try:
            reservation = await self._control.reserve_activity(request)
        except asyncio.CancelledError:
            try:
                await self._fail_reserved(invocation_key, "ACTIVITY_CANCELED")
            except ApplicationError:
                pass
            raise
        except AgenticControlFailure as error:
            self._raise_control(error)
        recovered = self._recover(reservation)
        if recovered is not None:
            return recovered

        try:
            result = {
                "status": "usable",
                "activityKind": kind.value,
                "branchId": branch,
            }
            await self._control.complete_activity(
                invocation_key,
                ActivityOutcome(1, self._outcome_code(kind), result),
            )
        except asyncio.CancelledError:
            await self._fail_reserved(invocation_key, "ACTIVITY_CANCELED")
            raise
        except AgenticControlFailure as error:
            if not error.retryable or value.execution_attempt >= 3:
                await self._fail_reserved(invocation_key, error.code)
            self._raise_control(error)
        return result

    async def _fail_reserved(self, invocation_key: str, outcome_code: str) -> None:
        try:
            await self._control.fail_activity(
                invocation_key, ActivityOutcome(1, outcome_code)
            )
        except AgenticControlFailure as error:
            self._raise_control(error)

    async def _with_heartbeat(self, operation: Any) -> Any:
        heartbeat = (
            asyncio.create_task(self._heartbeat()) if activity.in_activity() else None
        )
        try:
            return await operation
        finally:
            if heartbeat is not None:
                heartbeat.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat

    @staticmethod
    async def _heartbeat() -> None:
        while True:
            activity.heartbeat()
            await asyncio.sleep(1)

    @staticmethod
    def _digest(value: ActivityExecutionInput) -> str:
        body = json.dumps(
            {
                "runId": value.run_id,
                "workflowVersion": value.workflow_version,
                "branchId": value.branch_id,
                "sourceBranches": value.source_branches,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return hashlib.sha256(body).hexdigest()

    @staticmethod
    def _recover(reservation: object) -> dict[str, Any] | None:
        if not isinstance(reservation, dict) or reservation.get("status") != "duplicate":
            return None
        invocation = reservation.get("invocation")
        if not isinstance(invocation, dict):
            raise ApplicationError(
                "INVALID_STORED_ACTIVITY", type="SCHEMA_INVALID", non_retryable=True
            )
        state = invocation.get("state")
        if state == "completed" and isinstance(invocation.get("safeResult"), dict):
            return invocation["safeResult"]
        if state == "failed":
            code = str(invocation.get("outcomeCode", "STORED_ACTIVITY_FAILED"))
            raise ApplicationError(code, type=code, non_retryable=True)
        return None

    @staticmethod
    def _outcome_code(kind: ActivityKind) -> str:
        return f"{kind.value.upper()}_COMPLETED"

    @staticmethod
    def _raise_control(error: AgenticControlFailure) -> None:
        raise ApplicationError(
            error.code,
            type=error.code,
            non_retryable=not error.retryable,
        ) from error

    @property
    def registered(self) -> list[object]:
        return [
            self.load_frozen_plan,
            self.project_state,
            self.execute_fake_analysis,
            self.execute_fake_quality_review,
            self.execute_fake_collaboration,
            self.execute_fake_synthesis,
        ]
