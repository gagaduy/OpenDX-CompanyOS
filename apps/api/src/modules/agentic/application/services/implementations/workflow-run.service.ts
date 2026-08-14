// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { WorkflowGateway } from "../../workflows/interfaces/workflow-gateway";
import type { ApprovalRequest } from "../../../domain/entities/approval-request";
import type { AgentTask } from "../../../domain/entities/agent-task";
import {
  isTerminalWorkflowState,
  type ActivityInvocation,
  type WorkflowRun,
  type WorkflowSignalReceipt,
} from "../../../domain/entities/workflow-run";
import { assertAcyclicDependencies } from "../../../domain/services/agent-governance-rules";
import { transitionWorkflowRun } from "../../../domain/services/workflow-run-rules";
import { AgenticApplicationError } from "../agentic-application.error";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import type {
  ActivityReservation,
  CancelWorkflowInput,
  CompleteActivityInput,
  FailActivityInput,
  FrozenWorkflowPlan,
  ProjectWorkflowStateInput,
  ReserveActivityInput,
  StartWorkflowInput,
  WorkflowRunService,
  WorkflowCommandResult,
} from "../interfaces/workflow-run.service";

type WorkflowRepository = Pick<AgenticRepository,
  | "findTask" | "findTaskById" | "findRevision" | "listTaskGraph"
  | "findActiveRevocation" | "createWorkflowRun" | "findWorkflowRun"
  | "findActiveWorkflowRunForTask" | "attachTemporalRunId" | "projectWorkflowRun"
  | "createApproval" | "findWorkflowApproval" | "createWorkflowSignalReceipt"
  | "updateWorkflowSignalReceipt" | "reserveActivityInvocation"
  | "findActivityInvocation" | "finishActivityInvocation"
  | "appendAudit" | "appendProvenance">;

const workerClientId = "opendx-agentic-worker";
const digestPattern = /^[a-f0-9]{64}$/;
const reasonCodePattern = /^[A-Z][A-Z0-9_]{0,99}$/;

export class WorkflowRunServiceImpl implements WorkflowRunService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly transactions: TransactionRunner,
    private readonly policy: PolicyEvaluator,
    private readonly gateway: WorkflowGateway,
    private readonly generateId: () => string,
    private readonly now: () => string,
    private readonly approvalTtlMs: number,
    private readonly onDispatchError: (error: unknown) => void = () => undefined,
  ) {}

  async start(input: StartWorkflowInput, principal: StaffPrincipal): Promise<WorkflowRun> {
    return (await this.startCommand(input, principal)).run;
  }

  async startCommand(
    input: StartWorkflowInput,
    principal: StaffPrincipal,
  ): Promise<WorkflowCommandResult> {
    requireOperator(principal);
    if (input.workflowVersion !== 1) fail("WORKFLOW_VERSION_UNSUPPORTED", "Workflow version is unsupported");
    const accepted = await this.transactions.run(async (session) => {
      const task = await this.requireTaskForStaff(session, input.taskId, principal);
      if (task.version !== input.expectedVersion) fail("STALE_VERSION", "Task version is stale");
      if (task.state !== "ready" || task.configurationRevisionId === undefined) {
        fail("TASK_STATE_INVALID", "Only ready tasks can start a workflow");
      }
      const revision = await this.repository.findRevision(session, task.configurationRevisionId);
      if (revision === undefined || revision.state !== "active") {
        fail("CONFIGURATION_NOT_ACTIVE", "Pinned configuration is no longer active");
      }
      const graph = await this.repository.listTaskGraph(session, task.id);
      if (graph.subtasks.length === 0 || graph.subtasks.some(({ version }) => version < 1)) {
        fail("INVALID_FROZEN_PLAN", "Frozen task graph is invalid");
      }
      assertAcyclicDependencies(
        graph.subtasks.map(({ id }) => id),
        graph.dependencies,
      );
      for (const agentKind of new Set(graph.subtasks.map(({ agentKind }) => agentKind))) {
        if (await this.repository.findActiveRevocation(session, "agent", agentKind) !== undefined) {
          fail("EXECUTION_REVOKED", "A required Digital Employee is revoked");
        }
      }
      const decision = await this.policy.evaluateInSession(session, {
        revisionId: revision.id,
        policyVersion: revision.version,
        actorType: "staff",
        resource: "agentic.workflow",
        action: "complete",
        purpose: "store_health_review",
        dataClassification: "internal",
      });
      if (decision.effect === "DENY") {
        fail("WORKFLOW_POLICY_DENIED", "Policy denied workflow execution");
      }

      const at = this.now();
      const runId = this.generateId();
      const proposed: WorkflowRun = {
        id: runId,
        taskId: task.id,
        workflowName: "StoreHealthReviewWorkflowV1",
        workflowVersion: 1,
        planRevision: task.version,
        temporalWorkflowId: `store-health-v1:${runId}`,
        state: "received",
        projectionSequence: 0,
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      const created = await this.repository.createWorkflowRun(session, proposed);
      if (created.status === "created") {
        if (decision.effect === "REQUIRE_APPROVAL") {
          await this.repository.createApproval(session, this.workflowApproval(
            created.run,
            revision.id,
            decision.policyVersion,
            at,
          ));
        }
        await this.repository.appendAudit(session, {
          id: this.generateId(),
          actorId: principal.subject,
          actorType: "staff",
          taskId: task.id,
          action: "agentic.workflow.start.accepted",
          resourceType: "workflow_run",
          resourceId: created.run.id,
          outcome: "allowed",
          policyVersion: decision.policyVersion,
          correlationId: created.run.id,
          occurredAt: at,
        });
      }
      return {
        run: created.run,
        disposition: created.status === "created" ? "accepted" as const : "replayed" as const,
      };
    });
    return {
      disposition: accepted.disposition,
      run: await this.dispatchStart(accepted.run),
    };
  }

  async get(runId: string, principal: StaffPrincipal): Promise<WorkflowRun> {
    return this.transactions.runReadOnly(async (session) => {
      const run = await this.requireRun(session, runId);
      await this.requireReadableTaskForStaff(session, run.taskId, principal);
      return run;
    });
  }

  async cancel(input: CancelWorkflowInput, principal: StaffPrincipal): Promise<WorkflowRun> {
    return (await this.cancelCommand(input, principal)).run;
  }

  async cancelCommand(
    input: CancelWorkflowInput,
    principal: StaffPrincipal,
  ): Promise<WorkflowCommandResult> {
    requireOperator(principal);
    if (!reasonCodePattern.test(input.reasonCode)) {
      fail("WORKFLOW_CANCELLATION_INVALID", "Cancellation reason code is invalid");
    }
    const result = await this.transactions.run(async (session) => {
      const run = await this.requireRun(session, input.runId);
      await this.requireTaskForStaff(session, run.taskId, principal);
      if (run.version !== input.expectedVersion) fail("STALE_VERSION", "Workflow version is stale");
      if (isTerminalWorkflowState(run.state)) fail("WORKFLOW_TERMINAL_IMMUTABLE", "Terminal workflow runs are immutable");
      const at = this.now();
      const receiptId = deterministicUuid(
        `cancellation:${run.id}:${input.expectedVersion}`,
      );
      const receipt: WorkflowSignalReceipt = {
        id: receiptId,
        workflowRunId: run.id,
        signalKind: "cancellation",
        idempotencyKey: receiptId,
        payloadDigest: digest({
          workflowRunId: run.id,
          workflowVersion: run.workflowVersion,
          expectedVersion: input.expectedVersion,
          reasonCode: input.reasonCode,
        }),
        reasonCode: input.reasonCode,
        deliveryState: "pending",
        createdAt: at,
      };
      const stored = await this.repository.createWorkflowSignalReceipt(session, receipt);
      if (stored.status === "conflict") fail("WORKFLOW_SIGNAL_CONFLICT", "Cancellation signal conflicts with stored evidence");
      if (stored.status === "created") {
        await this.repository.appendAudit(session, {
          id: this.generateId(), actorId: principal.subject, actorType: "staff",
          taskId: run.taskId, action: "agentic.workflow.cancel.accepted",
          resourceType: "workflow_run", resourceId: run.id, outcome: "allowed",
          correlationId: run.id, occurredAt: at,
        });
      }
      return {
        run,
        receipt: stored.receipt,
        disposition: stored.status === "created" ? "accepted" as const : "replayed" as const,
      };
    });
    await this.dispatchSignal(result.run, result.receipt);
    return { run: result.run, disposition: result.disposition };
  }

  async projectState(
    input: ProjectWorkflowStateInput,
    principal: WorkloadPrincipal,
  ): Promise<WorkflowRun> {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      const current = await this.requireRun(session, input.runId);
      if (input.projectionSequence === current.projectionSequence) {
        if (current.state === input.state && current.outcomeCode === input.outcomeCode) return current;
        fail("WORKFLOW_PROJECTION_CONFLICT", "Projection sequence has conflicting state");
      }
      if (input.projectionSequence !== current.projectionSequence + 1) {
        fail("WORKFLOW_PROJECTION_STALE", "Projection sequence is stale or out of order");
      }
      const next = transitionWorkflowRun(current, {
        state: input.state,
        ...(input.outcomeCode === undefined ? {} : { outcomeCode: input.outcomeCode }),
      }, this.now());
      const status = await this.repository.projectWorkflowRun(
        session, next, current.version, current.projectionSequence,
      );
      if (status === "conflict") fail("WORKFLOW_PROJECTION_CONFLICT", "Projection conflicts with stored state");
      if (status === "stale") fail("WORKFLOW_PROJECTION_STALE", "Projection is stale");
      if (status === "updated") {
        await this.repository.appendAudit(session, {
          id: this.generateId(), actorId: principal.subject, actorType: "system",
          taskId: current.taskId, action: "agentic.workflow.state.projected",
          resourceType: "workflow_run", resourceId: current.id, outcome: "allowed",
          correlationId: current.id, occurredAt: next.updatedAt,
        });
      }
      return status === "duplicate" ? current : next;
    });
  }

  async loadPlan(runId: string, principal: WorkloadPrincipal): Promise<FrozenWorkflowPlan> {
    requireWorker(principal);
    return this.transactions.runReadOnly(async (session) => {
      const run = await this.requireRun(session, runId);
      const task = await this.repository.findTaskById(session, run.taskId);
      if (task === undefined || task.configurationRevisionId === undefined || task.version !== run.planRevision) {
        fail("INVALID_FROZEN_PLAN", "Frozen task plan no longer matches its run");
      }
      const graph = await this.repository.listTaskGraph(session, task.id);
      const approval = await this.repository.findWorkflowApproval(session, run.id);
      return {
        taskId: task.id,
        workflowRunId: run.id,
        workflowVersion: 1,
        planRevision: run.planRevision,
        configurationRevisionId: task.configurationRevisionId,
        subtasks: graph.subtasks.map(({ id, agentKind, version }) => ({ id, agentKind, version })),
        dependencies: graph.dependencies.map(({ from, to }) => ({ from, to })),
        partialCompletionAllowed: true,
        ...(approval === undefined ? {} : { approval: {
          id: approval.id,
          payloadDigest: approval.parametersDigest,
          expiresAt: approval.expiresAt,
          policyVersion: approval.policyVersion,
          applicationDecisionVersion: approval.state === "pending"
            ? approval.version + 1
            : approval.version,
        } }),
      };
    });
  }

  async reserveActivity(
    input: ReserveActivityInput,
    principal: WorkloadPrincipal,
  ): Promise<ActivityReservation> {
    requireWorker(principal);
    if (!digestPattern.test(input.inputDigest)) fail("ACTIVITY_INPUT_INVALID", "Activity input digest is invalid");
    return this.transactions.run(async (session) => {
      const run = await this.requireRun(session, input.runId);
      if (isTerminalWorkflowState(run.state)) fail("WORKFLOW_TERMINAL_IMMUTABLE", "Terminal workflow runs cannot reserve activities");
      const expectedKey = `${run.id}:1:${input.activityKind}:${input.branchId ?? "root"}:${input.inputDigest}`;
      if (input.invocationKey !== expectedKey) fail("ACTIVITY_INPUT_INVALID", "Activity invocation key is invalid");
      if (input.branchId !== undefined) {
        const graph = await this.repository.listTaskGraph(session, run.taskId);
        if (!graph.subtasks.some(({ id }) => id === input.branchId)) {
          fail("ACTIVITY_INPUT_INVALID", "Activity branch is outside the frozen plan");
        }
      }
      const at = this.now();
      const invocation: ActivityInvocation = {
        invocationKey: input.invocationKey,
        workflowRunId: run.id,
        activityKind: input.activityKind,
        ...(input.branchId === undefined ? {} : { branchId: input.branchId }),
        inputDigest: input.inputDigest,
        state: "reserved",
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      const stored = await this.repository.reserveActivityInvocation(session, invocation);
      if (stored.status === "conflict") fail("ACTIVITY_INVOCATION_CONFLICT", "Activity invocation conflicts with stored evidence");
      if (stored.status === "reserved") {
        await this.repository.appendAudit(session, {
          id: this.generateId(), actorId: principal.subject, actorType: "system",
          taskId: run.taskId, action: "agentic.activity.reserved",
          resourceType: "activity_invocation", resourceId: invocation.invocationKey,
          outcome: "allowed", correlationId: run.id, occurredAt: at,
        });
      }
      return { status: stored.status, invocation: stored.invocation };
    });
  }

  async completeActivity(
    input: CompleteActivityInput,
    principal: WorkloadPrincipal,
  ): Promise<ActivityInvocation> {
    return this.finishActivity(input, "completed", principal);
  }

  async failActivity(
    input: FailActivityInput,
    principal: WorkloadPrincipal,
  ): Promise<ActivityInvocation> {
    return this.finishActivity(input, "failed", principal);
  }

  private async finishActivity(
    input: CompleteActivityInput | FailActivityInput,
    state: "completed" | "failed",
    principal: WorkloadPrincipal,
  ): Promise<ActivityInvocation> {
    requireWorker(principal);
    if (!reasonCodePattern.test(input.outcomeCode)) fail("ACTIVITY_OUTCOME_INVALID", "Activity outcome code is invalid");
    const safeResult = "safeResult" in input ? input.safeResult : undefined;
    if (safeResult !== undefined && Buffer.byteLength(JSON.stringify(safeResult), "utf8") > 16_384) {
      fail("ACTIVITY_OUTCOME_INVALID", "Activity safe result is too large");
    }
    return this.transactions.run(async (session) => {
      const current = await this.repository.findActivityInvocation(session, input.invocationKey);
      if (current === undefined) fail("ACTIVITY_NOT_FOUND", "Activity invocation was not found");
      if (current.version !== input.expectedVersion || current.state !== "reserved") {
        if (
          current.version === input.expectedVersion + 1
          && current.state === state
          && current.outcomeCode === input.outcomeCode
          && JSON.stringify(current.safeResult) === JSON.stringify(safeResult)
        ) return current;
        if (current.state === "completed" || current.state === "failed") {
          fail("ACTIVITY_INVOCATION_CONFLICT", "Activity invocation already has a different outcome");
        }
        fail("STALE_VERSION", "Activity invocation version is stale");
      }
      const at = this.now();
      const next: ActivityInvocation = {
        ...current,
        state,
        outcomeCode: input.outcomeCode,
        ...(safeResult === undefined ? {} : { safeResult }),
        version: current.version + 1,
        updatedAt: at,
        completedAt: at,
      };
      if (!await this.repository.finishActivityInvocation(session, next, input.expectedVersion)) {
        fail("STALE_VERSION", "Activity invocation version is stale");
      }
      const run = await this.requireRun(session, current.workflowRunId);
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: principal.subject, actorType: "system",
        taskId: run.taskId, action: `agentic.activity.${state}`,
        resourceType: "activity_invocation", resourceId: current.invocationKey,
        outcome: state === "completed" ? "allowed" : "failed",
        correlationId: run.id, occurredAt: at,
      });
      await this.repository.appendProvenance(session, {
        id: this.generateId(), taskId: run.taskId, sourceType: "workflow_activity",
        sourceId: current.invocationKey,
        sourceDigest: digest({ outcomeCode: input.outcomeCode, safeResult: safeResult ?? null }),
        classification: "internal", recordedBy: principal.subject, recordedAt: at,
      });
      return next;
    });
  }

  private async dispatchStart(run: WorkflowRun): Promise<WorkflowRun> {
    if (run.temporalRunId !== undefined) return run;
    try {
      const result = await this.gateway.start({
        workflowRunId: run.id,
        temporalWorkflowId: run.temporalWorkflowId,
        taskId: run.taskId,
        workflowVersion: 1,
        planRevision: run.planRevision,
      });
      return this.transactions.run(async (session) => {
        const current = await this.requireRun(session, run.id);
        if (current.temporalRunId === undefined) {
          await this.repository.attachTemporalRunId(
            session, current.id, result.temporalRunId, current.version, this.now(),
          );
        }
        return (await this.repository.findWorkflowRun(session, run.id)) ?? current;
      });
    } catch (error) {
      this.onDispatchError(error);
      return run;
    }
  }

  private async dispatchSignal(run: WorkflowRun, receipt: WorkflowSignalReceipt): Promise<void> {
    if (receipt.deliveryState !== "pending") return;
    try {
      if (receipt.signalKind === "cancellation") {
        await this.gateway.signalCancellation({
          temporalWorkflowId: run.temporalWorkflowId,
          idempotencyKey: receipt.idempotencyKey,
          payloadDigest: receipt.payloadDigest,
          reasonCode: receipt.reasonCode!,
        });
      } else {
        await this.gateway.signalApproval({
          temporalWorkflowId: run.temporalWorkflowId,
          idempotencyKey: receipt.idempotencyKey,
          approvalId: receipt.approvalId!,
          payloadDigest: receipt.payloadDigest,
          decision: receipt.decision!,
          applicationDecisionVersion: receipt.applicationDecisionVersion!,
        });
      }
      await this.transactions.run((session) => this.repository.updateWorkflowSignalReceipt(
        session,
        { ...receipt, deliveryState: "delivered", accepted: true, deliveredAt: this.now() },
      ));
    } catch (error) {
      this.onDispatchError(error);
    }
  }

  private workflowApproval(
    run: WorkflowRun,
    revisionId: string,
    policyVersion: number,
    at: string,
  ): ApprovalRequest {
    return {
      id: this.generateId(),
      state: "pending",
      requesterId: "system:workflow",
      approverScope: "workflow_execution",
      action: "agentic.workflow.complete",
      resourceType: "workflow_run",
      resourceId: run.id,
      parametersDigest: digest({
        taskId: run.taskId,
        workflowRunId: run.id,
        workflowVersion: run.workflowVersion,
        planRevision: run.planRevision,
        configurationRevisionId: revisionId,
        policyVersion,
        action: "agentic.workflow.complete",
      }),
      taskId: run.taskId,
      policyVersion,
      workflowVersion: 1,
      configurationRevisionId: revisionId,
      expiresAt: new Date(Date.parse(at) + this.approvalTtlMs).toISOString(),
      version: 1,
      createdAt: at,
    };
  }

  private async requireTaskForStaff(
    session: DatabaseSession,
    taskId: string,
    principal: StaffPrincipal,
  ): Promise<AgentTask> {
    const task = principal.roles.includes("administrator")
      ? await this.repository.findTaskById(session, taskId)
      : principal.roles.includes("agentic_operator")
        ? await this.repository.findTask(session, taskId, principal.subject)
        : undefined;
    if (task === undefined) fail("TASK_NOT_FOUND", "Task was not found");
    return task;
  }

  private async requireReadableTaskForStaff(
    session: DatabaseSession,
    taskId: string,
    principal: StaffPrincipal,
  ): Promise<AgentTask> {
    const hasOversight = principal.roles.some((role) =>
      role === "administrator"
      || role === "agentic_approver"
      || role === "agentic_governance_admin");
    const task = hasOversight
      ? await this.repository.findTaskById(session, taskId)
      : principal.roles.includes("agentic_operator")
        ? await this.repository.findTask(session, taskId, principal.subject)
        : undefined;
    if (task === undefined) fail("TASK_NOT_FOUND", "Task was not found");
    return task;
  }

  private async requireRun(session: DatabaseSession, runId: string): Promise<WorkflowRun> {
    const run = await this.repository.findWorkflowRun(session, runId);
    if (run === undefined) fail("WORKFLOW_RUN_NOT_FOUND", "Workflow run was not found");
    return run;
  }
}

function requireOperator(principal: StaffPrincipal): void {
  if (!principal.roles.includes("administrator") && !principal.roles.includes("agentic_operator")) {
    fail("FORBIDDEN", "Operator role is required");
  }
}

function requireWorker(principal: WorkloadPrincipal): void {
  if (principal.workload !== "agentic_worker" || principal.clientId !== workerClientId) {
    fail("FORBIDDEN", "Agentic worker identity is required");
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deterministicUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function fail(code: string, message: string): never {
  throw new AgenticApplicationError(code, message);
}
