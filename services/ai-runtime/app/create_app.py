# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from fastapi import FastAPI

from app.shared.health.router import router as health_router


def create_app() -> FastAPI:
    application = FastAPI(title="OpenDX AI Runtime")
    application.include_router(health_router)
    return application
