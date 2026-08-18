# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import base64
import binascii
import json
import math
import re
from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from datetime import datetime

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
        "accesskey",
        "accesstoken",
        "address",
        "apikey",
        "billingaddress",
        "credential",
        "credentials",
        "customerid",
        "customeridentifier",
        "customername",
        "customeremail",
        "customerphone",
        "firstname",
        "fullname",
        "lastname",
        "paymenttransactionid",
        "password",
        "privatekey",
        "providerpayload",
        "providerreference",
        "providertransactionid",
        "rawtickettext",
        "refreshtoken",
        "secret",
        "shippingaddress",
        "signingkey",
        "ticketbody",
        "ticketmessage",
        "transactionid",
        "token",
    }
)
_SENSITIVE_FIELD_SUFFIXES = (
    "address",
    "credential",
    "credentials",
    "email",
    "key",
    "name",
    "password",
    "phone",
    "privatekey",
    "secret",
    "token",
)
_SENSITIVE_IDENTITY_FIELDS = frozenset(
    {
        "citizenid",
        "dateofbirth",
        "dob",
        "governmentid",
        "governmentidentifier",
        "identitynumber",
        "nationalid",
        "passport",
        "passportid",
        "passportnumber",
    }
)
_SENSITIVE_FINANCIAL_FIELDS = frozenset(
    {
        "accountnumber",
        "bankaccount",
        "bankaccountnumber",
        "cardnumber",
        "cardsecuritycode",
        "cvc",
        "cvv",
        "paymentcredential",
        "paymentcredentials",
    }
)
_SENSITIVE_AUTH_FIELDS = frozenset(
    {
        "authorization",
        "authorizationheader",
        "authheader",
        "cookie",
        "cookies",
        "sessioncookie",
        "sessionid",
        "setcookie",
    }
)
_AGENT_METRIC_FIELDS: dict[AgentKind, frozenset[str]] = {
    "ai_ceo": frozenset({"crossDepartmentRiskCount"}),
    "catalog": frozenset(
        {
            "completenessBasisPoints",
            "productsAtRisk",
            "publicationBlockerCount",
            "merchandisingSignalCount",
        }
    ),
    "inventory": frozenset(
        {
            "atRiskSkuCount",
            "slowStockSkuCount",
            "reservationAnomalyCount",
            "affectedProductCount",
        }
    ),
    "order": frozenset(
        {
            "stalledOrderCount",
            "invalidTransitionCount",
            "expiryRiskCount",
            "affectedOrderCount",
        }
    ),
    "finance": frozenset(
        {
            "pendingPaymentCount",
            "pendingAmountVnd",
            "discrepancyCount",
            "discrepancyAmountVnd",
            "providerEvidenceCoverageBasisPoints",
        }
    ),
    "crm": frozenset(
        {
            "segmentCount",
            "followupOpportunityCount",
            "repeatCustomerCount",
            "lifetimePaidRevenueVnd",
        }
    ),
    "support": frozenset(
        {
            "slaRiskCount",
            "overdueCount",
            "classificationCount",
            "relatedOrderContextCount",
        }
    ),
}
_BASIS_POINT_FIELDS = frozenset(
    {"completenessBasisPoints", "providerEvidenceCoverageBasisPoints"}
)
_RISK_LEVELS = frozenset({"low", "medium", "high"})
_FRESHNESS_STATUSES = frozenset({"fresh", "stale", "unknown"})
_DEPARTMENT_AGENT_KINDS = frozenset(
    {"catalog", "inventory", "order", "finance", "crm", "support"}
)
_RESULT_STATUSES = frozenset({"complete", "partial"})
_REASON_CODE = re.compile(r"^[A-Z][A-Z0-9_]{0,99}$")
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$")
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
_COMPACT_JWT = re.compile(
    r"(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{8,512}={0,2}\."
    r"[A-Za-z0-9_-]{8,512}={0,2}\.[A-Za-z0-9_-]{8,512}={0,2}"
    r"(?![A-Za-z0-9_=-])"
)
_PAYMENT_CARD_CANDIDATE = re.compile(
    r"(?<![0-9])(?:[0-9][ -]?){12,18}[0-9](?![0-9])"
)
_SENSITIVE_EVIDENCE = re.compile(
    r"(?i)(?:customer[_ -]?id|provider[_ -]?transaction[_ -]?id|"
    r"raw[_ -]?ticket[_ -]?text)\s*[:=]\s*\S+|"
    r"\b(?:sepay\s+)?provider\s+transaction\s+\S+"
)
_SENSITIVE_LABEL_VALUE = re.compile(
    r"(?i)\b(?:full[_ -]?name|customer[_ -]?name|shipping[_ -]?address|"
    r"billing[_ -]?address|home[_ -]?address|credit[_ -]?card[_ -]?number|"
    r"national[_ -]?id|private[_ -]?key|access[_ -]?token|refresh[_ -]?token)"
    r"\s*(?::|=|\bis\b)\s*[^\r\n]{1,256}"
)
_MAX_STRING_LENGTH = 1_000
_MAX_DEPTH = 6
_MAX_COLLECTION_ITEMS = 128
_MAX_FIELDS_PER_MAPPING = 128
_MAX_TOTAL_FIELDS = 512
_MAX_TOTAL_ITEMS = 512
_MAX_SERIALIZED_BYTES = 32_768
_MAX_SAFE_INTEGER = 9_007_199_254_740_991


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
    fields: Mapping[str, object] = field(repr=False, compare=False)


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
    forbidden_fields = (
        _AI_CEO_FORBIDDEN_FIELDS if agent_kind == "ai_ceo" else frozenset()
    )
    _preflight_input(context.fields, forbidden_fields)
    filtered = _parse_typed_context(agent_kind, context.fields, forbidden_fields)
    _serialized_text, serialized = _serialize_json(filtered)
    if len(serialized) > _MAX_SERIALIZED_BYTES:
        raise ContextBoundaryFailure("CONTEXT_SIZE_LIMIT_EXCEEDED")
    return AuthorizedContext(filtered)


def context_as_plain_json(context: AuthorizedContext) -> dict[str, object]:
    if type(context) is not AuthorizedContext:
        raise TypeError("authorized context is required")
    return {key: _thaw(context[key]) for key in context}


def serialize_authorized_context(context: AuthorizedContext) -> str:
    serialized, _encoded = _serialize_json(context_as_plain_json(context))
    return serialized


def _parse_typed_context(
    agent_kind: AgentKind,
    value: Mapping[str, object],
    forbidden_fields: frozenset[str],
) -> dict[str, object]:
    allowed_fields = _AGENT_FIELDS[agent_kind]
    metric_fields = _AGENT_METRIC_FIELDS[agent_kind]
    result: dict[str, object] = {}
    for key, item in value.items():
        _validate_context_key(key, forbidden_fields)
        if key not in allowed_fields:
            continue
        item = _unwrap_internal(item)
        if key in metric_fields:
            result[key] = _safe_non_negative_integer(
                item, basis_points=key in _BASIS_POINT_FIELDS
            )
        elif key == "riskLevel":
            result[key] = _safe_literal(item, _RISK_LEVELS)
        elif key == "summary":
            result[key] = _safe_string(item)
        elif key == "evidence":
            result[key] = _parse_evidence(item)
        elif key == "departmentSummaries" and agent_kind == "ai_ceo":
            result[key] = _parse_department_summaries(item, forbidden_fields)
        elif key == "crossDepartmentRisks" and agent_kind == "ai_ceo":
            result[key] = _parse_cross_department_risks(item, forbidden_fields)
        elif key == "unresolvedConflictCodes" and agent_kind == "ai_ceo":
            result[key] = _parse_reason_codes(item, maximum=8)
        else:
            raise ContextBoundaryFailure("CONTEXT_SCHEMA_INVALID")
    return result


def _parse_evidence(value: object) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for raw_item in _safe_array(value, maximum=24):
        item = _exact_object(
            raw_item,
            {
                "provenanceId",
                "source",
                "retrievedAt",
                "freshnessStatus",
                "classification",
            },
        )
        classification = _unwrap_internal(item["classification"])
        _require_internal(classification)
        retrieved_at = _safe_string(_unwrap_internal(item["retrievedAt"]), maximum=100)
        if not _is_offset_datetime(retrieved_at):
            raise ContextBoundaryFailure("CONTEXT_VALUE_INVALID")
        result.append(
            {
                "provenanceId": _safe_identifier(
                    _unwrap_internal(item["provenanceId"])
                ),
                "source": _safe_identifier(_unwrap_internal(item["source"])),
                "retrievedAt": retrieved_at,
                "freshnessStatus": _safe_literal(
                    _unwrap_internal(item["freshnessStatus"]),
                    _FRESHNESS_STATUSES,
                ),
                "classification": "internal",
            }
        )
    return result


def _parse_department_summaries(
    value: object, forbidden_fields: frozenset[str]
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    seen: set[str] = set()
    for raw_item in _safe_array(value, maximum=6):
        item = _exact_object(
            raw_item,
            {"agentKind", "status", "riskLevel", "summary", "provenanceIds"},
            forbidden_fields,
        )
        agent_kind = _safe_literal(
            _unwrap_internal(item["agentKind"]), _DEPARTMENT_AGENT_KINDS
        )
        if agent_kind in seen:
            raise ContextBoundaryFailure("CONTEXT_VALUE_INVALID")
        seen.add(agent_kind)
        result.append(
            {
                "agentKind": agent_kind,
                "status": _safe_literal(
                    _unwrap_internal(item["status"]), _RESULT_STATUSES
                ),
                "riskLevel": _safe_literal(
                    _unwrap_internal(item["riskLevel"]), _RISK_LEVELS
                ),
                "summary": _safe_string(_unwrap_internal(item["summary"])),
                "provenanceIds": _parse_provenance_ids(item["provenanceIds"]),
            }
        )
    return result


def _parse_cross_department_risks(
    value: object, forbidden_fields: frozenset[str]
) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for raw_item in _safe_array(value, maximum=8):
        item = _exact_object(
            raw_item,
            {"code", "severity", "summary", "provenanceIds"},
            forbidden_fields,
        )
        result.append(
            {
                "code": _safe_reason_code(_unwrap_internal(item["code"])),
                "severity": _safe_literal(
                    _unwrap_internal(item["severity"]), _RISK_LEVELS
                ),
                "summary": _safe_string(_unwrap_internal(item["summary"])),
                "provenanceIds": _parse_provenance_ids(item["provenanceIds"]),
            }
        )
    return result


def _parse_provenance_ids(value: object) -> list[str]:
    return [
        _safe_identifier(_unwrap_internal(item))
        for item in _safe_array(value, maximum=8, minimum=1)
    ]


def _parse_reason_codes(value: object, *, maximum: int) -> list[str]:
    return [
        _safe_reason_code(_unwrap_internal(item))
        for item in _safe_array(value, maximum=maximum)
    ]


def _exact_object(
    value: object,
    expected_keys: set[str],
    forbidden_fields: frozenset[str] = frozenset(),
) -> Mapping[str, object]:
    value = _unwrap_internal(value)
    if not isinstance(value, Mapping):
        raise ContextBoundaryFailure("CONTEXT_SCHEMA_INVALID")
    for key in value:
        _validate_context_key(key, forbidden_fields)
    if set(value) != expected_keys:
        raise ContextBoundaryFailure("CONTEXT_SCHEMA_INVALID")
    return value


def _safe_array(
    value: object, *, maximum: int, minimum: int = 0
) -> tuple[object, ...]:
    value = _unwrap_internal(value)
    if type(value) not in (list, tuple) or not minimum <= len(value) <= maximum:
        raise ContextBoundaryFailure("CONTEXT_SCHEMA_INVALID")
    return tuple(value)


def _safe_non_negative_integer(value: object, *, basis_points: bool) -> int:
    value = _unwrap_internal(value)
    if type(value) is not int:
        raise ContextBoundaryFailure("CONTEXT_SCHEMA_INVALID")
    maximum = 10_000 if basis_points else _MAX_SAFE_INTEGER
    if value < 0 or value > maximum:
        raise ContextBoundaryFailure("CONTEXT_VALUE_INVALID")
    return value


def _safe_literal(value: object, allowed: frozenset[str]) -> str:
    value = _unwrap_internal(value)
    if type(value) is not str:
        raise ContextBoundaryFailure("CONTEXT_SCHEMA_INVALID")
    if value not in allowed:
        raise ContextBoundaryFailure("CONTEXT_VALUE_INVALID")
    return value


def _safe_identifier(value: object) -> str:
    value = _safe_string(_unwrap_internal(value), maximum=255)
    if not _SAFE_IDENTIFIER.fullmatch(value):
        raise ContextBoundaryFailure("CONTEXT_VALUE_INVALID")
    return value


def _safe_reason_code(value: object) -> str:
    value = _safe_string(_unwrap_internal(value), maximum=100)
    if not _REASON_CODE.fullmatch(value):
        raise ContextBoundaryFailure("CONTEXT_VALUE_INVALID")
    return value


def sensitive_text_kind(value: str) -> str | None:
    if _SENSITIVE_EVIDENCE.search(value):
        return "provider_evidence"
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
            _SENSITIVE_LABEL_VALUE,
        )
    ) or _contains_valid_compact_jwt(value) or _contains_luhn_payment_card(value):
        return "sensitive"
    return None


def _contains_valid_compact_jwt(value: str) -> bool:
    for match in _COMPACT_JWT.finditer(value):
        header_segment, payload_segment, _signature_segment = match.group().split(".")
        header = _decode_base64url_json_object(header_segment)
        payload = _decode_base64url_json_object(payload_segment)
        if (
            header is not None
            and type(header.get("alg")) is str
            and 1 <= len(header["alg"]) <= 100
            and payload is not None
        ):
            return True
    return False


def _decode_base64url_json_object(segment: str) -> dict[str, object] | None:
    padding = "=" * (-len(segment) % 4)
    try:
        decoded = base64.b64decode(
            (segment + padding).encode("ascii"), altchars=b"-_", validate=True
        )
        if len(decoded) > 512:
            return None
        parsed = json.loads(decoded.decode("utf-8"))
    except (
        binascii.Error,
        UnicodeDecodeError,
        json.JSONDecodeError,
        RecursionError,
        ValueError,
    ):
        return None
    return parsed if type(parsed) is dict else None


def _contains_luhn_payment_card(value: str) -> bool:
    for match in _PAYMENT_CARD_CANDIDATE.finditer(value):
        digits = match.group().replace(" ", "").replace("-", "")
        if not 13 <= len(digits) <= 19 or len(set(digits)) == 1:
            continue
        checksum = 0
        parity = len(digits) % 2
        for index, character in enumerate(digits):
            digit = int(character)
            if index % 2 == parity:
                digit *= 2
                if digit > 9:
                    digit -= 9
            checksum += digit
        if checksum % 10 == 0:
            return True
    return False


def _safe_string(value: object, *, maximum: int = _MAX_STRING_LENGTH) -> str:
    value = _unwrap_internal(value)
    if type(value) is not str:
        raise ContextBoundaryFailure("CONTEXT_SCHEMA_INVALID")
    if not value or len(value) > maximum:
        raise ContextBoundaryFailure("CONTEXT_STRING_LIMIT_EXCEEDED")
    if not _is_valid_unicode(value):
        raise ContextBoundaryFailure("CONTEXT_STRING_INVALID")
    if sensitive_text_kind(value) is not None:
        raise ContextBoundaryFailure("CONTEXT_SENSITIVE_DATA_BLOCKED")
    return value


def _unwrap_internal(value: object) -> object:
    while isinstance(value, ClassifiedValue):
        _require_internal(value.classification)
        value = value.value
    return value


def _is_offset_datetime(value: str) -> bool:
    parsed: datetime | None = None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        parsed = None
    return parsed is not None and parsed.tzinfo is not None


def _validate_context_key(key: object, forbidden_fields: frozenset[str]) -> None:
    if type(key) is not str:
        raise ContextBoundaryFailure("CONTEXT_SCHEMA_INVALID")
    if len(key) > _MAX_STRING_LENGTH:
        raise ContextBoundaryFailure("CONTEXT_STRING_LIMIT_EXCEEDED")
    if not _is_valid_unicode(key):
        raise ContextBoundaryFailure("CONTEXT_STRING_INVALID")
    normalized = _normalized_field(key)
    if normalized in forbidden_fields:
        raise ContextBoundaryFailure("CONTEXT_FORBIDDEN_SEMANTIC_FIELD")
    if _is_sensitive_field(normalized):
        raise ContextBoundaryFailure("CONTEXT_SENSITIVE_FIELD_BLOCKED")


def _require_internal(classification: object) -> None:
    if type(classification) is not str or classification != "internal":
        raise ContextBoundaryFailure("CONTEXT_CLASSIFICATION_BLOCKED")


def _check_depth(depth: int) -> None:
    if depth > _MAX_DEPTH:
        raise ContextBoundaryFailure("CONTEXT_DEPTH_LIMIT_EXCEEDED")


def _normalized_field(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _is_sensitive_field(value: str) -> bool:
    return (
        value in _SENSITIVE_FIELDS
        or value in _SENSITIVE_IDENTITY_FIELDS
        or value in _SENSITIVE_FINANCIAL_FIELDS
        or value in _SENSITIVE_AUTH_FIELDS
        or value.endswith(_SENSITIVE_FIELD_SUFFIXES)
    )


def _preflight_input(root: object, forbidden_fields: frozenset[str]) -> None:
    if not isinstance(root, Mapping):
        raise ContextBoundaryFailure("CONTEXT_STRUCTURE_INVALID")
    active_ids: set[int] = set()
    bounds = _Bounds()
    stack: list[tuple[bool, object, int]] = [(True, root, 0)]
    while stack:
        entering, value, depth = stack.pop()
        if not entering:
            active_ids.remove(id(value))
            continue
        _check_depth(depth)
        if isinstance(value, ClassifiedValue):
            _require_internal(value.classification)
            stack.append((True, value.value, depth + 1))
            continue
        if isinstance(value, Mapping):
            _preflight_container(
                value,
                depth,
                active_ids,
                stack,
                bounds,
                forbidden_fields,
                mapping=True,
            )
            continue
        if type(value) in (list, tuple):
            _preflight_container(
                value,
                depth,
                active_ids,
                stack,
                bounds,
                forbidden_fields,
                mapping=False,
            )
            continue
        if type(value) is str:
            if len(value) > _MAX_STRING_LENGTH:
                raise ContextBoundaryFailure("CONTEXT_STRING_LIMIT_EXCEEDED")
            if not _is_valid_unicode(value):
                raise ContextBoundaryFailure("CONTEXT_STRING_INVALID")
        if type(value) is float and not math.isfinite(value):
            raise ContextBoundaryFailure("CONTEXT_NUMBER_INVALID")
        if type(value) is int and abs(value) > _MAX_SAFE_INTEGER:
            raise ContextBoundaryFailure("CONTEXT_NUMBER_INVALID")


def _preflight_container(
    value: object,
    depth: int,
    active_ids: set[int],
    stack: list[tuple[bool, object, int]],
    bounds: _Bounds,
    forbidden_fields: frozenset[str],
    *,
    mapping: bool,
) -> None:
    _check_depth(depth)
    size = _safe_length(value)
    if mapping:
        if size > _MAX_FIELDS_PER_MAPPING:
            raise ContextBoundaryFailure("CONTEXT_FIELD_LIMIT_EXCEEDED")
        bounds.fields += size
        if bounds.fields > _MAX_TOTAL_FIELDS:
            raise ContextBoundaryFailure("CONTEXT_FIELD_LIMIT_EXCEEDED")
        bounds.items += size
    else:
        if size > _MAX_COLLECTION_ITEMS:
            raise ContextBoundaryFailure("CONTEXT_COLLECTION_LIMIT_EXCEEDED")
        bounds.items += size
    if bounds.items > _MAX_TOTAL_ITEMS:
        raise ContextBoundaryFailure("CONTEXT_COLLECTION_LIMIT_EXCEEDED")
    identity = id(value)
    if identity in active_ids:
        raise ContextBoundaryFailure("CONTEXT_STRUCTURE_INVALID")
    active_ids.add(identity)
    stack.append((False, value, depth))
    children = _safe_children(
        value, mapping=mapping, forbidden_fields=forbidden_fields
    )
    for child in reversed(children):
        stack.append((True, child, depth + 1))


def _safe_length(value: object) -> int:
    size: int | None = None
    try:
        size = len(value)  # type: ignore[arg-type]
    except Exception:
        size = None
    if type(size) is not int or size < 0:
        raise ContextBoundaryFailure("CONTEXT_STRUCTURE_INVALID")
    return size


def _safe_children(
    value: object, *, mapping: bool, forbidden_fields: frozenset[str]
) -> tuple[object, ...]:
    children: tuple[object, ...] | None = None
    if mapping:
        items: tuple[tuple[object, object], ...] | None = None
        try:
            items = tuple(value.items())  # type: ignore[union-attr]
        except Exception:
            items = None
        if items is None:
            raise ContextBoundaryFailure("CONTEXT_STRUCTURE_INVALID")
        for key, _item in items:
            _validate_context_key(key, forbidden_fields)
        children = tuple(child for key, item in items for child in (key, item))
    else:
        try:
            children = tuple(value)  # type: ignore[arg-type]
        except Exception:
            children = None
    if children is None:
        raise ContextBoundaryFailure("CONTEXT_STRUCTURE_INVALID")
    return children


def _is_valid_unicode(value: str) -> bool:
    valid = True
    try:
        value.encode("utf-8")
    except UnicodeError:
        valid = False
    return valid


def _serialize_json(value: object) -> tuple[str, bytes]:
    serialized: str | None = None
    encoded: bytes | None = None
    try:
        serialized = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        encoded = serialized.encode("utf-8")
    except Exception:
        serialized = None
        encoded = None
    if serialized is None or encoded is None:
        raise ContextBoundaryFailure("CONTEXT_SERIALIZATION_FAILED")
    return serialized, encoded


def _thaw(value: object) -> object:
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if type(value) is tuple:
        return [_thaw(item) for item in value]
    return value
