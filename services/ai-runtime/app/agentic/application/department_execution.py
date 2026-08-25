# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Callable, Mapping
from uuid import NAMESPACE_URL, UUID, uuid5

from app.agentic.application.context_boundary import AuthorizedContextInput
from app.agentic.application.model_executor import ModelExecutionCommand
from app.agentic.application.phase_f_context import PhaseFContext, build_phase_f_context
from app.agentic.application.ports import (
    AgentSubmissionPort,
    AgenticControlPort,
    DepartmentToolPort,
)
from app.agentic.application.quality_gate import (
    DepartmentResultQualityContext,
    ExecutiveSynthesisQualityContext,
    PlanningQualityContext,
)
from app.agentic.domain.ai_ceo_execution import AiCeoExecutionView
from app.agentic.domain.execution_descriptor import (
    DescriptorExecutionInput,
    DescriptorExecutionReference,
    ExecutionDescriptorAuthority,
    ExecutionDescriptorView,
    ExecutionToolGrant,
    PlanningExecutionInput,
    PlanningExecutionReference,
    SynthesisExecutionInput,
    SynthesisExecutionReference,
    canonical_digest,
    descriptor_json,
)
from app.agentic.domain.orchestration_schemas import (
    OrchestrationPlan,
    PlannedSubtask,
)
from app.agentic.application.orchestration import OrchestrationPlanner


class DepartmentExecutionError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class DepartmentExecutionService:
    def __init__(self, *, controls: AgenticControlPort, tools: DepartmentToolPort,
                 models: object, result_schemas: Mapping[str, Mapping[str, object]],
                 now: Callable[[], datetime] = lambda: datetime.now(UTC),
                 generate_id: Callable[[], str] | None = None,
                 parameters: Callable[[ExecutionToolGrant, ExecutionDescriptorAuthority],
                                      Mapping[str, object]] | None = None,
                 quality_context: Callable[[object, tuple[dict[str, object], ...]], object]
                 | None = None) -> None:
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
        tool_summaries: list[dict[str, object]] = []
        provenance_ids: list[str] = []
        descriptor = view.descriptor
        for grant in view.payload.tool_grants:
            try:
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
            except Exception as error:
                code = getattr(error, "code", "DEPARTMENT_TOOL_FAILED")
                retryable = getattr(error, "retryable", False)
                if type(code) is not str or type(retryable) is not bool:
                    code, retryable = "DEPARTMENT_TOOL_FAILED", False
                if retryable:
                    raise DepartmentExecutionError(code, retryable=True) from error
                return DescriptorExecutionReference(
                    status="unavailable",
                    result_digest=canonical_digest({"status": "unavailable", "reasonCode": code}),
                    provenance_ids=(),
                )
            output = result.get("output")
            values = result.get("provenanceIds")
            if (
                not isinstance(output, Mapping)
                or type(values) not in (list, tuple)
                or len(values) != 1
                or type(values[0]) is not str
                or output.get("provenanceId") != values[0]
                or "summary" not in output
            ):
                raise DepartmentExecutionError("DEPARTMENT_TOOL_RESPONSE_INVALID")
            tool_results.append({"toolName": grant.name, "output": dict(output)})
            provenance_ids.append(values[0])
            tool_summaries.append({
                "toolName": grant.name,
                "provenanceId": values[0],
                "summaryDigest": canonical_digest(output["summary"]),
            })

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
            quality_context=(
                self._quality_context(descriptor, tuple(tool_results))
                if self._quality_context is not None
                else DepartmentResultQualityContext(
                    descriptor.agent_kind, 0, tuple(tool_summaries)
                )
            ),
        ))
        if outcome.status == "escalated":
            return DescriptorExecutionReference(
                status="unavailable", result_digest=outcome.output_digest,
                provenance_ids=tuple(UUID(value) for value in sorted(set(provenance_ids))),
            )
        status = "usable" if outcome.status == "completed" else "partial"
        if outcome.accepted_content is None or outcome.quality_evidence_digest is None:
            raise DepartmentExecutionError("MODEL_RESULT_BINDING_INVALID")
        accepted_result = _mutable_json(outcome.accepted_content)
        if not isinstance(accepted_result, dict) or canonical_digest(accepted_result) != outcome.output_digest:
            raise DepartmentExecutionError("MODEL_RESULT_BINDING_INVALID")
        accepted_at = self._now().astimezone(UTC).isoformat(
            timespec="milliseconds"
        ).replace("+00:00", "Z")
        result_id = (
            self._generate_id() if self._generate_id is not None
            else str(uuid5(NAMESPACE_URL, f"{command.idempotency_key}:result"))
        )
        await self._controls.accept_orchestration_result({
            "id": result_id, "taskId": str(descriptor.task_id),
            "planVersion": descriptor.plan_version, "subtaskId": str(descriptor.subtask_id),
            "descriptorId": str(descriptor.id),
            "descriptorDigest": descriptor.descriptor_digest,
            "resultDigest": outcome.output_digest,
            "qualityEvidenceDigest": outcome.quality_evidence_digest,
            "provenanceDigest": canonical_digest(sorted(set(provenance_ids))),
            "acceptedAt": accepted_at,
            "result": accepted_result,
        })
        return DescriptorExecutionReference.model_validate({
            "status": status, "resultId": UUID(result_id),
            "resultDigest": outcome.output_digest,
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


class AiCeoPlanningService:
    def __init__(
        self, *, controls: AgenticControlPort, models: object,
        submissions: AgentSubmissionPort, ai_ceo_client_id: str,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._controls = controls
        self._models = models
        self._submissions = submissions
        self._client_id = ai_ceo_client_id
        self._now = now

    async def plan(self, command: PlanningExecutionInput) -> PlanningExecutionReference:
        brief = await self._controls.load_task_brief(str(command.task_id))
        authority_reference = brief.get("planningAuthority")
        if not isinstance(authority_reference, Mapping):
            raise DepartmentExecutionError("AI_CEO_AUTHORITY_BINDING_INVALID")
        raw_authority = await self._controls.load_ai_ceo_execution_authority(
            str(authority_reference.get("authorityId")),
            str(authority_reference.get("authorityDigest")),
        )
        view = _ai_ceo_view(raw_authority)
        context = build_phase_f_context(view)
        authority = view.authority
        brief_without_reference = {
            key: value for key, value in brief.items() if key != "planningAuthority"
        }
        if (
            authority.purpose != "orchestration_planning"
            or authority.task_id != command.task_id
            or str(authority.id) != authority_reference.get("authorityId")
            or authority.authority_digest != authority_reference.get("authorityDigest")
            or _mutable_json(context.authorized_context) != {
                "taskBrief": brief_without_reference
            }
            or self._now() >= authority.expires_at
        ):
            raise DepartmentExecutionError("AI_CEO_AUTHORITY_BINDING_INVALID")
        assignments = brief.get("eligibleAssignments")
        provenance = brief.get("provenance")
        if type(assignments) is not list or type(provenance) is not list:
            raise DepartmentExecutionError("TASK_BRIEF_INVALID")
        eligible = {
            item.get("agentKind"): item
            for item in assignments if isinstance(item, Mapping)
        }
        if not eligible or None in eligible:
            raise DepartmentExecutionError("TASK_BRIEF_INVALID")
        provenance_ids = tuple(
            str(item.get("id")) for item in provenance if isinstance(item, Mapping)
        )
        if len(provenance_ids) != len(provenance) or not provenance_ids:
            raise DepartmentExecutionError("TASK_BRIEF_INVALID")
        outcome = await self._models.execute(ModelExecutionCommand(
            task_id=str(command.task_id), agent_kind="ai_ceo",
            configuration_revision_id=str(authority.configuration_revision_id),
            primary_model=authority.primary_model, fallback_model=authority.fallback_model,
            input_digest=authority.authorized_context_digest,
            idempotency_key=command.idempotency_key,
            result_schema_name=authority.result_schema_name,
            result_schema=view.payload.result_schema, context=context,
            quality_context=PlanningQualityContext(
                frozenset(eligible), provenance_ids,
            ),
        ))
        proposal = _accepted_result(outcome, "AI_CEO_PLANNING_UNAVAILABLE")
        subtasks_value = proposal.get("subtasks")
        if type(subtasks_value) is not list:
            raise DepartmentExecutionError("INVALID_PLAN")
        owner_ids = {
            str(item.get("owner")): str(uuid5(
                NAMESPACE_URL, f"{command.idempotency_key}:subtask:{item.get('owner')}"
            ))
            for item in subtasks_value if isinstance(item, Mapping)
        }
        if len(owner_ids) != len(subtasks_value):
            raise DepartmentExecutionError("INVALID_PLAN")
        source_digest = canonical_digest(provenance)
        planned: list[PlannedSubtask] = []
        for item in subtasks_value:
            if not isinstance(item, Mapping):
                raise DepartmentExecutionError("INVALID_PLAN")
            owner = item.get("owner")
            assignment = eligible.get(owner)
            dependencies = item.get("dependencies")
            if not isinstance(assignment, Mapping) or type(dependencies) is not list:
                raise DepartmentExecutionError("INVALID_PLAN")
            try:
                planned.append(PlannedSubtask(
                    id=owner_ids[str(owner)], owner=owner,
                    dependencies=tuple(owner_ids[str(value)] for value in dependencies),
                    expected_result_schema_digest=assignment["resultSchemaDigest"],
                    allowed_tools_digest=assignment["allowedToolsDigest"],
                    data_scope=f"{owner}:health:read", freshness_seconds=300,
                    timeout_seconds=30, budget_micros=10_000,
                    source_provenance_digest=source_digest,
                ))
            except (KeyError, TypeError, ValueError) as error:
                raise DepartmentExecutionError("INVALID_PLAN") from error
        plan_model = OrchestrationPlan(
            task_id=str(command.task_id), version=1, digest="0" * 64,
            subtasks=tuple(planned),
        )
        decision = OrchestrationPlanner(frozenset(eligible)).validate(plan_model)
        if not decision.dispatchable:
            raise DepartmentExecutionError(decision.code)
        submission: dict[str, object] = {
            "id": str(uuid5(NAMESPACE_URL, f"{command.idempotency_key}:plan")),
            "taskId": str(command.task_id), "version": 1,
            "taskBriefDigest": brief.get("digest"),
            "planningAuthorityId": str(authority.id),
            "planningAuthorityDigest": authority.authority_digest,
            "policyVersion": authority.policy_version,
            "configurationRevisionId": str(authority.configuration_revision_id),
            "createdBy": self._client_id,
            "createdAt": _timestamp(authority.created_at),
            "subtasks": [_planned_subtask_json(item) for item in planned],
        }
        submission["digest"] = canonical_digest(submission)
        await self._submissions.accept_plan(submission)
        return PlanningExecutionReference(
            task_id=command.task_id, plan_version=1,
            plan_digest=str(submission["digest"]),
        )


class AiCeoSynthesisService:
    def __init__(
        self, *, controls: AgenticControlPort, models: object,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._controls = controls
        self._models = models
        self._now = now

    async def synthesize(
        self, command: SynthesisExecutionInput
    ) -> SynthesisExecutionReference:
        branches = [descriptor_json(branch, exclude={"result_id"}) | (
            {} if branch.result_id is None else {"resultId": str(branch.result_id)}
        ) for branch in command.branches]
        resolved = await self._controls.load_synthesis_context({
            "taskId": str(command.task_id), "planVersion": command.plan_version,
            "branches": branches,
        })
        reference = resolved.get("authority")
        if not isinstance(reference, Mapping):
            raise DepartmentExecutionError("AI_CEO_AUTHORITY_BINDING_INVALID")
        raw_authority = await self._controls.load_ai_ceo_execution_authority(
            str(reference.get("authorityId")), str(reference.get("authorityDigest")),
        )
        view = _ai_ceo_view(raw_authority)
        verified_context = build_phase_f_context(view)
        authority = view.authority
        if (
            authority.purpose != "executive_synthesis"
            or authority.task_id != command.task_id
            or authority.plan_version != command.plan_version
            or str(authority.id) != reference.get("authorityId")
            or authority.authority_digest != reference.get("authorityDigest")
            or self._now() >= authority.expires_at
        ):
            raise DepartmentExecutionError("AI_CEO_AUTHORITY_BINDING_INVALID")
        accepted = resolved.get("acceptedResults")
        unavailable = resolved.get("unavailableBranches")
        if type(accepted) is not list or type(unavailable) is not list:
            raise DepartmentExecutionError("SYNTHESIS_CONTEXT_INVALID")
        expected_branches = sorted(branches, key=lambda item: str(item["subtaskId"]))
        resolved_branches = sorted([
            {
                "subtaskId": item.get("subtaskId"), "status": item.get("status"),
                "resultId": item.get("resultId"),
                "resultDigest": item.get("resultDigest"),
                "provenanceIds": item.get("provenanceIds"),
            }
            for item in accepted if isinstance(item, Mapping)
        ] + [
            {
                "subtaskId": item.get("subtaskId"), "status": "unavailable",
                "resultDigest": item.get("resultDigest"),
                "provenanceIds": item.get("provenanceIds"),
            }
            for item in unavailable if isinstance(item, Mapping)
        ], key=lambda item: str(item["subtaskId"]))
        if resolved_branches != expected_branches:
            raise DepartmentExecutionError("SYNTHESIS_CONTEXT_INVALID")
        accepted_references = tuple({
            "resultId": item["resultId"], "subtaskId": item["subtaskId"],
            "resultDigest": item["resultDigest"],
        } for item in accepted if isinstance(item, Mapping))
        unavailable_references = tuple({
            "subtaskId": item["subtaskId"], "reasonCode": "DEPARTMENT_UNAVAILABLE",
        } for item in unavailable if isinstance(item, Mapping))
        provenance = tuple(sorted({
            value for item in accepted if isinstance(item, Mapping)
            for value in item.get("provenanceIds", ()) if type(value) is str
        }))
        partial_ids = tuple(
            str(item["resultId"]) for item in accepted
            if isinstance(item, Mapping) and item.get("status") == "partial"
        )
        base_context = _mutable_json(verified_context.authorized_context)
        if not isinstance(base_context, dict):
            raise DepartmentExecutionError("SYNTHESIS_CONTEXT_INVALID")
        unavailable_context = [
            {**item, "reasonCode": "DEPARTMENT_UNAVAILABLE"}
            for item in unavailable
        ]
        model_context = PhaseFContext("executive_synthesis", {
            **base_context, "branches": [*accepted, *unavailable_context],
        })
        outcome = await self._models.execute(ModelExecutionCommand(
            task_id=str(command.task_id), agent_kind="ai_ceo",
            configuration_revision_id=str(authority.configuration_revision_id),
            primary_model=authority.primary_model, fallback_model=authority.fallback_model,
            input_digest=canonical_digest(_mutable_json(model_context.authorized_context)),
            idempotency_key=command.idempotency_key,
            result_schema_name=authority.result_schema_name,
            result_schema=view.payload.result_schema, context=model_context,
            quality_context=ExecutiveSynthesisQualityContext(
                0, accepted_references, unavailable_references, provenance,
                partial_result_ids=partial_ids,
            ),
        ))
        report = _accepted_result(outcome, "AI_CEO_SYNTHESIS_UNAVAILABLE")
        completion = report.get("completionState")
        if completion not in {"complete", "partial", "quality_escalated", "canceled"}:
            raise DepartmentExecutionError("EXECUTIVE_REPORT_BINDING_INVALID")
        material = (
            *report.get("conclusions", []), *report.get("risks", []),
            *report.get("recommendedActions", []), *report.get("conflicts", []),
        )
        conclusion_ids = sorted({
            value for item in material if isinstance(item, Mapping)
            for value in item.get("provenanceIds", ()) if type(value) is str
        })
        unavailable_report = report.get("unavailableBranches")
        if type(unavailable_report) is not list:
            raise DepartmentExecutionError("EXECUTIVE_REPORT_BINDING_INVALID")
        report_id = str(uuid5(NAMESPACE_URL, f"{command.idempotency_key}:report"))
        settlement = await self._controls.load_synthesis_context({
            "taskId": str(command.task_id), "planVersion": command.plan_version,
            "branches": branches,
        })
        if settlement.get("authority") != resolved.get("authority"):
            raise DepartmentExecutionError("AI_CEO_AUTHORITY_BINDING_INVALID")
        body = {
            "id": report_id, "taskId": str(command.task_id),
            "planVersion": command.plan_version, "reportDigest": outcome.output_digest,
            "authorityId": str(authority.id), "authorityDigest": authority.authority_digest,
            "completionState": completion,
            "conclusionProvenanceDigest": canonical_digest(conclusion_ids),
            "unavailableBranchesDigest": canonical_digest(sorted(
                unavailable_report, key=lambda item: str(item["subtaskId"])
            )),
            "costMicros": settlement.get("costMicros"),
            "approvalHistoryDigest": settlement.get("approvalHistoryDigest"),
            "createdAt": _timestamp(authority.created_at), "report": report,
        }
        await self._controls.accept_executive_report(body)
        return SynthesisExecutionReference(
            completion_state=completion, report_digest=outcome.output_digest,
        )


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


def _mutable_json(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _mutable_json(item) for key, item in value.items()}
    if type(value) in (tuple, list):
        return [_mutable_json(item) for item in value]
    return value


def _ai_ceo_view(raw: object) -> AiCeoExecutionView:
    try:
        return AiCeoExecutionView.model_validate_json(json.dumps(raw))
    except (TypeError, ValueError) as error:
        raise DepartmentExecutionError("AI_CEO_AUTHORITY_BINDING_INVALID") from error


def _accepted_result(outcome: object, unavailable_code: str) -> dict[str, object]:
    if getattr(outcome, "status", None) != "completed":
        raise DepartmentExecutionError(unavailable_code)
    content = _mutable_json(getattr(outcome, "accepted_content", None))
    digest = getattr(outcome, "output_digest", None)
    if not isinstance(content, dict) or canonical_digest(content) != digest:
        raise DepartmentExecutionError("MODEL_RESULT_BINDING_INVALID")
    return content


def _timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _planned_subtask_json(item: PlannedSubtask) -> dict[str, object]:
    return {
        "id": item.id, "owner": item.owner,
        "expectedResultSchemaDigest": item.expected_result_schema_digest,
        "allowedToolsDigest": item.allowed_tools_digest,
        "dataScope": item.data_scope, "freshnessSeconds": item.freshness_seconds,
        "timeoutSeconds": item.timeout_seconds, "budgetMicros": item.budget_micros,
        "sourceProvenanceDigest": item.source_provenance_digest,
        "dependencies": list(item.dependencies),
    }
