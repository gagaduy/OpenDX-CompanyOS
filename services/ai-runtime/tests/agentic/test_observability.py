# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json

import pytest

from app.agentic.observability import BoundedMetrics, StructuredEventLogger


def test_metrics_cover_fixed_runtime_events_with_low_cardinality_labels() -> None:
    metrics = BoundedMetrics()
    metrics.increment("workflow_start", {"outcome": "accepted"})
    metrics.increment("active_runs", {"state": "department_analysis"})
    metrics.increment("waiting_runs", {"state": "awaiting_human_approval"})
    metrics.observe(
        "activity_duration_seconds",
        0.25,
        {"activity": "execute_fake_analysis", "outcome": "completed"},
    )
    metrics.increment("retry_exhaustion", {"activity": "execute_fake_analysis"})
    metrics.increment("rejected_signal", {"signal": "approval"})
    metrics.increment("worker_polling", {"outcome": "healthy"})
    metrics.increment("terminal_outcome", {"outcome": "completed"})

    snapshot = metrics.snapshot()
    assert set(snapshot) == {
        "workflow_start", "active_runs", "waiting_runs",
        "activity_duration_seconds", "retry_exhaustion", "rejected_signal",
        "worker_polling", "terminal_outcome",
    }


def test_metrics_and_logs_reject_sensitive_or_high_cardinality_fields() -> None:
    metrics = BoundedMetrics()
    with pytest.raises(ValueError):
        metrics.increment("workflow_start", {"task_id": "task-123"})
    with pytest.raises(ValueError):
        metrics.increment("workflow_start", {"outcome": "run-123456789"})

    lines: list[str] = []
    logger = StructuredEventLogger(lines.append)
    logger.emit(
        "workflow_started",
        workflow_id="store-health-v1:run-sensitive",
        outcome="accepted",
    )
    with pytest.raises(ValueError):
        logger.emit("workflow_started", token="secret-token")

    payload = json.loads(lines[0])
    assert payload["event"] == "workflow_started"
    assert payload["workflowIdHash"] != "store-health-v1:run-sensitive"
    assert "run-sensitive" not in lines[0]
    forbidden = [
        "token", "certificate", "payload", "history", "customer", "payment",
        "taskText", "taskId", "runId",
    ]
    assert all(value not in lines[0] for value in forbidden)


def test_metrics_aggregate_repeated_events_in_bounded_storage() -> None:
    metrics = BoundedMetrics()

    for _ in range(1_000):
        metrics.increment("workflow_start", {"outcome": "accepted"})
    for duration in (0.1, 0.2, 0.3):
        metrics.observe(
            "activity_duration_seconds",
            duration,
            {"activity": "execute_fake_analysis", "outcome": "completed"},
        )

    snapshot = metrics.snapshot()
    assert snapshot["workflow_start"] == ({
        "count": 1_000,
        "total": 1_000.0,
        "minimum": 1.0,
        "maximum": 1.0,
        "labels": {"outcome": "accepted"},
    },)
    assert snapshot["activity_duration_seconds"] == ({
        "count": 3,
        "total": pytest.approx(0.6),
        "minimum": 0.1,
        "maximum": 0.3,
        "labels": {
            "activity": "execute_fake_analysis",
            "outcome": "completed",
        },
    },)


def test_metrics_render_prometheus_counters_without_high_cardinality_values() -> None:
    emitted: list[str] = []
    metrics = BoundedMetrics(emitted.append)
    metrics.increment("active_runs", {"state": "department_analysis"})
    metrics.increment("waiting_runs", {"state": "awaiting_human_approval"})

    rendered = metrics.render()

    assert "opendx_agentic_active_run_transitions_total" in rendered
    assert "opendx_agentic_waiting_run_transitions_total" in rendered
    assert 'state="department_analysis"' in rendered
    assert emitted
    assert all("run-" not in line and "task-" not in line for line in emitted)


def test_model_execution_observability_is_bounded_and_never_accepts_content() -> None:
    lines: list[str] = []
    logger = StructuredEventLogger(lines.append)
    logger.emit_model_execution(
        agent_kind="catalog", model="google/gemma-4-26b-a4b-it:free",
        status="completed", input_tokens=10, output_tokens=20, cost_micros=0,
        latency_ms=12, fallback_position=0, correction_round=0,
    )

    payload = json.loads(lines[0])
    assert payload["event"] == "model_execution_finished"
    assert payload["model"] == "google/gemma-4-26b-a4b-it:free"
    assert "content" not in payload and "prompt" not in payload
    with pytest.raises(ValueError):
        logger.emit_model_execution(
            agent_kind="catalog", model="unknown-model", status="completed",
            input_tokens=10, output_tokens=20, cost_micros=0, latency_ms=12,
            fallback_position=0, correction_round=0,
        )
