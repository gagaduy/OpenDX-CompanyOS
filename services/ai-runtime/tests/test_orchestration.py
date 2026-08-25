# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import pytest
from pydantic import ValidationError

from app.agentic.application.orchestration import OrchestrationPlanner, OrchestrationSynthesizer
from app.agentic.domain.orchestration_schemas import (
    DepartmentResult, ExecutiveConclusion, OrchestrationPlan, PlannedSubtask,
)


def plan(owner: str = "catalog") -> OrchestrationPlan:
    return OrchestrationPlan(
        task_id="task-1", version=1, digest="a" * 64,
        subtasks=(PlannedSubtask(
            id="catalog-1", owner=owner, dependencies=(), expected_result_schema_digest="b" * 64,
            allowed_tools_digest="c" * 64, data_scope="catalog.aggregate", freshness_seconds=300,
            timeout_seconds=30, budget_micros=100, source_provenance_digest="d" * 64,
        ),),
    )


def test_planner_rejects_assignment_outside_policy_eligible_departments() -> None:
    decision = OrchestrationPlanner(frozenset({"inventory"})).validate(plan())

    assert decision.code == "POLICY_DENIED"
    assert decision.dispatchable is False


def test_synthesizer_discloses_unavailable_branch_without_fabricating_conclusions() -> None:
    results = (
        DepartmentResult(agent_kind="catalog", status="accepted", result_digest="e" * 64,
            provenance_ids=("prov-1",), conclusions=(ExecutiveConclusion(
                code="CATALOG_HEALTH", statement="Catalog evidence is current.", provenance_ids=("prov-1",)),)),
        DepartmentResult(agent_kind="inventory", status="unavailable", reason_code="TOOL_UNAVAILABLE"),
    )

    report = OrchestrationSynthesizer().synthesize(results)

    assert report.completion_state == "partial"
    assert "inventory:TOOL_UNAVAILABLE" in report.unavailable_branches
    assert tuple(item.code for item in report.conclusions) == ("CATALOG_HEALTH",)


def test_orchestration_schemas_reject_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        OrchestrationPlan(task_id="task-1", version=1, digest="a" * 64, subtasks=(), prompt="unsafe")
