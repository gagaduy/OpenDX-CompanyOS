# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
from collections.abc import Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.agentic.application.orchestration import OrchestrationPlanner
from app.agentic.domain.model_runtime import QualityDecision
from app.agentic.domain.orchestration_schemas import (
    DepartmentAgentKind, OrchestrationPlan, PlannedSubtask,
)


class _ProposalSubtask(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    owner: DepartmentAgentKind
    dependencies: tuple[DepartmentAgentKind, ...] = Field(max_length=5)


class _Proposal(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    schemaVersion: int = Field(frozen=True)
    subtasks: tuple[_ProposalSubtask, ...] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def validate_identity(self) -> _Proposal:
        if (
            self.schemaVersion != 1
            or len({item.owner for item in self.subtasks}) != len(self.subtasks)
            or any(
                len(set(item.dependencies)) != len(item.dependencies)
                for item in self.subtasks
            )
        ):
            raise ValueError("INVALID_PLAN")
        return self


class PlanningQualityGate:
    def __init__(self, eligible_departments: frozenset[DepartmentAgentKind]) -> None:
        self._eligible = eligible_departments

    def evaluate(self, raw_result: object, _context: object) -> QualityDecision:
        try:
            proposal = _Proposal.model_validate_json(json.dumps(_mutable_json(raw_result)))
        except (ValidationError, TypeError, ValueError, OverflowError):
            return QualityDecision("correct", ("INVALID_PLAN",), ())
        if any(item.owner not in self._eligible for item in proposal.subtasks):
            return QualityDecision("escalate", ("POLICY_DENIED",), ())
        by_owner = {item.owner: item for item in proposal.subtasks}
        if any(dependency not in by_owner or dependency == item.owner
               for item in proposal.subtasks for dependency in item.dependencies):
            return QualityDecision("correct", ("INVALID_PLAN",), ())
        plan = OrchestrationPlan(
            task_id="planning-quality-gate", version=1, digest="0" * 64,
            subtasks=tuple(PlannedSubtask(
                id=item.owner, owner=item.owner, dependencies=item.dependencies,
                expected_result_schema_digest="0" * 64, allowed_tools_digest="0" * 64,
                data_scope=f"{item.owner}:health:read", freshness_seconds=1,
                timeout_seconds=1, budget_micros=1, source_provenance_digest="0" * 64,
            ) for item in proposal.subtasks),
        )
        decision = OrchestrationPlanner(self._eligible).validate(plan)
        if not decision.dispatchable:
            return QualityDecision("correct", (decision.code,), ())
        return QualityDecision("accepted", (), ())


def _mutable_json(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _mutable_json(item) for key, item in value.items()}
    if type(value) in (tuple, list):
        return [_mutable_json(item) for item in value]
    return value
