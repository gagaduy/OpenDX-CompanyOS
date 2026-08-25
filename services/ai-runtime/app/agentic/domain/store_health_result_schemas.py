# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Mapping

from app.agentic.domain.orchestration_schemas import DepartmentAgentKind


_TOOLS: dict[DepartmentAgentKind, tuple[str, ...]] = {
    "catalog": (
        "catalog.product_completeness", "catalog.publication_readiness",
        "catalog.merchandising_summary",
    ),
    "inventory": (
        "inventory.stock_risk", "inventory.slow_stock",
        "inventory.reservation_anomalies",
    ),
    "order": (
        "order.stalled_summary", "order.invalid_state_evidence", "order.expiry_risk",
    ),
    "finance": (
        "finance.pending_payments", "finance.reconciliation_discrepancies",
        "finance.provider_evidence_status",
    ),
    "crm": ("crm.segment_summary", "crm.followup_opportunities"),
    "support": ("support.sla_risk", "support.classification_summary"),
}


def _string(maximum: int) -> dict[str, object]:
    return {"type": "string", "minLength": 1, "maxLength": maximum}


def _uuid() -> dict[str, object]:
    return {"type": "string", "format": "uuid"}


def _strict(properties: dict[str, object]) -> dict[str, object]:
    return {
        "type": "object", "additionalProperties": False,
        "required": list(properties), "properties": properties,
    }


def _provenance_ids() -> dict[str, object]:
    return {
        "type": "array", "minItems": 1, "maxItems": 8,
        "uniqueItems": True, "items": _uuid(),
    }


def _tool_summary(
    agent_kind: DepartmentAgentKind, tool_name: str | None = None
) -> dict[str, object]:
    return _strict({
        "toolName": (
            {"type": "string", "enum": list(_TOOLS[agent_kind])}
            if tool_name is None else {"const": tool_name}
        ),
        "provenanceId": _uuid(),
        "summaryDigest": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
    })


def _schema(agent_kind: DepartmentAgentKind) -> dict[str, object]:
    reason = {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{0,99}$"}
    conclusion = _strict({
        "code": reason, "statement": _string(1_000),
        "confidenceBasis": _string(1_000), "provenanceIds": _provenance_ids(),
    })
    risk = _strict({
        "code": reason,
        "severity": {"type": "string", "enum": ["low", "medium", "high"]},
        "statement": _string(1_000), "provenanceIds": _provenance_ids(),
    })
    action = _strict({
        "code": reason, "statement": _string(1_000),
        "requiresHumanApproval": {"type": "boolean"},
        "provenanceIds": _provenance_ids(),
    })
    return _strict({
        "schemaVersion": {"const": 1}, "agentKind": {"const": agent_kind},
        "status": {"type": "string", "enum": ["complete", "partial"]},
        "summary": _string(1_000),
        "conclusions": {"type": "array", "maxItems": 8, "items": conclusion},
        "risks": {"type": "array", "maxItems": 8, "items": risk},
        "recommendedActions": {"type": "array", "maxItems": 8, "items": action},
        "payload": _strict({
            "toolSummaries": {
                "type": "array", "minItems": 1,
                "maxItems": len(_TOOLS[agent_kind]), "uniqueItems": True,
                "allOf": [{
                    "contains": _tool_summary(agent_kind, tool_name),
                    "minContains": 0, "maxContains": 1,
                } for tool_name in _TOOLS[agent_kind]],
                "items": _tool_summary(agent_kind),
            },
        }),
    })


STORE_HEALTH_RESULT_SCHEMAS: Mapping[str, Mapping[str, object]] = {
    f"store_health_{agent_kind}_v1": _schema(agent_kind)
    for agent_kind in _TOOLS
}
