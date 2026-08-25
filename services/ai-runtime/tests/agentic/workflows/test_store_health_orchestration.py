# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import hashlib
import json
import multiprocessing
import os
from typing import Any
from uuid import UUID

import pytest
from temporalio import activity
from temporalio.client import Client, WorkflowHandle
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Replayer, Worker

from app.agentic.domain.contracts import (
    OrchestrationCollaborationInstruction,
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
PHASE_F_NODES = {
    "catalog": "20000000-0000-4000-8000-000000000001",
    "inventory": "20000000-0000-4000-8000-000000000002",
    "order": "20000000-0000-4000-8000-000000000003",
    "finance": "20000000-0000-4000-8000-000000000004",
    "crm": "20000000-0000-4000-8000-000000000005",
    "support": "20000000-0000-4000-8000-000000000006",
}


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
        self.department_commands: dict[str, DescriptorExecutionInput] = {}

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
                _node(DEPENDENT, "inventory", (ROOT_A,), (
                    OrchestrationCollaborationInstruction(
                        requester_subtask_id=ROOT_A, requester_agent_kind="catalog",
                        purpose="compare_availability",
                        requested_data_classification="internal",
                    ),
                )),
                _node(ROOT_B, "support"),
            ),
        )

    @activity.defn(name="execute_department_subtask_v1")
    async def department(
        self, raw: dict[str, Any]
    ) -> dict[str, Any]:
        value = DescriptorExecutionInput.model_validate_json(json.dumps(raw))
        branch = str(value.subtask_id)
        self.department_commands[branch] = value
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


class PhaseFAcceptanceActivities(DescriptorActivities):
    def __init__(self, rows: Any, *, lose_support_ack: bool) -> None:
        super().__init__()
        self.rows = rows
        self.lose_support_ack = lose_support_ack

    @activity.defn(name="plan_orchestration_v1")
    async def plan(self, raw: dict[str, Any]) -> dict[str, Any]:
        value = PlanningExecutionInput.model_validate_json(json.dumps(raw))
        self._record("model", value.idempotency_key)
        return descriptor_json(PlanningExecutionReference(
            task_id=value.task_id, plan_version=1, plan_digest="a" * 64,
        ))

    @activity.defn(name="load_orchestration_dispatch_plan")
    async def load(self, _run_id: str) -> OrchestrationDispatchPlan:
        catalog = PHASE_F_NODES["catalog"]
        return OrchestrationDispatchPlan(
            task_id=TASK_ID, plan_version=1, plan_digest="a" * 64,
            nodes=tuple(
                _node(
                    subtask_id, kind,
                    (catalog,) if kind == "inventory" else (),
                    (OrchestrationCollaborationInstruction(
                        requester_subtask_id=catalog, requester_agent_kind="catalog",
                        purpose="compare_availability",
                        requested_data_classification="internal",
                    ),) if kind == "inventory" else (),
                )
                for kind, subtask_id in PHASE_F_NODES.items()
            ),
        )

    @activity.defn(name="execute_department_subtask_v1")
    async def department(self, raw: dict[str, Any]) -> dict[str, Any]:
        value = DescriptorExecutionInput.model_validate_json(json.dumps(raw))
        kind = value.agent_kind
        attempt_key = f"attempt:{value.idempotency_key}"
        self.rows[attempt_key] = int(self.rows.get(attempt_key, 0)) + 1
        self._record("tool", f"{value.idempotency_key}:tool")
        self._record("model", f"{value.idempotency_key}:model")
        self._record("result", f"{value.idempotency_key}:result")
        for collaboration in value.collaborations:
            self._record("collaboration",
                f"{collaboration.requester_subtask_id}:{value.subtask_id}:"
                f"{collaboration.purpose}"
            )
        if kind == "support" and self.lose_support_ack:
            self._record("lost_ack", value.idempotency_key)
            os._exit(23)
        return descriptor_json(DescriptorExecutionReference(
            status="usable", result_id=value.subtask_id,
            result_digest=hashlib.sha256(kind.encode()).hexdigest(),
            provenance_ids=(value.subtask_id,),
        ))

    @activity.defn(name="synthesize_executive_report_v1")
    async def synthesize(self, raw: dict[str, Any]) -> dict[str, Any]:
        value = SynthesisExecutionInput.model_validate_json(json.dumps(raw))
        self._record("model", value.idempotency_key)
        self._record("report", f"{value.idempotency_key}:report")
        return descriptor_json(SynthesisExecutionReference(
            completion_state="complete", report_digest="d" * 64,
        ))

    def _record(self, table: str, key: str) -> None:
        self.rows[f"{table}:{key}"] = True


def _run_phase_f_acceptance_worker(
    target_host: str, namespace: str, task_queue: str, rows: Any,
    lose_support_ack: bool,
) -> None:
    async def serve() -> None:
        client = await Client.connect(target_host, namespace=namespace)
        activities = PhaseFAcceptanceActivities(
            rows, lose_support_ack=lose_support_ack,
        )
        worker = Worker(
            client, task_queue=task_queue,
            workflows=[StoreHealthReviewWorkflowV1], activities=activities.registered,
        )
        rows[f"ready:{os.getpid()}"] = True
        await worker.run()

    asyncio.run(serve())


def test_new_runs_fan_out_descriptor_roots_and_keep_history_reference_only() -> None:
    async def scenario() -> None:
        activities = DescriptorActivities()
        result, history = await _execute(activities)

        assert result.state is WorkflowState.COMPLETED
        assert result.successful_branches == tuple(sorted((ROOT_A, DEPENDENT, ROOT_B)))
        assert set(activities.started[:2]) == {ROOT_A, ROOT_B}
        assert activities.started.index(DEPENDENT) > activities.finished.index(ROOT_A)
        collaboration = activities.department_commands[DEPENDENT].collaborations[0]
        assert collaboration.requester_subtask_id == UUID(ROOT_A)
        assert collaboration.requester_agent_kind == "catalog"
        assert collaboration.result_id == UUID(ROOT_A)
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


def test_dispatch_plan_rejects_collaboration_requester_identity_mismatch() -> None:
    with pytest.raises(ValueError, match="collaboration bindings"):
        OrchestrationDispatchPlan(
            task_id=TASK_ID, plan_version=1, plan_digest="a" * 64,
            nodes=(
                _node(ROOT_A, "catalog"),
                _node(DEPENDENT, "inventory", (ROOT_A,), (
                    OrchestrationCollaborationInstruction(
                        requester_subtask_id=ROOT_A, requester_agent_kind="support",
                        purpose="compare_availability",
                        requested_data_classification="internal",
                    ),
                )),
            ),
        )


def test_phase_f_acceptance_restarts_worker_replays_history_without_duplicate_effects() -> None:
    async def scenario() -> None:
        process_context = multiprocessing.get_context("spawn")
        manager = process_context.Manager()
        rows = manager.dict()
        commerce = {"orders": 17, "payments": 11, "inventory": 29}
        commerce_before = hashlib.sha256(
            json.dumps(commerce, sort_keys=True).encode()
        ).hexdigest()
        task_queue = "phase-f-worker-restart-acceptance"
        processes: list[multiprocessing.Process] = []
        try:
            async with await WorkflowEnvironment.start_time_skipping() as environment:
                target_host = environment.client.service_client.config.target_host

                def worker(lose_support_ack: bool) -> multiprocessing.Process:
                    process = process_context.Process(
                        target=_run_phase_f_acceptance_worker,
                        args=(target_host, environment.client.namespace, task_queue, rows,
                              lose_support_ack),
                    )
                    process.start()
                    processes.append(process)
                    return process

                first = worker(True)
                while not any(key.startswith("ready:") for key in rows.keys()):
                    await asyncio.sleep(0.01)
                handle = await environment.client.start_workflow(
                    StoreHealthReviewWorkflowV1.run,
                    StoreHealthReviewInput(TASK_ID, 1, 1),
                    id=f"store-health-v1:{RUN_ID}", task_queue=task_queue,
                )
                while not any(key.startswith("lost_ack:") for key in rows.keys()):
                    await asyncio.sleep(0.01)
                await asyncio.to_thread(first.join, 5)
                assert first.exitcode == 23

                second = worker(False)
                while sum(key.startswith("ready:") for key in rows.keys()) < 2:
                    await asyncio.sleep(0.01)
                result = await handle.result()
                history = await handle.fetch_history()
                second.terminate()
                await asyncio.to_thread(second.join, 5)
                assert result.state is WorkflowState.COMPLETED
                assert sum(key.startswith("tool:") for key in rows.keys()) == 6
                assert sum(key.startswith("model:") for key in rows.keys()) == 8
                assert sum(key.startswith("result:") for key in rows.keys()) == 6
                assert sum(key.startswith("collaboration:") for key in rows.keys()) == 1
                assert sum(key.startswith("report:") for key in rows.keys()) == 1
                assert sum(key.startswith("lost_ack:") for key in rows.keys()) == 1
                support_key = (
                    f"attempt:{RUN_ID}:department:{PHASE_F_NODES['support']}:v1"
                )
                assert rows[support_key] == 2
                commerce_after = hashlib.sha256(
                    json.dumps(commerce, sort_keys=True).encode()
                ).hexdigest()
                assert commerce_after == commerce_before
                serialized = history.to_json()
                assert "authorizedContext" not in serialized
                assert "client_secret" not in serialized
                await Replayer(workflows=[StoreHealthReviewWorkflowV1]).replay_workflow(
                    history
                )
        finally:
            for process in processes:
                if process.is_alive():
                    process.terminate()
                    process.join(5)
            manager.shutdown()

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
    collaborations: tuple[OrchestrationCollaborationInstruction, ...] = (),
) -> OrchestrationDispatchNode:
    return OrchestrationDispatchNode(
        subtask_id=subtask_id, agent_kind=agent_kind, dependencies=dependencies,
        collaborations=collaborations,
        descriptor_id=subtask_id, descriptor_digest="e" * 64,
    )
