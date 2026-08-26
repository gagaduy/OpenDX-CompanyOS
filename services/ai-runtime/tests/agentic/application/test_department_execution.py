# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import asyncio
from datetime import UTC, datetime
from uuid import UUID

import pytest

from app.agentic.application.department_execution import (
    AiCeoPlanningService,
    AiCeoSynthesisService,
    DepartmentExecutionError,
    DepartmentExecutionService,
)
from app.agentic.domain.ai_ceo_execution import AI_CEO_RESULT_SCHEMAS
from app.agentic.domain.execution_descriptor import (
    DescriptorCollaborationReference,
    DescriptorExecutionInput,
    PlanningExecutionInput,
    SynthesisBranchReference,
    SynthesisExecutionInput,
    canonical_digest,
)
from app.agentic.domain.store_health_result_schemas import STORE_HEALTH_RESULT_SCHEMAS
from app.agentic.application.ports import CompleteModelRunRequest


class Control:
    def __init__(self, descriptor: dict[str, object]) -> None:
        self.descriptor = descriptor
        self.results: list[dict[str, object]] = []
        self.collaborations: list[dict[str, object]] = []

    async def load_orchestration_settlement(
        self, _kind: str, _settlement_id: str
    ) -> dict[str, object]:
        return {"settled": False}

    async def load_execution_descriptor(self, _id: str, _digest: str) -> dict[str, object]:
        return self.descriptor

    async def accept_orchestration_result(self, body: dict[str, object]) -> str:
        self.results.append(body)
        return str(body["resultDigest"])

    async def mediate_collaboration(self, body: dict[str, object]) -> str:
        self.collaborations.append(body)
        return str(body["redactedPayloadDigest"])


class Tools:
    def __init__(self) -> None:
        self.calls: list[object] = []

    async def invoke(self, agent: str, request: dict[str, object]) -> dict[str, object]:
        self.calls.append((agent, request))
        return {
            "output": {
                "provenanceId": "00000000-0000-4000-8000-000000000011",
                "summary": {"riskLevel": "low"},
            },
            "provenanceIds": ["00000000-0000-4000-8000-000000000011"],
        }


class FailedTools:
    async def invoke(self, _agent: str, _request: dict[str, object]) -> dict[str, object]:
        error = RuntimeError("private provider body")
        error.code = "DEPARTMENT_IDENTITY_UNAVAILABLE"  # type: ignore[attr-defined]
        error.retryable = False  # type: ignore[attr-defined]
        raise error


class Models:
    def __init__(self) -> None:
        self.commands: list[object] = []
        self.result: dict[str, object] | None = None

    async def execute(self, command: object) -> object:
        self.commands.append(command)
        result = {
            "schemaVersion": 1, "agentKind": "catalog", "status": "complete",
            "summary": "Reviewed", "conclusions": [], "risks": [],
            "recommendedActions": [], "payload": {"toolSummaries": [{
                "toolName": "catalog.product_completeness",
                "provenanceId": "00000000-0000-4000-8000-000000000011",
                "summaryDigest": canonical_digest({"riskLevel": "low"}),
            }]},
        }
        self.result = result
        return type("Outcome", (), {
            "status": "completed", "output_digest": canonical_digest(result),
            "quality_reasons": (), "accepted_content": result,
            "quality_evidence_digest": "f" * 64,
            "terminal_settlement": terminal_settlement(canonical_digest(result), "f" * 64),
        })()


def test_descriptor_mismatch_stops_before_tools_or_model() -> None:
    descriptor, schemas = fixture()
    tools, models = Tools(), Models()
    service = DepartmentExecutionService(
        controls=Control(descriptor), tools=tools, models=models,
        result_schemas=schemas, now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )
    command = execution_input(descriptor) .model_copy(update={
        "subtask_id": UUID("00000000-0000-4000-8000-000000000099")
    })

    with pytest.raises(DepartmentExecutionError, match="DESCRIPTOR_BINDING_INVALID"):
        asyncio.run(service.execute(command))
    assert tools.calls == []
    assert models.commands == []


def test_named_schema_mismatch_stops_before_tools_or_model() -> None:
    descriptor, schemas = fixture()
    tools, models = Tools(), Models()
    schemas["store_health_catalog_v1"] = {"type": "string"}
    service = DepartmentExecutionService(
        controls=Control(descriptor), tools=tools, models=models,
        result_schemas=schemas, now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    with pytest.raises(DepartmentExecutionError, match="RESULT_SCHEMA_BINDING_INVALID"):
        asyncio.run(service.execute(execution_input(descriptor)))
    assert tools.calls == []
    assert models.commands == []


def test_executes_only_descriptor_grants_then_settles_a_digest_reference() -> None:
    descriptor, schemas = fixture()
    control, tools, models = Control(descriptor), Tools(), Models()
    service = DepartmentExecutionService(
        controls=control, tools=tools, models=models, result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
        generate_id=lambda: "00000000-0000-4000-8000-000000000010",
    )

    result = asyncio.run(service.execute(execution_input(descriptor)))

    assert result.status == "usable"
    assert result.result_id == UUID("00000000-0000-4000-8000-000000000010")
    assert result.result_digest == control.results[0]["resultDigest"]
    assert len(tools.calls) == 1
    assert tools.calls[0][0] == "catalog"
    assert len(models.commands) == 1
    assert control.results[0]["qualityEvidenceDigest"] == "f" * 64
    assert control.results[0]["result"] == models.result
    assert "authorizedContext" not in control.results[0]
    assert tuple(
        dict(item) for item in models.commands[0].quality_context.authorized_tool_summaries
    ) == (
        {
            "toolName": "catalog.product_completeness",
            "provenanceId": "00000000-0000-4000-8000-000000000011",
            "summaryDigest": canonical_digest({"riskLevel": "low"}),
        },
    )


def test_mediates_bound_dependency_before_target_tools_and_is_retry_stable() -> None:
    descriptor, schemas = fixture()
    control, tools = Control(descriptor), Tools()
    service = DepartmentExecutionService(
        controls=control, tools=tools, models=Models(), result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )
    command = execution_input(descriptor).model_copy(update={
        "collaborations": (DescriptorCollaborationReference(
            requester_subtask_id=UUID("00000000-0000-4000-8000-000000000020"),
            requester_agent_kind="inventory",
            result_id=UUID("00000000-0000-4000-8000-000000000021"),
            result_digest="a" * 64,
            provenance_ids=(UUID("00000000-0000-4000-8000-000000000022"),),
            purpose="compare_availability", requested_data_classification="internal",
        ),),
    })

    asyncio.run(service.execute(command))
    asyncio.run(service.execute(command))

    assert len(control.collaborations) == 2
    assert control.collaborations[0] == control.collaborations[1]
    assert control.collaborations[0]["requester"] == "inventory"
    assert control.collaborations[0]["requested"] == "catalog"
    assert control.collaborations[0]["purpose"] == "compare_availability"
    assert control.collaborations[0]["policyVersion"] == 4
    assert len(tools.calls) == 2


def test_denied_collaboration_stops_target_before_tools_and_model() -> None:
    descriptor, schemas = fixture()
    control, tools, models = Control(descriptor), Tools(), Models()

    async def denied(_body: dict[str, object]) -> str:
        error = RuntimeError("private policy detail")
        error.code = "POLICY_DENIED"  # type: ignore[attr-defined]
        error.retryable = False  # type: ignore[attr-defined]
        raise error

    control.mediate_collaboration = denied  # type: ignore[method-assign]
    service = DepartmentExecutionService(
        controls=control, tools=tools, models=models, result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )
    collaboration = DescriptorCollaborationReference(
        requester_subtask_id=UUID("00000000-0000-4000-8000-000000000020"),
        requester_agent_kind="inventory",
        result_id=UUID("00000000-0000-4000-8000-000000000021"),
        result_digest="a" * 64,
        provenance_ids=(UUID("00000000-0000-4000-8000-000000000022"),),
        purpose="compare_availability", requested_data_classification="internal",
    )

    result = asyncio.run(service.execute(execution_input(descriptor).model_copy(
        update={"collaborations": (collaboration,)},
    )))

    assert result.status == "unavailable"
    assert tools.calls == []
    assert models.commands == []
    assert control.results == []


def test_materializes_only_the_api_owned_tool_parameter_template() -> None:
    descriptor, schemas = fixture()
    payload = descriptor["payload"]
    authority = descriptor["descriptor"]
    assert isinstance(payload, dict) and isinstance(authority, dict)
    grants = payload["toolGrants"]
    assert isinstance(grants, list) and isinstance(grants[0], dict)
    grants[0]["parameterTemplate"] = "evidence_window_24h"
    authority["allowedToolsDigest"] = canonical_digest(grants)
    authority["payloadDigest"] = canonical_digest(payload)
    authority.pop("descriptorDigest")
    authority["descriptorDigest"] = canonical_digest(authority)
    tools = Tools()
    service = DepartmentExecutionService(
        controls=Control(descriptor), tools=tools, models=Models(), result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    asyncio.run(service.execute(execution_input(descriptor)))

    request = tools.calls[0][1]
    assert request["parameters"] == {
        "start": "2026-08-21T00:00:00Z", "end": "2026-08-22T00:00:00Z",
        "timezone": "Asia/Ho_Chi_Minh", "limit": 25,
    }


def test_department_domain_settlement_is_stable_across_activity_retry() -> None:
    descriptor, schemas = fixture()
    control = Control(descriptor)
    current = [datetime(2026, 8, 22, 0, 1, tzinfo=UTC)]
    service = DepartmentExecutionService(
        controls=control, tools=Tools(), models=Models(), result_schemas=schemas,
        now=lambda: current[0],
    )
    command = execution_input(descriptor)

    first = asyncio.run(service.execute(command))
    current[0] = datetime(2026, 8, 22, 0, 2, tzinfo=UTC)
    second = asyncio.run(service.execute(command))

    assert first == second
    assert control.results[0] == control.results[1]
    assert control.results[0]["acceptedAt"] == "2026-08-22T00:00:00.000Z"


def test_department_retry_recovers_committed_result_before_tools_or_model() -> None:
    descriptor, schemas = fixture()
    control, tools, models = Control(descriptor), Tools(), Models()
    command = execution_input(descriptor)

    async def recovered(_kind: str, settlement_id: str) -> dict[str, object]:
        return {"settled": True, "taskId": str(command.task_id),
                "planVersion": command.plan_version, "subtaskId": str(command.subtask_id),
                "agentKind": command.agent_kind,
                "descriptorId": str(command.descriptor_id),
                "descriptorDigest": command.descriptor_digest,
                "status": "usable", "resultId": settlement_id,
                "resultDigest": "a" * 64,
                "provenanceIds": ["00000000-0000-4000-8000-000000000011"]}

    control.load_orchestration_settlement = recovered  # type: ignore[method-assign]
    service = DepartmentExecutionService(
        controls=control, tools=tools, models=models, result_schemas=schemas,
    )

    result = asyncio.run(service.execute(command))

    assert result.status == "usable"
    assert tools.calls == []
    assert models.commands == []


def test_terminal_department_failure_returns_unavailable_without_model_or_settlement() -> None:
    descriptor, schemas = fixture()
    control, models = Control(descriptor), Models()
    service = DepartmentExecutionService(
        controls=control, tools=FailedTools(), models=models, result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    result = asyncio.run(service.execute(execution_input(descriptor)))

    assert result.status == "unavailable"
    assert result.provenance_ids == ()
    assert models.commands == []
    assert control.results == []


def test_terminal_department_model_failure_returns_unavailable_without_settlement() -> None:
    descriptor, schemas = fixture()
    control, models = Control(descriptor), Models()

    async def failed(_command: object) -> object:
        error = RuntimeError("private provider body")
        error.code = "MODEL_SCHEMA_REJECTED"  # type: ignore[attr-defined]
        error.retryable = False  # type: ignore[attr-defined]
        raise error

    models.execute = failed  # type: ignore[method-assign]
    service = DepartmentExecutionService(
        controls=control, tools=Tools(), models=models, result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    result = asyncio.run(service.execute(execution_input(descriptor)))

    assert result.status == "unavailable"
    assert result.result_digest == canonical_digest({
        "status": "unavailable", "reasonCode": "MODEL_SCHEMA_REJECTED",
    })
    assert control.results == []


def test_quality_escalation_is_not_persisted_as_an_accepted_result() -> None:
    descriptor, schemas = fixture()
    control, models = Control(descriptor), Models()

    async def escalated(_command: object) -> object:
        return type("Outcome", (), {
            "status": "escalated", "output_digest": "f" * 64,
            "quality_reasons": ("SCOPE_VIOLATION",),
        })()

    models.execute = escalated  # type: ignore[method-assign]
    service = DepartmentExecutionService(
        controls=control, tools=Tools(), models=models, result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    result = asyncio.run(service.execute(execution_input(descriptor)))

    assert result.status == "unavailable"
    assert control.results == []


def test_runtime_schema_catalog_matches_api_owned_descriptor_digests() -> None:
    assert {name: canonical_digest(schema) for name, schema in STORE_HEALTH_RESULT_SCHEMAS.items()} == {
        "store_health_catalog_v1": "5e4189a1c9425c3fb863d084569de22a2d1c902426b5bf053b8ff47396d0e087",
        "store_health_inventory_v1": "d4c5a3e2a60a904b02d24abfbcb6b014aee346f0b022f0e216a7e0b7a26ef0c7",
        "store_health_order_v1": "a245f4dc12c3fa5c4dec37de0e4c08f6e20c5c79eb319508391b552dd92b2c24",
        "store_health_finance_v1": "d7f3da4436040d600106b7df9565a2b6006dfa36e508233dccd1363d93ae67cd",
        "store_health_crm_v1": "8687b161d1e7cd0344301b7544fc81e63ec0f0ac8caa81df081448cfdfa3703b",
        "store_health_support_v1": "d88d729676bc7c9a813f50ac17050a6a2f2abef07b02c824c2596bd7c536788e",
    }


def test_ai_ceo_planning_uses_authority_and_submits_deterministically_enriched_plan() -> None:
    brief = task_brief()
    controls = OrchestrationControl(
        brief=brief,
        authority=ai_ceo_authority(
            "orchestration_planning",
            {"taskBrief": {key: value for key, value in brief.items()
                            if key != "planningAuthority"}},
        ),
    )
    proposal = {"schemaVersion": 1, "subtasks": [
        {"owner": "catalog", "dependencies": []},
        {"owner": "inventory", "dependencies": ["catalog"]},
    ]}
    models = AiCeoModels(proposal)
    submissions = Submissions()
    service = AiCeoPlanningService(
        controls=controls, models=models, submissions=submissions,
        ai_ceo_client_id="agent-ai-ceo",
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    reference = asyncio.run(service.plan(PlanningExecutionInput(
        task_id=UUID(str(brief["taskId"])), idempotency_key="planning:1",
    )))

    assert reference.plan_version == 1
    assert reference.plan_digest == submissions.plans[0]["digest"]
    assert submissions.plans[0]["createdBy"] == "agent-ai-ceo"
    assert [item["owner"] for item in submissions.plans[0]["subtasks"]] == [
        "catalog", "inventory",
    ]
    assert submissions.plans[0]["subtasks"][1]["dependencies"] == [
        submissions.plans[0]["subtasks"][0]["id"],
    ]
    assert submissions.plans[0]["subtasks"][0] == {
        **submissions.plans[0]["subtasks"][0],
        "dataScope": "catalog:health:read", "freshnessSeconds": 240,
        "timeoutSeconds": 12, "budgetMicros": 321,
    }
    assert "goal" not in reference.model_dump(mode="json")


def test_ai_ceo_planning_settles_exhausted_deferred_result_before_rejecting_it() -> None:
    brief = task_brief()
    controls = OrchestrationControl(
        brief=brief,
        authority=ai_ceo_authority(
            "orchestration_planning",
            {"taskBrief": {key: value for key, value in brief.items()
                            if key != "planningAuthority"}},
        ),
    )
    models = AiCeoModels({})
    settlement = terminal_settlement("a" * 64, "e" * 64)

    async def partial(_command: object) -> object:
        return type("Outcome", (), {
            "status": "partial", "output_digest": "a" * 64,
            "accepted_content": {}, "terminal_settlement": settlement,
        })()

    models.execute = partial  # type: ignore[method-assign]
    service = AiCeoPlanningService(
        controls=controls, models=models, submissions=Submissions(),
        ai_ceo_client_id="agent-ai-ceo",
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    with pytest.raises(DepartmentExecutionError, match="AI_CEO_PLANNING_UNAVAILABLE"):
        asyncio.run(service.plan(PlanningExecutionInput(
            task_id=UUID(str(brief["taskId"])), idempotency_key="planning:partial",
        )))

    assert controls.model_settlements == [settlement]


def test_planning_retry_returns_committed_plan_before_loading_private_authority() -> None:
    task_id = UUID("00000000-0000-4000-8000-000000000001")
    controls = OrchestrationControl(authority={}, settlement={
        "settled": True, "taskId": str(task_id), "planVersion": 1,
        "planDigest": "a" * 64,
    })
    models, submissions = AiCeoModels({}), Submissions()
    service = AiCeoPlanningService(
        controls=controls, models=models, submissions=submissions,
        ai_ceo_client_id="agent-ai-ceo",
    )

    reference = asyncio.run(service.plan(PlanningExecutionInput(
        task_id=task_id, idempotency_key="planning:1",
    )))

    assert reference.plan_digest == "a" * 64
    assert models.commands == []
    assert submissions.plans == []


def test_ai_ceo_synthesis_resolves_private_results_and_settles_private_report() -> None:
    task_id = "00000000-0000-4000-8000-000000000001"
    subtask_id = "00000000-0000-4000-8000-000000000002"
    result_id = "00000000-0000-4000-8000-000000000003"
    provenance_id = "00000000-0000-4000-8000-000000000011"
    branch = SynthesisBranchReference(
        subtask_id=UUID(subtask_id), status="usable", result_id=UUID(result_id),
        result_digest="a" * 64, provenance_ids=(UUID(provenance_id),),
    )
    authority_context = {
        "taskId": task_id, "planVersion": 1, "planDigest": "b" * 64,
        "branches": [{"subtaskId": subtask_id, "agentKind": "catalog",
                      "resultSchemaDigest": "c" * 64}],
    }
    authority = ai_ceo_authority(
        "executive_synthesis", authority_context, plan_version=1,
    )
    controls = OrchestrationControl(
        authority=authority,
        synthesis={
            "authority": {"authorityId": authority["authority"]["id"],
                          "authorityDigest": authority["authority"]["authorityDigest"]},
            "acceptedResults": [{
                "subtaskId": subtask_id, "status": "usable", "resultId": result_id,
                "resultDigest": "a" * 64, "provenanceIds": [provenance_id],
                "result": {"private": "department-result"},
            }],
            "unavailableBranches": [], "costMicros": 123,
            "approvalHistoryDigest": "d" * 64,
        },
    )
    report = {
        "schemaVersion": 1, "completionState": "complete", "summary": "Reviewed",
        "conclusions": [], "risks": [], "recommendedActions": [], "conflicts": [],
        "acceptedResultReferences": [{"resultId": result_id, "subtaskId": subtask_id,
                                      "resultDigest": "a" * 64}],
        "unavailableBranches": [],
    }
    service = AiCeoSynthesisService(
        controls=controls, models=AiCeoModels(report),
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    reference = asyncio.run(service.synthesize(SynthesisExecutionInput(
        task_id=UUID(task_id), plan_version=1, branches=(branch,),
        idempotency_key="synthesis:1",
    )))

    assert reference.completion_state == "complete"
    assert controls.reports[0]["report"] == report
    assert "costMicros" not in controls.reports[0]
    assert controls.reports[0]["approvalHistoryDigest"] == "d" * 64
    assert "report" not in reference.model_dump(mode="json")


def test_ai_ceo_synthesis_does_not_authorize_unavailable_branch_provenance() -> None:
    task_id = "00000000-0000-4000-8000-000000000001"
    subtask_id = "00000000-0000-4000-8000-000000000002"
    provenance_id = "00000000-0000-4000-8000-000000000011"
    branch = SynthesisBranchReference(
        subtask_id=UUID(subtask_id), status="unavailable",
        result_digest="a" * 64, provenance_ids=(UUID(provenance_id),),
    )
    authority_context = {
        "taskId": task_id, "planVersion": 1, "planDigest": "b" * 64,
        "branches": [{"subtaskId": subtask_id, "agentKind": "inventory",
                      "resultSchemaDigest": "c" * 64}],
    }
    authority = ai_ceo_authority(
        "executive_synthesis", authority_context, plan_version=1,
    )
    controls = OrchestrationControl(
        authority=authority,
        synthesis={
            "authority": {"authorityId": authority["authority"]["id"],
                          "authorityDigest": authority["authority"]["authorityDigest"]},
            "acceptedResults": [],
            "unavailableBranches": [{
                "subtaskId": subtask_id, "status": "unavailable",
                "resultDigest": "a" * 64, "provenanceIds": [provenance_id],
            }],
            "approvalHistoryDigest": "d" * 64,
        },
    )
    report = {
        "schemaVersion": 1, "completionState": "partial",
        "summary": "Không có kết quả tồn kho khả dụng.",
        "conclusions": [], "risks": [], "recommendedActions": [],
        "conflicts": [], "acceptedResultReferences": [],
        "unavailableBranches": [{
            "subtaskId": subtask_id, "reasonCode": "DEPARTMENT_UNAVAILABLE",
        }],
    }
    models = AiCeoModels(report)
    service = AiCeoSynthesisService(
        controls=controls, models=models,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    reference = asyncio.run(service.synthesize(SynthesisExecutionInput(
        task_id=UUID(task_id), plan_version=1, branches=(branch,),
        idempotency_key="synthesis:unavailable",
    )))

    assert reference.completion_state == "partial"
    quality_context = models.commands[0].quality_context
    assert quality_context.authorized_provenance_ids == ()


def test_synthesis_retry_returns_committed_report_before_private_context_resolution() -> None:
    task_id = UUID("00000000-0000-4000-8000-000000000001")
    subtask_id = "00000000-0000-4000-8000-000000000002"
    branches_digest = canonical_digest([{
        "subtaskId": subtask_id, "status": "unavailable",
        "resultDigest": "a" * 64, "provenanceIds": [],
    }])
    controls = OrchestrationControl(authority={}, settlement={
        "settled": True, "taskId": str(task_id), "planVersion": 1,
        "completionState": "partial", "reportDigest": "b" * 64,
        "synthesisBranchesDigest": branches_digest,
    })
    models = AiCeoModels({})
    service = AiCeoSynthesisService(controls=controls, models=models)
    branch = SynthesisBranchReference(
        subtask_id=UUID(subtask_id),
        status="unavailable", result_digest="a" * 64, provenance_ids=(),
    )

    reference = asyncio.run(service.synthesize(SynthesisExecutionInput(
        task_id=task_id, plan_version=1, branches=(branch,),
        idempotency_key="synthesis:1",
    )))

    assert reference.completion_state == "partial"
    assert models.commands == []
    assert controls.reports == []


def test_synthesis_retry_rejects_changed_branch_input() -> None:
    task_id = UUID("00000000-0000-4000-8000-000000000001")
    controls = OrchestrationControl(authority={}, settlement={
        "settled": True, "taskId": str(task_id), "planVersion": 1,
        "completionState": "partial", "reportDigest": "b" * 64,
        "synthesisBranchesDigest": "c" * 64,
    })
    service = AiCeoSynthesisService(controls=controls, models=AiCeoModels({}))
    branch = SynthesisBranchReference(
        subtask_id=UUID("00000000-0000-4000-8000-000000000002"),
        status="unavailable", result_digest="a" * 64, provenance_ids=(),
    )

    with pytest.raises(DepartmentExecutionError, match="SETTLEMENT_RECOVERY_INVALID"):
        asyncio.run(service.synthesize(SynthesisExecutionInput(
            task_id=task_id, plan_version=1, branches=(branch,),
            idempotency_key="synthesis:1",
        )))


def fixture() -> tuple[dict[str, object], dict[str, dict[str, object]]]:
    schema = {"type": "object", "additionalProperties": False, "properties": {}}
    context: list[dict[str, object]] = []
    grants = [{"name": "catalog.product_completeness", "version": 1,
               "purpose": "store_health_review", "dataScope": "catalog:health:read",
               "dataClassification": "internal", "maximumInvocations": 1,
               "parameterTemplate": "empty"}]
    payload = {"taskBrief": {"taskId": "00000000-0000-4000-8000-000000000001"},
               "resultSchema": schema, "authorizedContext": context, "toolGrants": grants}
    authority = {"id": "00000000-0000-4000-8000-000000000002", "version": 1,
                 "taskId": "00000000-0000-4000-8000-000000000001", "planVersion": 1,
                 "subtaskId": "00000000-0000-4000-8000-000000000003", "agentKind": "catalog",
                 "configurationRevisionId": "00000000-0000-4000-8000-000000000004",
                 "policyVersion": 4, "primaryModel": "provider/primary",
                 "fallbackModel": "provider/fallback", "resultSchemaName": "store_health_catalog_v1",
                 "resultSchemaDigest": canonical_digest(schema),
                 "authorizedContextDigest": canonical_digest(context),
                 "allowedToolsDigest": canonical_digest(grants), "budgetAuthorizationMicros": 100,
                 "timeoutSeconds": 30, "freshnessSeconds": 300,
                 "expiresAt": "2026-08-22T00:05:00Z", "payloadDigest": canonical_digest(payload),
                 "createdAt": "2026-08-22T00:00:00Z"}
    authority["descriptorDigest"] = canonical_digest(authority)
    return {"descriptor": authority, "payload": payload}, {"store_health_catalog_v1": schema}


def execution_input(value: dict[str, object]) -> DescriptorExecutionInput:
    descriptor = value["descriptor"]
    assert isinstance(descriptor, dict)
    return DescriptorExecutionInput.model_validate({
        "descriptorId": UUID(str(descriptor["id"])), "descriptorDigest": descriptor["descriptorDigest"],
        "taskId": UUID(str(descriptor["taskId"])), "planVersion": descriptor["planVersion"],
        "subtaskId": UUID(str(descriptor["subtaskId"])), "agentKind": descriptor["agentKind"],
        "idempotencyKey": "department:catalog:1",
    })


class OrchestrationControl:
    def __init__(self, *, authority: dict[str, object],
                 brief: dict[str, object] | None = None,
                 synthesis: dict[str, object] | None = None,
                 settlement: dict[str, object] | None = None) -> None:
        self.authority = authority
        self.brief = brief
        self.synthesis = synthesis
        self.settlement = settlement or {"settled": False}
        self.reports: list[dict[str, object]] = []
        self.model_settlements: list[CompleteModelRunRequest] = []

    async def complete_model_run(self, request: CompleteModelRunRequest) -> object:
        self.model_settlements.append(request)
        return object()

    async def load_orchestration_settlement(
        self, _kind: str, _settlement_id: str
    ) -> dict[str, object]:
        return self.settlement

    async def load_task_brief(self, _task_id: str) -> dict[str, object]:
        assert self.brief is not None
        return self.brief

    async def load_ai_ceo_execution_authority(
        self, _authority_id: str, _authority_digest: str
    ) -> dict[str, object]:
        return self.authority

    async def load_synthesis_context(
        self, _body: dict[str, object]
    ) -> dict[str, object]:
        assert self.synthesis is not None
        return self.synthesis

    async def accept_executive_report(self, body: dict[str, object]) -> str:
        self.reports.append(body)
        return str(body["reportDigest"])


class Submissions:
    def __init__(self) -> None:
        self.plans: list[dict[str, object]] = []

    async def accept_plan(self, plan: dict[str, object]) -> None:
        self.plans.append(plan)


class AiCeoModels:
    def __init__(self, content: dict[str, object]) -> None:
        self.content = content
        self.commands: list[object] = []

    async def execute(self, command: object) -> object:
        self.commands.append(command)
        return type("Outcome", (), {
            "status": "completed", "output_digest": canonical_digest(self.content),
            "quality_reasons": (), "accepted_content": self.content,
            "quality_evidence_digest": "e" * 64, "cost_micros": 10,
            "terminal_settlement": terminal_settlement(canonical_digest(self.content), "e" * 64),
        })()


def terminal_settlement(output_digest: str, evidence_digest: str) -> CompleteModelRunRequest:
    return CompleteModelRunRequest(
        "00000000-0000-4000-8000-000000000030", 2, "model:complete",
        "completed", output_digest, 10, 20, "a" * 64, 25,
        "MODEL_COMPLETED", "accepted", (),
        ("00000000-0000-4000-8000-000000000011",), evidence_digest,
    )


def task_brief() -> dict[str, object]:
    content: dict[str, object] = {
        "taskId": "00000000-0000-4000-8000-000000000001",
        "goal": "Review health", "instructions": "Use governed evidence",
        "configurationRevisionId": "00000000-0000-4000-8000-000000000004",
        "policyVersion": 4,
        "provenance": [{
            "id": "00000000-0000-4000-8000-000000000011",
            "sourceType": "staff_intake", "sourceDigest": "1" * 64,
            "classification": "internal",
        }],
        "eligibleAssignments": [
            {"agentKind": "catalog", "resultSchemaName": "store_health_catalog_v1",
             "resultSchemaDigest": "2" * 64, "allowedToolsDigest": "3" * 64,
             "dataScope": "catalog:health:read", "freshnessSeconds": 240,
             "timeoutSeconds": 12, "budgetMicros": 321},
            {"agentKind": "inventory", "resultSchemaName": "store_health_inventory_v1",
             "resultSchemaDigest": "4" * 64, "allowedToolsDigest": "5" * 64,
             "dataScope": "inventory:health:read", "freshnessSeconds": 180,
             "timeoutSeconds": 9, "budgetMicros": 123},
        ],
    }
    content["digest"] = canonical_digest(content)
    context = {"taskBrief": dict(content)}
    authority = ai_ceo_authority("orchestration_planning", context)
    content["planningAuthority"] = {
        "authorityId": authority["authority"]["id"],
        "authorityDigest": authority["authority"]["authorityDigest"],
    }
    return content


def ai_ceo_authority(
    purpose: str, context: dict[str, object], *, plan_version: int | None = None,
) -> dict[str, object]:
    schema_name = (
        "orchestration_plan_proposal_v1"
        if purpose == "orchestration_planning"
        else "store_health_ai_ceo_report_v1"
    )
    schema = AI_CEO_RESULT_SCHEMAS[schema_name]
    payload = {"resultSchema": schema, "authorizedContext": context}
    authority: dict[str, object] = {
        "id": "00000000-0000-4000-8000-000000000020", "version": 1,
        "purpose": purpose, "taskId": context.get("taskId", context.get("taskBrief", {}).get("taskId")),
        "configurationRevisionId": "00000000-0000-4000-8000-000000000004",
        "policyVersion": 4, "primaryModel": "provider/primary",
        "fallbackModel": "provider/fallback", "resultSchemaName": schema_name,
        "resultSchemaDigest": canonical_digest(schema),
        "authorizedContextDigest": canonical_digest(context),
        "budgetAuthorizationMicros": 10_000, "timeoutSeconds": 30,
        "createdAt": "2026-08-22T00:00:00.000Z",
        "expiresAt": "2026-08-22T00:05:00.000Z",
        "payloadDigest": canonical_digest(payload),
    }
    if plan_version is not None:
        authority["planVersion"] = plan_version
    authority["authorityDigest"] = canonical_digest(authority)
    return {"authority": authority, "payload": payload}
