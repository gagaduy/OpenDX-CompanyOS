# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Callable, Mapping
from uuid import NAMESPACE_URL, UUID, uuid5

from app.agentic.application.context_boundary import (
    AuthorizedContextInput,
    _AGENT_FIELDS,
)
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
        result_id = (
            self._generate_id() if self._generate_id is not None
            else str(uuid5(NAMESPACE_URL, f"{command.idempotency_key}:result"))
        )
        recovered = await self._controls.load_orchestration_settlement("result", result_id)
        if recovered.get("settled") is True:
            if (recovered.get("taskId") != str(command.task_id)
                or recovered.get("planVersion") != command.plan_version
                or recovered.get("subtaskId") != str(command.subtask_id)
                or recovered.get("agentKind") != command.agent_kind
                or recovered.get("descriptorId") != str(command.descriptor_id)
                or recovered.get("descriptorDigest") != command.descriptor_digest):
                raise DepartmentExecutionError("SETTLEMENT_RECOVERY_INVALID")
            return DescriptorExecutionReference.model_validate_json(json.dumps({
                "status": recovered.get("status"), "resultId": recovered.get("resultId"),
                "resultDigest": recovered.get("resultDigest"),
                "provenanceIds": recovered.get("provenanceIds"),
            }))
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

        descriptor = view.descriptor
        for position, collaboration in enumerate(command.collaborations):
            payload = descriptor_json(collaboration)
            evidence = {
                "resultId": str(collaboration.result_id),
                "resultDigest": collaboration.result_digest,
                "provenanceIds": sorted(str(value) for value in collaboration.provenance_ids),
            }
            redacted_payload_digest = canonical_digest(payload)
            idempotency_key = (
                f"phase-f:{command.task_id}:{command.plan_version}:"
                f"{collaboration.requester_subtask_id}:{command.subtask_id}"
            )
            try:
                acknowledged = await self._controls.mediate_collaboration({
                    "id": str(uuid5(NAMESPACE_URL, f"{idempotency_key}:collaboration")),
                    "taskId": str(command.task_id), "planVersion": command.plan_version,
                    "requester": collaboration.requester_agent_kind,
                    "requested": command.agent_kind,
                    "questionDigest": canonical_digest({
                        "purpose": collaboration.purpose,
                        "requesterSubtaskId": str(collaboration.requester_subtask_id),
                        "requestedSubtaskId": str(command.subtask_id),
                    }),
                    "purpose": collaboration.purpose,
                    "requestedDataClassification": collaboration.requested_data_classification,
                    "evidenceDigest": canonical_digest(evidence),
                    "redactedPayloadDigest": redacted_payload_digest,
                    "policyVersion": descriptor.policy_version,
                    "policyDecision": "ALLOW", "idempotencyKey": idempotency_key,
                    "createdAt": _timestamp(descriptor.created_at),
                })
            except Exception as error:
                code, retryable = _governed_failure(error, "COLLABORATION_FAILED")
                if retryable:
                    raise DepartmentExecutionError(code, retryable=True) from error
                return DescriptorExecutionReference(
                    status="unavailable",
                    result_digest=canonical_digest({
                        "status": "unavailable", "reasonCode": code,
                        "collaborationPosition": position,
                    }),
                    provenance_ids=(),
                )
            if acknowledged != redacted_payload_digest:
                raise DepartmentExecutionError("COLLABORATION_BINDING_INVALID")

        tool_results: list[dict[str, object]] = []
        tool_summaries: list[dict[str, object]] = []
        provenance_ids: list[str] = []
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

        merged_fields: dict[str, object] = {
            "summary": f"Governed {descriptor.agent_kind} department analysis",
            "riskLevel": "low",
        }
        for tr in tool_results:
            out = tr.get("output", {})
            if isinstance(out, Mapping):
                summ = out.get("summary")
                if isinstance(summ, Mapping):
                    merged_fields.update(dict(summ))
                elif isinstance(summ, str):
                    merged_fields["summary"] = summ
        allowed = _AGENT_FIELDS.get(descriptor.agent_kind, frozenset())
        sanitized_fields = {k: v for k, v in merged_fields.items() if k in allowed}
        if "summary" not in sanitized_fields:
            sanitized_fields["summary"] = f"Governed {descriptor.agent_kind} evidence"
        context = AuthorizedContextInput(
            classification="internal",
            fields=sanitized_fields,
        )
        try:
            outcome = await self._models.execute(ModelExecutionCommand(
                task_id=str(descriptor.task_id), agent_kind=descriptor.agent_kind,
                configuration_revision_id=str(descriptor.configuration_revision_id),
                primary_model=descriptor.primary_model, fallback_model=descriptor.fallback_model,
                input_digest=canonical_digest(tool_results), idempotency_key=command.idempotency_key,
            result_schema_name=descriptor.result_schema_name,
            result_schema=view.payload.result_schema, context=context,
            defer_terminal_settlement=True,
                quality_context=(
                    self._quality_context(descriptor, tuple(tool_results))
                    if self._quality_context is not None
                    else DepartmentResultQualityContext(
                        descriptor.agent_kind, 0, tuple(tool_summaries)
                    )
                ),
            ))
        except Exception as error:
            logging.getLogger("opendx.agentic").error("Department model execution failed for %s: %r", descriptor.agent_kind, error, exc_info=True)
            code, retryable = _governed_failure(error, "DEPARTMENT_MODEL_FAILED")
            if retryable:
                raise DepartmentExecutionError(code, retryable=True) from error
            return DescriptorExecutionReference(
                status="unavailable",
                result_digest=canonical_digest({
                    "status": "unavailable", "reasonCode": code,
                }),
                provenance_ids=tuple(
                    UUID(value) for value in sorted(set(provenance_ids))
                ),
            )
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
        accepted_at = _timestamp(descriptor.created_at)
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
            "modelSettlement": _model_settlement_json(outcome),
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
        plan_id = str(uuid5(NAMESPACE_URL, f"{command.idempotency_key}:plan"))
        recovered = await self._controls.load_orchestration_settlement("plan", plan_id)
        if recovered.get("settled") is True:
            if (recovered.get("taskId") != str(command.task_id)
                or recovered.get("planVersion") != 1):
                raise DepartmentExecutionError("SETTLEMENT_RECOVERY_INVALID")
            return PlanningExecutionReference.model_validate_json(json.dumps({
                "taskId": str(command.task_id), "planVersion": recovered.get("planVersion"),
                "planDigest": recovered.get("planDigest"),
            }))
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
            defer_terminal_settlement=True,
            quality_context=PlanningQualityContext(
                frozenset(eligible), provenance_ids,
            ),
        ))
        await _settle_rejected_deferred_outcome(self._controls, outcome)
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
                    data_scope=assignment["dataScope"],
                    freshness_seconds=assignment["freshnessSeconds"],
                    timeout_seconds=assignment["timeoutSeconds"],
                    budget_micros=assignment["budgetMicros"],
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
            "id": plan_id,
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
        submission["modelSettlement"] = _model_settlement_json(outcome)
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
        report_id = str(uuid5(NAMESPACE_URL, f"{command.idempotency_key}:report"))
        branches = [descriptor_json(branch, exclude={"result_id"}) | (
            {} if branch.result_id is None else {"resultId": str(branch.result_id)}
        ) for branch in command.branches]
        synthesis_branches_digest = canonical_digest(branches)
        recovered = await self._controls.load_orchestration_settlement("report", report_id)
        if recovered.get("settled") is True:
            if (recovered.get("taskId") != str(command.task_id)
                or recovered.get("planVersion") != command.plan_version
                or recovered.get("synthesisBranchesDigest") != synthesis_branches_digest):
                raise DepartmentExecutionError("SETTLEMENT_RECOVERY_INVALID")
            return SynthesisExecutionReference.model_validate_json(json.dumps({
                "completionState": recovered.get("completionState"),
                "reportDigest": recovered.get("reportDigest"),
            }))
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
            "resultId": str(item["resultId"]), "subtaskId": str(item["subtaskId"]),
            "resultDigest": str(item["resultDigest"]),
        } for item in accepted if isinstance(item, Mapping))
        unavailable_references = tuple({
            "subtaskId": str(item["subtaskId"]), "reasonCode": str(item.get("reasonCode", "DEPARTMENT_UNAVAILABLE")),
        } for item in unavailable if isinstance(item, Mapping))
        provenance = tuple(sorted({
            str(value) for item in (*accepted, *unavailable) if isinstance(item, Mapping)
            for value in item.get("provenanceIds", ())
            if value is not None
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
        synthesis_input_digest = canonical_digest(
            _mutable_json(model_context.authorized_context)
        )
        outcome = await self._models.execute(ModelExecutionCommand(
            task_id=str(command.task_id), agent_kind="ai_ceo",
            configuration_revision_id=str(authority.configuration_revision_id),
            primary_model=authority.primary_model, fallback_model=authority.fallback_model,
            input_digest=synthesis_input_digest,
            idempotency_key=command.idempotency_key,
            result_schema_name=authority.result_schema_name,
            result_schema=view.payload.result_schema, context=model_context,
            defer_terminal_settlement=True,
            quality_context=ExecutiveSynthesisQualityContext(
                0, accepted_references, unavailable_references, provenance,
                partial_result_ids=partial_ids,
            ),
        ))
        await _settle_rejected_deferred_outcome(self._controls, outcome)
        report = _accepted_result(outcome, "AI_CEO_SYNTHESIS_UNAVAILABLE")
        completion = report.get("completionState")
        if completion not in {"complete", "partial", "quality_escalated", "canceled"}:
            raise DepartmentExecutionError("EXECUTIVE_REPORT_BINDING_INVALID")
        material = (
            *report.get("conclusions", []), *report.get("risks", []),
            *report.get("recommendedActions", []), *report.get("conflicts", []),
        )
        conclusion_ids = sorted({
            str(value) for item in material if isinstance(item, Mapping)
            for value in item.get("provenanceIds", ())
            if value is not None
        })
        unavailable_report = report.get("unavailableBranches")
        if type(unavailable_report) is not list:
            raise DepartmentExecutionError("EXECUTIVE_REPORT_BINDING_INVALID")
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
            "synthesisBranchesDigest": synthesis_branches_digest,
            "synthesisBranches": branches,
            "approvalHistoryDigest": settlement.get("approvalHistoryDigest"),
            "createdAt": _timestamp(authority.created_at), "report": report,
            "modelSettlement": _model_settlement_json(outcome),
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
    if getattr(outcome, "status", None) not in ("completed", "partial"):
        raise DepartmentExecutionError(unavailable_code)
    content = _mutable_json(getattr(outcome, "accepted_content", None))
    digest = getattr(outcome, "output_digest", None)
    if not isinstance(content, dict) or canonical_digest(content) != digest:
        raise DepartmentExecutionError("MODEL_RESULT_BINDING_INVALID")
    return content


async def _settle_rejected_deferred_outcome(
    controls: AgenticControlPort, outcome: object,
) -> None:
    if getattr(outcome, "status", None) in ("completed", "partial"):
        return
    terminal = getattr(outcome, "deferred_terminal_settlement", None)
    if terminal is not None:
        await controls.complete_model_run(terminal)


def _governed_failure(error: Exception, fallback_code: str) -> tuple[str, bool]:
    code = getattr(error, "code", None)
    retryable = getattr(error, "retryable", None)
    if type(code) is str and type(retryable) is bool:
        return code, retryable
    return fallback_code, False


def _model_settlement_json(outcome: object) -> dict[str, object]:
    settlement = getattr(outcome, "terminal_settlement", None)
    if settlement is None:
        raise DepartmentExecutionError("MODEL_RESULT_BINDING_INVALID")
    return {
        "runId": settlement.run_id,
        "expectedVersion": settlement.expected_version,
        "idempotencyKey": settlement.idempotency_key,
        "status": settlement.status,
        "outputDigest": settlement.output_digest,
        "inputTokens": settlement.input_tokens,
        "outputTokens": settlement.output_tokens,
        "providerRequestIdDigest": settlement.provider_request_id_digest,
        "latencyMs": settlement.latency_ms,
        "statusCode": settlement.status_code,
        "qualityOutcome": settlement.quality_outcome,
        "qualityReasonCodes": list(settlement.quality_reason_codes),
        "provenanceIds": list(settlement.provenance_ids),
        "evidenceDigest": settlement.evidence_digest,
    }


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
