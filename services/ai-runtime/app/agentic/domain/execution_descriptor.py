# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.agentic.domain.orchestration_schemas import DepartmentAgentKind


Digest = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


def _camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(item.capitalize() for item in tail)


class DescriptorModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, strict=True, alias_generator=_camel,
        populate_by_name=True,
    )


class DescriptorExecutionInput(DescriptorModel):
    descriptor_id: UUID
    descriptor_digest: Digest
    task_id: UUID
    plan_version: int = Field(gt=0)
    subtask_id: UUID
    agent_kind: DepartmentAgentKind
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class DescriptorExecutionReference(DescriptorModel):
    status: Literal["usable", "partial", "unavailable"]
    result_digest: Digest
    provenance_ids: tuple[UUID, ...] = Field(max_length=24)


class ExecutionToolGrant(DescriptorModel):
    name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    version: Literal[1]
    purpose: Literal["store_health_review"]
    data_scope: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    data_classification: Literal["internal", "confidential", "restricted"]
    maximum_invocations: int = Field(gt=0)
    parameter_template: Literal["empty", "aggregate_window_24h", "evidence_window_24h"]


class ExecutionDescriptorAuthority(DescriptorModel):
    id: UUID
    version: Literal[1]
    task_id: UUID
    plan_version: int = Field(gt=0)
    subtask_id: UUID
    agent_kind: DepartmentAgentKind
    configuration_revision_id: UUID
    policy_version: int = Field(gt=0)
    primary_model: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    fallback_model: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    result_schema_name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    result_schema_digest: Digest
    authorized_context_digest: Digest
    allowed_tools_digest: Digest
    budget_authorization_micros: int = Field(gt=0)
    timeout_seconds: int = Field(gt=0)
    freshness_seconds: int = Field(gt=0)
    expires_at: datetime
    payload_digest: Digest
    descriptor_digest: Digest
    created_at: datetime


class ExecutionDescriptorPayload(DescriptorModel):
    task_brief: dict[str, object]
    result_schema: dict[str, object]
    authorized_context: tuple[dict[str, object], ...] = Field(max_length=128)
    tool_grants: tuple[ExecutionToolGrant, ...] = Field(min_length=1, max_length=32)


class ExecutionDescriptorView(DescriptorModel):
    descriptor: ExecutionDescriptorAuthority
    payload: ExecutionDescriptorPayload


def canonical_digest(value: object) -> str:
    encoded = json.dumps(
        value, ensure_ascii=False, allow_nan=False, sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def descriptor_json(model: BaseModel, *, exclude: set[str] | None = None) -> dict[str, object]:
    return model.model_dump(mode="json", by_alias=True, exclude=exclude)
