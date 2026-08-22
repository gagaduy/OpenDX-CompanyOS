# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio

import pytest

from app.agentic.cli.catalog_live_acceptance import CatalogLiveAcceptanceError, run_catalog_acceptance


def test_requires_confirmation_before_execution() -> None:
    async def execute(_command: object) -> object:
        raise AssertionError("provider must not be called")

    with pytest.raises(CatalogLiveAcceptanceError, match="LIVE_ACCEPTANCE_CONFIRMATION_REQUIRED"):
        asyncio.run(run_catalog_acceptance({"agentKind": "catalog"}, execute, execution_enabled=True))


def test_executes_only_catalog_and_returns_safe_aggregate() -> None:
    async def execute(_command: object) -> object:
        return {"runId": "run-1", "status": "completed", "inputTokens": 12,
                "outputTokens": 8, "costMicros": 19, "secret": "must-not-leak"}

    result = asyncio.run(run_catalog_acceptance(
        {"agentKind": "catalog"}, execute, execution_enabled=True, confirmation="run-one-catalog",
    ))
    assert result == {"runId": "run-1", "status": "completed", "inputTokens": 12,
                      "outputTokens": 8, "costMicros": 19}
