# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.agentic.domain.execution_descriptor import canonical_digest
from app.agentic.domain.model_runtime import FrozenJsonMapping


Digest = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
SafeIdentifier = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$")]
AiCeoExecutionPurpose = Literal["orchestration_planning", "executive_synthesis"]
_SENSITIVE_KEY = re.compile(r"(apikey|accesskey|authorization|credential|password|privatekey|secret|token)")
_DEPARTMENTS = ["catalog", "inventory", "order", "finance", "crm", "support"]


def _camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(item.capitalize() for item in tail)


class AiCeoModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, strict=True, alias_generator=_camel,
        populate_by_name=True, arbitrary_types_allowed=True,
    )


class AiCeoExecutionAuthority(AiCeoModel):
    id: UUID
    version: int = Field(gt=0)
    purpose: AiCeoExecutionPurpose
    task_id: UUID
    plan_version: int | None = Field(default=None, gt=0)
    configuration_revision_id: UUID
    policy_version: int = Field(gt=0)
    primary_model: SafeIdentifier
    fallback_model: SafeIdentifier
    result_schema_name: SafeIdentifier
    result_schema_digest: Digest
    authorized_context_digest: Digest
    budget_authorization_micros: int = Field(gt=0)
    timeout_seconds: int = Field(gt=0)
    created_at: datetime
    expires_at: datetime
    payload_digest: Digest
    authority_digest: Digest

    @model_validator(mode="after")
    def validate_purpose_binding(self) -> AiCeoExecutionAuthority:
        if self.created_at.tzinfo is None or self.expires_at.tzinfo is None:
            raise ValueError("AI_CEO_EXECUTION_AUTHORITY_INVALID")
        if self.expires_at <= self.created_at:
            raise ValueError("AI_CEO_EXECUTION_AUTHORITY_INVALID")
        if (self.purpose == "orchestration_planning") != (self.plan_version is None):
            raise ValueError("AI_CEO_EXECUTION_AUTHORITY_INVALID")
        return self


class AiCeoExecutionPayload(AiCeoModel):
    result_schema: Mapping[str, object]
    authorized_context: Mapping[str, object]

    @field_validator("result_schema", "authorized_context", mode="after")
    @classmethod
    def validate_json_mapping(cls, value: object) -> FrozenJsonMapping:
        if not isinstance(value, Mapping):
            raise ValueError("AI_CEO_EXECUTION_PAYLOAD_INVALID")
        _inspect_json(value, 0, set())
        return FrozenJsonMapping(value)


class AiCeoExecutionView(AiCeoModel):
    authority: AiCeoExecutionAuthority
    payload: AiCeoExecutionPayload


def verify_ai_ceo_execution(view: AiCeoExecutionView) -> None:
    payload = {
        "resultSchema": _json_value(view.payload.result_schema),
        "authorizedContext": _json_value(view.payload.authorized_context),
    }
    authority = view.authority.model_dump(
        mode="json", by_alias=True, exclude={"authority_digest"}, exclude_none=True,
    )
    authority["createdAt"] = _canonical_timestamp(view.authority.created_at)
    authority["expiresAt"] = _canonical_timestamp(view.authority.expires_at)
    expected_name = (
        "orchestration_plan_proposal_v1"
        if view.authority.purpose == "orchestration_planning"
        else "store_health_ai_ceo_report_v1"
    )
    expected_schema = AI_CEO_RESULT_SCHEMAS[expected_name]
    if (
        view.authority.result_schema_name != expected_name
        or canonical_digest(expected_schema) != view.authority.result_schema_digest
        or payload["resultSchema"] != expected_schema
        or
        canonical_digest(payload["resultSchema"]) != view.authority.result_schema_digest
        or canonical_digest(payload["authorizedContext"]) != view.authority.authorized_context_digest
        or canonical_digest(payload) != view.authority.payload_digest
        or canonical_digest(authority) != view.authority.authority_digest
    ):
        raise ValueError("AI_CEO_EXECUTION_AUTHORITY_INVALID")


def _json_value(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _json_value(item) for key, item in value.items()}
    if type(value) in (list, tuple):
        return [_json_value(item) for item in value]
    return value


def _canonical_timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _inspect_json(value: object, depth: int, active: set[int]) -> None:
    if depth > 16:
        raise ValueError("AI_CEO_EXECUTION_PAYLOAD_INVALID")
    if value is None or type(value) in (str, bool, int, float):
        return
    if not isinstance(value, (Mapping, list, tuple)) or id(value) in active:
        raise ValueError("AI_CEO_EXECUTION_PAYLOAD_INVALID")
    active.add(id(value))
    try:
        if isinstance(value, Mapping):
            for key, item in value.items():
                if type(key) is not str or _SENSITIVE_KEY.search(re.sub(r"[^a-z]", "", key.lower())):
                    raise ValueError("AI_CEO_EXECUTION_PAYLOAD_INVALID")
                _inspect_json(item, depth + 1, active)
        else:
            for item in value:
                _inspect_json(item, depth + 1, active)
    finally:
        active.remove(id(value))


def _strict(properties: dict[str, object]) -> dict[str, object]:
    return {"type": "object", "additionalProperties": False,
            "required": list(properties), "properties": properties}


def _string(maximum: int) -> dict[str, object]:
    return {"type": "string", "minLength": 1, "maxLength": maximum}


def _uuid() -> dict[str, object]:
    return {"type": "string", "format": "uuid"}


def _digest() -> dict[str, object]:
    return {"type": "string", "pattern": "^[a-f0-9]{64}$"}


def _reason() -> dict[str, object]:
    return {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{0,99}$"}


def _provenance() -> dict[str, object]:
    return {"type": "array", "minItems": 1, "maxItems": 8, "items": _uuid()}


def _conclusion() -> dict[str, object]:
    return _strict({"code": _reason(), "statement": _string(1_000),
                    "provenanceIds": _provenance()})


AI_CEO_RESULT_SCHEMAS: Mapping[str, Mapping[str, object]] = {
    "orchestration_plan_proposal_v1": _strict({
        "schemaVersion": {"type": "integer", "const": 1},
        "subtasks": {"type": "array", "minItems": 1, "maxItems": 6,
                     "items": _strict({
                         "owner": {"type": "string", "enum": _DEPARTMENTS},
                         "dependencies": {"type": "array", "maxItems": 0,
                                          "items": {"type": "string", "enum": _DEPARTMENTS}},
                     })},
    }),
    "store_health_ai_ceo_report_v1": _strict({
        "schemaVersion": {"type": "integer", "const": 1},
        "completionState": {"type": "string", "enum": [
            "complete", "partial", "quality_escalated", "canceled",
        ]},
        "summary": _string(2_000),
        "conclusions": {"type": "array", "maxItems": 12, "items": _conclusion()},
        "risks": {"type": "array", "maxItems": 12, "items": _strict({
            "code": _reason(), "statement": _string(1_000),
            "provenanceIds": _provenance(),
            "severity": {"type": "string", "enum": ["low", "medium", "high"]},
        })},
        "recommendedActions": {"type": "array", "maxItems": 12, "items": _strict({
            "code": _reason(), "statement": _string(1_000),
            "provenanceIds": _provenance(), "requiresHumanApproval": {"type": "boolean"},
        })},
        "conflicts": {"type": "array", "maxItems": 12, "items": _conclusion()},
        "acceptedResultReferences": {"type": "array", "maxItems": 6,
                                     "items": _strict({
                                         "resultId": _uuid(), "subtaskId": _uuid(),
                                         "resultDigest": _digest(),
                                     })},
        "unavailableBranches": {"type": "array", "maxItems": 6,
                                "items": _strict({
                                    "subtaskId": _uuid(), "reasonCode": _reason(),
                                })},
    }),
}
