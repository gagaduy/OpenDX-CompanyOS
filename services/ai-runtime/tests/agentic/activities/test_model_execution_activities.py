# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio

from app.agentic.activities.model_execution_activities import ModelExecutionActivities
from app.agentic.application.model_executor import ModelExecutionCommand, ModelExecutionOutcome


class Executor:
    def __init__(self) -> None:
        self.commands: list[ModelExecutionCommand] = []

    async def execute(self, command: ModelExecutionCommand) -> ModelExecutionOutcome:
        self.commands.append(command)
        return ModelExecutionOutcome(
            "completed", "run-1", "b" * 64, (), accepted_content={"private": "body"}
        )


def test_executes_one_authorized_command_without_routing_or_response_body() -> None:
    executor = Executor()
    activity = ModelExecutionActivities(executor)
    command = ModelExecutionCommand(
        task_id="task-1", agent_kind="catalog", configuration_revision_id="revision-1",
        primary_model="google/gemma-4-26b-a4b-it:free",
        fallback_model="liquid/lfm-2.5-2.6b:free", input_digest="a" * 64,
        idempotency_key="model:task-1", result_schema_name="catalog_analysis_v1",
        result_schema={"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        context={"safe": "internal"}, quality_context=object(),
    )

    result = asyncio.run(activity.execute_model_analysis_v1(command))

    assert executor.commands == [command]
    assert result == {"status": "completed", "outputDigest": "b" * 64, "qualityReasonCodes": []}
    assert "task" not in result and "agent" not in result and "content" not in result
    assert "acceptedContent" not in result and "private" not in result
    assert activity.registered[0].__temporal_activity_definition.name == "execute_model_analysis_v1"
