# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Callable, Mapping
from uuid import UUID, uuid4

from app.agentic.application.context_boundary import AuthorizedContextInput
from app.agentic.application.model_executor import ModelExecutionCommand
from app.agentic.application.ports import AgenticControlPort, DepartmentToolPort
from app.agentic.domain.execution_descriptor import (
    DescriptorExecutionInput,
    DescriptorExecutionReference,
    ExecutionDescriptorAuthority,
    ExecutionDescriptorView,
    ExecutionToolGrant,
    canonical_digest,
    descriptor_json,
)


class DepartmentExecutionError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class DepartmentExecutionService:
    def __init__(self, *, controls: AgenticControlPort, tools: DepartmentToolPort,
                 models: object, result_schemas: Mapping[str, Mapping[str, object]],
                 now: Callable[[], datetime] = lambda: datetime.now(UTC),
                 generate_id: Callable[[], str] = lambda: str(uuid4()),
                 parameters: Callable[[ExecutionToolGrant, ExecutionDescriptorAuthority],
                                      Mapping[str, object]] | None = None,
                 quality_context: Callable[[object, tuple[dict[str, object], ...]], object]
                 = lambda _descriptor, _results: object()) -> None:
        self._controls = controls
        self._tools = tools
        self._models = models
        self._schemas = result_schemas
        self._now = now
        self._generate_id = generate_id
        self._parameters = parameters or _materialize_parameters
        self._quality_context = quality_context

    async def execute(self, command: DescriptorExecutionInput) -> DescriptorExecutionReference:
        raw = await self._controls.load_execution_descriptor(
            str(command.descriptor_id), command.descriptor_digest
        )
        try:
            view = ExecutionDescriptorView.model_validate_json(json.dumps(raw))
            self._verify(command, view, raw)
        except DepartmentExecutionError:
            raise
        except (TypeError, ValueError) as error:
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID") from error

        tool_results: list[dict[str, object]] = []
        provenance_ids: list[str] = []
        descriptor = view.descriptor
        for grant in view.payload.tool_grants:
            result = await self._tools.invoke(descriptor.agent_kind, {
                "taskId": str(descriptor.task_id), "toolName": grant.name,
                "toolVersion": grant.version, "purpose": grant.purpose,
                "dataScope": grant.data_scope,
                "dataClassification": grant.data_classification,
                "modelId": descriptor.primary_model,
                "parameters": dict(self._parameters(grant, descriptor)),
                "idempotencyKey": f"{command.idempotency_key}:tool:{grant.name}:1",
                "correlationId": str(descriptor.task_id),
                "causationId": str(descriptor.subtask_id),
            })
            tool_results.append(dict(result))
            values = result.get("provenanceIds", ())
            if isinstance(values, list | tuple):
                provenance_ids.extend(value for value in values if isinstance(value, str))

        context = AuthorizedContextInput(
            classification="internal",
            fields={"summary": "Governed Department evidence", "evidence": tool_results},
        )
        outcome = await self._models.execute(ModelExecutionCommand(
            task_id=str(descriptor.task_id), agent_kind=descriptor.agent_kind,
            configuration_revision_id=str(descriptor.configuration_revision_id),
            primary_model=descriptor.primary_model, fallback_model=descriptor.fallback_model,
            input_digest=canonical_digest(tool_results), idempotency_key=command.idempotency_key,
            result_schema_name=descriptor.result_schema_name,
            result_schema=view.payload.result_schema, context=context,
            quality_context=self._quality_context(descriptor, tuple(tool_results)),
        ))
        status = "usable" if outcome.status == "completed" else "partial"
        accepted_at = self._now().astimezone(UTC).isoformat().replace("+00:00", "Z")
        await self._controls.accept_orchestration_result({
            "id": self._generate_id(), "taskId": str(descriptor.task_id),
            "planVersion": descriptor.plan_version, "subtaskId": str(descriptor.subtask_id),
            "resultDigest": outcome.output_digest,
            "qualityEvidenceDigest": canonical_digest({
                "status": outcome.status, "reasons": list(outcome.quality_reasons),
            }),
            "provenanceDigest": canonical_digest(sorted(set(provenance_ids))),
            "acceptedAt": accepted_at,
        })
        return DescriptorExecutionReference.model_validate({
            "status": status, "resultDigest": outcome.output_digest,
            "provenanceIds": tuple(UUID(value) for value in sorted(set(provenance_ids))),
        })

    def _verify(self, command: DescriptorExecutionInput, view: ExecutionDescriptorView,
                raw: Mapping[str, object]) -> None:
        descriptor = view.descriptor
        if (
            descriptor.id != command.descriptor_id
            or descriptor.descriptor_digest != command.descriptor_digest
            or descriptor.task_id != command.task_id
            or descriptor.plan_version != command.plan_version
            or descriptor.subtask_id != command.subtask_id
            or descriptor.agent_kind != command.agent_kind
        ):
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")
        if self._now() >= descriptor.expires_at:
            raise DepartmentExecutionError("DESCRIPTOR_EXPIRED")
        payload_json = raw.get("payload")
        raw_descriptor = raw.get("descriptor")
        if not isinstance(payload_json, dict) or not isinstance(raw_descriptor, dict):
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")
        if canonical_digest(payload_json) != descriptor.payload_digest:
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")
        draft = {key: value for key, value in raw_descriptor.items()
                 if key not in {"payloadDigest", "descriptorDigest"}}
        if canonical_digest({**draft, "payloadDigest": descriptor.payload_digest}) != descriptor.descriptor_digest:
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")
        if canonical_digest(view.payload.authorized_context) != descriptor.authorized_context_digest:
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")
        if canonical_digest([descriptor_json(item) for item in view.payload.tool_grants]) != descriptor.allowed_tools_digest:
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")
        local_schema = self._schemas.get(descriptor.result_schema_name)
        if local_schema is None or canonical_digest(local_schema) != descriptor.result_schema_digest:
            raise DepartmentExecutionError("RESULT_SCHEMA_BINDING_INVALID")
        if canonical_digest(view.payload.result_schema) != descriptor.result_schema_digest:
            raise DepartmentExecutionError("DESCRIPTOR_BINDING_INVALID")


def _materialize_parameters(
    grant: ExecutionToolGrant, descriptor: ExecutionDescriptorAuthority,
) -> Mapping[str, object]:
    if grant.parameter_template == "empty":
        return {}
    end = descriptor.created_at.astimezone(UTC)
    start = end - timedelta(hours=24)
    value: dict[str, object] = {
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
        "timezone": "Asia/Ho_Chi_Minh",
    }
    if grant.parameter_template == "evidence_window_24h":
        value["limit"] = 25
    return value
