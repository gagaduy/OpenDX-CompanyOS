# SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, ApplicationError
from temporalio.workflow import ActivityCancellationType

from app.agentic.domain.contracts import (
    ApprovalDecision,
    ApprovalRequirement,
    ApprovalSignal,
    CancellationSignal,
    FrozenWorkflowPlan,
    OrchestrationDispatchPlan,
    StoreHealthReviewInput,
    WorkflowState,
)
from app.agentic.domain.execution_descriptor import (
    DescriptorCollaborationReference,
    DescriptorExecutionInput,
    DescriptorExecutionReference,
    PlanningExecutionInput,
    PlanningExecutionReference,
    SynthesisBranchReference,
    SynthesisExecutionInput,
    SynthesisExecutionReference,
    canonical_digest,
    descriptor_json,
)


MAX_EXECUTION_ATTEMPTS = 3
MAX_SIGNAL_RECEIPTS = 100
RETRY_BACKOFF_SECONDS = (1, 2)
INVALID_PLAN_ERROR_TYPES = frozenset(
    {"AGENTIC_RESPONSE_INVALID", "INVALID_FROZEN_PLAN", "SCHEMA_INVALID"}
)
CONTROL_RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=1),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=10),
    maximum_attempts=3,
    non_retryable_error_types=(
        "BUSINESS_REJECTED",
        "POLICY_DENIED",
        "STALE_INPUT",
        "SCHEMA_INVALID",
    ),
)
SINGLE_ATTEMPT_POLICY = RetryPolicy(maximum_attempts=1)


@dataclass(frozen=True)
class ActivityExecutionInput:
    run_id: str
    workflow_version: int
    branch_id: str | None = None
    source_branches: tuple[str, ...] = ()
    execution_attempt: int = 1


@dataclass(frozen=True)
class StateProjectionInput:
    run_id: str
    projection_sequence: int
    state: WorkflowState
    outcome_code: str | None = None


@dataclass(frozen=True)
class StoreHealthReviewResult:
    state: WorkflowState
    outcome_code: str
    successful_branches: tuple[str, ...]
    failed_branches: tuple[str, ...]


@workflow.defn(name="StoreHealthReviewWorkflowV1")
class StoreHealthReviewWorkflowV1:
    def __init__(self) -> None:
        self._approval: ApprovalSignal | None = None
        self._approval_requirement: ApprovalRequirement | None = None
        self._pending_approvals: tuple[ApprovalSignal, ...] = ()
        self._cancellation: CancellationSignal | None = None
        self._handled_receipts: tuple[str, ...] = ()
        self._outstanding: tuple[Any, ...] = ()
        self._sequence = 0
        self._terminal = False
        self._start_to_close = timedelta(seconds=30)
        self._schedule_to_close = timedelta(seconds=180)

    @workflow.run
    async def run(self, value: StoreHealthReviewInput) -> StoreHealthReviewResult:
        self._start_to_close = timedelta(seconds=value.activity_start_to_close_seconds)
        self._schedule_to_close = timedelta(seconds=value.activity_schedule_to_close_seconds)
        run_id = self._run_id()
        if value.execution_profile == "advanced_live":
            return await self._run_descriptor_orchestration(run_id, value)
        if workflow.patched("phase-f-execution-descriptor-v1") and self._uuid(value.task_id):
            return await self._run_descriptor_orchestration(run_id, value)
        return await self._run_phase_b_path(run_id, value)

    async def _run_phase_b_path(
        self, run_id: str, value: StoreHealthReviewInput
    ) -> StoreHealthReviewResult:
        await self._project(run_id, WorkflowState.PLANNING)
        canceled = await self._canceled_if_requested(run_id, (), ())
        if canceled is not None:
            return canceled
        try:
            plan = await self._load_plan(run_id)
        except ActivityError as error:
            application = self._application_error(error)
            outcome = (
                "INVALID_FROZEN_PLAN"
                if application is not None
                and application.type in INVALID_PLAN_ERROR_TYPES
                else "RETRY_EXHAUSTED"
            )
            return await self._finish(
                run_id, WorkflowState.FAILED, outcome, (), ()
            )
        if plan is None:
            return await self._canceled(run_id, (), ())
        if not self._valid_plan(plan, value, run_id):
            return await self._finish(
                run_id, WorkflowState.FAILED, "INVALID_FROZEN_PLAN", (), ()
            )

        self._install_approval_requirement(plan.approval)
        canceled = await self._canceled_if_requested(run_id, (), ())
        if canceled is not None:
            return canceled
        await self._project(run_id, WorkflowState.DISPATCHING)
        canceled = await self._canceled_if_requested(run_id, (), ())
        if canceled is not None:
            return canceled
        await self._project(run_id, WorkflowState.DEPARTMENT_ANALYSIS)
        canceled = await self._canceled_if_requested(run_id, (), ())
        if canceled is not None:
            return canceled

        successful, failed, retry_exhausted, rejected = await self._run_graph(plan)
        canceled = await self._canceled_if_requested(run_id, successful, failed)
        if canceled is not None:
            return canceled
        if not successful:
            outcome = "ACTIVITY_REJECTED" if rejected else "RETRY_EXHAUSTED"
            return await self._finish(
                run_id, WorkflowState.FAILED, outcome, successful, failed
            )
        if failed and not plan.partial_completion_allowed:
            outcome = "RETRY_EXHAUSTED" if retry_exhausted else "ACTIVITY_REJECTED"
            return await self._finish(
                run_id, WorkflowState.FAILED, outcome, successful, failed
            )

        await self._project(run_id, WorkflowState.QUALITY_REVIEW)
        canceled = await self._canceled_if_requested(run_id, successful, failed)
        if canceled is not None:
            return canceled
        quality, quality_rejected = await self._run_root(
            "execute_fake_quality_review", run_id, successful, WorkflowState.QUALITY_REVIEW
        )
        terminal = await self._after_root(
            run_id, plan, quality, quality_rejected, successful, failed
        )
        if terminal is not None:
            return terminal

        if len(successful) > 1:
            await self._project(run_id, WorkflowState.COLLABORATION)
            canceled = await self._canceled_if_requested(run_id, successful, failed)
            if canceled is not None:
                return canceled
            collaboration, collaboration_rejected = await self._run_root(
                "execute_fake_collaboration",
                run_id,
                successful,
                WorkflowState.COLLABORATION,
            )
            terminal = await self._after_root(
                run_id,
                plan,
                collaboration,
                collaboration_rejected,
                successful,
                failed,
            )
            if terminal is not None:
                return terminal

        await self._project(run_id, WorkflowState.EXECUTIVE_SYNTHESIS)
        canceled = await self._canceled_if_requested(run_id, successful, failed)
        if canceled is not None:
            return canceled
        synthesis, synthesis_rejected = await self._run_root(
            "execute_fake_synthesis",
            run_id,
            successful,
            WorkflowState.EXECUTIVE_SYNTHESIS,
        )
        terminal = await self._after_root(
            run_id, plan, synthesis, synthesis_rejected, successful, failed
        )
        if terminal is not None:
            return terminal

        if plan.approval is not None:
            approval_result = await self._await_approval(run_id)
            if approval_result is not None:
                return StoreHealthReviewResult(
                    state=approval_result.state,
                    outcome_code=approval_result.outcome_code,
                    successful_branches=successful,
                    failed_branches=failed,
                )
        if failed:
            return await self._finish(
                run_id,
                WorkflowState.PARTIALLY_COMPLETED,
                "PARTIAL_ACTIVITY_FAILURE",
                successful,
                failed,
            )
        return await self._finish(
            run_id, WorkflowState.COMPLETED, "COMPLETED", successful, failed
        )

    @workflow.signal(name="approve")
    async def approve(self, value: ApprovalSignal) -> None:
        if self._terminal or not self._record_receipt(value.idempotency_key):
            return
        if self._approval_requirement is None:
            if len(self._pending_approvals) < MAX_SIGNAL_RECEIPTS:
                self._pending_approvals = (*self._pending_approvals, value)
            return
        self._accept_approval(value)

    @workflow.signal(name="cancel")
    async def cancel(self, value: CancellationSignal) -> None:
        if self._terminal or not self._record_receipt(value.idempotency_key):
            return
        if self._cancellation is not None:
            return
        self._cancellation = value

    async def _run_descriptor_orchestration(
        self, run_id: str, value: StoreHealthReviewInput
    ) -> StoreHealthReviewResult:
        await self._project(run_id, WorkflowState.PLANNING)
        canceled = await self._canceled_if_requested(run_id, (), ())
        if canceled is not None:
            return canceled
        try:
            planned_raw = await self._descriptor_control_activity(
                "plan_orchestration_v1",
                descriptor_json(PlanningExecutionInput(
                    task_id=UUID(value.task_id), idempotency_key=f"{run_id}:plan:v1",
                )),
            )
            if planned_raw is None:
                return await self._canceled(run_id, (), ())
            planned = PlanningExecutionReference.model_validate_json(
                json.dumps(planned_raw)
            )
            plan = await self._descriptor_control_activity(
                "load_orchestration_dispatch_plan", run_id,
                OrchestrationDispatchPlan,
            )
            if plan is None:
                return await self._canceled(run_id, (), ())
        except (ActivityError, ValueError):
            return await self._finish(
                run_id, WorkflowState.FAILED, "INVALID_FROZEN_PLAN", (), (),
            )
        if (
            plan.task_id != value.task_id
            or planned.task_id != UUID(value.task_id)
            or plan.plan_version != planned.plan_version
            or plan.plan_digest != planned.plan_digest
            or not self._valid_dispatch_plan(plan)
        ):
            return await self._finish(
                run_id, WorkflowState.FAILED, "INVALID_FROZEN_PLAN", (), (),
            )
        await self._project(run_id, WorkflowState.DISPATCHING)
        await self._project(run_id, WorkflowState.DEPARTMENT_ANALYSIS)
        references = await self._run_descriptor_graph(run_id, plan)
        successful = tuple(sorted(
            branch_id for branch_id, reference in references.items()
            if reference.status in {"usable", "partial"}
        ))
        failed = tuple(sorted(
            branch_id for branch_id, reference in references.items()
            if reference.status == "unavailable"
        ))
        canceled = await self._canceled_if_requested(run_id, successful, failed)
        if canceled is not None:
            return canceled
        await self._project(run_id, WorkflowState.EXECUTIVE_SYNTHESIS)
        branches = tuple(
            SynthesisBranchReference(
                subtask_id=UUID(branch_id), status=reference.status,
                result_id=reference.result_id, result_digest=reference.result_digest,
                provenance_ids=reference.provenance_ids,
            )
            for branch_id, reference in sorted(references.items())
        )
        try:
            report_raw = await self._descriptor_control_activity(
                "synthesize_executive_report_v1",
                descriptor_json(SynthesisExecutionInput(
                    task_id=UUID(value.task_id), plan_version=plan.plan_version,
                    branches=branches, idempotency_key=f"{run_id}:synthesis:v1",
                )),
            )
            if report_raw is None:
                return await self._canceled(run_id, successful, failed)
            report = SynthesisExecutionReference.model_validate_json(
                json.dumps(report_raw)
            )
        except (ActivityError, ValueError):
            return await self._finish(
                run_id, WorkflowState.FAILED, "RETRY_EXHAUSTED", successful, failed,
            )
        canceled = await self._canceled_if_requested(run_id, successful, failed)
        if canceled is not None or report.completion_state == "canceled":
            return canceled or await self._canceled(run_id, successful, failed)
        if failed or any(reference.status == "partial" for reference in references.values()) \
                or report.completion_state != "complete":
            return await self._finish(
                run_id, WorkflowState.PARTIALLY_COMPLETED,
                "PARTIAL_ACTIVITY_FAILURE", successful, failed,
            )
        return await self._finish(
            run_id, WorkflowState.COMPLETED, "COMPLETED", successful, failed,
        )

    async def _run_descriptor_graph(
        self, run_id: str, plan: OrchestrationDispatchPlan
    ) -> dict[str, DescriptorExecutionReference]:
        collaboration_enabled = workflow.patched("phase-f-mediated-collaboration-v1")
        nodes = {node.subtask_id: node for node in plan.nodes}
        remaining = set(nodes)
        references: dict[str, DescriptorExecutionReference] = {}
        active: dict[Any, str] = {}
        cancellation_waiter = asyncio.create_task(
            workflow.wait_condition(lambda: self._cancellation is not None)
        )
        while remaining and self._cancellation is None:
            blocked = sorted(
                node_id for node_id in remaining
                if any(references.get(dependency) is not None
                       and references[dependency].status == "unavailable"
                       for dependency in nodes[node_id].dependencies)
            )
            for node_id in blocked:
                references[node_id] = self._unavailable_reference(
                    "DEPENDENCY_UNAVAILABLE"
                )
                remaining.remove(node_id)
            ready = sorted(
                node_id for node_id in remaining if node_id not in active.values()
                and all(dependency in references for dependency in nodes[node_id].dependencies)
            )
            for node_id in ready:
                node = nodes[node_id]
                collaborations = tuple(
                    DescriptorCollaborationReference(
                        requester_subtask_id=UUID(item.requester_subtask_id),
                        requester_agent_kind=item.requester_agent_kind,
                        result_id=references[item.requester_subtask_id].result_id,
                        result_digest=references[item.requester_subtask_id].result_digest,
                        provenance_ids=references[item.requester_subtask_id].provenance_ids,
                        purpose=item.purpose,
                        requested_data_classification=item.requested_data_classification,
                    )
                    for item in sorted(
                        node.collaborations,
                        key=lambda value: value.requester_subtask_id,
                    )
                ) if collaboration_enabled else ()
                command = DescriptorExecutionInput(
                    descriptor_id=UUID(node.descriptor_id),
                    descriptor_digest=node.descriptor_digest,
                    task_id=UUID(plan.task_id), plan_version=plan.plan_version,
                    subtask_id=UUID(node.subtask_id), agent_kind=node.agent_kind,
                    idempotency_key=f"{run_id}:department:{node.subtask_id}:v1",
                    collaborations=collaborations,
                )
                handle = workflow.start_activity(
                    "execute_department_subtask_v1",
                    descriptor_json(
                        command,
                        exclude=None if collaboration_enabled else {"collaborations"},
                    ),
                    start_to_close_timeout=self._start_to_close,
                    schedule_to_close_timeout=self._schedule_to_close,
                    heartbeat_timeout=timedelta(seconds=5),
                    retry_policy=CONTROL_RETRY_POLICY,
                    cancellation_type=ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
                )
                active[handle] = node_id
            self._outstanding = tuple(active)
            if not active:
                for node_id in remaining:
                    references[node_id] = self._unavailable_reference("INVALID_PLAN")
                break
            done, _ = await workflow.wait(
                (*active, cancellation_waiter), return_when="FIRST_COMPLETED",
            )
            if cancellation_waiter in done:
                break
            for handle in sorted(done, key=lambda item: active[item]):
                node_id = active.pop(handle)
                remaining.remove(node_id)
                try:
                    raw_reference = await handle
                    references[node_id] = DescriptorExecutionReference.model_validate_json(
                        json.dumps(raw_reference)
                    )
                except (ActivityError, ValueError) as error:
                    if isinstance(error, ValueError):
                        references[node_id] = self._unavailable_reference(
                            "SCHEMA_INVALID"
                        )
                        continue
                    application = self._application_error(error)
                    references[node_id] = self._unavailable_reference(
                        application.type if application is not None else "RETRY_EXHAUSTED"
                    )
        if self._cancellation is not None:
            await self._drain_canceled(active)
        else:
            cancellation_waiter.cancel()
            await self._ignore_cancellation(cancellation_waiter)
        return references

    @staticmethod
    def _unavailable_reference(reason_code: str) -> DescriptorExecutionReference:
        return DescriptorExecutionReference(
            status="unavailable", result_digest=canonical_digest({
                "status": "unavailable", "reasonCode": reason_code,
            }), provenance_ids=(),
        )

    @staticmethod
    def _valid_dispatch_plan(plan: OrchestrationDispatchPlan) -> bool:
        remaining = {node.subtask_id for node in plan.nodes}
        resolved: set[str] = set()
        dependencies = {node.subtask_id: set(node.dependencies) for node in plan.nodes}
        while remaining:
            ready = {node for node in remaining if dependencies[node] <= resolved}
            if not ready:
                return False
            resolved.update(ready)
            remaining.difference_update(ready)
        return True

    async def _run_graph(
        self, plan: FrozenWorkflowPlan
    ) -> tuple[tuple[str, ...], tuple[str, ...], bool, bool]:
        remaining = {node.id for node in plan.subtasks}
        dependencies = {
            node.id: {edge.source for edge in plan.dependencies if edge.target == node.id}
            for node in plan.subtasks
        }
        active: dict[Any, str] = {}
        backoffs: dict[asyncio.Task[None], str] = {}
        retry_ready: set[str] = set()
        attempts: dict[str, int] = {}
        successful: set[str] = set()
        failed: set[str] = set()
        retry_exhausted = False
        rejected = False
        cancellation_waiter = asyncio.create_task(
            workflow.wait_condition(lambda: self._cancellation is not None)
        )

        while remaining and self._cancellation is None:
            unavailable_nodes = {*active.values(), *backoffs.values()}
            blocked = {
                node
                for node in remaining - unavailable_nodes
                if dependencies[node] & failed
            }
            failed.update(blocked)
            remaining.difference_update(blocked)
            unavailable_nodes = {*active.values(), *backoffs.values()}
            ready = sorted(
                (
                    node
                    for node in remaining - unavailable_nodes
                    if dependencies[node] <= successful
                ),
                key=lambda node: (node in retry_ready, node),
            )
            for node in ready:
                retry_ready.discard(node)
                attempts[node] = attempts.get(node, 0) + 1
                handle = self._start_execution(
                    "execute_fake_analysis",
                    ActivityExecutionInput(
                        plan.workflow_run_id,
                        1,
                        branch_id=node,
                        execution_attempt=attempts[node],
                    ),
                )
                active[handle] = node
            self._outstanding = (*active, *backoffs)
            if not active and not backoffs:
                failed.update(remaining)
                break

            done, _ = await workflow.wait(
                (*active, *backoffs, cancellation_waiter),
                return_when="FIRST_COMPLETED",
            )
            if cancellation_waiter in done:
                for completed in (
                    item for item in done if item is not cancellation_waiter
                ):
                    if completed in active:
                        active.pop(completed)
                    elif completed in backoffs:
                        backoffs.pop(completed)
                    await self._ignore_cancellation(completed)
                break
            for handle in sorted(
                done,
                key=lambda item: (
                    0 if item in active else 1,
                    active[item] if item in active else backoffs[item],
                ),
            ):
                if handle in backoffs:
                    retry_ready.add(backoffs.pop(handle))
                    continue
                node = active.pop(handle)
                usable, retryable, non_retryable = await self._activity_result(handle)
                if self._cancellation is not None:
                    break
                if usable:
                    successful.add(node)
                    remaining.remove(node)
                    continue
                if retryable and attempts[node] < MAX_EXECUTION_ATTEMPTS:
                    await self._project(plan.workflow_run_id, WorkflowState.RETRYING)
                    if self._cancellation is not None:
                        break
                    await self._project(
                        plan.workflow_run_id, WorkflowState.DEPARTMENT_ANALYSIS
                    )
                    if self._cancellation is not None:
                        break
                    timer = asyncio.create_task(
                        workflow.sleep(RETRY_BACKOFF_SECONDS[attempts[node] - 1])
                    )
                    backoffs[timer] = node
                    continue
                remaining.remove(node)
                failed.add(node)
                retry_exhausted = retry_exhausted or retryable
                rejected = rejected or non_retryable
            self._outstanding = (*active, *backoffs)

        if self._cancellation is not None:
            await self._drain_canceled(active, backoffs)
        else:
            cancellation_waiter.cancel()
            await self._ignore_cancellation(cancellation_waiter)
        return (
            tuple(sorted(successful)),
            tuple(sorted(failed)),
            retry_exhausted,
            rejected,
        )

    async def _run_root(
        self,
        name: str,
        run_id: str,
        sources: tuple[str, ...],
        resume_state: WorkflowState,
    ) -> tuple[bool, bool]:
        for attempt in range(1, MAX_EXECUTION_ATTEMPTS + 1):
            value = ActivityExecutionInput(
                run_id, 1, source_branches=sources, execution_attempt=attempt
            )
            handle = self._start_execution(name, value)
            self._outstanding = (handle,)
            cancellation_waiter = asyncio.create_task(
                workflow.wait_condition(lambda: self._cancellation is not None)
            )
            done, _ = await workflow.wait(
                (handle, cancellation_waiter), return_when="FIRST_COMPLETED"
            )
            if cancellation_waiter in done and handle not in done:
                handle.cancel()
                await self._ignore_cancellation(handle)
                self._outstanding = ()
                return False, False
            cancellation_waiter.cancel()
            await self._ignore_cancellation(cancellation_waiter)
            usable, retryable, non_retryable = await self._activity_result(handle)
            self._outstanding = ()
            if self._cancellation is not None or usable:
                return usable, False
            if not retryable or attempt == MAX_EXECUTION_ATTEMPTS:
                return False, non_retryable
            await self._retry_pause(run_id, resume_state, attempt)
            if self._cancellation is not None:
                return False, False
        return False, False

    async def _retry_pause(
        self, run_id: str, resume_state: WorkflowState, attempt: int
    ) -> None:
        await self._project(run_id, WorkflowState.RETRYING)
        if self._cancellation is not None:
            return
        await workflow.sleep(RETRY_BACKOFF_SECONDS[attempt - 1])
        if self._cancellation is not None:
            return
        await self._project(run_id, resume_state)

    async def _activity_result(self, handle: Any) -> tuple[bool, bool, bool]:
        try:
            result = await handle
            usable = isinstance(result, dict) and result.get("status") == "usable"
            return usable, False, not usable
        except ActivityError as error:
            application = self._application_error(error)
            if application is None:
                return False, True, False
            return False, not application.non_retryable, application.non_retryable
        except Exception:
            return False, self._cancellation is None, False

    async def _after_root(
        self,
        run_id: str,
        plan: FrozenWorkflowPlan,
        usable: bool,
        rejected: bool,
        successful: tuple[str, ...],
        failed: tuple[str, ...],
    ) -> StoreHealthReviewResult | None:
        canceled = await self._canceled_if_requested(run_id, successful, failed)
        if canceled is not None:
            return canceled
        if usable:
            return None
        if plan.partial_completion_allowed:
            return await self._finish(
                run_id,
                WorkflowState.PARTIALLY_COMPLETED,
                "PARTIAL_ACTIVITY_FAILURE",
                successful,
                failed,
            )
        outcome = "ACTIVITY_REJECTED" if rejected else "RETRY_EXHAUSTED"
        return await self._finish(
            run_id, WorkflowState.FAILED, outcome, successful, failed
        )

    async def _await_approval(self, run_id: str) -> StoreHealthReviewResult | None:
        requirement = self._approval_requirement
        assert requirement is not None
        await self._project(run_id, WorkflowState.AWAITING_HUMAN_APPROVAL)
        expires_at = datetime.fromisoformat(requirement.expires_at.replace("Z", "+00:00"))
        timeout = max(0.0, (expires_at - workflow.now()).total_seconds())
        try:
            await workflow.wait_condition(
                lambda: self._approval is not None or self._cancellation is not None,
                timeout=timeout,
            )
        except TimeoutError:
            return await self._finish(
                run_id, WorkflowState.FAILED, "APPROVAL_EXPIRED", (), ()
            )
        if self._cancellation is not None:
            return await self._canceled(run_id, (), ())
        assert self._approval is not None
        if self._approval.decision is ApprovalDecision.REJECTED:
            return await self._finish(
                run_id, WorkflowState.FAILED, "APPROVAL_REJECTED", (), ()
            )
        return None

    async def _project(
        self, run_id: str, state: WorkflowState, outcome_code: str | None = None
    ) -> None:
        self._sequence += 1
        await self._control_activity(
            "project_state",
            StateProjectionInput(run_id, self._sequence, state, outcome_code),
        )

    async def _control_activity(
        self, name: str, value: object, result_type: type | None = None
    ) -> Any:
        return await workflow.execute_activity(
            name,
            value,
            start_to_close_timeout=self._start_to_close,
            schedule_to_close_timeout=self._schedule_to_close,
            retry_policy=CONTROL_RETRY_POLICY,
            result_type=result_type,
        )

    async def _descriptor_control_activity(
        self, name: str, value: object, result_type: type | None = None
    ) -> Any | None:
        handle = workflow.start_activity(
            name,
            value,
            start_to_close_timeout=self._start_to_close,
            schedule_to_close_timeout=self._schedule_to_close,
            heartbeat_timeout=timedelta(seconds=5),
            retry_policy=CONTROL_RETRY_POLICY,
            cancellation_type=ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
            result_type=result_type,
        )
        self._outstanding = (handle,)
        cancellation_waiter = asyncio.create_task(
            workflow.wait_condition(lambda: self._cancellation is not None)
        )
        done, _ = await workflow.wait(
            (handle, cancellation_waiter), return_when="FIRST_COMPLETED"
        )
        if cancellation_waiter in done:
            if handle not in done:
                handle.cancel()
            await self._ignore_cancellation(handle)
            self._outstanding = ()
            return None
        cancellation_waiter.cancel()
        await self._ignore_cancellation(cancellation_waiter)
        self._outstanding = ()
        return await handle

    async def _load_plan(self, run_id: str) -> FrozenWorkflowPlan | None:
        handle = workflow.start_activity(
            "load_frozen_plan",
            run_id,
            start_to_close_timeout=self._start_to_close,
            schedule_to_close_timeout=self._schedule_to_close,
            heartbeat_timeout=timedelta(seconds=5),
            retry_policy=CONTROL_RETRY_POLICY,
            cancellation_type=ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
            result_type=FrozenWorkflowPlan,
        )
        self._outstanding = (handle,)
        cancellation_waiter = asyncio.create_task(
            workflow.wait_condition(lambda: self._cancellation is not None)
        )
        done, _ = await workflow.wait(
            (handle, cancellation_waiter), return_when="FIRST_COMPLETED"
        )
        if cancellation_waiter in done:
            if handle not in done:
                handle.cancel()
            await self._ignore_cancellation(handle)
            self._outstanding = ()
            return None
        cancellation_waiter.cancel()
        await self._ignore_cancellation(cancellation_waiter)
        self._outstanding = ()
        return await handle

    def _start_execution(self, name: str, value: ActivityExecutionInput) -> Any:
        return workflow.start_activity(
            name,
            value,
            start_to_close_timeout=self._start_to_close,
            schedule_to_close_timeout=self._schedule_to_close,
            heartbeat_timeout=timedelta(seconds=5),
            retry_policy=SINGLE_ATTEMPT_POLICY,
            cancellation_type=ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
        )

    async def _finish(
        self,
        run_id: str,
        state: WorkflowState,
        outcome_code: str,
        successful: tuple[str, ...],
        failed: tuple[str, ...],
    ) -> StoreHealthReviewResult:
        self._terminal = True
        await self._project(run_id, state, outcome_code)
        return StoreHealthReviewResult(state, outcome_code, successful, failed)

    async def _canceled_if_requested(
        self, run_id: str, successful: tuple[str, ...], failed: tuple[str, ...]
    ) -> StoreHealthReviewResult | None:
        if self._cancellation is None:
            return None
        return await self._canceled(run_id, successful, failed)

    async def _canceled(
        self, run_id: str, successful: tuple[str, ...], failed: tuple[str, ...]
    ) -> StoreHealthReviewResult:
        return await self._finish(
            run_id, WorkflowState.CANCELED, "CANCELED_BY_STAFF", successful, failed
        )

    async def _drain_canceled(self, *groups: dict[Any, str]) -> None:
        for group in groups:
            for handle in tuple(group):
                handle.cancel()
            for handle in tuple(group):
                await self._ignore_cancellation(handle)
            group.clear()
        self._outstanding = ()

    @staticmethod
    async def _ignore_cancellation(handle: Any) -> None:
        try:
            await handle
        except BaseException:
            pass

    def _install_approval_requirement(
        self, requirement: ApprovalRequirement | None
    ) -> None:
        self._approval_requirement = requirement
        if requirement is not None:
            for signal in self._pending_approvals:
                self._accept_approval(signal)
                if self._approval is not None:
                    break
        self._pending_approvals = ()

    def _accept_approval(self, value: ApprovalSignal) -> None:
        requirement = self._approval_requirement
        if requirement is None or self._approval is not None:
            return
        if (
            value.approval_id == requirement.id
            and value.payload_digest == requirement.payload_digest
            and value.application_decision_version
            == requirement.application_decision_version
        ):
            self._approval = value

    def _record_receipt(self, idempotency_key: str) -> bool:
        if (
            idempotency_key in self._handled_receipts
            or len(self._handled_receipts) >= MAX_SIGNAL_RECEIPTS
        ):
            return False
        self._handled_receipts = (*self._handled_receipts, idempotency_key)
        return True

    @staticmethod
    def _application_error(error: ActivityError) -> ApplicationError | None:
        cause: BaseException | None = error.cause
        while cause is not None:
            if isinstance(cause, ApplicationError):
                return cause
            cause = cause.__cause__
        return None

    @staticmethod
    def _valid_plan(
        plan: FrozenWorkflowPlan, value: StoreHealthReviewInput, run_id: str
    ) -> bool:
        node_ids = {node.id for node in plan.subtasks}
        identity_matches = (
            plan.task_id == value.task_id
            and plan.workflow_run_id == run_id
            and plan.workflow_version == value.workflow_version
            and plan.plan_revision == value.plan_revision
            and len(node_ids) == len(plan.subtasks)
            and all(
                edge.source in node_ids and edge.target in node_ids
                for edge in plan.dependencies
            )
        )
        if not identity_matches:
            return False
        remaining = set(node_ids)
        resolved: set[str] = set()
        while remaining:
            ready = {
                node
                for node in remaining
                if all(
                    edge.source in resolved
                    for edge in plan.dependencies
                    if edge.target == node
                )
            }
            if not ready:
                return False
            resolved.update(ready)
            remaining.difference_update(ready)
        return True

    @staticmethod
    def _run_id() -> str:
        workflow_id = workflow.info().workflow_id
        prefix = "store-health-v1:"
        return workflow_id[len(prefix):] if workflow_id.startswith(prefix) else workflow_id

    @staticmethod
    def _uuid(value: str) -> bool:
        try:
            UUID(value)
            return True
        except ValueError:
            return False
