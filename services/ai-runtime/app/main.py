# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from app.agentic.application.workflow_control import WorkflowControl
from app.agentic.infrastructure.keycloak import KeycloakWorkloadVerifier
from app.agentic.infrastructure.temporal_client import DeferredTemporalClient
from app.agentic.observability import BoundedMetrics, StructuredEventLogger
from app.agentic.presentation.router import create_agentic_router
from app.agentic.presentation.workload_auth import WorkloadAuthenticator
from app.create_app import create_app
from app.shared.config import RuntimeSettings


def build_application(settings: RuntimeSettings) -> FastAPI:
    temporal = DeferredTemporalClient(settings.temporal)
    metrics = BoundedMetrics()
    logger = StructuredEventLogger(logging.getLogger("opendx.agentic").info)
    control = WorkflowControl(
        temporal,
        settings.activity.start_to_close_seconds,
        settings.activity.schedule_to_close_seconds,
        metrics,
        logger,
    )
    verifier = KeycloakWorkloadVerifier(
        issuer=settings.keycloak.issuer,
        audience=settings.keycloak.control_audience,
        authorized_client_id=settings.keycloak.control_client_id,
        jwks_url=settings.keycloak.jwks_url,
    )

    @asynccontextmanager
    async def lifespan(_application: FastAPI):
        try:
            yield
        finally:
            await temporal.aclose()

    return create_app(
        agentic_router=create_agentic_router(
            control, WorkloadAuthenticator(verifier)
        ),
        readiness=control,
        metrics=metrics,
        lifespan=lifespan,
    )


settings = RuntimeSettings.from_environment()
app = build_application(settings)


def main() -> None:
    uvicorn.run(app, host=settings.bind_host, port=settings.bind_port)


if __name__ == "__main__":
    main()
