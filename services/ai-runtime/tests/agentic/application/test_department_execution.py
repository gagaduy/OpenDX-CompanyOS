# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

import asyncio
from datetime import UTC, datetime
from uuid import UUID

import pytest

from app.agentic.application.department_execution import (
    DepartmentExecutionError,
    DepartmentExecutionService,
)
from app.agentic.domain.execution_descriptor import (
    DescriptorExecutionInput,
    canonical_digest,
)
from app.agentic.domain.store_health_result_schemas import STORE_HEALTH_RESULT_SCHEMAS


class Control:
    def __init__(self, descriptor: dict[str, object]) -> None:
        self.descriptor = descriptor
        self.results: list[dict[str, object]] = []

    async def load_execution_descriptor(self, _id: str, _digest: str) -> dict[str, object]:
        return self.descriptor

    async def accept_orchestration_result(self, body: dict[str, object]) -> str:
        self.results.append(body)
        return str(body["resultDigest"])


class Tools:
    def __init__(self) -> None:
        self.calls: list[object] = []

    async def invoke(self, agent: str, request: dict[str, object]) -> dict[str, object]:
        self.calls.append((agent, request))
        return {"resultDigest": "d" * 64, "safeResult": {"riskLevel": "low"}}


class Models:
    def __init__(self) -> None:
        self.commands: list[object] = []

    async def execute(self, command: object) -> object:
        self.commands.append(command)
        return type("Outcome", (), {"status": "completed", "output_digest": "e" * 64,
                                     "quality_reasons": ()})()


def test_descriptor_mismatch_stops_before_tools_or_model() -> None:
    descriptor, schemas = fixture()
    tools, models = Tools(), Models()
    service = DepartmentExecutionService(
        controls=Control(descriptor), tools=tools, models=models,
        result_schemas=schemas, now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )
    command = execution_input(descriptor) .model_copy(update={
        "subtask_id": UUID("00000000-0000-4000-8000-000000000099")
    })

    with pytest.raises(DepartmentExecutionError, match="DESCRIPTOR_BINDING_INVALID"):
        asyncio.run(service.execute(command))
    assert tools.calls == []
    assert models.commands == []


def test_named_schema_mismatch_stops_before_tools_or_model() -> None:
    descriptor, schemas = fixture()
    tools, models = Tools(), Models()
    schemas["store_health_catalog_v1"] = {"type": "string"}
    service = DepartmentExecutionService(
        controls=Control(descriptor), tools=tools, models=models,
        result_schemas=schemas, now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    with pytest.raises(DepartmentExecutionError, match="RESULT_SCHEMA_BINDING_INVALID"):
        asyncio.run(service.execute(execution_input(descriptor)))
    assert tools.calls == []
    assert models.commands == []


def test_executes_only_descriptor_grants_then_settles_a_digest_reference() -> None:
    descriptor, schemas = fixture()
    control, tools, models = Control(descriptor), Tools(), Models()
    service = DepartmentExecutionService(
        controls=control, tools=tools, models=models, result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
        generate_id=lambda: "00000000-0000-4000-8000-000000000010",
    )

    result = asyncio.run(service.execute(execution_input(descriptor)))

    assert result.status == "usable"
    assert result.result_digest == "e" * 64
    assert len(tools.calls) == 1
    assert tools.calls[0][0] == "catalog"
    assert len(models.commands) == 1
    assert control.results[0]["resultDigest"] == "e" * 64
    assert "output" not in control.results[0]


def test_materializes_only_the_api_owned_tool_parameter_template() -> None:
    descriptor, schemas = fixture()
    payload = descriptor["payload"]
    authority = descriptor["descriptor"]
    assert isinstance(payload, dict) and isinstance(authority, dict)
    grants = payload["toolGrants"]
    assert isinstance(grants, list) and isinstance(grants[0], dict)
    grants[0]["parameterTemplate"] = "evidence_window_24h"
    authority["allowedToolsDigest"] = canonical_digest(grants)
    authority["payloadDigest"] = canonical_digest(payload)
    authority.pop("descriptorDigest")
    authority["descriptorDigest"] = canonical_digest(authority)
    tools = Tools()
    service = DepartmentExecutionService(
        controls=Control(descriptor), tools=tools, models=Models(), result_schemas=schemas,
        now=lambda: datetime(2026, 8, 22, 0, 1, tzinfo=UTC),
    )

    asyncio.run(service.execute(execution_input(descriptor)))

    request = tools.calls[0][1]
    assert request["parameters"] == {
        "start": "2026-08-21T00:00:00Z", "end": "2026-08-22T00:00:00Z",
        "timezone": "Asia/Ho_Chi_Minh", "limit": 25,
    }


def test_runtime_schema_catalog_matches_api_owned_descriptor_digests() -> None:
    assert {name: canonical_digest(schema) for name, schema in STORE_HEALTH_RESULT_SCHEMAS.items()} == {
        "store_health_catalog_v1": "499f95eff07e1ae4a99c60121fc175144bd9e2376409b15c408b3b07e9bb5e32",
        "store_health_inventory_v1": "9056ff5750e3a473c9c3380c3d57d838b26d3207604861e0a3afbdcf9fefd48f",
        "store_health_order_v1": "aea11a1162a32734682f97740bb130085fb9e01fead669ec466cb694c79e6f82",
        "store_health_finance_v1": "cfb97fdb10794a7dd94ae1493775e86939dddbfea752c4bbcd0cbce820c9215c",
        "store_health_crm_v1": "07e68c6cc7cf108d6c625d3dcfad6fdfaea3c306fd63e3fd6d1f9f74544ee868",
        "store_health_support_v1": "34e1063ef40e306ed665f8d4b867ac48e331a114f0f664eb8b32fc88647f2612",
    }


def fixture() -> tuple[dict[str, object], dict[str, dict[str, object]]]:
    schema = {"type": "object", "additionalProperties": False, "properties": {}}
    context: list[dict[str, object]] = []
    grants = [{"name": "catalog.product_completeness", "version": 1,
               "purpose": "store_health_review", "dataScope": "catalog:health:read",
               "dataClassification": "internal", "maximumInvocations": 1,
               "parameterTemplate": "empty"}]
    payload = {"taskBrief": {"taskId": "00000000-0000-4000-8000-000000000001"},
               "resultSchema": schema, "authorizedContext": context, "toolGrants": grants}
    authority = {"id": "00000000-0000-4000-8000-000000000002", "version": 1,
                 "taskId": "00000000-0000-4000-8000-000000000001", "planVersion": 1,
                 "subtaskId": "00000000-0000-4000-8000-000000000003", "agentKind": "catalog",
                 "configurationRevisionId": "00000000-0000-4000-8000-000000000004",
                 "policyVersion": 4, "primaryModel": "provider/primary",
                 "fallbackModel": "provider/fallback", "resultSchemaName": "store_health_catalog_v1",
                 "resultSchemaDigest": canonical_digest(schema),
                 "authorizedContextDigest": canonical_digest(context),
                 "allowedToolsDigest": canonical_digest(grants), "budgetAuthorizationMicros": 100,
                 "timeoutSeconds": 30, "freshnessSeconds": 300,
                 "expiresAt": "2026-08-22T00:05:00Z", "payloadDigest": canonical_digest(payload),
                 "createdAt": "2026-08-22T00:00:00Z"}
    authority["descriptorDigest"] = canonical_digest(authority)
    return {"descriptor": authority, "payload": payload}, {"store_health_catalog_v1": schema}


def execution_input(value: dict[str, object]) -> DescriptorExecutionInput:
    descriptor = value["descriptor"]
    assert isinstance(descriptor, dict)
    return DescriptorExecutionInput.model_validate({
        "descriptorId": UUID(str(descriptor["id"])), "descriptorDigest": descriptor["descriptorDigest"],
        "taskId": UUID(str(descriptor["taskId"])), "planVersion": descriptor["planVersion"],
        "subtaskId": UUID(str(descriptor["subtaskId"])), "agentKind": descriptor["agentKind"],
        "idempotencyKey": "department:catalog:1",
    })
