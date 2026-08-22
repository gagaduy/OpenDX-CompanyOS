# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from app.agentic.domain.orchestration_schemas import (
    DepartmentAgentKind, DepartmentResult, ExecutiveReport, OrchestrationPlan, PlanningDecision,
)


class OrchestrationPlanner:
    def __init__(self, eligible_departments: frozenset[DepartmentAgentKind]) -> None:
        self._eligible_departments = eligible_departments

    def validate(self, plan: OrchestrationPlan) -> PlanningDecision:
        if any(subtask.owner not in self._eligible_departments for subtask in plan.subtasks):
            return PlanningDecision(code="POLICY_DENIED", dispatchable=False)
        graph = {subtask.id: subtask.dependencies for subtask in plan.subtasks}
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(subtask_id: str) -> bool:
            if subtask_id in visiting:
                return False
            if subtask_id in visited:
                return True
            visiting.add(subtask_id)
            if not all(visit(dependency) for dependency in graph[subtask_id]):
                return False
            visiting.remove(subtask_id)
            visited.add(subtask_id)
            return True

        if not all(visit(subtask_id) for subtask_id in graph):
            return PlanningDecision(code="INVALID_PLAN", dispatchable=False)
        return PlanningDecision(code="ACCEPTED", dispatchable=True)


class OrchestrationSynthesizer:
    def synthesize(self, results: tuple[DepartmentResult, ...]) -> ExecutiveReport:
        accepted = tuple(result for result in results if result.status == "accepted")
        unavailable = tuple(
            f"{result.agent_kind}:{result.reason_code}"
            for result in results if result.status != "accepted"
        )
        return ExecutiveReport(
            completion_state="partial" if unavailable else "complete",
            conclusions=tuple(conclusion for result in accepted for conclusion in result.conclusions),
            unavailable_branches=unavailable,
        )
