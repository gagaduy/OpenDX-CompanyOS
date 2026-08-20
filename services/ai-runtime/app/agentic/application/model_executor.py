# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Mapping as MappingCollection
from dataclasses import dataclass, replace
from typing import Any, Callable, Literal, Mapping, Protocol

from app.agentic.application.ports import (
    CompleteModelRunRequest,
    FailModelRunRequest,
    ModelRunControlPort,
    ReserveModelRunRequest,
    StartModelRunRequest,
)
from app.agentic.domain.model_runtime import (
    AgentKind,
    ModelGatewayFailure,
    ModelRequest,
    QualityDecision,
)


class ModelExecutionError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class _GatewayAttemptFailure(RuntimeError):
    def __init__(self, failure: ModelGatewayFailure, request: ModelRequest) -> None:
        super().__init__(failure.code)
        self.failure = failure
        self.request = request


@dataclass(frozen=True)
class ModelExecutionCommand:
    task_id: str
    agent_kind: AgentKind
    configuration_revision_id: str
    primary_model: str
    fallback_model: str
    input_digest: str
    idempotency_key: str
    result_schema_name: str
    result_schema: Mapping[str, object]
    context: object
    quality_context: object


@dataclass(frozen=True)
class ModelExecutionOutcome:
    status: Literal["completed", "partial", "escalated"]
    run_id: str
    output_digest: str
    quality_reasons: tuple[str, ...]
    agent_kind: AgentKind = "catalog"
    model: str = "google/gemma-4-26b-a4b-it:free"
    fallback_position: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_micros: int = 0
    latency_ms: int = 0
    correction_round: int = 0


class QualityGatePort(Protocol):
    def evaluate(self, raw_result: object, context: object) -> QualityDecision: ...


class ModelExecutor:
    def __init__(
        self,
        *,
        controls: ModelRunControlPort,
        gateway: Any,
        quality_gate: QualityGatePort,
        context_filter: Callable[[AgentKind, object], object],
        prompt_builder: Callable[[AgentKind, object], object],
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self._controls = controls
        self._gateway = gateway
        self._quality_gate = quality_gate
        self._context_filter = context_filter
        self._prompt_builder = prompt_builder
        self._now = now

    async def execute(self, command: ModelExecutionCommand) -> ModelExecutionOutcome:
        try:
            context = self._context_filter(command.agent_kind, command.context)
            prompt = self._prompt_builder(command.agent_kind, context)
        except Exception as error:
            raise ModelExecutionError("MODEL_CONTEXT_INVALID") from error

        correction: QualityDecision | None = None
        for correction_round in range(3):
            reservation = await self._controls.reserve_model_run(ReserveModelRunRequest(
                task_id=command.task_id, agent_kind=command.agent_kind,
                generation_round=correction_round,
                idempotency_key=f"{command.idempotency_key}:round:{correction_round}",
                input_digest=_input_digest(prompt, correction), primary_model=command.primary_model,
                fallback_model=command.fallback_model,
            ))
            started_at = self._now()
            try:
                result, fallback_position = await self._generate(
                    command, prompt, reservation, correction_round, correction
                )
            except _GatewayAttemptFailure as error:
                await self._fail_gateway(
                    reservation, command, error.failure, error.request, started_at
                )
                raise ModelExecutionError(
                    error.failure.code, retryable=error.failure.retryable
                ) from error

            try:
                state = await self._controls.start_model_run(StartModelRunRequest(
                    reservation.run_id, reservation.version, result.model, fallback_position
                ))
            except Exception as error:
                await self._settle_unexpected(
                    reservation.run_id, reservation.version, command, correction_round
                )
                raise ModelExecutionError("MODEL_EXECUTION_FAILED") from error
            try:
                output_digest = _digest(result.content)
                provider_digest = _digest({"providerRequestId": result.provider_request_id})
                latency_ms = _elapsed_ms(started_at, self._now())
                decision = self._quality_gate.evaluate(
                    result.content, _with_correction_round(command.quality_context, correction_round)
                )
                evidence_digest = _digest({
                    "outcome": decision.outcome, "reasons": decision.reasons,
                    "evidenceIds": decision.evidence_ids,
                })
                if decision.outcome == "accepted":
                    await self._controls.complete_model_run(CompleteModelRunRequest(
                        reservation.run_id, state.version,
                        f"{command.idempotency_key}:round:{correction_round}:complete",
                        "completed", output_digest, result.input_tokens, result.output_tokens,
                        provider_digest, latency_ms, "MODEL_COMPLETED", "accepted", (),
                        decision.evidence_ids, evidence_digest,
                    ))
                    return ModelExecutionOutcome("completed", reservation.run_id, output_digest, (), command.agent_kind, result.model, fallback_position, result.input_tokens, result.output_tokens, result.provider_cost_micros or 0, latency_ms, correction_round)
                if decision.outcome == "escalate":
                    await self._controls.complete_model_run(CompleteModelRunRequest(
                        reservation.run_id, state.version,
                        f"{command.idempotency_key}:round:{correction_round}:escalate",
                        "escalated", output_digest, result.input_tokens, result.output_tokens,
                        provider_digest, latency_ms, "MODEL_ESCALATED", "escalate",
                        decision.reasons, decision.evidence_ids, evidence_digest,
                    ))
                    return ModelExecutionOutcome("escalated", reservation.run_id, output_digest, decision.reasons, command.agent_kind, result.model, fallback_position, result.input_tokens, result.output_tokens, result.provider_cost_micros or 0, latency_ms, correction_round)
                if decision.outcome == "partial" or correction_round == 2:
                    await self._controls.complete_model_run(CompleteModelRunRequest(
                        reservation.run_id, state.version,
                        f"{command.idempotency_key}:round:{correction_round}:partial",
                        "partial", output_digest, result.input_tokens, result.output_tokens,
                        provider_digest, latency_ms, "MODEL_PARTIAL", "partial",
                        decision.reasons, decision.evidence_ids, evidence_digest,
                    ))
                    return ModelExecutionOutcome("partial", reservation.run_id, output_digest, decision.reasons, command.agent_kind, result.model, fallback_position, result.input_tokens, result.output_tokens, result.provider_cost_micros or 0, latency_ms, correction_round)
                await self._controls.fail_model_run(FailModelRunRequest(
                    reservation.run_id, state.version,
                    f"{command.idempotency_key}:round:{correction_round}:correct",
                    output_digest, result.input_tokens, result.output_tokens, provider_digest,
                    latency_ms, "MODEL_CORRECTION_REQUESTED", "MODEL_QUALITY_CORRECTION",
                    "correct", decision.reasons, decision.evidence_ids, evidence_digest,
                ))
                correction = decision
            except ModelExecutionError:
                raise
            except Exception as error:
                await self._settle_unexpected(reservation.run_id, state.version, command, correction_round)
                raise ModelExecutionError("MODEL_EXECUTION_FAILED") from error
        raise AssertionError("model correction loop must return")

    async def _generate(
        self, command: ModelExecutionCommand, prompt: object, reservation: object,
        correction_round: int, correction: QualityDecision | None,
    ) -> tuple[Any, Literal[0, 1]]:
        primary = self._request(command, prompt, reservation, correction_round, 0, correction)
        try:
            await self._gateway.preflight(primary)
            return await self._gateway.generate(primary), 0
        except ModelGatewayFailure as error:
            if not error.retryable:
                raise _GatewayAttemptFailure(error, primary) from error
        fallback = self._request(command, prompt, reservation, correction_round, 1, correction)
        try:
            await self._gateway.preflight(fallback)
            return await self._gateway.generate(fallback), 1
        except ModelGatewayFailure as error:
            raise _GatewayAttemptFailure(error, fallback) from error

    @staticmethod
    def _request(
        command: ModelExecutionCommand, prompt: object, reservation: Any,
        correction_round: int, fallback_position: Literal[0, 1],
        correction: QualityDecision | None,
    ) -> ModelRequest:
        model = reservation.primary_model if fallback_position == 0 else reservation.fallback_model
        trusted = tuple(
            message.content for message in getattr(prompt, "trusted_messages", ())
            if getattr(message, "role", None) == "system"
        )
        untrusted = getattr(prompt, "untrusted_message", None)
        context: dict[str, object] = {"context": getattr(untrusted, "content", prompt)}
        if correction is not None:
            context["correction"] = {
                "reasonCodes": list(correction.reasons),
                "evidenceIds": list(correction.evidence_ids),
            }
        return ModelRequest(
            task_id=command.task_id, agent_kind=command.agent_kind,
            configuration_revision_id=command.configuration_revision_id, model=model,
            fallback_position=fallback_position, result_schema_name=command.result_schema_name,
            result_schema=command.result_schema, trusted_instructions=trusted,
            untrusted_context=context, max_output_tokens=reservation.max_output_tokens,
            idempotency_key=f"{command.idempotency_key}:round:{correction_round}:model:{fallback_position}",
        )

    async def _fail_gateway(
        self, reservation: object, command: ModelExecutionCommand,
        error: ModelGatewayFailure, attempted: ModelRequest, started_at: float,
    ) -> None:
        state = await self._controls.start_model_run(StartModelRunRequest(
            reservation.run_id, reservation.version, attempted.model, attempted.fallback_position
        ))
        await self._controls.fail_model_run(FailModelRunRequest(
            reservation.run_id, state.version,
            f"{command.idempotency_key}:gateway-failure", None, 0, 0, None,
            _elapsed_ms(started_at, self._now()), "MODEL_GATEWAY_FAILED", error.code,
            "escalate", (error.code,), (), _digest({"errorCode": error.code}),
        ))

    async def _settle_unexpected(
        self, run_id: str, version: int, command: ModelExecutionCommand,
        correction_round: int,
    ) -> None:
        try:
            await self._controls.fail_model_run(FailModelRunRequest(
                run_id, version, f"{command.idempotency_key}:round:{correction_round}:unexpected",
                None, 0, 0, None, 0, "MODEL_EXECUTION_FAILED",
                "MODEL_EXECUTION_FAILED", "escalate", ("MODEL_EXECUTION_FAILED",), (),
                _digest({"errorCode": "MODEL_EXECUTION_FAILED"}),
            ))
        except Exception:
            pass


def _digest(value: object) -> str:
    encoded = json.dumps(_plain_json(value), ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _input_digest(prompt: object, correction: QualityDecision | None) -> str:
    trusted = [
        message.content for message in getattr(prompt, "trusted_messages", ())
        if getattr(message, "role", None) == "system"
    ]
    untrusted = getattr(prompt, "untrusted_message", None)
    context: dict[str, object] = {"context": getattr(untrusted, "content", prompt)}
    if correction is not None:
        context["correction"] = {
            "reasonCodes": list(correction.reasons),
            "evidenceIds": list(correction.evidence_ids),
        }
    return _digest({"trustedInstructions": trusted, "untrustedContext": context})


def _plain_json(value: object) -> object:
    if isinstance(value, MappingCollection):
        return {str(key): _plain_json(item) for key, item in value.items()}
    if isinstance(value, tuple | list):
        return [_plain_json(item) for item in value]
    return value


def _elapsed_ms(started_at: float, finished_at: float) -> int:
    return max(0, int((finished_at - started_at) * 1_000))


def _with_correction_round(context: object, correction_round: int) -> object:
    try:
        return replace(context, correction_round=correction_round)
    except TypeError:
        return context
