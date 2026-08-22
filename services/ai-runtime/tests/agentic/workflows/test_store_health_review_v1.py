# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Any

from temporalio import activity
from temporalio.client import WorkflowHandle
from temporalio.exceptions import ApplicationError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from app.agentic.domain.contracts import (
    ApprovalDecision,
    ApprovalRequirement,
    ApprovalSignal,
    CancellationSignal,
    FrozenWorkflowPlan,
    PlanDependency,
    PlanNode,
    StoreHealthReviewInput,
    WorkflowState,
)
from app.agentic.workflows.store_health_review_v1 import (
    ActivityExecutionInput,
    StateProjectionInput,
    StoreHealthReviewResult,
    StoreHealthReviewWorkflowV1,
)


class InjectedActivities:
    def __init__(
        self,
        plan: FrozenWorkflowPlan,
        *,
        failures: dict[tuple[str, str], tuple[str, int]] | None = None,
        blocked_branch: str | None = None,
        load_delay: float = 0,
        load_failure: tuple[str, bool] | None = None,
        blocked_projection: WorkflowState | None = None,
        delays: dict[tuple[str, str], float] | None = None,
        statuses: dict[tuple[str, str], str] | None = None,
    ) -> None:
        self.plan = plan
        self.failures = failures or {}
        self.blocked_branch = blocked_branch
        self.load_delay = load_delay
        self.load_failure = load_failure
        self.blocked_projection = blocked_projection
        self.delays = delays or {}
        self.statuses = statuses or {}
        self.states: list[WorkflowState] = []
        self.started: list[tuple[str, str]] = []
        self.finished: list[tuple[str, str]] = []
        self.events: list[tuple[str, str, str]] = []
        self.attempts: dict[tuple[str, str], int] = {}
        self.maximum_parallel = 0
        self._active = 0

    @activity.defn(name="load_frozen_plan")
    async def load_frozen_plan(self, _run_id: str) -> FrozenWorkflowPlan:
        remaining = self.load_delay
        while remaining > 0:
            activity.heartbeat()
            delay = min(0.1, remaining)
            await asyncio.sleep(delay)
            remaining -= delay
        if self.load_failure is not None:
            code, non_retryable = self.load_failure
            raise ApplicationError(code, type=code, non_retryable=non_retryable)
        return self.plan

    @activity.defn(name="project_state")
    async def project_state(self, value: StateProjectionInput) -> None:
        self.states.append(value.state)
        if value.state is self.blocked_projection:
            await asyncio.sleep(0.1)

    @activity.defn(name="execute_fake_analysis")
    async def execute_fake_analysis(self, value: ActivityExecutionInput) -> dict[str, str]:
        return await self._execute("analysis", value)

    @activity.defn(name="execute_fake_quality_review")
    async def execute_fake_quality_review(self, value: ActivityExecutionInput) -> dict[str, str]:
        return await self._execute("quality", value)

    @activity.defn(name="execute_fake_collaboration")
    async def execute_fake_collaboration(self, value: ActivityExecutionInput) -> dict[str, str]:
        return await self._execute("collaboration", value)

    @activity.defn(name="execute_fake_synthesis")
    async def execute_fake_synthesis(self, value: ActivityExecutionInput) -> dict[str, str]:
        return await self._execute("synthesis", value)

    async def _execute(self, kind: str, value: ActivityExecutionInput) -> dict[str, str]:
        branch = value.branch_id or "root"
        key = (kind, branch)
        self.attempts[key] = self.attempts.get(key, 0) + 1
        self.started.append(key)
        self.events.append(("started", kind, branch))
        self._active += 1
        self.maximum_parallel = max(self.maximum_parallel, self._active)
        try:
            failure = self.failures.get(key)
            if failure is not None and self.attempts[key] <= failure[1]:
                error_type = failure[0]
                raise ApplicationError(
                    error_type,
                    type=error_type,
                    non_retryable=error_type == "BUSINESS_REJECTED",
                )
            if branch == self.blocked_branch:
                for _ in range(120):
                    activity.heartbeat()
                    await asyncio.sleep(0.25)
            await asyncio.sleep(self.delays.get(key, 0.02))
            self.finished.append(key)
            self.events.append(("finished", kind, branch))
            return {"status": self.statuses.get(key, "usable"), "branchId": branch}
        finally:
            self._active -= 1

    @property
    def registered(self) -> list[Any]:
        return [
            self.load_frozen_plan,
            self.project_state,
            self.execute_fake_analysis,
            self.execute_fake_quality_review,
            self.execute_fake_collaboration,
            self.execute_fake_synthesis,
        ]


def test_happy_path_projects_exact_states_and_runs_independent_branches_concurrently() -> None:
    async def scenario() -> None:
        plan = _plan()
        activities = InjectedActivities(
            plan, delays={("analysis", "support"): 0.15}
        )
        result = await _execute(activities)

        assert result == StoreHealthReviewResult(
            state=WorkflowState.COMPLETED,
            outcome_code="COMPLETED",
            successful_branches=("catalog", "inventory", "support"),
            failed_branches=(),
        )
        assert [WorkflowState.RECEIVED, *activities.states] == [
            WorkflowState.RECEIVED,
            WorkflowState.PLANNING,
            WorkflowState.DISPATCHING,
            WorkflowState.DEPARTMENT_ANALYSIS,
            WorkflowState.QUALITY_REVIEW,
            WorkflowState.COLLABORATION,
            WorkflowState.EXECUTIVE_SYNTHESIS,
            WorkflowState.COMPLETED,
        ]
        assert activities.maximum_parallel >= 2
        support_started = activities.events.index(("started", "analysis", "support"))
        catalog_finished = activities.events.index(("finished", "analysis", "catalog"))
        inventory_started = activities.events.index(("started", "analysis", "inventory"))
        support_finished = activities.events.index(("finished", "analysis", "support"))
        assert support_started < catalog_finished < inventory_started < support_finished

    asyncio.run(scenario())


def test_retry_exhaustion_blocks_dependents_but_allows_honest_partial_completion() -> None:
    async def scenario() -> None:
        activities = InjectedActivities(
            _plan(), failures={("analysis", "catalog"): ("TRANSIENT", 3)}
        )
        result = await _execute(activities)

        assert result.state is WorkflowState.PARTIALLY_COMPLETED
        assert result.outcome_code == "PARTIAL_ACTIVITY_FAILURE"
        assert result.successful_branches == ("support",)
        assert result.failed_branches == ("catalog", "inventory")
        assert activities.attempts[("analysis", "catalog")] == 3
        assert activities.states.count(WorkflowState.RETRYING) == 2
        assert activities.states.count(WorkflowState.DEPARTMENT_ANALYSIS) == 3
        assert ("analysis", "inventory") not in activities.started
        assert ("analysis", "support") in activities.finished

    asyncio.run(scenario())


def test_non_retryable_business_failure_is_not_retried() -> None:
    async def scenario() -> None:
        plan = replace(_plan(), subtasks=(PlanNode("catalog", "catalog", 1),), dependencies=())
        activities = InjectedActivities(
            plan, failures={("analysis", "catalog"): ("BUSINESS_REJECTED", 3)}
        )
        result = await _execute(activities)

        assert result.state is WorkflowState.FAILED
        assert result.outcome_code == "ACTIVITY_REJECTED"
        assert activities.attempts[("analysis", "catalog")] == 1

    asyncio.run(scenario())


def test_corrupt_cyclic_frozen_plan_fails_before_dispatching_branches() -> None:
    async def scenario() -> None:
        plan = replace(
            _plan(),
            subtasks=(PlanNode("catalog", "catalog", 1), PlanNode("support", "support", 1)),
            dependencies=(
                PlanDependency("catalog", "support"),
                PlanDependency("support", "catalog"),
            ),
        )
        activities = InjectedActivities(plan)
        result = await _execute(activities)

        assert result.state is WorkflowState.FAILED
        assert result.outcome_code == "INVALID_FROZEN_PLAN"
        assert activities.started == []

    asyncio.run(scenario())


def test_retry_exhausted_plan_load_is_not_reported_as_corrupt_input() -> None:
    result = asyncio.run(_execute(InjectedActivities(
        _plan(), load_failure=("AGENTIC_CONTROL_TRANSPORT_FAILED", False)
    )))

    assert result.state is WorkflowState.FAILED
    assert result.outcome_code == "RETRY_EXHAUSTED"


def test_control_plane_rejection_is_not_reported_as_corrupt_plan_data() -> None:
    rejected = asyncio.run(_execute(InjectedActivities(
        _plan(), load_failure=("AGENTIC_CONTROL_REJECTED", True)
    )))
    invalid = asyncio.run(_execute(InjectedActivities(
        _plan(), load_failure=("AGENTIC_RESPONSE_INVALID", True)
    )))
    authoritative_invalid = asyncio.run(_execute(InjectedActivities(
        _plan(), load_failure=("INVALID_FROZEN_PLAN", True)
    )))

    assert rejected.outcome_code == "RETRY_EXHAUSTED"
    assert invalid.outcome_code == "INVALID_FROZEN_PLAN"
    assert authoritative_invalid.outcome_code == "INVALID_FROZEN_PLAN"


def test_retryable_failure_resumes_and_timeout_is_bounded() -> None:
    async def scenario() -> None:
        retrying = InjectedActivities(
            _plan(), failures={("analysis", "catalog"): ("TRANSIENT", 1)}
        )
        assert (await _execute(retrying)).state is WorkflowState.COMPLETED
        assert retrying.attempts[("analysis", "catalog")] == 2
        assert WorkflowState.RETRYING in retrying.states

        plan = replace(_plan(), subtasks=(PlanNode("catalog", "catalog", 1),), dependencies=())
        timing_out = InjectedActivities(
            plan, failures={("analysis", "catalog"): ("TIMEOUT", 3)}
        )
        result = await _execute(timing_out)
        assert result.state is WorkflowState.FAILED
        assert result.outcome_code == "RETRY_EXHAUSTED"
        assert timing_out.attempts[("analysis", "catalog")] == 3

    asyncio.run(scenario())


def test_retry_backoff_does_not_stall_an_unrelated_dependency_path() -> None:
    async def scenario() -> None:
        plan = replace(
            _plan(),
            subtasks=(
                PlanNode("catalog", "catalog", 1),
                PlanNode("inventory", "inventory", 1),
                PlanNode("support", "support", 1),
                PlanNode("finance", "finance", 1),
            ),
            dependencies=(
                PlanDependency("catalog", "inventory"),
                PlanDependency("support", "finance"),
            ),
        )
        activities = InjectedActivities(
            plan,
            failures={("analysis", "catalog"): ("TRANSIENT", 1)},
            delays={("analysis", "support"): 0.05},
        )
        result = await _execute(activities)

        catalog_starts = [
            index for index, event in enumerate(activities.events)
            if event == ("started", "analysis", "catalog")
        ]
        assert result.state is WorkflowState.COMPLETED
        assert len(catalog_starts) == 2
        assert activities.events.index(
            ("started", "analysis", "finance")
        ) < catalog_starts[1]

    asyncio.run(scenario())


def test_unusable_result_never_unlocks_a_dependent_branch() -> None:
    async def scenario() -> None:
        activities = InjectedActivities(
            _plan(), statuses={("analysis", "catalog"): "unusable"}
        )
        result = await _execute(activities)

        assert result.state is WorkflowState.PARTIALLY_COMPLETED
        assert result.successful_branches == ("support",)
        assert result.failed_branches == ("catalog", "inventory")
        assert ("analysis", "inventory") not in activities.started

    asyncio.run(scenario())


def test_partial_completion_requires_the_frozen_synthesis_permission() -> None:
    async def scenario() -> None:
        plan = replace(_plan(), partial_completion_allowed=False)
        activities = InjectedActivities(
            plan, failures={("analysis", "catalog"): ("TRANSIENT", 3)}
        )
        result = await _execute(activities)

        assert result.state is WorkflowState.FAILED
        assert result.outcome_code == "RETRY_EXHAUSTED"

    asyncio.run(scenario())


def test_valid_approval_resumes_and_stale_or_duplicate_signals_do_not() -> None:
    async def scenario() -> None:
        activities = InjectedActivities(_plan(approval=_approval()))
        async with await WorkflowEnvironment.start_time_skipping() as environment:
            async with Worker(
                environment.client,
                task_queue="store-health-test",
                workflows=[StoreHealthReviewWorkflowV1],
                activities=activities.registered,
            ):
                handle = await environment.client.start_workflow(
                    StoreHealthReviewWorkflowV1.run,
                    _workflow_input(),
                    id="store-health-v1:run-1",
                    task_queue="store-health-test",
                )
                await _wait_for_state(activities, WorkflowState.AWAITING_HUMAN_APPROVAL)
                await handle.signal(StoreHealthReviewWorkflowV1.approve, _signal("other"))
                await handle.signal(
                    StoreHealthReviewWorkflowV1.approve,
                    replace(_signal("approval-1"), application_decision_version=3,
                            idempotency_key="wrong-version"),
                )
                await handle.signal(StoreHealthReviewWorkflowV1.approve, _signal("approval-1"))
                await handle.signal(StoreHealthReviewWorkflowV1.approve, _signal("approval-1"))
                result = await handle.result()

        assert result.state is WorkflowState.COMPLETED
        assert activities.states.count(WorkflowState.COMPLETED) == 1

    asyncio.run(scenario())


def test_valid_approval_delivered_before_plan_load_is_buffered() -> None:
    async def scenario() -> None:
        activities = InjectedActivities(
            _plan(approval=_approval()), load_delay=0.1
        )
        async with await WorkflowEnvironment.start_time_skipping() as environment:
            async with Worker(
                environment.client,
                task_queue="store-health-test",
                workflows=[StoreHealthReviewWorkflowV1],
                activities=activities.registered,
            ):
                handle = await environment.client.start_workflow(
                    StoreHealthReviewWorkflowV1.run,
                    _workflow_input(),
                    id="store-health-v1:run-1",
                    task_queue="store-health-test",
                )
                await handle.signal(
                    StoreHealthReviewWorkflowV1.approve, _signal("approval-1")
                )
                result = await handle.result()

        assert result.state is WorkflowState.COMPLETED
        assert WorkflowState.AWAITING_HUMAN_APPROVAL in activities.states

    asyncio.run(scenario())


def test_rejection_and_expiration_fail_closed() -> None:
    async def scenario() -> None:
        rejecting = InjectedActivities(_plan(approval=_approval()))
        rejected = await _execute_with_signal(
            rejecting,
            ApprovalSignal(
                approval_id="approval-1",
                payload_digest="a" * 64,
                decision=ApprovalDecision.REJECTED,
                application_decision_version=2,
                idempotency_key="approval-rejected",
            ),
        )
        assert rejected.outcome_code == "APPROVAL_REJECTED"

        expired_requirement = replace(_approval(), expires_at="2000-01-01T00:00:00+00:00")
        expired = await _execute(InjectedActivities(_plan(approval=expired_requirement)))
        assert expired.state is WorkflowState.FAILED
        assert expired.outcome_code == "APPROVAL_EXPIRED"

    asyncio.run(scenario())


def test_cancellation_stops_an_activity_and_also_works_while_waiting_for_approval() -> None:
    async def scenario() -> None:
        running = InjectedActivities(_plan(), blocked_branch="support")
        canceled = await _execute_with_cancellation(running, WorkflowState.DEPARTMENT_ANALYSIS)
        assert canceled.state is WorkflowState.CANCELED
        assert ("quality", "root") not in running.started

        waiting = InjectedActivities(_plan(approval=_approval()))
        canceled_wait = await _execute_with_cancellation(
            waiting, WorkflowState.AWAITING_HUMAN_APPROVAL
        )
        assert canceled_wait.state is WorkflowState.CANCELED
        assert waiting.states[-1] is WorkflowState.CANCELED

        projecting = InjectedActivities(
            _plan(), blocked_projection=WorkflowState.QUALITY_REVIEW
        )
        canceled_projection = await _execute_with_cancellation(
            projecting, WorkflowState.QUALITY_REVIEW
        )
        assert canceled_projection.state is WorkflowState.CANCELED
        assert ("quality", "root") not in projecting.started

        loading = InjectedActivities(_plan(), load_delay=30)
        canceled_loading = await _execute_with_cancellation(
            loading, WorkflowState.PLANNING
        )
        assert canceled_loading.state is WorkflowState.CANCELED
        assert WorkflowState.DISPATCHING not in loading.states

    asyncio.run(scenario())


async def _execute(activities: InjectedActivities) -> StoreHealthReviewResult:
    async with await WorkflowEnvironment.start_time_skipping() as environment:
        async with Worker(
            environment.client,
            task_queue="store-health-test",
            workflows=[StoreHealthReviewWorkflowV1],
            activities=activities.registered,
        ):
            return await environment.client.execute_workflow(
                StoreHealthReviewWorkflowV1.run,
                _workflow_input(),
                id="store-health-v1:run-1",
                task_queue="store-health-test",
            )


async def _execute_with_signal(
    activities: InjectedActivities, signal: ApprovalSignal
) -> StoreHealthReviewResult:
    async with await WorkflowEnvironment.start_time_skipping() as environment:
        async with Worker(
            environment.client,
            task_queue="store-health-test",
            workflows=[StoreHealthReviewWorkflowV1],
            activities=activities.registered,
        ):
            handle = await environment.client.start_workflow(
                StoreHealthReviewWorkflowV1.run,
                _workflow_input(),
                id="store-health-v1:run-1",
                task_queue="store-health-test",
            )
            await _wait_for_state(activities, WorkflowState.AWAITING_HUMAN_APPROVAL)
            await handle.signal(StoreHealthReviewWorkflowV1.approve, signal)
            return await handle.result()


async def _execute_with_cancellation(
    activities: InjectedActivities, state: WorkflowState
) -> StoreHealthReviewResult:
    async with await WorkflowEnvironment.start_time_skipping() as environment:
        async with Worker(
            environment.client,
            task_queue="store-health-test",
            workflows=[StoreHealthReviewWorkflowV1],
            activities=activities.registered,
        ):
            handle: WorkflowHandle[StoreHealthReviewWorkflowV1, StoreHealthReviewResult]
            handle = await environment.client.start_workflow(
                StoreHealthReviewWorkflowV1.run,
                _workflow_input(),
                id="store-health-v1:run-1",
                task_queue="store-health-test",
            )
            await _wait_for_state(activities, state)
            if activities.blocked_branch is not None:
                for _ in range(500):
                    if ("analysis", activities.blocked_branch) in activities.started:
                        break
                    await asyncio.sleep(0.01)
                else:
                    raise AssertionError("Blocking activity did not start")
            await handle.signal(
                StoreHealthReviewWorkflowV1.cancel,
                CancellationSignal(
                    payload_digest="b" * 64,
                    reason_code="CANCELED_BY_STAFF",
                    idempotency_key="cancel-1",
                ),
            )
            return await handle.result()


async def _wait_for_state(
    activities: InjectedActivities, state: WorkflowState
) -> None:
    for _ in range(500):
        if state in activities.states:
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"Workflow did not reach {state}")


def _workflow_input() -> StoreHealthReviewInput:
    return StoreHealthReviewInput(task_id="task-1", workflow_version=1, plan_revision=2)


def _approval() -> ApprovalRequirement:
    return ApprovalRequirement(
        id="approval-1",
        payload_digest="a" * 64,
        expires_at="2099-08-14T00:00:00+00:00",
        policy_version=4,
        application_decision_version=2,
    )


def _signal(approval_id: str) -> ApprovalSignal:
    return ApprovalSignal(
        approval_id=approval_id,
        payload_digest="a" * 64,
        decision=ApprovalDecision.APPROVED,
        application_decision_version=2,
        idempotency_key=f"signal-{approval_id}",
    )


def _plan(approval: ApprovalRequirement | None = None) -> FrozenWorkflowPlan:
    return FrozenWorkflowPlan(
        task_id="task-1",
        workflow_run_id="run-1",
        workflow_version=1,
        plan_revision=2,
        configuration_revision_id="revision-1",
        subtasks=(
            PlanNode("catalog", "catalog", 1),
            PlanNode("inventory", "inventory", 1),
            PlanNode("support", "support", 1),
        ),
        dependencies=(PlanDependency("catalog", "inventory"),),
        approval=approval,
        partial_completion_allowed=True,
    )
