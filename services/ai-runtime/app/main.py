# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from fastapi import FastAPI

app = FastAPI(title="OpenDX AI Runtime")


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "opendx-ai-runtime",
    }
