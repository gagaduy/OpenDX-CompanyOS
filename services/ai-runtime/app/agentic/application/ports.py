# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Mapping, Protocol

from app.agentic.domain.contracts import (
    ActivityOutcome,
    ActivityReservationRequest,
    FrozenWorkflowPlan,
    StateProjection,
    WorkloadPrincipal,
)
from app.agentic.domain.model_runtime import ModelRequest, ModelResult
from app.agentic.domain.orchestration_schemas import DepartmentAgentKind


class AgenticControlFailure(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class WorkloadVerifier(Protocol):
    def verify(self, token: str) -> WorkloadPrincipal: ...


class AccessTokenProvider(Protocol):
    async def get_token(self) -> str: ...


class ModelGateway(Protocol):
    async def preflight(self, request: ModelRequest) -> None: ...
    async def generate(self, request: ModelRequest) -> ModelResult: ...


@dataclass(frozen=True)
class ReserveModelRunRequest:
    task_id: str
    agent_kind: str
    generation_round: int
    idempotency_key: str
    input_digest: str
    result_schema_name: str
    result_schema_digest: str
    primary_model: str
    fallback_model: str


@dataclass(frozen=True)
class StartModelRunRequest:
    run_id: str
    expected_version: int
    returned_model: str
    fallback_position: Literal[0, 1]


@dataclass(frozen=True)
class CompleteModelRunRequest:
    run_id: str
    expected_version: int
    idempotency_key: str
    status: Literal["completed", "partial", "escalated"]
    output_digest: str
    input_tokens: int
    output_tokens: int
    provider_request_id_digest: str
    latency_ms: int
    status_code: str
    quality_outcome: Literal["accepted", "partial", "escalate"]
    quality_reason_codes: tuple[str, ...]
    provenance_ids: tuple[str, ...]
    evidence_digest: str


@dataclass(frozen=True)
class FailModelRunRequest:
    run_id: str
    expected_version: int
    idempotency_key: str
    output_digest: str | None
    input_tokens: int
    output_tokens: int
    provider_request_id_digest: str | None
    latency_ms: int
    status_code: str
    error_code: str
    quality_outcome: Literal["correct", "escalate"]
    quality_reason_codes: tuple[str, ...]
    provenance_ids: tuple[str, ...]
    evidence_digest: str


@dataclass(frozen=True)
class ModelRunReservation:
    run_id: str
    primary_model: str
    fallback_model: str
    max_input_tokens: int
    max_output_tokens: int
    timeout_ms: int
    schema_version: Literal[1]
    input_cost_micros_per_million: int
    output_cost_micros_per_million: int
    max_reserved_cost_micros: int
    version: int


@dataclass(frozen=True)
class ModelRunState:
    run_id: str
    status: str
    version: int
    settled_cost_micros: int | None = None


class ModelRunControlPort(Protocol):
    async def reserve_model_run(self, request: ReserveModelRunRequest) -> ModelRunReservation: ...
    async def start_model_run(self, request: StartModelRunRequest) -> ModelRunState: ...
    async def complete_model_run(self, request: CompleteModelRunRequest) -> ModelRunState: ...
    async def fail_model_run(self, request: FailModelRunRequest) -> ModelRunState: ...


class AgenticControlPort(Protocol):
    async def complete_model_run(self, request: CompleteModelRunRequest) -> ModelRunState: ...
    async def load_plan(self, run_id: str) -> FrozenWorkflowPlan: ...
    async def project_state(self, run_id: str, projection: StateProjection) -> object: ...
    async def reserve_activity(self, reservation: ActivityReservationRequest) -> object: ...
    async def complete_activity(self, invocation_key: str, outcome: ActivityOutcome) -> object: ...
    async def fail_activity(self, invocation_key: str, outcome: ActivityOutcome) -> object: ...
    async def load_task_brief(self, task_id: str) -> dict[str, object]: ...
    async def load_orchestration_settlement(
        self, kind: str, settlement_id: str
    ) -> dict[str, object]: ...
    async def load_dispatch_plan(self, run_id: str) -> dict[str, object]: ...
    async def load_execution_descriptor(
        self, descriptor_id: str, descriptor_digest: str
    ) -> dict[str, object]: ...
    async def load_ai_ceo_execution_authority(
        self, authority_id: str, authority_digest: str
    ) -> dict[str, object]: ...
    async def load_synthesis_context(
        self, body: Mapping[str, object]
    ) -> dict[str, object]: ...
    async def accept_orchestration_result(self, body: Mapping[str, object]) -> str: ...
    async def mediate_collaboration(self, body: Mapping[str, object]) -> str: ...
    async def accept_executive_report(self, body: Mapping[str, object]) -> str: ...


class AgentSubmissionPort(Protocol):
    async def accept_plan(self, plan: Mapping[str, object]) -> None: ...


class DepartmentToolPort(Protocol):
    async def invoke(
        self, agent_kind: DepartmentAgentKind, request: Mapping[str, object]
    ) -> dict[str, object]: ...
