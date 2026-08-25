# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import inspect

from fastapi.testclient import TestClient

from app.agentic.observability import BoundedMetrics
from app.create_app import create_app


class ReadinessFake:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error

    async def probe(self) -> None:
        if self.error is not None:
            raise self.error


def test_health_endpoint_returns_service_status() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "opendx-ai-runtime",
    }


def test_readiness_checks_temporal_without_affecting_liveness() -> None:
    ready = TestClient(create_app(readiness=ReadinessFake()))
    unavailable = TestClient(create_app(
        readiness=ReadinessFake(RuntimeError("sensitive temporal detail"))
    ))

    assert ready.get("/ready").json() == {
        "status": "ready",
        "service": "opendx-ai-runtime",
    }
    failed = unavailable.get("/ready")
    assert failed.status_code == 503
    assert failed.json() == {
        "status": "unavailable",
        "service": "opendx-ai-runtime",
    }
    assert unavailable.get("/health").status_code == 200
    assert "sensitive" not in failed.text


def test_metrics_endpoint_exports_only_the_bounded_registry() -> None:
    metrics = BoundedMetrics()
    metrics.increment("workflow_start", {"outcome": "accepted"})
    application = create_app(metrics=metrics)

    response = TestClient(application).get("/metrics")
    endpoint = next(
        route.endpoint
        for route in application.routes
        if getattr(route, "path", None) == "/metrics"
    )

    assert response.status_code == 200
    assert inspect.iscoroutinefunction(endpoint)
    assert response.headers["content-type"].startswith("text/plain")
    assert "opendx_agentic_workflow_starts_total" in response.text
    assert "workflow_id" not in response.text
