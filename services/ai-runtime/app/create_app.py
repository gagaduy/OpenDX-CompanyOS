# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from app.shared.health.router import create_health_router


def create_app(
    *,
    agentic_router: APIRouter | None = None,
    readiness: Any | None = None,
    metrics: Any | None = None,
    lifespan: Any | None = None,
) -> FastAPI:
    application = FastAPI(title="OpenDX AI Runtime", lifespan=lifespan)
    application.include_router(create_health_router(readiness))
    if agentic_router is not None:
        application.include_router(agentic_router)
    if metrics is not None:
        @application.get("/metrics", include_in_schema=False)
        async def get_metrics() -> Response:
            return Response(
                content=metrics.render(),
                media_type="text/plain; version=0.0.4",
            )

    @application.exception_handler(RequestValidationError)
    async def validation_error(
        _request: object, _error: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": "REQUEST_INVALID"})

    return application
