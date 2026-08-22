# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import replace
from pathlib import Path
from typing import Awaitable, Callable

from temporalio.client import WorkflowHandle, WorkflowHistory
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Replayer, Worker

from app.agentic.domain.contracts import CancellationSignal, WorkflowState
from app.agentic.workflows.store_health_review_v1 import (
    StoreHealthReviewResult,
    StoreHealthReviewWorkflowV1,
)
from test_store_health_review_v1 import (
    InjectedActivities,
    _approval,
    _plan,
    _signal,
    _wait_for_state,
    _workflow_input,
)


HISTORIES = Path(__file__).with_name("histories")
FIXTURES = (
    "store_health_success_v1.json",
    "store_health_approval_v1.json",
    "store_health_retry_v1.json",
    "store_health_partial_v1.json",
    "store_health_canceled_v1.json",
)


def test_store_health_v1_replays_all_versioned_histories() -> None:
    if os.environ.get("UPDATE_TEMPORAL_HISTORIES") == "1":
        asyncio.run(_generate_histories())

    async def scenario() -> None:
        replayer = Replayer(workflows=[StoreHealthReviewWorkflowV1])
        for index, fixture in enumerate(FIXTURES, start=1):
            payload = (HISTORIES / fixture).read_text(encoding="utf-8")
            history = WorkflowHistory.from_json(f"store-health-v1:history-{index}", payload)
            await replayer.replay_workflow(history)

    asyncio.run(scenario())


async def _generate_histories() -> None:
    scenarios: tuple[
        tuple[
            str,
            InjectedActivities,
            Callable[[WorkflowHandle, InjectedActivities], Awaitable[None]] | None,
        ], ...
    ] = (
        (FIXTURES[0], InjectedActivities(_plan()), None),
        (FIXTURES[1], InjectedActivities(_plan(approval=_approval())), _approve),
        (
            FIXTURES[2],
            InjectedActivities(_plan(), failures={("analysis", "catalog"): ("TRANSIENT", 1)}),
            None,
        ),
        (
            FIXTURES[3],
            InjectedActivities(_plan(), failures={("analysis", "catalog"): ("TRANSIENT", 3)}),
            None,
        ),
        (FIXTURES[4], InjectedActivities(_plan(), blocked_branch="support"), _cancel),
    )
    for index, (fixture, activities, interaction) in enumerate(scenarios, start=1):
        history = await _record(index, activities, interaction)
        bounded = _scrub_identities(history.to_json_dict())
        (HISTORIES / fixture).write_text(
            json.dumps(bounded, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )


async def _record(
    index: int,
    activities: InjectedActivities,
    interaction: Callable[
        [WorkflowHandle, InjectedActivities], Awaitable[None]
    ] | None,
) -> WorkflowHistory:
    activities.plan = replace(activities.plan, workflow_run_id=f"history-{index}")
    async with await WorkflowEnvironment.start_time_skipping() as environment:
        async with Worker(
            environment.client,
            task_queue="store-health-replay",
            workflows=[StoreHealthReviewWorkflowV1],
            activities=activities.registered,
            identity="history-worker",
        ):
            handle: WorkflowHandle[StoreHealthReviewWorkflowV1, StoreHealthReviewResult]
            handle = await environment.client.start_workflow(
                StoreHealthReviewWorkflowV1.run,
                _workflow_input(),
                id=f"store-health-v1:history-{index}",
                task_queue="store-health-replay",
            )
            if interaction is not None:
                await interaction(handle, activities)
            await handle.result()
            return await handle.fetch_history()


async def _approve(handle: WorkflowHandle, activities: InjectedActivities) -> None:
    await _wait_for_state(activities, WorkflowState.AWAITING_HUMAN_APPROVAL)
    await handle.signal(StoreHealthReviewWorkflowV1.approve, _signal("approval-1"))


async def _cancel(handle: WorkflowHandle, activities: InjectedActivities) -> None:
    await _wait_for_state(activities, WorkflowState.DEPARTMENT_ANALYSIS)
    await handle.signal(
        StoreHealthReviewWorkflowV1.cancel,
        CancellationSignal(
            payload_digest="b" * 64,
            reason_code="CANCELED_BY_STAFF",
            idempotency_key="history-cancel",
        ),
    )


def _scrub_identities(value: object) -> object:
    if isinstance(value, dict):
        return {
            key: "history-worker" if key == "identity" else _scrub_identities(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_scrub_identities(item) for item in value]
    return value
