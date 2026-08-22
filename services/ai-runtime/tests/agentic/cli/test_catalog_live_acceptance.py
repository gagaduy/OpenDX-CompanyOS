# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import pytest

from app.agentic.cli.catalog_live_acceptance import (
    CatalogLiveAcceptanceError,
    _catalog_result_schema,
    load_model_execution_command,
    run_catalog_acceptance,
)


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


def test_loads_catalog_command_with_one_provider_attempt_only() -> None:
    command = load_model_execution_command(
        {
            "agentKind": "catalog",
            "taskId": "4f15f874-c794-4f90-8fbb-4e17c1ce00a4",
            "configurationRevisionId": "d8a87b5e-399b-4b2a-bdd0-a8ddc02f0105",
            "primaryModel": "openai/gpt-5-mini",
            "fallbackModel": "openai/gpt-5-mini",
            "provenanceId": "741dbf9f-6e80-4a36-a52b-bd9f9f8ef6e8",
            "inputDigest": "a" * 64,
            "idempotencyKey": "b" * 64,
        },
        retrieved_at=datetime(2026, 8, 22, tzinfo=timezone.utc),
    )

    assert command.maximum_correction_rounds == 0
    assert command.allow_fallback is False
    assert command.agent_kind == "catalog"
    assert command.context.classification == "internal"
    assert command.quality_context.purpose == "department_analysis"
    assert command.quality_context.authorized_evidence[0].provenance_id == "741dbf9f-6e80-4a36-a52b-bd9f9f8ef6e8"


def test_catalog_result_schema_uses_strict_structured_output_subset() -> None:
    schema = _catalog_result_schema(provenance_id="prov-1", retrieved_at="2026-08-22T00:00:00Z")

    assert schema["properties"]["schemaVersion"] == {"enum": [1]}
    assert schema["properties"]["agentKind"] == {"enum": ["catalog"]}
    assert schema["properties"]["status"] == {"enum": ["complete"]}
    assert schema["properties"]["conclusions"]["items"]["properties"]["code"] == {"enum": ["CATALOG_LIVE_ACCEPTANCE"]}
    assert schema["properties"]["evidence"]["items"]["properties"]["provenanceId"] == {"enum": ["prov-1"]}
    evidence = schema["properties"]["evidence"]["items"]
    assert evidence["properties"]["classification"] == {"enum": ["internal"]}
    assert '"const"' not in json.dumps(schema)
