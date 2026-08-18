# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
import math
import re
from collections.abc import Iterator, Mapping
from dataclasses import dataclass

from app.agentic.domain.model_runtime import AgentKind, FrozenJsonMapping


_AGENT_FIELDS: dict[AgentKind, frozenset[str]] = {
    "ai_ceo": frozenset(
        {
            "departmentSummaries",
            "crossDepartmentRisks",
            "crossDepartmentRiskCount",
            "unresolvedConflictCodes",
            "riskLevel",
            "summary",
            "evidence",
        }
    ),
    "catalog": frozenset(
        {
            "completenessBasisPoints",
            "productsAtRisk",
            "publicationBlockerCount",
            "merchandisingSignalCount",
            "riskLevel",
            "summary",
            "evidence",
        }
    ),
    "inventory": frozenset(
        {
            "atRiskSkuCount",
            "slowStockSkuCount",
            "reservationAnomalyCount",
            "affectedProductCount",
            "riskLevel",
            "summary",
            "evidence",
        }
    ),
    "order": frozenset(
        {
            "stalledOrderCount",
            "invalidTransitionCount",
            "expiryRiskCount",
            "affectedOrderCount",
            "riskLevel",
            "summary",
            "evidence",
        }
    ),
    "finance": frozenset(
        {
            "pendingPaymentCount",
            "pendingAmountVnd",
            "discrepancyCount",
            "discrepancyAmountVnd",
            "providerEvidenceCoverageBasisPoints",
            "riskLevel",
            "summary",
            "evidence",
        }
    ),
    "crm": frozenset(
        {
            "segmentCount",
            "followupOpportunityCount",
            "repeatCustomerCount",
            "lifetimePaidRevenueVnd",
            "riskLevel",
            "summary",
            "evidence",
        }
    ),
    "support": frozenset(
        {
            "slaRiskCount",
            "overdueCount",
            "classificationCount",
            "relatedOrderContextCount",
            "riskLevel",
            "summary",
            "evidence",
        }
    ),
}
_SENSITIVE_FIELDS = frozenset(
    {
        "apikey",
        "customerid",
        "customeridentifier",
        "customername",
        "customeremail",
        "customerphone",
        "paymenttransactionid",
        "password",
        "providerpayload",
        "providerreference",
        "providertransactionid",
        "rawtickettext",
        "secret",
        "ticketbody",
        "ticketmessage",
        "transactionid",
    }
)
_AI_CEO_FORBIDDEN_FIELDS = frozenset(
    {
        "agentcall",
        "agentcalls",
        "assignee",
        "assignees",
        "delegation",
        "subtask",
        "subtasks",
        "task",
        "taskplan",
        "tasks",
        "toolcall",
        "toolcalls",
    }
)
_EMAIL = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_PHONE = re.compile(r"(?<!\d)(?:\+?84|0)(?:[ .-]?\d){9,10}(?!\d)")
_INTERNATIONAL_PHONE = re.compile(r"(?<!\w)\+[1-9]\d{0,2}(?:[ .()-]?\d){7,12}(?!\d)")
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Z0-9._~+/=-]{8,}")
_CREDENTIAL = re.compile(
    r"(?i)(?:api[_-]?key|secret|password|client[_-]?secret)\s*[:=]\s*\S+"
)
_PRIVATE_KEY = re.compile(r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----")
_COMMON_API_KEY = re.compile(r"(?:\bsk-[A-Za-z0-9_-]{20,}\b|\bAKIA[A-Z0-9]{16}\b)")
_GITHUB_TOKEN = re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")
_SENSITIVE_EVIDENCE = re.compile(
    r"(?i)(?:customer[_ -]?id|provider[_ -]?transaction[_ -]?id|"
    r"raw[_ -]?ticket[_ -]?text)\s*[:=]\s*\S+"
)
_MAX_STRING_LENGTH = 1_000
_MAX_DEPTH = 6
_MAX_COLLECTION_ITEMS = 128
_MAX_TOTAL_FIELDS = 128
_MAX_TOTAL_ITEMS = 512
_MAX_SERIALIZED_BYTES = 32_768


class ContextBoundaryFailure(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ClassifiedValue:
    classification: str
    value: object


@dataclass(frozen=True)
class AuthorizedContextInput:
    classification: str
    fields: Mapping[str, object]

    def __post_init__(self) -> None:
        object.__setattr__(self, "fields", _freeze_input(self.fields))


@dataclass(frozen=True, init=False, eq=False)
class _FrozenInputMapping(Mapping[str, object]):
    _items: tuple[tuple[str, object], ...]

    def __init__(
        self, value: Mapping[str, object], active_ids: set[int] | None = None
    ) -> None:
        active = set() if active_ids is None else active_ids
        identity = id(value)
        if identity in active:
            raise ContextBoundaryFailure("CONTEXT_STRUCTURE_INVALID")
        active.add(identity)
        try:
            items = tuple(
                (key, _freeze_input(item, active)) for key, item in value.items()
            )
        finally:
            active.remove(identity)
        object.__setattr__(self, "_items", items)

    def __getitem__(self, key: str) -> object:
        for candidate, value in self._items:
            if candidate == key:
                return value
        raise KeyError(key)

    def __iter__(self) -> Iterator[str]:
        return (key for key, _value in self._items)

    def __len__(self) -> int:
        return len(self._items)


@dataclass(frozen=True, init=False, eq=False)
class AuthorizedContext(Mapping[str, object]):
    _value: FrozenJsonMapping

    def __init__(self, value: Mapping[str, object]) -> None:
        object.__setattr__(self, "_value", FrozenJsonMapping(value))

    def __getitem__(self, key: str) -> object:
        return self._value[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._value)

    def __len__(self) -> int:
        return len(self._value)


@dataclass
class _Bounds:
    fields: int = 0
    items: int = 0


def enforce_context_boundary(
    agent_kind: AgentKind, context: AuthorizedContextInput
) -> AuthorizedContext:
    allowed_fields = _AGENT_FIELDS.get(agent_kind)
    if allowed_fields is None:
        raise ContextBoundaryFailure("CONTEXT_AGENT_KIND_UNSUPPORTED")
    _require_internal(context.classification)
    bounds = _Bounds()
    filtered = _filter_mapping(
        context.fields,
        inherited_classification=context.classification,
        depth=0,
        bounds=bounds,
        allowed_top_level=allowed_fields,
        forbidden_fields=(
            _AI_CEO_FORBIDDEN_FIELDS if agent_kind == "ai_ceo" else frozenset()
        ),
    )
    serialized = json.dumps(
        filtered,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    if len(serialized) > _MAX_SERIALIZED_BYTES:
        raise ContextBoundaryFailure("CONTEXT_SIZE_LIMIT_EXCEEDED")
    return AuthorizedContext(filtered)


def context_as_plain_json(context: AuthorizedContext) -> dict[str, object]:
    if type(context) is not AuthorizedContext:
        raise TypeError("authorized context is required")
    return {key: _thaw(context[key]) for key in context}


def _filter_mapping(
    value: Mapping[str, object],
    *,
    inherited_classification: str,
    depth: int,
    bounds: _Bounds,
    allowed_top_level: frozenset[str] | None = None,
    forbidden_fields: frozenset[str] = frozenset(),
) -> dict[str, object]:
    _check_depth(depth)
    bounds.fields += len(value)
    if bounds.fields > _MAX_TOTAL_FIELDS:
        raise ContextBoundaryFailure("CONTEXT_FIELD_LIMIT_EXCEEDED")
    if len(value) > _MAX_COLLECTION_ITEMS:
        raise ContextBoundaryFailure("CONTEXT_COLLECTION_LIMIT_EXCEEDED")
    result: dict[str, object] = {}
    for key, item in value.items():
        if type(key) is not str:
            raise ContextBoundaryFailure("CONTEXT_TYPE_UNSUPPORTED")
        if len(key) > _MAX_STRING_LENGTH:
            raise ContextBoundaryFailure("CONTEXT_STRING_LIMIT_EXCEEDED")
        normalized_field = _normalized_field(key)
        if normalized_field in forbidden_fields:
            raise ContextBoundaryFailure("CONTEXT_FORBIDDEN_SEMANTIC_FIELD")
        if normalized_field in _SENSITIVE_FIELDS:
            raise ContextBoundaryFailure("CONTEXT_SENSITIVE_FIELD_BLOCKED")
        filtered = _filter_value(
            item,
            inherited_classification=inherited_classification,
            depth=depth + 1,
            bounds=bounds,
            forbidden_fields=forbidden_fields,
        )
        if allowed_top_level is None or key in allowed_top_level:
            result[key] = filtered
    return result


def _filter_value(
    value: object,
    *,
    inherited_classification: str,
    depth: int,
    bounds: _Bounds,
    forbidden_fields: frozenset[str],
) -> object:
    _check_depth(depth)
    classification = inherited_classification
    if isinstance(value, ClassifiedValue):
        classification = value.classification
        value = value.value
    _require_internal(classification)
    bounds.items += 1
    if bounds.items > _MAX_TOTAL_ITEMS:
        raise ContextBoundaryFailure("CONTEXT_COLLECTION_LIMIT_EXCEEDED")
    if isinstance(value, Mapping):
        return _filter_mapping(
            value,
            inherited_classification=classification,
            depth=depth,
            bounds=bounds,
            forbidden_fields=forbidden_fields,
        )
    if type(value) in (tuple, list):
        if len(value) > _MAX_COLLECTION_ITEMS:
            raise ContextBoundaryFailure("CONTEXT_COLLECTION_LIMIT_EXCEEDED")
        return [
            _filter_value(
                item,
                inherited_classification=classification,
                depth=depth + 1,
                bounds=bounds,
                forbidden_fields=forbidden_fields,
            )
            for item in value
        ]
    if type(value) is str:
        if len(value) > _MAX_STRING_LENGTH:
            raise ContextBoundaryFailure("CONTEXT_STRING_LIMIT_EXCEEDED")
        if any(
            pattern.search(value)
            for pattern in (
                _EMAIL,
                _PHONE,
                _INTERNATIONAL_PHONE,
                _BEARER,
                _CREDENTIAL,
                _PRIVATE_KEY,
                _COMMON_API_KEY,
                _GITHUB_TOKEN,
                _SENSITIVE_EVIDENCE,
            )
        ):
            raise ContextBoundaryFailure("CONTEXT_SENSITIVE_DATA_BLOCKED")
        return value
    if type(value) is float and not math.isfinite(value):
        raise ContextBoundaryFailure("CONTEXT_NUMBER_INVALID")
    if value is None or type(value) in (bool, int, float):
        return value
    raise ContextBoundaryFailure("CONTEXT_TYPE_UNSUPPORTED")


def _require_internal(classification: object) -> None:
    if type(classification) is not str or classification != "internal":
        raise ContextBoundaryFailure("CONTEXT_CLASSIFICATION_BLOCKED")


def _check_depth(depth: int) -> None:
    if depth > _MAX_DEPTH:
        raise ContextBoundaryFailure("CONTEXT_DEPTH_LIMIT_EXCEEDED")


def _normalized_field(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _freeze_input(value: object, active_ids: set[int] | None = None) -> object:
    if isinstance(value, ClassifiedValue):
        return ClassifiedValue(
            value.classification, _freeze_input(value.value, active_ids)
        )
    if isinstance(value, Mapping):
        return _FrozenInputMapping(value, active_ids)
    if type(value) in (list, tuple):
        active = set() if active_ids is None else active_ids
        identity = id(value)
        if identity in active:
            raise ContextBoundaryFailure("CONTEXT_STRUCTURE_INVALID")
        active.add(identity)
        try:
            return tuple(_freeze_input(item, active) for item in value)
        finally:
            active.remove(identity)
    return value


def _thaw(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if type(value) is tuple:
        return [_thaw(item) for item in value]
    return value
