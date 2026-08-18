# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, TypeAlias

from app.agentic.domain.model_runtime import AgentKind


ResultStatus = Literal["complete", "partial"]
RiskLevel = Literal["low", "medium", "high"]
FreshnessStatus = Literal["fresh", "stale"]
DepartmentAgentKind = Literal[
    "catalog", "inventory", "order", "finance", "crm", "support"
]

_AGENT_KINDS = frozenset(
    {"ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"}
)
_DEPARTMENT_AGENT_KINDS = _AGENT_KINDS - {"ai_ceo"}
_RESULT_STATUSES = frozenset({"complete", "partial"})
_RISK_LEVELS = frozenset({"low", "medium", "high"})
_FRESHNESS_STATUSES = frozenset({"fresh", "stale"})
_REASON_CODE = re.compile(r"^[A-Z][A-Z0-9_]{0,99}$")
_MAX_SAFE_INTEGER = 9_007_199_254_740_991


class ModelResultValidationError(ValueError):
    __slots__ = ("code",)

    def __init__(self, code: Literal["EVIDENCE_CLASSIFICATION_BLOCKED"]) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class ProvenanceEvidence:
    provenance_id: str
    source: str
    retrieved_at: str
    freshness_status: FreshnessStatus
    classification: Literal["internal"] = "internal"


@dataclass(frozen=True)
class _ParsedEvidence:
    value: ProvenanceEvidence
    classification_blocked: bool


@dataclass(frozen=True)
class Conclusion:
    code: str
    statement: str
    confidence_basis: str
    provenance_ids: tuple[str, ...]


@dataclass(frozen=True)
class Risk:
    code: str
    severity: RiskLevel
    statement: str
    provenance_ids: tuple[str, ...]


@dataclass(frozen=True)
class RecommendedAction:
    code: str
    statement: str
    requires_human_approval: bool
    provenance_ids: tuple[str, ...]


@dataclass(frozen=True)
class CatalogPayload:
    completeness_basis_points: int
    products_at_risk: int
    publication_blocker_count: int
    merchandising_signal_count: int
    risk_level: RiskLevel


@dataclass(frozen=True)
class InventoryPayload:
    at_risk_sku_count: int
    slow_stock_sku_count: int
    reservation_anomaly_count: int
    affected_product_count: int
    risk_level: RiskLevel


@dataclass(frozen=True)
class OrderPayload:
    stalled_order_count: int
    invalid_transition_count: int
    expiry_risk_count: int
    affected_order_count: int
    risk_level: RiskLevel


@dataclass(frozen=True)
class FinancePayload:
    pending_payment_count: int
    pending_amount_vnd: int
    discrepancy_count: int
    discrepancy_amount_vnd: int
    provider_evidence_coverage_basis_points: int
    risk_level: RiskLevel


@dataclass(frozen=True)
class CrmPayload:
    segment_count: int
    followup_opportunity_count: int
    repeat_customer_count: int
    lifetime_paid_revenue_vnd: int
    risk_level: RiskLevel


@dataclass(frozen=True)
class SupportPayload:
    sla_risk_count: int
    overdue_count: int
    classification_count: int
    related_order_context_count: int
    risk_level: RiskLevel


@dataclass(frozen=True)
class DepartmentCoverage:
    agent_kind: DepartmentAgentKind
    status: ResultStatus
    provenance_ids: tuple[str, ...]


@dataclass(frozen=True)
class AiCeoPayload:
    department_coverage: tuple[DepartmentCoverage, ...]
    cross_department_risk_count: int
    unresolved_conflict_codes: tuple[str, ...]
    risk_level: RiskLevel


AgentPayload: TypeAlias = (
    AiCeoPayload
    | CatalogPayload
    | InventoryPayload
    | OrderPayload
    | FinancePayload
    | CrmPayload
    | SupportPayload
)


@dataclass(frozen=True)
class ModelResultEnvelope:
    schema_version: Literal[1]
    agent_kind: AgentKind
    status: ResultStatus
    summary: str
    conclusions: tuple[Conclusion, ...]
    risks: tuple[Risk, ...]
    recommended_actions: tuple[RecommendedAction, ...]
    evidence: tuple[ProvenanceEvidence, ...]
    payload: AgentPayload


def parse_model_result(value: object) -> ModelResultEnvelope:
    document = _dictionary(value, "result")
    _exact_keys(
        document,
        {
            "schemaVersion",
            "agentKind",
            "status",
            "summary",
            "conclusions",
            "risks",
            "recommendedActions",
            "evidence",
            "payload",
        },
        "result",
    )
    if type(document["schemaVersion"]) is not int or document["schemaVersion"] != 1:
        raise ValueError("schemaVersion must be literal 1")
    agent_kind = _literal(document["agentKind"], _AGENT_KINDS, "agentKind")
    status = _literal(document["status"], _RESULT_STATUSES, "status")
    conclusions = tuple(
        _parse_conclusion(item) for item in _array(document["conclusions"], 8, "conclusions")
    )
    risks = tuple(_parse_risk(item) for item in _array(document["risks"], 8, "risks"))
    recommended_actions = tuple(
        _parse_recommended_action(item)
        for item in _array(document["recommendedActions"], 8, "recommendedActions")
    )
    parsed_evidence = tuple(
        _parse_evidence(item) for item in _array(document["evidence"], 24, "evidence")
    )
    result = ModelResultEnvelope(
        schema_version=1,
        agent_kind=agent_kind,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        summary=_bounded_text(document["summary"], "summary"),
        conclusions=conclusions,
        risks=risks,
        recommended_actions=recommended_actions,
        evidence=tuple(item.value for item in parsed_evidence),
        payload=_parse_payload(agent_kind, document["payload"]),
    )
    if any(item.classification_blocked for item in parsed_evidence):
        raise ModelResultValidationError(
            "EVIDENCE_CLASSIFICATION_BLOCKED"
        ) from None
    return result


def _parse_conclusion(value: object) -> Conclusion:
    item = _dictionary(value, "conclusion")
    _exact_keys(item, {"code", "statement", "confidenceBasis", "provenanceIds"}, "conclusion")
    return Conclusion(
        code=_reason_code(item["code"]),
        statement=_bounded_text(item["statement"], "conclusion statement"),
        confidence_basis=_bounded_text(item["confidenceBasis"], "confidence basis"),
        provenance_ids=_provenance_ids(item["provenanceIds"]),
    )


def _parse_risk(value: object) -> Risk:
    item = _dictionary(value, "risk")
    _exact_keys(item, {"code", "severity", "statement", "provenanceIds"}, "risk")
    return Risk(
        code=_reason_code(item["code"]),
        severity=_literal(
            item["severity"], _RISK_LEVELS, "risk severity"
        ),  # type: ignore[arg-type]
        statement=_bounded_text(item["statement"], "risk statement"),
        provenance_ids=_provenance_ids(item["provenanceIds"]),
    )


def _parse_recommended_action(value: object) -> RecommendedAction:
    item = _dictionary(value, "recommended action")
    _exact_keys(
        item,
        {"code", "statement", "requiresHumanApproval", "provenanceIds"},
        "recommended action",
    )
    if type(item["requiresHumanApproval"]) is not bool:
        raise ValueError("requiresHumanApproval must be a boolean")
    return RecommendedAction(
        code=_reason_code(item["code"]),
        statement=_bounded_text(item["statement"], "recommended action statement"),
        requires_human_approval=item["requiresHumanApproval"],
        provenance_ids=_provenance_ids(item["provenanceIds"]),
    )


def _parse_evidence(value: object) -> _ParsedEvidence:
    item = _dictionary(value, "evidence")
    _exact_keys(
        item,
        {"provenanceId", "source", "retrievedAt", "freshnessStatus", "classification"},
        "evidence",
    )
    classification_blocked = (
        type(item["classification"]) is not str
        or item["classification"] != "internal"
    )
    retrieved_at = _bounded_text(item["retrievedAt"], "retrievedAt", maximum=100)
    parsed_at = _parse_iso_timestamp(retrieved_at)
    if parsed_at is None:
        raise ValueError("retrievedAt must be an ISO-8601 timestamp") from None
    if parsed_at.tzinfo is None:
        raise ValueError("retrievedAt must include a timezone")
    return _ParsedEvidence(
        value=ProvenanceEvidence(
            provenance_id=_identifier(item["provenanceId"], "provenanceId"),
            source=_bounded_text(item["source"], "evidence source", maximum=255),
            retrieved_at=retrieved_at,
            freshness_status=_literal(
                item["freshnessStatus"], _FRESHNESS_STATUSES, "freshnessStatus"
            ),  # type: ignore[arg-type]
        ),
        classification_blocked=classification_blocked,
    )


def _parse_iso_timestamp(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_payload(agent_kind: str, value: object) -> AgentPayload:
    item = _dictionary(value, f"{agent_kind} payload")
    if agent_kind == "ai_ceo":
        return _parse_ai_ceo_payload(item)
    if agent_kind == "catalog":
        _exact_keys(
            item,
            {
                "completenessBasisPoints",
                "productsAtRisk",
                "publicationBlockerCount",
                "merchandisingSignalCount",
                "riskLevel",
            },
            "catalog payload",
        )
        return CatalogPayload(
            _basis_points(item["completenessBasisPoints"]),
            _safe_integer(item["productsAtRisk"], "productsAtRisk"),
            _safe_integer(item["publicationBlockerCount"], "publicationBlockerCount"),
            _safe_integer(item["merchandisingSignalCount"], "merchandisingSignalCount"),
            _risk_level(item["riskLevel"]),
        )
    if agent_kind == "inventory":
        _exact_keys(
            item,
            {
                "atRiskSkuCount",
                "slowStockSkuCount",
                "reservationAnomalyCount",
                "affectedProductCount",
                "riskLevel",
            },
            "inventory payload",
        )
        return InventoryPayload(
            _safe_integer(item["atRiskSkuCount"], "atRiskSkuCount"),
            _safe_integer(item["slowStockSkuCount"], "slowStockSkuCount"),
            _safe_integer(item["reservationAnomalyCount"], "reservationAnomalyCount"),
            _safe_integer(item["affectedProductCount"], "affectedProductCount"),
            _risk_level(item["riskLevel"]),
        )
    if agent_kind == "order":
        _exact_keys(
            item,
            {
                "stalledOrderCount",
                "invalidTransitionCount",
                "expiryRiskCount",
                "affectedOrderCount",
                "riskLevel",
            },
            "order payload",
        )
        return OrderPayload(
            _safe_integer(item["stalledOrderCount"], "stalledOrderCount"),
            _safe_integer(item["invalidTransitionCount"], "invalidTransitionCount"),
            _safe_integer(item["expiryRiskCount"], "expiryRiskCount"),
            _safe_integer(item["affectedOrderCount"], "affectedOrderCount"),
            _risk_level(item["riskLevel"]),
        )
    if agent_kind == "finance":
        _exact_keys(
            item,
            {
                "pendingPaymentCount",
                "pendingAmountVnd",
                "discrepancyCount",
                "discrepancyAmountVnd",
                "providerEvidenceCoverageBasisPoints",
                "riskLevel",
            },
            "finance payload",
        )
        return FinancePayload(
            _safe_integer(item["pendingPaymentCount"], "pendingPaymentCount"),
            _vnd(item["pendingAmountVnd"], "pendingAmountVnd"),
            _safe_integer(item["discrepancyCount"], "discrepancyCount"),
            _vnd(item["discrepancyAmountVnd"], "discrepancyAmountVnd"),
            _basis_points(item["providerEvidenceCoverageBasisPoints"]),
            _risk_level(item["riskLevel"]),
        )
    if agent_kind == "crm":
        _exact_keys(
            item,
            {
                "segmentCount",
                "followupOpportunityCount",
                "repeatCustomerCount",
                "lifetimePaidRevenueVnd",
                "riskLevel",
            },
            "crm payload",
        )
        return CrmPayload(
            _safe_integer(item["segmentCount"], "segmentCount"),
            _safe_integer(item["followupOpportunityCount"], "followupOpportunityCount"),
            _safe_integer(item["repeatCustomerCount"], "repeatCustomerCount"),
            _vnd(item["lifetimePaidRevenueVnd"], "lifetimePaidRevenueVnd"),
            _risk_level(item["riskLevel"]),
        )
    _exact_keys(
        item,
        {
            "slaRiskCount",
            "overdueCount",
            "classificationCount",
            "relatedOrderContextCount",
            "riskLevel",
        },
        "support payload",
    )
    return SupportPayload(
        _safe_integer(item["slaRiskCount"], "slaRiskCount"),
        _safe_integer(item["overdueCount"], "overdueCount"),
        _safe_integer(item["classificationCount"], "classificationCount"),
        _safe_integer(item["relatedOrderContextCount"], "relatedOrderContextCount"),
        _risk_level(item["riskLevel"]),
    )


def _parse_ai_ceo_payload(item: dict[str, object]) -> AiCeoPayload:
    _exact_keys(
        item,
        {"departmentCoverage", "crossDepartmentRiskCount", "unresolvedConflictCodes", "riskLevel"},
        "ai_ceo payload",
    )
    coverage_values = _array(item["departmentCoverage"], 6, "department coverage")
    coverage = tuple(_parse_department_coverage(value) for value in coverage_values)
    conflicts = tuple(
        _reason_code(value)
        for value in _array(item["unresolvedConflictCodes"], 8, "unresolved conflict codes")
    )
    return AiCeoPayload(
        department_coverage=coverage,
        cross_department_risk_count=_safe_integer(
            item["crossDepartmentRiskCount"], "crossDepartmentRiskCount"
        ),
        unresolved_conflict_codes=conflicts,
        risk_level=_risk_level(item["riskLevel"]),
    )


def _parse_department_coverage(value: object) -> DepartmentCoverage:
    item = _dictionary(value, "department coverage")
    _exact_keys(item, {"agentKind", "status", "provenanceIds"}, "department coverage")
    return DepartmentCoverage(
        agent_kind=_literal(
            item["agentKind"], _DEPARTMENT_AGENT_KINDS, "department agentKind"
        ),  # type: ignore[arg-type]
        status=_literal(
            item["status"], _RESULT_STATUSES, "department status"
        ),  # type: ignore[arg-type]
        provenance_ids=_provenance_ids(item["provenanceIds"]),
    )


def _dictionary(value: object, name: str) -> dict[str, object]:
    if type(value) is not dict:
        raise ValueError(f"{name} must be an object")
    return value  # type: ignore[return-value]


def _exact_keys(value: dict[str, object], expected: set[str], name: str) -> None:
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        if actual - expected:
            raise ValueError(f"{name} contains unknown keys")
        raise ValueError(f"{name} is missing keys: {', '.join(missing)}")


def _array(value: object, maximum: int, name: str) -> list[object]:
    if type(value) is not list or len(value) > maximum:
        raise ValueError(f"{name} is outside its bounds")
    return value  # type: ignore[return-value]


def _bounded_text(value: object, name: str, maximum: int = 1_000) -> str:
    if type(value) is not str or not value or len(value) > maximum:
        raise ValueError(f"{name} is outside its bounds")
    return value


def _identifier(value: object, name: str) -> str:
    return _bounded_text(value, name, maximum=255)


def _literal(value: object, allowed: frozenset[str] | set[str], name: str) -> str:
    if type(value) is not str or value not in allowed:
        raise ValueError(f"{name} is invalid")
    return value


def _reason_code(value: object) -> str:
    if type(value) is not str or not _REASON_CODE.fullmatch(value):
        raise ValueError("invalid uppercase snake reason code")
    return value


def _provenance_ids(value: object) -> tuple[str, ...]:
    items = _array(value, 8, "provenanceIds")
    if not items:
        raise ValueError("provenanceIds requires one to eight entries")
    return tuple(_identifier(item, "provenanceId") for item in items)


def _safe_integer(value: object, name: str) -> int:
    if type(value) is not int or value < 0 or value > _MAX_SAFE_INTEGER:
        raise ValueError(f"{name} must be a non-negative safe integer")
    return value


def _vnd(value: object, name: str) -> int:
    try:
        return _safe_integer(value, name)
    except ValueError as error:
        raise ValueError(f"{name} must be a non-negative safe VND integer") from error


def _basis_points(value: object) -> int:
    if type(value) is not int or value < 0 or value > 10_000:
        raise ValueError("basis points must be an integer from 0 to 10000")
    return value


def _risk_level(value: object) -> RiskLevel:
    return _literal(value, _RISK_LEVELS, "riskLevel")  # type: ignore[return-value]
