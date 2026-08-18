# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from copy import deepcopy
from dataclasses import FrozenInstanceError
from typing import Any

import pytest

from app.agentic.domain.model_result_schemas import (
    AiCeoPayload,
    CatalogPayload,
    CrmPayload,
    FinancePayload,
    InventoryPayload,
    OrderPayload,
    SupportPayload,
    parse_model_result,
)


PAYLOADS: dict[str, dict[str, Any]] = {
    "ai_ceo": {
        "departmentCoverage": [
            {
                "agentKind": "catalog",
                "status": "complete",
                "provenanceIds": ["prov-1"],
            }
        ],
        "crossDepartmentRiskCount": 1,
        "unresolvedConflictCodes": ["INVENTORY_ORDER_MISMATCH"],
        "riskLevel": "medium",
    },
    "catalog": {
        "completenessBasisPoints": 9_500,
        "productsAtRisk": 2,
        "publicationBlockerCount": 1,
        "merchandisingSignalCount": 3,
        "riskLevel": "medium",
    },
    "inventory": {
        "atRiskSkuCount": 2,
        "slowStockSkuCount": 3,
        "reservationAnomalyCount": 1,
        "affectedProductCount": 4,
        "riskLevel": "high",
    },
    "order": {
        "stalledOrderCount": 2,
        "invalidTransitionCount": 0,
        "expiryRiskCount": 1,
        "affectedOrderCount": 3,
        "riskLevel": "medium",
    },
    "finance": {
        "pendingPaymentCount": 2,
        "pendingAmountVnd": 2_500_000,
        "discrepancyCount": 1,
        "discrepancyAmountVnd": 500_000,
        "providerEvidenceCoverageBasisPoints": 10_000,
        "riskLevel": "high",
    },
    "crm": {
        "segmentCount": 4,
        "followupOpportunityCount": 2,
        "repeatCustomerCount": 10,
        "lifetimePaidRevenueVnd": 40_000_000,
        "riskLevel": "low",
    },
    "support": {
        "slaRiskCount": 2,
        "overdueCount": 1,
        "classificationCount": 4,
        "relatedOrderContextCount": 3,
        "riskLevel": "medium",
    },
}

PAYLOAD_TYPES = {
    "ai_ceo": AiCeoPayload,
    "catalog": CatalogPayload,
    "inventory": InventoryPayload,
    "order": OrderPayload,
    "finance": FinancePayload,
    "crm": CrmPayload,
    "support": SupportPayload,
}


def valid_envelope(agent_kind: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "agentKind": agent_kind,
        "status": "complete",
        "summary": "Authoritative aggregate health summary.",
        "conclusions": [
            {
                "code": "AGGREGATE_HEALTH_REVIEWED",
                "statement": "Aggregate health was reviewed.",
                "confidenceBasis": "Backed by current internal evidence.",
                "provenanceIds": ["prov-1"],
            }
        ],
        "risks": [
            {
                "code": "AGGREGATE_RISK_FOUND",
                "severity": "medium",
                "statement": "An aggregate risk requires attention.",
                "provenanceIds": ["prov-1"],
            }
        ],
        "recommendedActions": [
            {
                "code": "REVIEW_AGGREGATE_RISK",
                "statement": "A human should review the aggregate risk.",
                "requiresHumanApproval": True,
                "provenanceIds": ["prov-1"],
            }
        ],
        "evidence": [
            {
                "provenanceId": "prov-1",
                "source": "department-tool:aggregate-health-v1",
                "retrievedAt": "2026-08-19T08:00:00Z",
                "freshnessStatus": "fresh",
                "classification": "internal",
            }
        ],
        "payload": deepcopy(PAYLOADS[agent_kind]),
    }


@pytest.mark.parametrize("agent_kind", PAYLOADS)
def test_parses_one_exact_envelope_for_each_agent(agent_kind: str) -> None:
    result = parse_model_result(valid_envelope(agent_kind))

    assert result.schema_version == 1
    assert result.agent_kind == agent_kind
    assert isinstance(result.payload, PAYLOAD_TYPES[agent_kind])
    with pytest.raises(FrozenInstanceError):
        result.summary = "changed"  # type: ignore[misc]


@pytest.mark.parametrize(
    ("path", "extra_key"),
    [
        ((), "unexpected"),
        (("conclusions", 0), "unexpected"),
        (("risks", 0), "unexpected"),
        (("recommendedActions", 0), "unexpected"),
        (("evidence", 0), "unexpected"),
        (("payload",), "unexpected"),
        (("payload", "departmentCoverage", 0), "unexpected"),
    ],
)
def test_rejects_unknown_keys_at_every_nesting_level(
    path: tuple[str | int, ...], extra_key: str
) -> None:
    value = valid_envelope("ai_ceo")
    target: Any = value
    for part in path:
        target = target[part]
    target[extra_key] = "not allowed"

    with pytest.raises(ValueError, match="unknown keys"):
        parse_model_result(value)


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("schemaVersion", 2),
        ("status", "failed"),
        ("summary", ""),
        ("summary", "x" * 1_001),
        ("conclusions", [{}] * 9),
        ("risks", [{}] * 9),
        ("recommendedActions", [{}] * 9),
        ("evidence", [{}] * 25),
    ],
)
def test_rejects_common_envelope_bounds(field: str, invalid_value: Any) -> None:
    value = valid_envelope("catalog")
    value[field] = invalid_value

    with pytest.raises(ValueError):
        parse_model_result(value)


@pytest.mark.parametrize(
    ("collection", "field", "invalid_value"),
    [
        ("conclusions", "code", "not_upper_snake"),
        ("risks", "code", "RISK-HYPHEN"),
        ("recommendedActions", "code", ""),
        ("conclusions", "statement", ""),
        ("conclusions", "confidenceBasis", "x" * 1_001),
        ("risks", "severity", "critical"),
        ("recommendedActions", "requiresHumanApproval", 1),
        ("conclusions", "provenanceIds", []),
        ("conclusions", "provenanceIds", ["prov"] * 9),
    ],
)
def test_rejects_invalid_nested_result_fields(
    collection: str, field: str, invalid_value: Any
) -> None:
    value = valid_envelope("catalog")
    value[collection][0][field] = invalid_value

    with pytest.raises(ValueError):
        parse_model_result(value)


@pytest.mark.parametrize("classification", ["public", "confidential", "restricted"])
def test_rejects_non_internal_evidence(classification: str) -> None:
    value = valid_envelope("catalog")
    value["evidence"][0]["classification"] = classification

    with pytest.raises(ValueError, match="classification"):
        parse_model_result(value)


@pytest.mark.parametrize(
    ("agent_kind", "field"),
    [
        ("catalog", "productsAtRisk"),
        ("inventory", "atRiskSkuCount"),
        ("order", "stalledOrderCount"),
        ("finance", "pendingPaymentCount"),
        ("crm", "segmentCount"),
        ("support", "slaRiskCount"),
        ("ai_ceo", "crossDepartmentRiskCount"),
    ],
)
@pytest.mark.parametrize("invalid_value", [-1, True, 9_007_199_254_740_992, 1.5])
def test_rejects_invalid_non_negative_safe_integers(
    agent_kind: str, field: str, invalid_value: Any
) -> None:
    value = valid_envelope(agent_kind)
    value["payload"][field] = invalid_value

    with pytest.raises(ValueError, match="safe integer"):
        parse_model_result(value)


@pytest.mark.parametrize(
    ("agent_kind", "field"),
    [
        ("finance", "pendingAmountVnd"),
        ("finance", "discrepancyAmountVnd"),
        ("crm", "lifetimePaidRevenueVnd"),
    ],
)
@pytest.mark.parametrize("invalid_value", [-1, True, 1.5])
def test_rejects_invalid_vnd_integer_amounts(
    agent_kind: str, field: str, invalid_value: Any
) -> None:
    value = valid_envelope(agent_kind)
    value["payload"][field] = invalid_value

    with pytest.raises(ValueError, match="VND"):
        parse_model_result(value)


@pytest.mark.parametrize(
    ("agent_kind", "field"),
    [
        ("catalog", "completenessBasisPoints"),
        ("finance", "providerEvidenceCoverageBasisPoints"),
    ],
)
@pytest.mark.parametrize("invalid_value", [-1, 10_001, True, 1.5])
def test_rejects_invalid_basis_points(
    agent_kind: str, field: str, invalid_value: Any
) -> None:
    value = valid_envelope(agent_kind)
    value["payload"][field] = invalid_value

    with pytest.raises(ValueError, match="basis points"):
        parse_model_result(value)


@pytest.mark.parametrize(
    "forbidden_field",
    ["tasks", "subtasks", "assignees", "delegations", "agentCalls"],
)
def test_ai_ceo_rejects_delegation_fields(forbidden_field: str) -> None:
    value = valid_envelope("ai_ceo")
    value["payload"][forbidden_field] = []

    with pytest.raises(ValueError, match="unknown keys"):
        parse_model_result(value)


def test_ai_ceo_rejects_more_than_six_department_coverage_entries() -> None:
    value = valid_envelope("ai_ceo")
    value["payload"]["departmentCoverage"] *= 7

    with pytest.raises(ValueError, match="department coverage"):
        parse_model_result(value)


@pytest.mark.parametrize("invalid_code", ["lowercase", "HAS-HYPHEN", "has space"])
def test_ai_ceo_rejects_invalid_conflict_reason_codes(invalid_code: str) -> None:
    value = valid_envelope("ai_ceo")
    value["payload"]["unresolvedConflictCodes"] = [invalid_code]

    with pytest.raises(ValueError, match="reason code"):
        parse_model_result(value)
