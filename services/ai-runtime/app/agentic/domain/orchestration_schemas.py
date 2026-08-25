# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


DepartmentAgentKind = Literal["catalog", "inventory", "order", "finance", "crm", "support"]
Digest = str


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class PlannedSubtask(StrictModel):
    id: str = Field(min_length=1, max_length=255)
    owner: DepartmentAgentKind
    dependencies: tuple[str, ...] = Field(max_length=100)
    expected_result_schema_digest: Digest = Field(pattern=r"^[a-f0-9]{64}$")
    allowed_tools_digest: Digest = Field(pattern=r"^[a-f0-9]{64}$")
    data_scope: str = Field(min_length=1, max_length=255)
    freshness_seconds: int = Field(gt=0)
    timeout_seconds: int = Field(gt=0)
    budget_micros: int = Field(gt=0)
    source_provenance_digest: Digest = Field(pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def validate_dependencies(self) -> PlannedSubtask:
        if self.id in self.dependencies or len(set(self.dependencies)) != len(self.dependencies):
            raise ValueError("INVALID_PLAN")
        return self


class OrchestrationPlan(StrictModel):
    task_id: str = Field(min_length=1, max_length=255)
    version: int = Field(gt=0)
    digest: Digest = Field(pattern=r"^[a-f0-9]{64}$")
    subtasks: tuple[PlannedSubtask, ...] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_identity(self) -> OrchestrationPlan:
        ids = tuple(item.id for item in self.subtasks)
        if len(set(ids)) != len(ids):
            raise ValueError("INVALID_PLAN")
        if any(dependency not in ids for item in self.subtasks for dependency in item.dependencies):
            raise ValueError("INVALID_PLAN")
        return self


class ExecutiveConclusion(StrictModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{0,99}$")
    statement: str = Field(min_length=1, max_length=2_000)
    provenance_ids: tuple[str, ...] = Field(min_length=1, max_length=8)


class DepartmentResult(StrictModel):
    agent_kind: DepartmentAgentKind
    status: Literal["accepted", "unavailable", "failed"]
    result_digest: Digest | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    provenance_ids: tuple[str, ...] = Field(default=(), max_length=24)
    conclusions: tuple[ExecutiveConclusion, ...] = Field(default=(), max_length=8)
    reason_code: str | None = Field(default=None, pattern=r"^[A-Z][A-Z0-9_]{0,99}$")

    @model_validator(mode="after")
    def validate_status(self) -> DepartmentResult:
        if self.status == "accepted":
            if self.result_digest is None or not self.provenance_ids or self.reason_code is not None:
                raise ValueError("RESULT_EVIDENCE_REQUIRED")
        elif self.result_digest is not None or self.provenance_ids or self.conclusions or self.reason_code is None:
            raise ValueError("UNAVAILABLE_RESULT_MUST_NOT_CONTAIN_EVIDENCE")
        return self


class PlanningDecision(StrictModel):
    code: Literal["ACCEPTED", "INVALID_PLAN", "POLICY_DENIED"]
    dispatchable: bool


class ExecutiveReport(StrictModel):
    completion_state: Literal["complete", "partial"]
    conclusions: tuple[ExecutiveConclusion, ...] = Field(max_length=48)
    unavailable_branches: tuple[str, ...] = Field(max_length=6)
