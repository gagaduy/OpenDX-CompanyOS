# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from temporalio import activity
from temporalio.client import WorkflowHandle
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Replayer, Worker

from app.agentic.domain.contracts import (
    OrchestrationDispatchNode,
    OrchestrationDispatchPlan,
    CancellationSignal,
    StoreHealthReviewInput,
    WorkflowState,
)
from app.agentic.domain.execution_descriptor import (
    DescriptorExecutionInput,
    DescriptorExecutionReference,
    PlanningExecutionInput,
    PlanningExecutionReference,
    SynthesisExecutionInput,
    SynthesisExecutionReference,
    descriptor_json,
)
from app.agentic.workflows.store_health_review_v1 import (
    StateProjectionInput,
    StoreHealthReviewWorkflowV1,
)


TASK_ID = "10000000-0000-4000-8000-000000000001"
RUN_ID = "10000000-0000-4000-8000-000000000002"
ROOT_A = "10000000-0000-4000-8000-000000000003"
DEPENDENT = "10000000-0000-4000-8000-000000000004"
ROOT_B = "10000000-0000-4000-8000-000000000005"


class DescriptorActivities:
    def __init__(
        self, unavailable: str | None = None, *, block_departments: bool = False,
        blocked_control: str | None = None,
    ) -> None:
        self.unavailable = unavailable
        self.block_departments = block_departments
        self.blocked_control = blocked_control
        self.states: list[WorkflowState] = []
        self.started: list[str] = []
        self.finished: list[str] = []
        self.synthesis: SynthesisExecutionInput | None = None
        self.idempotency_keys: list[str] = []
        self.control_started: list[str] = []

    @activity.defn(name="project_state")
    async def project_state(self, value: StateProjectionInput) -> None:
        self.states.append(value.state)

    @activity.defn(name="plan_orchestration_v1")
    async def plan(self, raw: dict[str, Any]) -> dict[str, Any]:
        value = PlanningExecutionInput.model_validate_json(json.dumps(raw))
        self.control_started.append("planning")
        await self._block_control("planning")
        self.idempotency_keys.append(value.idempotency_key)
        assert str(value.task_id) == TASK_ID
        return descriptor_json(PlanningExecutionReference(
            task_id=value.task_id, plan_version=1, plan_digest="a" * 64,
        ))

    @activity.defn(name="load_orchestration_dispatch_plan")
    async def load(self, run_id: str) -> OrchestrationDispatchPlan:
        assert run_id == RUN_ID
        self.control_started.append("dispatch")
        await self._block_control("dispatch")
        return OrchestrationDispatchPlan(
            task_id=TASK_ID, plan_version=1, plan_digest="a" * 64,
            nodes=(
                _node(ROOT_A, "catalog"),
                _node(DEPENDENT, "inventory", (ROOT_A,)),
                _node(ROOT_B, "support"),
            ),
        )

    @activity.defn(name="execute_department_subtask_v1")
    async def department(
        self, raw: dict[str, Any]
    ) -> dict[str, Any]:
        value = DescriptorExecutionInput.model_validate_json(json.dumps(raw))
        branch = str(value.subtask_id)
        self.idempotency_keys.append(value.idempotency_key)
        self.started.append(branch)
        if self.block_departments:
            while True:
                activity.heartbeat()
                await asyncio.sleep(0.1)
        await asyncio.sleep(0.02 if branch == ROOT_B else 0.01)
        self.finished.append(branch)
        if branch == self.unavailable:
            return descriptor_json(DescriptorExecutionReference(
                status="unavailable", result_digest="b" * 64, provenance_ids=(),
            ))
        return descriptor_json(DescriptorExecutionReference(
            status="usable", result_id=UUID(branch), result_digest="c" * 64,
            provenance_ids=(UUID(branch),),
        ))

    @activity.defn(name="synthesize_executive_report_v1")
    async def synthesize(
        self, raw: dict[str, Any]
    ) -> dict[str, Any]:
        value = SynthesisExecutionInput.model_validate_json(json.dumps(raw))
        self.control_started.append("synthesis")
        await self._block_control("synthesis")
        self.idempotency_keys.append(value.idempotency_key)
        self.synthesis = value
        completion = "partial" if any(
            branch.status == "unavailable" for branch in value.branches
        ) else "complete"
        return descriptor_json(SynthesisExecutionReference(
            completion_state=completion, report_digest="d" * 64,
        ))

    async def _block_control(self, stage: str) -> None:
        if self.blocked_control != stage:
            return
        while True:
            activity.heartbeat()
            await asyncio.sleep(0.1)

    @property
    def registered(self) -> list[object]:
        return [self.project_state, self.plan, self.load, self.department, self.synthesize]


def test_new_runs_fan_out_descriptor_roots_and_keep_history_reference_only() -> None:
    async def scenario() -> None:
        activities = DescriptorActivities()
        result, history = await _execute(activities)

        assert result.state is WorkflowState.COMPLETED
        assert result.successful_branches == tuple(sorted((ROOT_A, DEPENDENT, ROOT_B)))
        assert activities.started[:2] == [ROOT_A, ROOT_B]
        assert activities.started.index(DEPENDENT) > activities.finished.index(ROOT_A)
        serialized = history.to_json()
        assert "authorizedContext" not in serialized
        assert "client_secret" not in serialized
        side_effects = (
            tuple(activities.started), tuple(activities.finished),
            tuple(activities.idempotency_keys),
        )
        assert len(activities.idempotency_keys) == len(set(activities.idempotency_keys))
        await Replayer(workflows=[StoreHealthReviewWorkflowV1]).replay_workflow(history)
        assert side_effects == (
            tuple(activities.started), tuple(activities.finished),
            tuple(activities.idempotency_keys),
        )

    asyncio.run(scenario())


def test_cancellation_drains_descriptor_work_and_skips_synthesis() -> None:
    async def scenario() -> None:
        activities = DescriptorActivities(block_departments=True)
        async with await WorkflowEnvironment.start_time_skipping() as environment:
            async with Worker(
                environment.client, task_queue="descriptor-cancellation-test",
                workflows=[StoreHealthReviewWorkflowV1], activities=activities.registered,
            ):
                handle: WorkflowHandle[StoreHealthReviewWorkflowV1, object]
                handle = await environment.client.start_workflow(
                    StoreHealthReviewWorkflowV1.run,
                    StoreHealthReviewInput(TASK_ID, 1, 1),
                    id=f"store-health-v1:{RUN_ID}",
                    task_queue="descriptor-cancellation-test",
                )
                while len(activities.started) < 2:
                    await asyncio.sleep(0.01)
                await handle.signal(
                    StoreHealthReviewWorkflowV1.cancel,
                    CancellationSignal(
                        payload_digest="f" * 64,
                        reason_code="CANCELED_BY_STAFF",
                        idempotency_key="descriptor-cancel-1",
                    ),
                )
                result = await handle.result()

        assert result.state is WorkflowState.CANCELED
        assert result.outcome_code == "CANCELED_BY_STAFF"
        assert activities.synthesis is None
        assert activities.finished == []

    asyncio.run(scenario())


def test_cancellation_drains_each_descriptor_control_activity() -> None:
    async def cancel_stage(stage: str) -> None:
        activities = DescriptorActivities(blocked_control=stage)
        task_queue = f"descriptor-{stage}-cancellation-test"
        async with await WorkflowEnvironment.start_time_skipping() as environment:
            async with Worker(
                environment.client, task_queue=task_queue,
                workflows=[StoreHealthReviewWorkflowV1], activities=activities.registered,
            ):
                handle = await environment.client.start_workflow(
                    StoreHealthReviewWorkflowV1.run,
                    StoreHealthReviewInput(TASK_ID, 1, 1),
                    id=f"store-health-v1:{RUN_ID}", task_queue=task_queue,
                )
                while stage not in activities.control_started:
                    await asyncio.sleep(0.01)
                await handle.signal(
                    StoreHealthReviewWorkflowV1.cancel,
                    CancellationSignal(
                        payload_digest="f" * 64,
                        reason_code="CANCELED_BY_STAFF",
                        idempotency_key=f"descriptor-{stage}-cancel",
                    ),
                )
                result = await handle.result()

        assert result.state is WorkflowState.CANCELED
        assert result.outcome_code == "CANCELED_BY_STAFF"

    async def scenario() -> None:
        for stage in ("planning", "dispatch", "synthesis"):
            await cancel_stage(stage)

    asyncio.run(scenario())


def test_unavailable_root_blocks_dependents_and_synthesizes_honest_partial() -> None:
    async def scenario() -> None:
        activities = DescriptorActivities(unavailable=ROOT_A)
        result, _history = await _execute(activities)

        assert result.state is WorkflowState.PARTIALLY_COMPLETED
        assert result.successful_branches == (ROOT_B,)
        assert result.failed_branches == tuple(sorted((ROOT_A, DEPENDENT)))
        assert DEPENDENT not in activities.started
        assert activities.synthesis is not None
        assert {branch.status for branch in activities.synthesis.branches} == {
            "usable", "unavailable",
        }

    asyncio.run(scenario())


async def _execute(activities: DescriptorActivities):
    async with await WorkflowEnvironment.start_time_skipping() as environment:
        async with Worker(
            environment.client, task_queue="descriptor-orchestration-test",
            workflows=[StoreHealthReviewWorkflowV1], activities=activities.registered,
        ):
            handle = await environment.client.start_workflow(
                StoreHealthReviewWorkflowV1.run,
                StoreHealthReviewInput(TASK_ID, 1, 1),
                id=f"store-health-v1:{RUN_ID}",
                task_queue="descriptor-orchestration-test",
            )
            result = await handle.result()
            return result, await handle.fetch_history()


def _node(
    subtask_id: str, agent_kind: str, dependencies: tuple[str, ...] = (),
) -> OrchestrationDispatchNode:
    return OrchestrationDispatchNode(
        subtask_id=subtask_id, agent_kind=agent_kind, dependencies=dependencies,
        descriptor_id=subtask_id, descriptor_digest="e" * 64,
    )
