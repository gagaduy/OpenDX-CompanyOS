# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable, Mapping
from typing import Any


_METRIC_LABELS = {
    "workflow_start": frozenset({"outcome"}),
    "active_runs": frozenset({"state"}),
    "waiting_runs": frozenset({"state"}),
    "activity_duration_seconds": frozenset({"activity", "outcome"}),
    "retry_exhaustion": frozenset({"activity"}),
    "rejected_signal": frozenset({"signal"}),
    "worker_polling": frozenset({"outcome"}),
    "terminal_outcome": frozenset({"outcome"}),
    "model_execution": frozenset({"agent", "model", "status"}),
}
_LABEL_VALUES = {
    "activity": frozenset({
        "load_frozen_plan", "project_state", "execute_fake_analysis",
        "execute_fake_quality_review", "execute_fake_collaboration",
        "execute_fake_synthesis",
    }),
    "outcome": frozenset({
        "accepted", "duplicate", "completed", "failed", "canceled",
        "rejected", "exhausted", "healthy", "unavailable",
        "partially_completed",
    }),
    "signal": frozenset({"approval", "cancellation"}),
    "state": frozenset({
        "received", "planning", "awaiting_plan_approval", "dispatching",
        "department_analysis", "quality_review", "collaboration",
        "executive_synthesis", "awaiting_human_approval", "retrying",
        "completed", "partially_completed", "failed", "canceled",
    }),
    "agent": frozenset({"ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"}),
    "model": frozenset({
        "z-ai/glm-5.2:free", "google/gemma-4-26b-a4b-it:free",
        "nvidia/nemotron-3-super-120b-a12b:free", "openai/gpt-oss-20b:free",
        "dots-studio/dots-3-note-preview:free", "nvidia/nemotron-nano-9b-v2:free",
        "liquid/lfm-2.5-2.6b:free",
    }),
    "status": frozenset({"completed", "partial", "escalated"}),
}
_LOG_FIELDS = frozenset({
    "workflow_id", "task_id", "correlation_id", "causation_id", "activity",
    "attempt", "duration_seconds", "outcome", "error_code", "signal",
})
_LOG_EVENTS = frozenset({
    "workflow_started", "workflow_described", "workflow_signaled",
    "activity_finished", "worker_polling", "workflow_terminal",
})
_METRIC_NAMES = {
    "workflow_start": "opendx_agentic_workflow_starts_total",
    "active_runs": "opendx_agentic_active_run_transitions_total",
    "waiting_runs": "opendx_agentic_waiting_run_transitions_total",
    "activity_duration_seconds": "opendx_agentic_activity_duration_seconds",
    "retry_exhaustion": "opendx_agentic_retry_exhaustions_total",
    "rejected_signal": "opendx_agentic_rejected_signals_total",
    "worker_polling": "opendx_agentic_worker_polling_transitions_total",
    "terminal_outcome": "opendx_agentic_terminal_outcomes_total",
    "model_execution": "opendx_agentic_model_executions_total",
}
_SAFE_CODE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,99}$")


class BoundedMetrics:
    def __init__(self, sink: Callable[[str], None] | None = None) -> None:
        self._values: dict[
            str, dict[tuple[tuple[str, str], ...], dict[str, Any]]
        ] = {}
        self._sink = sink

    def increment(self, name: str, labels: Mapping[str, str]) -> None:
        self._record(name, 1.0, labels)

    def observe(
        self, name: str, value: float, labels: Mapping[str, str]
    ) -> None:
        if value < 0 or value > 86_400:
            raise ValueError("Metric observation is out of bounds")
        self._record(name, float(value), labels)

    def snapshot(self) -> dict[str, tuple[dict[str, Any], ...]]:
        return {
            name: tuple(
                {
                    **record,
                    "labels": dict(record["labels"]),
                }
                for _, record in sorted(values.items())
            )
            for name, values in self._values.items()
        }

    def render(self) -> str:
        lines: list[str] = []
        for name, records in sorted(self._values.items()):
            metric_name = _METRIC_NAMES[name]
            if name == "activity_duration_seconds":
                lines.append(f"# TYPE {metric_name} summary")
                for label_key, record in sorted(records.items()):
                    labels = _render_labels(label_key)
                    lines.append(f"{metric_name}_count{{{labels}}} {record['count']}")
                    lines.append(f"{metric_name}_sum{{{labels}}} {record['total']}")
            else:
                lines.append(f"# TYPE {metric_name} counter")
                for label_key, record in sorted(records.items()):
                    lines.append(
                        f"{metric_name}{{{_render_labels(label_key)}}} "
                        f"{record['total']}"
                    )
        return f"{'\n'.join(lines)}\n" if lines else ""

    def _record(
        self, name: str, value: float, labels: Mapping[str, str]
    ) -> None:
        expected = _METRIC_LABELS.get(name)
        if expected is None or frozenset(labels) != expected:
            raise ValueError("Metric schema is not allowed")
        for key, label in labels.items():
            if label not in _LABEL_VALUES[key]:
                raise ValueError("Metric label is not allowed")
        label_key = tuple(sorted(labels.items()))
        records = self._values.setdefault(name, {})
        record = records.get(label_key)
        if record is None:
            record = {
                "count": 1,
                "total": value,
                "minimum": value,
                "maximum": value,
                "labels": dict(label_key),
            }
            records[label_key] = record
            self._emit(name, label_key, record)
            return
        record["count"] += 1
        record["total"] += value
        record["minimum"] = min(record["minimum"], value)
        record["maximum"] = max(record["maximum"], value)
        self._emit(name, label_key, record)

    def _emit(
        self,
        name: str,
        label_key: tuple[tuple[str, str], ...],
        record: Mapping[str, Any],
    ) -> None:
        if self._sink is not None:
            self._sink(
                f"{_METRIC_NAMES[name]}{{{_render_labels(label_key)}}} "
                f"{record['total']}"
            )


class StructuredEventLogger:
    def __init__(self, sink: Callable[[str], None]) -> None:
        self._sink = sink

    def emit(self, event: str, **fields: object) -> None:
        if event not in _LOG_EVENTS or not set(fields) <= _LOG_FIELDS:
            raise ValueError("Structured log schema is not allowed")
        payload: dict[str, object] = {"event": event}
        for key, value in fields.items():
            if key.endswith("_id"):
                if not isinstance(value, str) or not value or len(value) > 255:
                    raise ValueError("Structured log identifier is invalid")
                output_key = "".join(
                    [key.split("_")[0], *[part.title() for part in key.split("_")[1:]]]
                ) + "Hash"
                payload[output_key] = hashlib.sha256(value.encode()).hexdigest()[:16]
            elif key in {"attempt"}:
                if not isinstance(value, int) or value < 1 or value > 100:
                    raise ValueError("Structured log attempt is invalid")
                payload["attempt"] = value
            elif key == "duration_seconds":
                if not isinstance(value, (int, float)) or value < 0 or value > 86_400:
                    raise ValueError("Structured log duration is invalid")
                payload["durationSeconds"] = float(value)
            else:
                if not isinstance(value, str) or _SAFE_CODE.fullmatch(value) is None:
                    raise ValueError("Structured log value is invalid")
                output_key = key.split("_")[0] + "".join(
                    part.title() for part in key.split("_")[1:]
                )
                payload[output_key] = value
        self._sink(json.dumps(payload, sort_keys=True, separators=(",", ":")))

    def emit_model_execution(
        self, *, agent_kind: str, model: str, status: str, input_tokens: int,
        output_tokens: int, cost_micros: int, latency_ms: int,
        fallback_position: int, correction_round: int,
    ) -> None:
        if (
            agent_kind not in _LABEL_VALUES["agent"] or model not in _LABEL_VALUES["model"]
            or status not in _LABEL_VALUES["status"]
            or any(type(value) is not int or value < 0 or value > 9_007_199_254_740_991
                   for value in (input_tokens, output_tokens, cost_micros, latency_ms))
            or fallback_position not in {0, 1} or correction_round not in {0, 1, 2}
        ):
            raise ValueError("Model execution log is invalid")
        self._sink(json.dumps({
            "event": "model_execution_finished", "agentKind": agent_kind,
            "model": model, "status": status, "inputTokens": input_tokens,
            "outputTokens": output_tokens, "costMicros": cost_micros,
            "latencyMs": latency_ms, "fallbackPosition": fallback_position,
            "correctionRound": correction_round,
        }, sort_keys=True, separators=(",", ":")))


def _render_labels(labels: tuple[tuple[str, str], ...]) -> str:
    return ",".join(f'{key}="{value}"' for key, value in labels)
