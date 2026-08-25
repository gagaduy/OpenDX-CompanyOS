# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from typing import Any

from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.agentic.application.model_executor import (
    ModelExecutionCommand,
    ModelExecutionError,
    ModelExecutionOutcome,
)


class ModelExecutionActivities:
    def __init__(self, executor: Any, metrics: Any | None = None, logger: Any | None = None) -> None:
        self._executor = executor
        self._metrics = metrics
        self._logger = logger

    @activity.defn(name="execute_model_analysis_v1")
    async def execute_model_analysis_v1(self, command: ModelExecutionCommand) -> dict[str, object]:
        try:
            outcome = await self._executor.execute(command)
        except ModelExecutionError as error:
            raise ApplicationError(error.code, type=error.code, non_retryable=not error.retryable) from error
        self._observe(outcome)
        return {
            "status": outcome.status,
            "outputDigest": outcome.output_digest,
            "qualityReasonCodes": list(outcome.quality_reasons),
        }

    def _observe(self, outcome: ModelExecutionOutcome) -> None:
        try:
            if self._metrics is not None:
                self._metrics.increment("model_execution", {
                    "agent": outcome.agent_kind, "model": outcome.model,
                    "status": outcome.status,
                })
            if self._logger is not None:
                self._logger.emit_model_execution(
                    agent_kind=outcome.agent_kind, model=outcome.model,
                    status=outcome.status, input_tokens=outcome.input_tokens,
                    output_tokens=outcome.output_tokens, cost_micros=outcome.cost_micros,
                    latency_ms=outcome.latency_ms, fallback_position=outcome.fallback_position,
                    correction_round=outcome.correction_round,
                )
        except Exception:
            pass

    @property
    def registered(self) -> list[object]:
        return [self.execute_model_analysis_v1]
