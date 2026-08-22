# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, fields, is_dataclass
from datetime import datetime
from typing import Literal

from app.agentic.application.context_boundary import sensitive_text_kind
from app.agentic.domain.model_result_schemas import (
    AiCeoPayload,
    CatalogPayload,
    CrmPayload,
    FinancePayload,
    InventoryPayload,
    ModelResultEnvelope,
    OrderPayload,
    ProvenanceEvidence,
    SupportPayload,
    inspect_model_result,
    parse_model_result,
)
from app.agentic.domain.model_runtime import (
    AgentKind,
    FrozenJsonMapping,
    QualityDecision,
)


FreshnessStatus = Literal["fresh", "stale"]
DataClassification = Literal["public", "internal", "confidential", "restricted"]

_AGENT_KINDS = frozenset(
    {"ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"}
)
_CLASSIFICATIONS = frozenset({"public", "internal", "confidential", "restricted"})
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$")
_REASON_CODE = re.compile(r"^[A-Z][A-Z0-9_]{0,99}$")
_PROMPT_INJECTION = (
    re.compile(
        r"(?i)\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|system)\s+"
        r"(?:system\s+)?instructions?\b"
    ),
    re.compile(
        r"(?i)\boverride\s+(?:the\s+)?"
        r"(?:system|policy|permissions?|approval|tools?)\b"
    ),
    re.compile(
        r"(?i)\bbypass\s+(?:the\s+)?"
        r"(?:policy|permissions?|approval|system|tools?)\b"
    ),
    re.compile(r"(?i)\bact\s+as\s+(?:the\s+)?system\b"),
)
_PHASE_F_SEMANTICS = (
    re.compile(r"(?i)\bdelegat(?:e|es|ed|ing|ion)\b"),
    re.compile(r"(?i)\bassign(?:ee|ees|ment|ments)?\b"),
    re.compile(r"(?i)\bsubtasks?\b"),
    re.compile(r"(?i)\btask\s+plan\b"),
    re.compile(r"(?i)\b(?:create|split|route|dispatch)\s+(?:a\s+|the\s+)?tasks?\b"),
    re.compile(r"(?i)\bagent\s+calls?\b"),
    re.compile(r"(?i)\bcall\s+(?:the\s+)?[a-z0-9_-]+\s+agent\b"),
)
_AI_CEO_PHASE_F_SEMANTICS = re.compile(r"(?i)\b(?:tasks?|assignees?|agent[- ]calls?)\b")
_ROUND_TWO_PARTIAL_REASONS = frozenset(
    {"MISSING_AUTHORITATIVE_EVIDENCE", "FRESHNESS_INVALID"}
)
_IMMEDIATE_PROVENANCE_REASONS = frozenset({"PROVENANCE_SOURCE_MISMATCH"})


@dataclass(frozen=True)
class AuthoritativeEvidenceFact:
    provenance_id: str
    source: str
    retrieved_at: str
    freshness_status: FreshnessStatus

    def __post_init__(self) -> None:
        if not _is_safe_identifier(self.provenance_id):
            _invalid_context()
        if (
            type(self.source) is not str
            or not 1 <= len(self.source) <= 255
            or sensitive_text_kind(self.source) is not None
        ):
            _invalid_context()
        if not _is_offset_timestamp(self.retrieved_at):
            _invalid_context()
        if self.freshness_status not in {"fresh", "stale"}:
            _invalid_context()


@dataclass(frozen=True)
class AuthoritativeQualityContext:
    expected_agent_kind: AgentKind
    correction_round: int
    authorized_evidence: tuple[AuthoritativeEvidenceFact, ...]
    expected_payload: Mapping[str, object]
    unresolved_conflict_codes: tuple[str, ...]
    purpose: str
    authorized_agent_scope: tuple[AgentKind, ...]
    data_classification: DataClassification

    def __post_init__(self) -> None:
        try:
            evidence = tuple(self.authorized_evidence)
            conflicts = tuple(self.unresolved_conflict_codes)
            scope = tuple(self.authorized_agent_scope)
            if self.expected_agent_kind not in _AGENT_KINDS:
                _invalid_context()
            if (
                type(self.correction_round) is not int
                or not 0 <= self.correction_round <= 2
            ):
                _invalid_context()
            if not 1 <= len(evidence) <= 24 or any(
                type(item) is not AuthoritativeEvidenceFact for item in evidence
            ):
                _invalid_context()
            evidence_ids = tuple(item.provenance_id for item in evidence)
            if len(set(evidence_ids)) != len(evidence_ids):
                _invalid_context()
            if not 0 <= len(conflicts) <= 8 or any(
                type(code) is not str or not _REASON_CODE.fullmatch(code)
                for code in conflicts
            ):
                _invalid_context()
            if not 1 <= len(scope) <= 7 or len(set(scope)) != len(scope):
                _invalid_context()
            if any(agent_kind not in _AGENT_KINDS for agent_kind in scope):
                _invalid_context()
            if type(self.purpose) is not str or not 1 <= len(self.purpose) <= 100:
                _invalid_context()
            if self.data_classification not in _CLASSIFICATIONS:
                _invalid_context()
            parsed_payload = _parse_authoritative_payload(
                self.expected_agent_kind, _mutable_json(self.expected_payload)
            )
        except ValueError:
            _invalid_context()
        object.__setattr__(self, "authorized_evidence", evidence)
        object.__setattr__(self, "unresolved_conflict_codes", conflicts)
        object.__setattr__(self, "authorized_agent_scope", scope)
        object.__setattr__(
            self,
            "expected_payload",
            FrozenJsonMapping(_payload_as_mapping(parsed_payload)),
        )


class QualityGate:
    def evaluate(
        self, raw_result: object, context: AuthoritativeQualityContext
    ) -> QualityDecision:
        try:
            inspection = inspect_model_result(raw_result)
        except (TypeError, ValueError, RecursionError, OverflowError) as error:
            return _quality_failure_decision(
                context.correction_round, (_schema_failure_code(error),), ()
            )

        result = inspection.envelope
        reasons: list[str] = []
        escalation = False
        if "PROVENANCE_IDS_DUPLICATE" in inspection.issue_codes:
            _append_reason(reasons, "PROVENANCE_INVALID")
        classification_blocked = (
            "EVIDENCE_CLASSIFICATION_BLOCKED" in inspection.issue_codes
        )
        authorized = {
            item.provenance_id: item for item in context.authorized_evidence
        }
        evidence_by_id: dict[str, ProvenanceEvidence] = {}
        safe_involved_ids: set[str] = set()
        material_ids = _material_provenance_ids(result)

        if not result.evidence or not material_ids:
            _append_reason(reasons, "MISSING_AUTHORITATIVE_EVIDENCE")

        evidence_ids = [item.provenance_id for item in result.evidence]
        duplicate_ids = {item for item in evidence_ids if evidence_ids.count(item) > 1}
        if duplicate_ids:
            _append_reason(reasons, "PROVENANCE_INVALID")
            safe_involved_ids.update(duplicate_ids & authorized.keys())
        for item in result.evidence:
            evidence_by_id.setdefault(item.provenance_id, item)
            if item.provenance_id not in authorized:
                _append_reason(reasons, "PROVENANCE_INVALID")
            elif item.source != authorized[item.provenance_id].source:
                _append_reason(reasons, "PROVENANCE_SOURCE_MISMATCH")
                safe_involved_ids.add(item.provenance_id)

        if any(identifier not in authorized for identifier in material_ids):
            _append_reason(reasons, "PROVENANCE_INVALID")
        missing_ids = {
            identifier
            for identifier in material_ids
            if identifier in authorized and identifier not in evidence_by_id
        }
        if missing_ids:
            _append_reason(reasons, "MISSING_AUTHORITATIVE_EVIDENCE")
            safe_involved_ids.update(missing_ids)
        safe_involved_ids.update(
            identifier for identifier in material_ids if identifier in authorized
        )
        if result.status == "partial":
            _append_reason(reasons, "RESULT_STATUS_PARTIAL")

        escalation = escalation or any(
            reason in _IMMEDIATE_PROVENANCE_REASONS for reason in reasons
        )
        if classification_blocked:
            _append_reason(reasons, "SCOPE_VIOLATION")
            escalation = True
        if result.agent_kind != context.expected_agent_kind:
            _append_reason(reasons, "AGENT_KIND_MISMATCH")
            escalation = True
        if context.purpose != "department_analysis":
            _append_reason(reasons, "PURPOSE_SCOPE_VIOLATION")
            escalation = True
        if context.expected_agent_kind not in context.authorized_agent_scope:
            _append_reason(reasons, "DATA_SCOPE_VIOLATION")
            escalation = True
        if context.data_classification != "internal":
            _append_reason(reasons, "CLASSIFICATION_BLOCKED")
            escalation = True

        freshness_mismatch = False
        for actual in result.evidence:
            expected = authorized.get(actual.provenance_id)
            if expected is None:
                continue
            if (
                actual.retrieved_at != expected.retrieved_at
                or actual.freshness_status != expected.freshness_status
                or actual.freshness_status != "fresh"
            ):
                freshness_mismatch = True
                safe_involved_ids.add(actual.provenance_id)
        if freshness_mismatch:
            _append_reason(reasons, "FRESHNESS_INVALID")

        if _payload_as_mapping(result.payload) != dict(context.expected_payload):
            _append_reason(reasons, "MATERIAL_PAYLOAD_MISMATCH")

        leakage = _leakage_kinds(result)
        for reason in (
            "SENSITIVE_DATA_LEAKAGE",
            "PROVIDER_EVIDENCE_LEAKAGE",
            "PROMPT_INJECTION_DETECTED",
            "PHASE_F_SEMANTICS_BLOCKED",
        ):
            if reason in leakage:
                _append_reason(reasons, reason)
                escalation = True

        model_conflicts = (
            result.payload.unresolved_conflict_codes
            if isinstance(result.payload, AiCeoPayload)
            else ()
        )
        if context.unresolved_conflict_codes or model_conflicts:
            _append_reason(reasons, "UNRESOLVED_CONFLICT")
            escalation = True

        safe_ids = (
            ()
            if classification_blocked
            else tuple(sorted(safe_involved_ids))
        )
        if escalation:
            return QualityDecision("escalate", tuple(reasons), safe_ids)
        if reasons:
            return _quality_failure_decision(
                context.correction_round, tuple(reasons), safe_ids
            )
        return QualityDecision("accepted", (), safe_ids)


def _quality_failure_decision(
    correction_round: int, reasons: tuple[str, ...], evidence_ids: tuple[str, ...]
) -> QualityDecision:
    if correction_round < 2:
        return QualityDecision("correct", reasons, evidence_ids)
    evidence_reasons = tuple(
        reason for reason in reasons if reason != "RESULT_STATUS_PARTIAL"
    )
    can_return_partial = (
        bool(evidence_reasons)
        and all(reason in _ROUND_TWO_PARTIAL_REASONS for reason in evidence_reasons)
        and all(
            reason in _ROUND_TWO_PARTIAL_REASONS
            or reason == "RESULT_STATUS_PARTIAL"
            for reason in reasons
        )
    )
    outcome = "partial" if can_return_partial else "escalate"
    return QualityDecision(outcome, reasons, evidence_ids)


def _schema_failure_code(error: Exception) -> str:
    if type(error) is ValueError:
        if str(error) == "invalid uppercase snake reason code":
            return "RESULT_REASON_CODE_INVALID"
        if str(error) == "provenanceIds requires one to eight entries":
            return "RESULT_PROVENANCE_INVALID"
    return "SCHEMA_INVALID"


def _append_reason(reasons: list[str], reason: str) -> None:
    if reason not in reasons:
        reasons.append(reason)


def _material_provenance_ids(result: ModelResultEnvelope) -> tuple[str, ...]:
    identifiers: list[str] = []
    for item in (*result.conclusions, *result.risks, *result.recommended_actions):
        identifiers.extend(item.provenance_ids)
    if isinstance(result.payload, AiCeoPayload):
        for item in result.payload.department_coverage:
            identifiers.extend(item.provenance_ids)
    return tuple(dict.fromkeys(identifiers))


def _leakage_kinds(result: ModelResultEnvelope) -> set[str]:
    reasons: set[str] = set()
    for value in _model_strings(result):
        kind = sensitive_text_kind(value)
        if kind == "sensitive":
            reasons.add("SENSITIVE_DATA_LEAKAGE")
        elif kind == "provider_evidence":
            reasons.add("PROVIDER_EVIDENCE_LEAKAGE")
        if any(pattern.search(value) for pattern in _PROMPT_INJECTION):
            reasons.add("PROMPT_INJECTION_DETECTED")
        if any(pattern.search(value) for pattern in _PHASE_F_SEMANTICS):
            reasons.add("PHASE_F_SEMANTICS_BLOCKED")
        if result.agent_kind == "ai_ceo" and _AI_CEO_PHASE_F_SEMANTICS.search(value):
            reasons.add("PHASE_F_SEMANTICS_BLOCKED")
    return reasons


def _model_strings(value: object) -> Iterable[str]:
    stack = [value]
    while stack:
        item = stack.pop()
        if type(item) is str:
            yield item
        elif is_dataclass(item) and not isinstance(item, type):
            stack.extend(getattr(item, field.name) for field in fields(item))
        elif isinstance(item, Mapping):
            stack.extend(item.values())
        elif type(item) in (tuple, list):
            stack.extend(item)


def _payload_as_mapping(payload: object) -> dict[str, object]:
    if isinstance(payload, CatalogPayload):
        return {
            "completenessBasisPoints": payload.completeness_basis_points,
            "productsAtRisk": payload.products_at_risk,
            "publicationBlockerCount": payload.publication_blocker_count,
            "merchandisingSignalCount": payload.merchandising_signal_count,
            "riskLevel": payload.risk_level,
        }
    if isinstance(payload, InventoryPayload):
        return {
            "atRiskSkuCount": payload.at_risk_sku_count,
            "slowStockSkuCount": payload.slow_stock_sku_count,
            "reservationAnomalyCount": payload.reservation_anomaly_count,
            "affectedProductCount": payload.affected_product_count,
            "riskLevel": payload.risk_level,
        }
    if isinstance(payload, OrderPayload):
        return {
            "stalledOrderCount": payload.stalled_order_count,
            "invalidTransitionCount": payload.invalid_transition_count,
            "expiryRiskCount": payload.expiry_risk_count,
            "affectedOrderCount": payload.affected_order_count,
            "riskLevel": payload.risk_level,
        }
    if isinstance(payload, FinancePayload):
        return {
            "pendingPaymentCount": payload.pending_payment_count,
            "pendingAmountVnd": payload.pending_amount_vnd,
            "discrepancyCount": payload.discrepancy_count,
            "discrepancyAmountVnd": payload.discrepancy_amount_vnd,
            "providerEvidenceCoverageBasisPoints": (
                payload.provider_evidence_coverage_basis_points
            ),
            "riskLevel": payload.risk_level,
        }
    if isinstance(payload, CrmPayload):
        return {
            "segmentCount": payload.segment_count,
            "followupOpportunityCount": payload.followup_opportunity_count,
            "repeatCustomerCount": payload.repeat_customer_count,
            "lifetimePaidRevenueVnd": payload.lifetime_paid_revenue_vnd,
            "riskLevel": payload.risk_level,
        }
    if isinstance(payload, SupportPayload):
        return {
            "slaRiskCount": payload.sla_risk_count,
            "overdueCount": payload.overdue_count,
            "classificationCount": payload.classification_count,
            "relatedOrderContextCount": payload.related_order_context_count,
            "riskLevel": payload.risk_level,
        }
    if isinstance(payload, AiCeoPayload):
        return {
            "departmentCoverage": tuple(
                FrozenJsonMapping(
                    {
                        "agentKind": item.agent_kind,
                        "status": item.status,
                        "provenanceIds": item.provenance_ids,
                    }
                )
                for item in payload.department_coverage
            ),
            "crossDepartmentRiskCount": payload.cross_department_risk_count,
            "unresolvedConflictCodes": payload.unresolved_conflict_codes,
            "riskLevel": payload.risk_level,
        }
    raise ValueError("authoritative quality context is invalid")


def _parse_authoritative_payload(agent_kind: AgentKind, payload: object) -> object:
    result = parse_model_result(
        {
            "schemaVersion": 1,
            "agentKind": agent_kind,
            "status": "complete",
            "summary": "Authoritative payload validation.",
            "conclusions": [],
            "risks": [],
            "recommendedActions": [],
            "evidence": [],
            "payload": payload,
        }
    )
    return result.payload


def _mutable_json(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _mutable_json(item) for key, item in value.items()}
    if type(value) in (tuple, list):
        return [_mutable_json(item) for item in value]
    return value


def _is_safe_identifier(value: object) -> bool:
    return (
        type(value) is str
        and _SAFE_IDENTIFIER.fullmatch(value) is not None
        and sensitive_text_kind(value) is None
    )


def _is_offset_timestamp(value: object) -> bool:
    if type(value) is not str or len(value) > 100:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _invalid_context() -> None:
    raise ValueError("authoritative quality context is invalid") from None
