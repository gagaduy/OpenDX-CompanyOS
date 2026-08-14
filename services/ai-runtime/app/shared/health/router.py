# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from typing import Any

from fastapi import APIRouter, Response

from app.shared.health.schemas import HealthResponse

def create_health_router(readiness: Any | None = None) -> APIRouter:
    router = APIRouter()

    @router.get("/health", response_model=HealthResponse)
    def get_health() -> HealthResponse:
        return HealthResponse(status="ok", service="opendx-ai-runtime")

    @router.get("/ready", response_model=HealthResponse)
    async def get_ready(response: Response) -> HealthResponse:
        try:
            if readiness is None:
                raise RuntimeError("Readiness is not configured")
            await readiness.probe()
            return HealthResponse(status="ready", service="opendx-ai-runtime")
        except Exception:
            response.status_code = 503
            return HealthResponse(
                status="unavailable", service="opendx-ai-runtime"
            )

    return router


router = create_health_router()
