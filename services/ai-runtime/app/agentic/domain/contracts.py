# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID


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
    execution_profile: Literal["store_health_review", "advanced_live"] = "store_health_review"
    activity_start_to_close_seconds: int = 30
    activity_schedule_to_close_seconds: int = 180

    def __post_init__(self) -> None:
        _bounded(self.task_id, "task_id", 255)
        if (
            self.execution_profile not in {"store_health_review", "advanced_live"}
            or
            self.workflow_version != 1
            or self.plan_revision < 1
            or self.activity_start_to_close_seconds < 1
            or self.activity_schedule_to_close_seconds
            < self.activity_start_to_close_seconds
            or self.activity_schedule_to_close_seconds > 86_400
        ):
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
class ApprovalRequirement:
    id: str
    payload_digest: str
    expires_at: str
    policy_version: int
    application_decision_version: int = 2

    def __post_init__(self) -> None:
        _bounded(self.id, "approval id", 255)
        _digest(self.payload_digest)
        try:
            expires_at = datetime.fromisoformat(self.expires_at.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("Invalid approval expiration") from error
        if (
            expires_at.tzinfo is None
            or self.policy_version < 1
            or self.application_decision_version < 1
        ):
            raise ValueError("Invalid approval requirement")


@dataclass(frozen=True)
class FrozenWorkflowPlan:
    task_id: str
    workflow_run_id: str
    workflow_version: int
    plan_revision: int
    configuration_revision_id: str
    subtasks: tuple[PlanNode, ...]
    dependencies: tuple[PlanDependency, ...]
    approval: ApprovalRequirement | None = None
    partial_completion_allowed: bool = True

    def __post_init__(self) -> None:
        StoreHealthReviewInput(self.task_id, self.workflow_version, self.plan_revision)
        _bounded(self.workflow_run_id, "workflow_run_id", 255)
        _bounded(self.configuration_revision_id, "configuration_revision_id", 255)
        if (
            not self.subtasks
            or len(self.subtasks) > 100
            or len(self.dependencies) > 500
            or type(self.partial_completion_allowed) is not bool
        ):
            raise ValueError("Frozen plan bounds are invalid")


@dataclass(frozen=True)
class OrchestrationCollaborationInstruction:
    requester_subtask_id: str
    requester_agent_kind: str
    purpose: str
    requested_data_classification: str

    def __post_init__(self) -> None:
        _canonical_uuid(self.requester_subtask_id, "collaboration requester subtask id")
        if self.requester_agent_kind not in {
            "catalog", "inventory", "order", "finance", "crm", "support",
        }:
            raise ValueError("Invalid collaboration requester kind")
        _bounded(self.purpose, "collaboration purpose", 500)
        if self.requested_data_classification not in {
            "internal", "confidential", "restricted",
        }:
            raise ValueError("Invalid collaboration data classification")


@dataclass(frozen=True)
class OrchestrationDispatchNode:
    subtask_id: str
    agent_kind: str
    dependencies: tuple[str, ...]
    descriptor_id: str
    descriptor_digest: str
    collaborations: tuple[OrchestrationCollaborationInstruction, ...] = ()

    def __post_init__(self) -> None:
        _canonical_uuid(self.subtask_id, "subtask id")
        _canonical_uuid(self.descriptor_id, "descriptor id")
        if self.agent_kind not in {
            "catalog", "inventory", "order", "finance", "crm", "support",
        }:
            raise ValueError("Invalid dispatch agent kind")
        _digest(self.descriptor_digest)
        if (
            len(self.dependencies) > 100
            or len(set(self.dependencies)) != len(self.dependencies)
            or self.subtask_id in self.dependencies
        ):
            raise ValueError("Dispatch dependencies exceed their bounds")
        for dependency in self.dependencies:
            _canonical_uuid(dependency, "dependency id")
        requester_ids = tuple(item.requester_subtask_id for item in self.collaborations)
        if (len(self.collaborations) > 5
            or len(set(requester_ids)) != len(requester_ids)
            or any(item.requester_subtask_id not in self.dependencies
                   or item.requester_agent_kind == self.agent_kind
                   for item in self.collaborations)):
            raise ValueError("Dispatch collaboration bindings are invalid")


@dataclass(frozen=True)
class OrchestrationDispatchPlan:
    task_id: str
    plan_version: int
    plan_digest: str
    nodes: tuple[OrchestrationDispatchNode, ...]

    def __post_init__(self) -> None:
        _canonical_uuid(self.task_id, "task id")
        _digest(self.plan_digest)
        if self.plan_version < 1 or not self.nodes or len(self.nodes) > 6:
            raise ValueError("Dispatch plan bounds are invalid")
        node_ids = {node.subtask_id for node in self.nodes}
        nodes = {node.subtask_id: node for node in self.nodes}
        if len(node_ids) != len(self.nodes) or any(
            dependency not in node_ids
            for node in self.nodes for dependency in node.dependencies
        ):
            raise ValueError("Dispatch graph bindings are invalid")
        if any(
            nodes[item.requester_subtask_id].agent_kind != item.requester_agent_kind
            for node in self.nodes for item in node.collaborations
        ):
            raise ValueError("Dispatch collaboration bindings are invalid")


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


def _canonical_uuid(value: str, name: str) -> None:
    _bounded(value, name, 36)
    try:
        parsed = UUID(value)
    except ValueError as error:
        raise ValueError(f"Invalid {name}") from error
    if str(parsed) != value:
        raise ValueError(f"Invalid {name}")


def _digest(value: str) -> None:
    if not _DIGEST.fullmatch(value):
        raise ValueError("Invalid SHA-256 digest")
