# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Mapping

from app.agentic.domain.orchestration_schemas import DepartmentAgentKind


_MAX_SAFE_INTEGER = 9_007_199_254_740_991


def _integer() -> dict[str, object]:
    return {"type": "integer", "minimum": 0, "maximum": _MAX_SAFE_INTEGER}


def _basis_points() -> dict[str, object]:
    return {"type": "integer", "minimum": 0, "maximum": 10_000}


def _risk() -> dict[str, object]:
    return {"type": "string", "enum": ["low", "medium", "high"]}


_PAYLOADS: dict[DepartmentAgentKind, dict[str, object]] = {
    "catalog": {"completenessBasisPoints": _basis_points(), "productsAtRisk": _integer(),
                "publicationBlockerCount": _integer(), "merchandisingSignalCount": _integer(),
                "riskLevel": _risk()},
    "inventory": {"atRiskSkuCount": _integer(), "slowStockSkuCount": _integer(),
                  "reservationAnomalyCount": _integer(), "affectedProductCount": _integer(),
                  "riskLevel": _risk()},
    "order": {"stalledOrderCount": _integer(), "invalidTransitionCount": _integer(),
              "expiryRiskCount": _integer(), "affectedOrderCount": _integer(), "riskLevel": _risk()},
    "finance": {"pendingPaymentCount": _integer(), "pendingAmountVnd": _integer(),
                "discrepancyCount": _integer(), "discrepancyAmountVnd": _integer(),
                "providerEvidenceCoverageBasisPoints": _basis_points(), "riskLevel": _risk()},
    "crm": {"segmentCount": _integer(), "followupOpportunityCount": _integer(),
            "repeatCustomerCount": _integer(), "lifetimePaidRevenueVnd": _integer(),
            "riskLevel": _risk()},
    "support": {"slaRiskCount": _integer(), "overdueCount": _integer(),
                "classificationCount": _integer(), "relatedOrderContextCount": _integer(),
                "riskLevel": _risk()},
}


def _string(maximum: int) -> dict[str, object]:
    return {"type": "string", "minLength": 1, "maxLength": maximum}


def _strict(properties: dict[str, object]) -> dict[str, object]:
    return {"type": "object", "additionalProperties": False,
            "required": list(properties), "properties": properties}


def _provenance_ids() -> dict[str, object]:
    return {"type": "array", "minItems": 1, "maxItems": 8,
            "uniqueItems": True, "items": _string(255)}


def _schema(agent_kind: DepartmentAgentKind) -> dict[str, object]:
    conclusion = _strict({"code": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{0,99}$"},
                          "statement": _string(1_000), "confidenceBasis": _string(1_000),
                          "provenanceIds": _provenance_ids()})
    risk = _strict({"code": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{0,99}$"},
                    "severity": _risk(), "statement": _string(1_000),
                    "provenanceIds": _provenance_ids()})
    action = _strict({"code": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{0,99}$"},
                      "statement": _string(1_000), "requiresHumanApproval": {"type": "boolean"},
                      "provenanceIds": _provenance_ids()})
    evidence = _strict({"provenanceId": _string(255), "source": _string(255),
                        "retrievedAt": _string(100),
                        "freshnessStatus": {"type": "string", "enum": ["fresh", "stale"]},
                        "classification": {"const": "internal"}})
    properties = {
        "schemaVersion": {"const": 1}, "agentKind": {"const": agent_kind},
        "status": {"type": "string", "enum": ["complete", "partial"]},
        "summary": _string(1_000),
        "conclusions": {"type": "array", "maxItems": 8, "items": conclusion},
        "risks": {"type": "array", "maxItems": 8, "items": risk},
        "recommendedActions": {"type": "array", "maxItems": 8, "items": action},
        "evidence": {"type": "array", "maxItems": 24, "items": evidence},
        "payload": _strict(_PAYLOADS[agent_kind]),
    }
    return _strict(properties)


STORE_HEALTH_RESULT_SCHEMAS: Mapping[str, Mapping[str, object]] = {
    f"store_health_{agent_kind}_v1": _schema(agent_kind)
    for agent_kind in _PAYLOADS
}
