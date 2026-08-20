# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import pytest

from app.agentic.application.model_executor import (
    ModelExecutionCommand,
    ModelExecutor,
    ModelExecutionError,
)
from app.agentic.domain.model_runtime import (
    ModelGatewayFailure,
    ModelResult,
    QualityDecision,
)
from app.agentic.application.ports import ModelRunState


@dataclass(frozen=True)
class Receipt:
    run_id: str = "run-1"
    primary_model: str = "google/gemma-4-26b-a4b-it:free"
    fallback_model: str = "liquid/lfm-2.5-2.6b:free"
    max_input_tokens: int = 1_000
    max_output_tokens: int = 500
    timeout_ms: int = 1_000
    schema_version: int = 1
    input_cost_micros_per_million: int = 0
    output_cost_micros_per_million: int = 0
    max_reserved_cost_micros: int = 0
    version: int = 1


class Controls:
    def __init__(self) -> None:
        self.events: list[str] = []
        self.reservations: list[Any] = []
        self.completed: list[Any] = []
        self.failed: list[Any] = []

    async def reserve_model_run(self, command: object) -> Receipt:
        self.events.append("reserve")
        self.reservations.append(command)
        return Receipt(run_id=f"run-{len(self.reservations)}")

    async def start_model_run(self, command: object) -> object:
        self.events.append("start")
        return ModelRunState("run-1", "running", 2)

    async def complete_model_run(self, command: object) -> object:
        self.events.append("complete")
        self.completed.append(command)
        return ModelRunState("run-1", "completed", 3)

    async def fail_model_run(self, command: object) -> object:
        self.events.append("fail")
        self.failed.append(command)
        return ModelRunState("run-1", "failed", 3)


class Gateway:
    def __init__(self, results: list[object]) -> None:
        self.results = results
        self.requests: list[Any] = []

    async def preflight(self, request: object) -> None:
        self.requests.append(("preflight", request))

    async def generate(self, request: object) -> ModelResult:
        self.requests.append(("generate", request))
        next_result = self.results.pop(0)
        if isinstance(next_result, Exception):
            raise next_result
        return next_result  # type: ignore[return-value]


class Quality:
    def __init__(self, decisions: list[QualityDecision]) -> None:
        self.decisions = decisions

    def evaluate(self, _raw: object, _context: object) -> QualityDecision:
        return self.decisions.pop(0)


def command() -> ModelExecutionCommand:
    return ModelExecutionCommand(
        task_id="task-1",
        agent_kind="catalog",
        configuration_revision_id="revision-1",
        primary_model="google/gemma-4-26b-a4b-it:free",
        fallback_model="liquid/lfm-2.5-2.6b:free",
        input_digest="a" * 64,
        idempotency_key="model:task-1:catalog",
        result_schema_name="catalog_analysis_v1",
        result_schema={"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        context={"safe": "context"},
        quality_context=object(),
    )


def result(model: str = "google/gemma-4-26b-a4b-it:free") -> ModelResult:
    return ModelResult(
        provider_request_id="request-1", model=model, content={"status": "complete"},
        input_tokens=10, output_tokens=20, total_tokens=30, provider_cost_micros=0,
    )


def executor(controls: Controls, gateway: Gateway, quality: Quality) -> ModelExecutor:
    return ModelExecutor(
        controls=controls,
        gateway=gateway,
        quality_gate=quality,
        context_filter=lambda value: value,
        prompt_builder=lambda _agent, value: value,
    )


def test_filters_context_then_reserves_generates_and_completes_with_digests_only() -> None:
    controls = Controls()
    gateway = Gateway([result()])
    quality = Quality([QualityDecision("accepted", (), ("prov-1",))])

    outcome = asyncio.run(executor(controls, gateway, quality).execute(command()))

    assert outcome.status == "completed"
    assert controls.events == ["reserve", "start", "complete"]
    assert [event for event, _request in gateway.requests] == ["preflight", "generate"]
    completed = controls.completed[0]
    assert completed.output_digest != result().content
    assert completed.evidence_digest != result().content
    assert "content" not in vars(completed)


def test_uses_shared_fallback_once_only_for_retryable_gateway_failure() -> None:
    controls = Controls()
    gateway = Gateway([
        ModelGatewayFailure("OPENROUTER_TRANSPORT_FAILED", retryable=True),
        result("liquid/lfm-2.5-2.6b:free"),
    ])
    quality = Quality([QualityDecision("accepted", (), ("prov-1",))])

    outcome = asyncio.run(executor(controls, gateway, quality).execute(command()))

    assert outcome.status == "completed"
    generated = [request for event, request in gateway.requests if event == "generate"]
    assert [item.model for item in generated] == [
        "google/gemma-4-26b-a4b-it:free", "liquid/lfm-2.5-2.6b:free",
    ]
    assert controls.failed == []


def test_correction_uses_distinct_reservations_then_escalates_without_fallback() -> None:
    controls = Controls()
    gateway = Gateway([result(), result(), result()])
    quality = Quality([
        QualityDecision("correct", ("SCHEMA_INVALID",), ("prov-1",)),
        QualityDecision("correct", ("FRESHNESS_INVALID",), ("prov-1",)),
        QualityDecision("escalate", ("SCOPE_VIOLATION",), ()),
    ])

    outcome = asyncio.run(executor(controls, gateway, quality).execute(command()))

    assert outcome.status == "escalated"
    assert len(controls.reservations) == 3
    assert len({item.idempotency_key for item in controls.reservations}) == 3
    assert [request.model for event, request in gateway.requests if event == "generate"] == [
        "google/gemma-4-26b-a4b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "google/gemma-4-26b-a4b-it:free",
    ]
    assert len(controls.completed) == 1
    assert len(controls.failed) == 2
    second_request = [request for event, request in gateway.requests if event == "generate"][1]
    assert second_request.untrusted_context["correction"] == {
        "reasonCodes": ("SCHEMA_INVALID",), "evidenceIds": ("prov-1",),
    }


def test_non_retryable_gateway_failure_settles_failure_without_fallback() -> None:
    controls = Controls()
    gateway = Gateway([ModelGatewayFailure("OPENROUTER_SCHEMA_INVALID", retryable=False)])
    quality = Quality([])

    with pytest.raises(ModelExecutionError) as captured:
        asyncio.run(executor(controls, gateway, quality).execute(command()))

    assert captured.value.code == "OPENROUTER_SCHEMA_INVALID"
    assert len(controls.failed) == 1
    assert [request.model for event, request in gateway.requests if event == "generate"] == [
        "google/gemma-4-26b-a4b-it:free",
    ]


def test_rejects_context_before_any_reservation() -> None:
    controls = Controls()
    gateway = Gateway([])
    quality = Quality([])
    blocked = ModelExecutor(
        controls=controls, gateway=gateway, quality_gate=quality,
        context_filter=lambda _value: (_ for _ in ()).throw(ValueError("blocked")),
        prompt_builder=lambda _agent, value: value,
    )

    with pytest.raises(ModelExecutionError) as captured:
        asyncio.run(blocked.execute(command()))

    assert captured.value.code == "MODEL_CONTEXT_INVALID"
    assert controls.reservations == []
