# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

from app.agentic.domain.contracts import (
    ApprovalDecision,
    ApprovalSignal,
    CancellationSignal,
    StoreHealthReviewInput,
)


WorkflowExecutionStatus = Literal["running", "completed", "failed", "canceled"]


class TemporalControlFailure(RuntimeError):
    def __init__(
        self, code: str, *, retryable: bool, detail: str | None = None
    ) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.detail = detail


class TemporalAlreadyStarted(RuntimeError):
    def __init__(self, temporal_run_id: str | None = None) -> None:
        super().__init__("TEMPORAL_WORKFLOW_ALREADY_STARTED")
        self.temporal_run_id = temporal_run_id


class WorkflowControlError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class StartWorkflowCommand:
    workflow_run_id: str
    temporal_workflow_id: str
    task_id: str
    workflow_version: int
    plan_revision: int
    correlation_id: str


@dataclass(frozen=True)
class StartWorkflowResult:
    temporal_run_id: str
    duplicate: bool


@dataclass(frozen=True)
class ApprovalCommand:
    temporal_workflow_id: str
    idempotency_key: str
    approval_id: str
    payload_digest: str
    decision: ApprovalDecision
    application_decision_version: int
    correlation_id: str


@dataclass(frozen=True)
class CancellationCommand:
    temporal_workflow_id: str
    idempotency_key: str
    payload_digest: str
    reason_code: str
    correlation_id: str


@dataclass(frozen=True)
class TemporalDescription:
    status: WorkflowExecutionStatus
    temporal_run_id: str | None = None


class TemporalControlPort(Protocol):
    async def start(self, workflow_id: str, value: StoreHealthReviewInput) -> str: ...
    async def describe(self, workflow_id: str) -> TemporalDescription: ...
    async def signal(self, workflow_id: str, name: str, value: object) -> None: ...
    async def probe(self) -> None: ...


class WorkflowControl:
    def __init__(
        self,
        temporal: TemporalControlPort,
        activity_start_to_close_seconds: int,
        activity_schedule_to_close_seconds: int,
        metrics: Any | None = None,
        logger: Any | None = None,
    ) -> None:
        self._temporal = temporal
        self._start_to_close = activity_start_to_close_seconds
        self._schedule_to_close = activity_schedule_to_close_seconds
        self._metrics = metrics
        self._logger = logger

    async def start(self, command: StartWorkflowCommand) -> StartWorkflowResult:
        expected_id = f"store-health-v1:{command.workflow_run_id}"
        if command.temporal_workflow_id != expected_id:
            raise WorkflowControlError("WORKFLOW_ID_INVALID")
        try:
            value = StoreHealthReviewInput(
                task_id=command.task_id,
                workflow_version=command.workflow_version,
                plan_revision=command.plan_revision,
                activity_start_to_close_seconds=self._start_to_close,
                activity_schedule_to_close_seconds=self._schedule_to_close,
            )
            run_id = await self._temporal.start(command.temporal_workflow_id, value)
            self._observe_start(command, "accepted")
            return StartWorkflowResult(run_id, False)
        except TemporalAlreadyStarted:
            description = await self._safe_describe(command.temporal_workflow_id)
            if description.temporal_run_id is None:
                raise WorkflowControlError(
                    "TEMPORAL_CONVERGENCE_FAILED", retryable=True
                )
            self._observe_start(command, "duplicate")
            return StartWorkflowResult(description.temporal_run_id, True)
        except TemporalControlFailure as error:
            self._observe_start(
                command,
                "unavailable" if error.retryable else "rejected",
                error.code,
            )
            raise self._safe_error(error) from error
        except ValueError as error:
            raise WorkflowControlError("WORKFLOW_COMMAND_INVALID") from error

    async def describe(
        self, temporal_workflow_id: str, correlation_id: str
    ) -> TemporalDescription:
        self._canonical_workflow_id(temporal_workflow_id)
        self._bounded(correlation_id)
        description = await self._safe_describe(temporal_workflow_id)
        self._observe_description(
            temporal_workflow_id, correlation_id, description.status
        )
        return description

    async def signal_approval(self, command: ApprovalCommand) -> None:
        self._canonical_workflow_id(command.temporal_workflow_id)
        try:
            await self._temporal.signal(
                command.temporal_workflow_id,
                "approve",
                ApprovalSignal(
                    approval_id=command.approval_id,
                    payload_digest=command.payload_digest,
                    decision=command.decision,
                    application_decision_version=command.application_decision_version,
                    idempotency_key=command.idempotency_key,
                ),
            )
            self._observe_signal(command, "approval", "completed")
        except TemporalControlFailure as error:
            self._observe_signal(command, "approval", "rejected", error.code)
            raise self._safe_error(error) from error
        except ValueError as error:
            raise WorkflowControlError("WORKFLOW_SIGNAL_INVALID") from error

    async def signal_cancellation(self, command: CancellationCommand) -> None:
        self._canonical_workflow_id(command.temporal_workflow_id)
        try:
            await self._temporal.signal(
                command.temporal_workflow_id,
                "cancel",
                CancellationSignal(
                    payload_digest=command.payload_digest,
                    reason_code=command.reason_code,
                    idempotency_key=command.idempotency_key,
                ),
            )
            self._observe_signal(command, "cancellation", "completed")
        except TemporalControlFailure as error:
            self._observe_signal(
                command, "cancellation", "rejected", error.code
            )
            raise self._safe_error(error) from error
        except ValueError as error:
            raise WorkflowControlError("WORKFLOW_SIGNAL_INVALID") from error

    async def probe(self) -> None:
        try:
            await self._temporal.probe()
        except TemporalControlFailure as error:
            raise self._safe_error(error) from error

    async def _safe_describe(self, workflow_id: str) -> TemporalDescription:
        try:
            return await self._temporal.describe(workflow_id)
        except TemporalControlFailure as error:
            raise self._safe_error(error) from error

    @staticmethod
    def _safe_error(error: TemporalControlFailure) -> WorkflowControlError:
        return WorkflowControlError(error.code, retryable=error.retryable)

    @staticmethod
    def _bounded(value: str) -> None:
        if not value or len(value) > 255 or any(character.isspace() for character in value):
            raise WorkflowControlError("WORKFLOW_ID_INVALID")

    @classmethod
    def _canonical_workflow_id(cls, value: str) -> None:
        cls._bounded(value)
        prefix = "store-health-v1:"
        if not value.startswith(prefix) or len(value) == len(prefix):
            raise WorkflowControlError("WORKFLOW_ID_INVALID")

    def _observe_start(
        self,
        command: StartWorkflowCommand,
        outcome: str,
        error_code: str | None = None,
    ) -> None:
        try:
            if self._metrics is not None:
                self._metrics.increment("workflow_start", {"outcome": outcome})
            if self._logger is not None:
                self._logger.emit(
                    "workflow_started",
                    workflow_id=command.temporal_workflow_id,
                    task_id=command.task_id,
                    correlation_id=command.correlation_id,
                    causation_id=command.workflow_run_id,
                    outcome=outcome,
                    **({"error_code": error_code} if error_code else {}),
                )
        except Exception:
            pass

    def _observe_description(
        self, workflow_id: str, correlation_id: str, outcome: str
    ) -> None:
        try:
            if self._logger is not None:
                self._logger.emit(
                    "workflow_described",
                    workflow_id=workflow_id,
                    correlation_id=correlation_id,
                    causation_id=workflow_id,
                    outcome=outcome,
                )
        except Exception:
            pass

    def _observe_signal(
        self,
        command: ApprovalCommand | CancellationCommand,
        signal: str,
        outcome: str,
        error_code: str | None = None,
    ) -> None:
        try:
            if outcome == "rejected" and self._metrics is not None:
                self._metrics.increment("rejected_signal", {"signal": signal})
            if self._logger is not None:
                self._logger.emit(
                    "workflow_signaled",
                    workflow_id=command.temporal_workflow_id,
                    correlation_id=command.correlation_id,
                    causation_id=command.idempotency_key,
                    signal=signal,
                    outcome=outcome,
                    **({"error_code": error_code} if error_code else {}),
                )
        except Exception:
            pass
