# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from app.agentic.application.planning_quality_gate import PlanningQualityGate
from app.agentic.domain.model_runtime import ModelResult


def test_accepts_only_eligible_acyclic_owner_dependency_proposal() -> None:
    gate = PlanningQualityGate(frozenset({"catalog", "inventory"}))

    accepted = gate.evaluate({"schemaVersion": 1, "subtasks": [
        {"owner": "catalog", "dependencies": []},
        {"owner": "inventory", "dependencies": ["catalog"]},
    ]}, object())
    denied = gate.evaluate({"schemaVersion": 1, "subtasks": [
        {"owner": "finance", "dependencies": []},
    ]}, object())
    cyclic = gate.evaluate({"schemaVersion": 1, "subtasks": [
        {"owner": "catalog", "dependencies": ["inventory"]},
        {"owner": "inventory", "dependencies": ["catalog"]},
    ]}, object())

    assert accepted.outcome == "accepted"
    assert denied.outcome == "escalate" and denied.reasons == ("POLICY_DENIED",)
    assert cyclic.outcome == "correct" and cyclic.reasons == ("INVALID_PLAN",)


def test_rejects_model_selected_authority_fields() -> None:
    decision = PlanningQualityGate(frozenset({"catalog"})).evaluate({
        "schemaVersion": 1, "primaryModel": "unapproved/model",
        "subtasks": [{"owner": "catalog", "dependencies": []}],
    }, object())

    assert decision.outcome == "correct"
    assert decision.reasons == ("INVALID_PLAN",)


def test_accepts_immutable_model_result_content() -> None:
    content = ModelResult(
        provider_request_id="provider-request-1",
        model="test/model",
        content={"schemaVersion": 1, "subtasks": [
            {"owner": "catalog", "dependencies": []},
            {"owner": "inventory", "dependencies": ["catalog"]},
        ]},
        input_tokens=1,
        output_tokens=1,
        total_tokens=2,
        provider_cost_micros=1,
    ).content

    decision = PlanningQualityGate(frozenset({"catalog", "inventory"})).evaluate(
        content, object()
    )

    assert decision.outcome == "accepted"


def test_duplicate_dependencies_request_a_governed_correction() -> None:
    decision = PlanningQualityGate(frozenset({"catalog", "inventory"})).evaluate({
        "schemaVersion": 1,
        "subtasks": [
            {"owner": "catalog", "dependencies": []},
            {"owner": "inventory", "dependencies": ["catalog", "catalog"]},
        ],
    }, object())

    assert decision.outcome == "correct"
    assert decision.reasons == ("INVALID_PLAN",)
