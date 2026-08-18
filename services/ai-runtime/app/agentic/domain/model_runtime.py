# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

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


@dataclass(frozen=True)
class ModelRequest:
    task_id: str
    agent_kind: AgentKind
    configuration_revision_id: str
    model: str
    fallback_position: int
    result_schema_name: str
    result_schema: dict[str, object]
    trusted_instructions: tuple[str, ...]
    untrusted_context: dict[str, object]
    max_output_tokens: int
    idempotency_key: str


@dataclass(frozen=True)
class ModelResult:
    provider_request_id: str
    model: str
    content: dict[str, object]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    provider_cost_micros: int | None


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
