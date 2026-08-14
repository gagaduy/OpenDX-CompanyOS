# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_REASON = re.compile(r"^[A-Z][A-Z0-9_]{0,99}$")


class WorkflowState(StrEnum):
    RECEIVED = "received"
    PLANNING = "planning"
    AWAITING_PLAN_APPROVAL = "awaiting_plan_approval"
    DISPATCHING = "dispatching"
    DEPARTMENT_ANALYSIS = "department_analysis"
    QUALITY_REVIEW = "quality_review"
    COLLABORATION = "collaboration"
    EXECUTIVE_SYNTHESIS = "executive_synthesis"
    AWAITING_HUMAN_APPROVAL = "awaiting_human_approval"
    RETRYING = "retrying"
    PARTIALLY_COMPLETED = "partially_completed"
    FAILED = "failed"
    CANCELED = "canceled"
    COMPLETED = "completed"


class ActivityKind(StrEnum):
    LOAD_FROZEN_PLAN = "load_frozen_plan"
    PROJECT_STATE = "project_state"
    EXECUTE_FAKE_ANALYSIS = "execute_fake_analysis"
    EXECUTE_FAKE_QUALITY_REVIEW = "execute_fake_quality_review"
    EXECUTE_FAKE_COLLABORATION = "execute_fake_collaboration"
    EXECUTE_FAKE_SYNTHESIS = "execute_fake_synthesis"


class ApprovalDecision(StrEnum):
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass(frozen=True)
class WorkloadPrincipal:
    subject: str
    client_id: str

    def __post_init__(self) -> None:
        _bounded(self.subject, "subject", 255)
        _bounded(self.client_id, "client_id", 255)


@dataclass(frozen=True)
class StoreHealthReviewInput:
    task_id: str
    workflow_version: int
    plan_revision: int

    def __post_init__(self) -> None:
        _bounded(self.task_id, "task_id", 255)
        if self.workflow_version != 1 or self.plan_revision < 1:
            raise ValueError("Unsupported workflow input version")


@dataclass(frozen=True)
class ApprovalSignal:
    approval_id: str
    payload_digest: str
    decision: ApprovalDecision
    application_decision_version: int
    idempotency_key: str

    def __post_init__(self) -> None:
        _bounded(self.approval_id, "approval_id", 255)
        _digest(self.payload_digest)
        _bounded(self.idempotency_key, "idempotency_key", 255)
        if self.application_decision_version < 1:
            raise ValueError("Decision version must be positive")


@dataclass(frozen=True)
class CancellationSignal:
    payload_digest: str
    reason_code: str
    idempotency_key: str

    def __post_init__(self) -> None:
        _digest(self.payload_digest)
        if not _REASON.fullmatch(self.reason_code):
            raise ValueError("Invalid reason code")
        _bounded(self.idempotency_key, "idempotency_key", 255)


@dataclass(frozen=True)
class PlanNode:
    id: str
    agent_kind: str
    version: int

    def __post_init__(self) -> None:
        _bounded(self.id, "node id", 255)
        _bounded(self.agent_kind, "agent kind", 100)
        if self.version < 1:
            raise ValueError("Node version must be positive")


@dataclass(frozen=True)
class PlanDependency:
    source: str
    target: str


@dataclass(frozen=True)
class FrozenWorkflowPlan:
    task_id: str
    workflow_run_id: str
    workflow_version: int
    plan_revision: int
    configuration_revision_id: str
    subtasks: tuple[PlanNode, ...]
    dependencies: tuple[PlanDependency, ...]

    def __post_init__(self) -> None:
        StoreHealthReviewInput(self.task_id, self.workflow_version, self.plan_revision)
        _bounded(self.workflow_run_id, "workflow_run_id", 255)
        _bounded(self.configuration_revision_id, "configuration_revision_id", 255)
        if not self.subtasks or len(self.subtasks) > 100 or len(self.dependencies) > 500:
            raise ValueError("Frozen plan bounds are invalid")


@dataclass(frozen=True)
class StateProjection:
    projection_sequence: int
    state: WorkflowState
    outcome_code: str | None = None

    def __post_init__(self) -> None:
        if self.projection_sequence < 1:
            raise ValueError("Projection sequence must be positive")
        if self.outcome_code is not None and not _REASON.fullmatch(self.outcome_code):
            raise ValueError("Invalid outcome code")


@dataclass(frozen=True)
class ActivityReservationRequest:
    invocation_key: str
    run_id: str
    activity_kind: ActivityKind
    input_digest: str
    branch_id: str | None = None

    def __post_init__(self) -> None:
        _bounded(self.invocation_key, "invocation_key", 1_000)
        _bounded(self.run_id, "run_id", 255)
        _digest(self.input_digest)
        if self.branch_id is not None:
            _bounded(self.branch_id, "branch_id", 255)


@dataclass(frozen=True)
class ActivityOutcome:
    expected_version: int
    outcome_code: str
    safe_result: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.expected_version < 1 or not _REASON.fullmatch(self.outcome_code):
            raise ValueError("Invalid activity outcome")


def _bounded(value: str, name: str, maximum: int) -> None:
    if not value or len(value) > maximum:
        raise ValueError(f"{name} is outside its bounds")


def _digest(value: str) -> None:
    if not _DIGEST.fullmatch(value):
        raise ValueError("Invalid SHA-256 digest")
