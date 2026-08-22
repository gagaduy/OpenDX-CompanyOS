# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

"""Local-only, one-attempt Catalog OpenRouter acceptance command."""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from collections.abc import Awaitable, Callable, Mapping
from datetime import datetime, timezone
from uuid import UUID

import httpx

from app.agentic.application.context_boundary import AuthorizedContextInput
from app.agentic.application.model_executor import ModelExecutionCommand
from app.agentic.application.quality_gate import AuthoritativeEvidenceFact, AuthoritativeQualityContext
from app.agentic.infrastructure.agentic_control_client import AgenticControlClient
from app.agentic.infrastructure.keycloak import KeycloakClientCredentialsProvider
from app.agentic.worker import build_model_executor
from app.shared.config import RuntimeSettings


CONFIRMATION = "run-one-catalog"
_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_MODEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$")
_COMMAND_KEYS = frozenset({"agentKind", "taskId", "configurationRevisionId", "primaryModel", "fallbackModel", "provenanceId", "inputDigest", "idempotencyKey"})
_PROVENANCE_SOURCE = "catalog-live-acceptance"


class CatalogLiveAcceptanceError(ValueError):
    pass


def load_model_execution_command(value: Mapping[str, object], *, retrieved_at: datetime | None = None) -> ModelExecutionCommand:
    if set(value) != _COMMAND_KEYS or value.get("agentKind") != "catalog":
        raise CatalogLiveAcceptanceError("CATALOG_ACCEPTANCE_COMMAND_INVALID")
    task_id = _uuid(value.get("taskId"))
    revision_id = _uuid(value.get("configurationRevisionId"))
    primary_model = _model(value.get("primaryModel"))
    fallback_model = _model(value.get("fallbackModel"))
    provenance_id = _uuid(value.get("provenanceId"))
    input_digest = _digest(value.get("inputDigest"))
    idempotency_key = _digest(value.get("idempotencyKey"))
    observed_at = (retrieved_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    timestamp = observed_at.isoformat().replace("+00:00", "Z")
    expected_payload: dict[str, object] = {
        "completenessBasisPoints": 10_000, "productsAtRisk": 0,
        "publicationBlockerCount": 0, "merchandisingSignalCount": 0, "riskLevel": "low",
    }
    evidence = {"provenanceId": provenance_id, "source": _PROVENANCE_SOURCE, "retrievedAt": timestamp, "freshnessStatus": "fresh", "classification": "internal"}
    return ModelExecutionCommand(
        task_id=task_id, agent_kind="catalog", configuration_revision_id=revision_id,
        primary_model=primary_model, fallback_model=fallback_model, input_digest=input_digest,
        idempotency_key=idempotency_key, result_schema_name="catalog_live_acceptance_v1",
        result_schema=_catalog_result_schema(),
        context=AuthorizedContextInput("internal", {**expected_payload, "summary": "Synthetic internal local acceptance context.", "evidence": [evidence]}),
        quality_context=AuthoritativeQualityContext(
            expected_agent_kind="catalog", correction_round=0,
            authorized_evidence=(AuthoritativeEvidenceFact(provenance_id=provenance_id, source=_PROVENANCE_SOURCE, retrieved_at=timestamp, freshness_status="fresh"),),
            expected_payload=expected_payload, unresolved_conflict_codes=(),
            purpose="department_analysis", authorized_agent_scope=("catalog",), data_classification="internal",
        ),
        maximum_correction_rounds=0, allow_fallback=False,
    )


async def run_catalog_acceptance(command: Mapping[str, object], execute: Callable[[Mapping[str, object]], Awaitable[Mapping[str, object]]], *, execution_enabled: bool, confirmation: str | None = None) -> Mapping[str, object]:
    if confirmation != CONFIRMATION:
        raise CatalogLiveAcceptanceError("LIVE_ACCEPTANCE_CONFIRMATION_REQUIRED")
    if not execution_enabled:
        raise CatalogLiveAcceptanceError("OPENROUTER_EXECUTION_DISABLED")
    if command.get("agentKind") != "catalog":
        raise CatalogLiveAcceptanceError("CATALOG_AGENT_REQUIRED")
    outcome = await execute(command)
    return {key: outcome[key] for key in ("runId", "status", "inputTokens", "outputTokens", "costMicros") if key in outcome}


async def execute_from_command(command: Mapping[str, object], settings: RuntimeSettings) -> Mapping[str, object]:
    async def execute(raw: Mapping[str, object]) -> Mapping[str, object]:
        model_command = load_model_execution_command(raw)
        async with httpx.AsyncClient(timeout=10) as client:
            tokens = KeycloakClientCredentialsProvider(token_url=settings.keycloak.token_url, client_id=settings.keycloak.worker_client_id, client_secret=settings.keycloak.worker_client_secret, audience=settings.keycloak.worker_audience, client=client)
            control = AgenticControlClient(base_url=settings.agentic_api_base_url, tokens=tokens, client=client, timeout_seconds=10, maximum_response_bytes=16_384)
            executor = build_model_executor(settings, control, client)
            if executor is None:
                raise CatalogLiveAcceptanceError("OPENROUTER_EXECUTION_DISABLED")
            outcome = await executor.execute(model_command)
        return {"runId": outcome.run_id, "status": outcome.status, "inputTokens": outcome.input_tokens, "outputTokens": outcome.output_tokens, "costMicros": outcome.cost_micros}
    return await run_catalog_acceptance(command, execute, execution_enabled=settings.openrouter.execution_enabled, confirmation=confirmation_from_environment())


def confirmation_from_environment() -> str | None:
    return os.environ.get("OPENROUTER_LIVE_ACCEPTANCE_CONFIRM")


def main() -> None:
    try:
        raw = json.load(sys.stdin)
        if type(raw) is not dict:
            raise CatalogLiveAcceptanceError("CATALOG_ACCEPTANCE_COMMAND_INVALID")
        outcome = asyncio.run(execute_from_command(raw, RuntimeSettings.from_environment()))
    except (CatalogLiveAcceptanceError, ValueError) as error:
        print(json.dumps({"errorCode": _error_code(error)}, separators=(",", ":")))
        raise SystemExit(1) from None
    print(json.dumps(outcome, separators=(",", ":")))


def _uuid(value: object) -> str:
    if type(value) is not str:
        raise CatalogLiveAcceptanceError("CATALOG_ACCEPTANCE_COMMAND_INVALID")
    try:
        return str(UUID(value))
    except ValueError as error:
        raise CatalogLiveAcceptanceError("CATALOG_ACCEPTANCE_COMMAND_INVALID") from error


def _model(value: object) -> str:
    if type(value) is not str or _MODEL.fullmatch(value) is None:
        raise CatalogLiveAcceptanceError("CATALOG_ACCEPTANCE_COMMAND_INVALID")
    return value


def _digest(value: object) -> str:
    if type(value) is not str or _DIGEST.fullmatch(value) is None:
        raise CatalogLiveAcceptanceError("CATALOG_ACCEPTANCE_COMMAND_INVALID")
    return value


def _error_code(error: ValueError) -> str:
    value = str(error)
    return value if re.fullmatch(r"[A-Z][A-Z0-9_]{0,99}", value) else "CATALOG_ACCEPTANCE_FAILED"


def _catalog_result_schema() -> dict[str, object]:
    evidence = _object({"provenanceId": {"type": "string"}, "source": {"type": "string"}, "retrievedAt": {"type": "string"}, "freshnessStatus": {"enum": ["fresh", "stale"]}, "classification": {"enum": ["internal"]}})
    reference = _object({"code": {"type": "string"}, "statement": {"type": "string"}, "confidenceBasis": {"type": "string"}, "provenanceIds": {"type": "array", "items": {"type": "string"}}})
    risk = _object({"code": {"type": "string"}, "severity": {"enum": ["low", "medium", "high"]}, "statement": {"type": "string"}, "provenanceIds": {"type": "array", "items": {"type": "string"}}})
    action = _object({"code": {"type": "string"}, "statement": {"type": "string"}, "requiresHumanApproval": {"type": "boolean"}, "provenanceIds": {"type": "array", "items": {"type": "string"}}})
    payload = _object({"completenessBasisPoints": {"type": "integer"}, "productsAtRisk": {"type": "integer"}, "publicationBlockerCount": {"type": "integer"}, "merchandisingSignalCount": {"type": "integer"}, "riskLevel": {"enum": ["low", "medium", "high"]}})
    return _object({"schemaVersion": {"enum": [1]}, "agentKind": {"enum": ["catalog"]}, "status": {"enum": ["complete", "partial"]}, "summary": {"type": "string"}, "conclusions": {"type": "array", "items": reference}, "risks": {"type": "array", "items": risk}, "recommendedActions": {"type": "array", "items": action}, "evidence": {"type": "array", "items": evidence}, "payload": payload})


def _object(properties: Mapping[str, object]) -> dict[str, object]:
    return {"type": "object", "additionalProperties": False, "properties": dict(properties), "required": list(properties)}


if __name__ == "__main__":
    main()
