# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from typing import Literal


AgentKind = Literal[
    "ai_ceo",
    "catalog",
    "inventory",
    "order",
    "finance",
    "crm",
    "support",
]
QualityOutcome = Literal["accepted", "correct", "partial", "escalate"]


@dataclass(frozen=True, init=False, eq=False)
class FrozenJsonMapping(Mapping[str, object]):
    _items: tuple[tuple[str, object], ...]

    def __init__(self, value: Mapping[str, object]) -> None:
        items: list[tuple[str, object]] = []
        for key, item in value.items():
            if type(key) is not str:
                raise TypeError("model JSON object keys must be strings")
            items.append((key, _freeze_json(item)))
        object.__setattr__(self, "_items", tuple(items))

    def __getitem__(self, key: str) -> object:
        for candidate, value in self._items:
            if candidate == key:
                return value
        raise KeyError(key)

    def __iter__(self) -> Iterator[str]:
        return (key for key, _value in self._items)

    def __len__(self) -> int:
        return len(self._items)


@dataclass(frozen=True)
class ModelRequest:
    task_id: str
    agent_kind: AgentKind
    configuration_revision_id: str
    model: str
    fallback_position: int
    result_schema_name: str
    result_schema: Mapping[str, object]
    trusted_instructions: tuple[str, ...]
    untrusted_context: Mapping[str, object]
    max_output_tokens: int
    idempotency_key: str
    input_cost_micros_per_million: int
    output_cost_micros_per_million: int

    def __post_init__(self) -> None:
        object.__setattr__(self, "result_schema", FrozenJsonMapping(self.result_schema))
        object.__setattr__(
            self, "untrusted_context", FrozenJsonMapping(self.untrusted_context)
        )


@dataclass(frozen=True)
class ModelResult:
    provider_request_id: str
    model: str
    content: Mapping[str, object]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    provider_cost_micros: int | None

    def __post_init__(self) -> None:
        object.__setattr__(self, "content", FrozenJsonMapping(self.content))


@dataclass(frozen=True)
class ModelGatewayFailure(Exception):
    code: str
    retryable: bool

    def __post_init__(self) -> None:
        Exception.__init__(self, self.code)


@dataclass(frozen=True)
class AuthorizedModelRun:
    run_id: str
    task_id: str
    agent_kind: AgentKind
    configuration_revision_id: str
    model: str
    fallback_position: int
    correction_round: int
    idempotency_key: str


@dataclass(frozen=True)
class QualityDecision:
    outcome: QualityOutcome
    reasons: tuple[str, ...]
    evidence_ids: tuple[str, ...]


def _freeze_json(value: object) -> object:
    if isinstance(value, Mapping):
        return FrozenJsonMapping(value)
    if type(value) in (list, tuple):
        return tuple(_freeze_json(item) for item in value)
    if value is None or type(value) in (str, int, float, bool):
        return value
    raise TypeError("model JSON data contains an unsupported value")
