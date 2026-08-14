// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { WorkflowGateway } from "../../workflows/interfaces/workflow-gateway";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import type { WorkflowRun } from "../../../domain/entities/workflow-run";
import type { AgentTask } from "../../../domain/entities/agent-task";
import type { ConfigurationRevision } from "../../../domain/entities/configuration-revision";
import { WorkflowRunServiceImpl } from "./workflow-run.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = {
  run: (work) => work(session),
  runReadOnly: (work) => work(session),
};
const operator = { subject: "operator-a", displayName: "Operator A", roles: ["agentic_operator"] } as const;
const worker: WorkloadPrincipal = {
  subject: "service-account-opendx-agentic-worker",
  clientId: "opendx-agentic-worker",
  workload: "agentic_worker",
};

describe("WorkflowRunServiceImpl", () => {
  it("starts one ready frozen plan and attaches the Temporal run acknowledgement", async () => {
    const { service, repository, gateway } = harness();

    const run = await service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 },
      operator,
    );

    expect(run).toMatchObject({
      taskId: "task-1",
      workflowName: "StoreHealthReviewWorkflowV1",
      workflowVersion: 1,
      planRevision: 2,
      temporalRunId: "temporal-run-1",
      state: "received",
    });
    expect(gateway.start).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      temporalWorkflowId: `store-health-v1:${run.id}`,
      planRevision: 2,
    }));
    expect(repository.audits.map(({ action }) => action))
      .toContain("agentic.workflow.start.accepted");
  });

  it("keeps an accepted start pending when the gateway acknowledgement is lost", async () => {
    const { service, repository } = harness({ startError: new Error("gateway timeout") });

    const run = await service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 },
      operator,
    );

    expect(run.temporalRunId).toBeUndefined();
    expect(repository.runs.get(run.id)).toEqual(run);
  });

  it("converges repeated starts on the stored run identity", async () => {
    const accepted = workflowRun();
    const { service, gateway } = harness({ existingRun: accepted });

    const run = await service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 },
      operator,
    );

    expect(run.id).toBe(accepted.id);
    expect(gateway.start).toHaveBeenCalledWith(expect.objectContaining({
      workflowRunId: accepted.id,
      temporalWorkflowId: accepted.temporalWorkflowId,
    }));
  });

  it("freezes a version-bound approval when policy requires it", async () => {
    const { service, repository } = harness({ policyEffect: "REQUIRE_APPROVAL" });

    const run = await service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 },
      operator,
    );

    expect(repository.approvals).toHaveLength(1);
    expect(repository.approvals[0]).toMatchObject({
      requesterId: "system:workflow",
      approverScope: "workflow_execution",
      action: "agentic.workflow.complete",
      resourceType: "workflow_run",
      resourceId: run.id,
      taskId: "task-1",
      policyVersion: 4,
      workflowVersion: 1,
      configurationRevisionId: "revision-1",
      version: 1,
    });
  });

  it.each([
    ["draft", 2, "TASK_STATE_INVALID"],
    ["ready", 1, "STALE_VERSION"],
  ] as const)("rejects task state %s at expected version %s", async (state, expectedVersion, code) => {
    const { service, gateway } = harness({ taskState: state });

    await expect(service.start(
      { taskId: "task-1", expectedVersion, workflowVersion: 1 },
      operator,
    )).rejects.toMatchObject({ code });
    expect(gateway.start).not.toHaveBeenCalled();
  });

  it("rejects denied policy, superseded configuration, and an agent revocation", async () => {
    await expect(harness({ policyEffect: "DENY" }).service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 }, operator,
    )).rejects.toMatchObject({ code: "WORKFLOW_POLICY_DENIED" });
    await expect(harness({ revisionState: "superseded" }).service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 }, operator,
    )).rejects.toMatchObject({ code: "CONFIGURATION_NOT_ACTIVE" });
    await expect(harness({ revoked: true }).service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 }, operator,
    )).rejects.toMatchObject({ code: "EXECUTION_REVOKED" });
  });

  it("rejects unauthorized, unsupported, and empty-plan starts before dispatch", async () => {
    const viewer = {
      subject: "viewer-a",
      displayName: "Viewer A",
      roles: ["agentic_auditor"],
    } as const;
    const unauthorized = harness();
    await expect(unauthorized.service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 },
      viewer,
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(unauthorized.gateway.start).not.toHaveBeenCalled();

    const unsupported = harness();
    await expect(unsupported.service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 2 as 1 },
      operator,
    )).rejects.toMatchObject({ code: "WORKFLOW_VERSION_UNSUPPORTED" });
    expect(unsupported.gateway.start).not.toHaveBeenCalled();

    const empty = harness({ emptyGraph: true });
    await expect(empty.service.start(
      { taskId: "task-1", expectedVersion: 2, workflowVersion: 1 },
      operator,
    )).rejects.toMatchObject({ code: "INVALID_FROZEN_PLAN" });
    expect(empty.gateway.start).not.toHaveBeenCalled();
  });

  it("persists a bounded cancellation receipt before signaling", async () => {
    const active = workflowRun({ temporalRunId: "temporal-run-1", state: "department_analysis", version: 3 });
    const { service, repository, gateway } = harness({ existingRun: active });

    const result = await service.cancel(
      { runId: active.id, expectedVersion: 3, reasonCode: "CANCELED_BY_OPERATOR" },
      operator,
    );

    expect(result).toEqual(active);
    expect(repository.receipts[0]).toMatchObject({
      workflowRunId: active.id,
      signalKind: "cancellation",
      deliveryState: "delivered",
      reasonCode: "CANCELED_BY_OPERATOR",
    });
    expect(repository.receipts[0]?.idempotencyKey).toBe(repository.receipts[0]?.id);
    expect(gateway.signalCancellation).toHaveBeenCalledOnce();
  });

  it("projects monotonic state and treats an equivalent replay as a no-op", async () => {
    const active = workflowRun();
    const { service, repository } = harness({ existingRun: active });

    const planning = await service.projectState({
      runId: active.id,
      projectionSequence: 1,
      state: "planning",
    }, worker);
    const duplicate = await service.projectState({
      runId: active.id,
      projectionSequence: 1,
      state: "planning",
    }, worker);

    expect(planning.state).toBe("planning");
    expect(duplicate).toEqual(planning);
    await expect(service.projectState({
      runId: active.id,
      projectionSequence: 1,
      state: "failed",
      outcomeCode: "INVALID_FROZEN_PLAN",
    }, worker)).rejects.toMatchObject({ code: "WORKFLOW_PROJECTION_CONFLICT" });
    expect(repository.audits.filter(({ action }) => action === "agentic.workflow.state.projected"))
      .toHaveLength(1);
  });

  it("reserves and completes one stable activity outcome", async () => {
    const active = workflowRun({ state: "department_analysis" });
    const { service } = harness({ existingRun: active });
    const input = {
      invocationKey: `${active.id}:1:execute_fake_analysis:subtask-1:${"d".repeat(64)}`,
      runId: active.id,
      activityKind: "execute_fake_analysis",
      branchId: "subtask-1",
      inputDigest: "d".repeat(64),
    } as const;

    const reserved = await service.reserveActivity(input, worker);
    const duplicate = await service.reserveActivity(input, worker);
    const completed = await service.completeActivity({
      invocationKey: input.invocationKey,
      expectedVersion: 1,
      outcomeCode: "FAKE_ANALYSIS_COMPLETED",
      safeResult: { status: "usable" },
    }, worker);

    expect(reserved.status).toBe("reserved");
    expect(duplicate.status).toBe("duplicate");
    expect(completed).toMatchObject({ state: "completed", version: 2 });
  });
});

interface HarnessOptions {
  readonly taskState?: "draft" | "ready";
  readonly revisionState?: "active" | "superseded";
  readonly policyEffect?: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  readonly revoked?: boolean;
  readonly startError?: Error;
  readonly existingRun?: WorkflowRun;
  readonly emptyGraph?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const repository = new WorkflowRepositoryFake(options.existingRun, options.emptyGraph ?? false);
  repository.task = { ...repository.task, state: options.taskState ?? "ready" };
  repository.revision = { ...repository.revision, state: options.revisionState ?? "active" };
  repository.revoked = options.revoked ?? false;
  const policy = {
    evaluate: vi.fn(),
    evaluateInSession: vi.fn(async () => ({
      effect: options.policyEffect ?? "ALLOW",
      policyVersion: 4,
      reasonCode: "workflow-rule",
      matchedRuleIds: ["policy-1"],
      evaluatedAt: "2026-08-14T12:00:00.000Z",
    })),
  } as PolicyEvaluator;
  const gateway: WorkflowGateway = {
    start: vi.fn(async () => {
      if (options.startError !== undefined) throw options.startError;
      return { temporalRunId: "temporal-run-1", duplicate: false };
    }),
    signalApproval: vi.fn(async () => undefined),
    signalCancellation: vi.fn(async () => {
      expect(repository.receipts[0]?.deliveryState).toBe("pending");
    }),
    describe: vi.fn(async () => ({ status: "running" as const })),
  };
  let id = 0;
  const service = new WorkflowRunServiceImpl(
    repository as unknown as AgenticRepository,
    transactions,
    policy,
    gateway,
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    () => "2026-08-14T12:00:00.000Z",
    3_600_000,
  );
  return { service, repository, gateway, policy };
}

class WorkflowRepositoryFake {
  task: AgentTask = {
    id: "task-1", state: "ready" as const, createdBy: "operator-a",
    goal: "Review store health", instructions: "Use the fixed plan",
    configurationRevisionId: "revision-1", version: 2,
    createdAt: "2026-08-14T10:00:00.000Z", updatedAt: "2026-08-14T11:00:00.000Z",
  };
  revision: ConfigurationRevision = {
    id: "revision-1", state: "active" as const, createdBy: "governance-a",
    payloadDigest: "c".repeat(64), version: 4,
    createdAt: "2026-08-14T09:00:00.000Z", updatedAt: "2026-08-14T09:30:00.000Z",
  };
  revoked = false;
  readonly runs = new Map<string, WorkflowRun>();
  readonly approvals: Record<string, unknown>[] = [];
  readonly receipts: Record<string, unknown>[] = [];
  readonly audits: { readonly action: string }[] = [];
  readonly provenance: Record<string, unknown>[] = [];
  readonly invocations = new Map<string, Record<string, unknown>>();

  constructor(existingRun?: WorkflowRun, private readonly emptyGraph = false) {
    if (existingRun !== undefined) this.runs.set(existingRun.id, existingRun);
  }

  async findTask() { return this.task; }
  async findTaskById() { return this.task; }
  async findRevision() { return this.revision; }
  async listTaskGraph() {
    return {
      subtasks: this.emptyGraph
        ? []
        : [{ id: "subtask-1", taskId: "task-1", agentKind: "catalog", title: "Catalog", version: 1, createdAt: "" }],
      dependencies: [],
    };
  }
  async findActiveRevocation() { return this.revoked ? { id: "revocation-1" } : undefined; }
  async createWorkflowRun(_session: DatabaseSession, run: WorkflowRun) {
    const existing = [...this.runs.values()].find(({ taskId, planRevision }) =>
      taskId === run.taskId && planRevision === run.planRevision);
    if (existing !== undefined) return { status: "duplicate" as const, run: existing };
    this.runs.set(run.id, run);
    return { status: "created" as const, run };
  }
  async findWorkflowRun(_session: DatabaseSession, id: string) { return this.runs.get(id); }
  async findActiveWorkflowRunForTask(_session: DatabaseSession, taskId: string) {
    return [...this.runs.values()].find((run) => run.taskId === taskId);
  }
  async attachTemporalRunId(_session: DatabaseSession, id: string, temporalRunId: string) {
    const current = this.runs.get(id);
    if (current === undefined || current.temporalRunId !== undefined) return false;
    this.runs.set(id, { ...current, temporalRunId, version: current.version + 1 });
    return true;
  }
  async createApproval(_session: DatabaseSession, approval: Record<string, unknown>) {
    this.approvals.push(approval);
  }
  async appendAudit(_session: DatabaseSession, audit: { readonly action: string }) {
    this.audits.push(audit);
  }
  async appendProvenance(_session: DatabaseSession, record: Record<string, unknown>) {
    this.provenance.push(record);
  }
  async createWorkflowSignalReceipt(_session: DatabaseSession, receipt: Record<string, unknown>) {
    const existing = this.receipts.find(({ idempotencyKey }) => idempotencyKey === receipt.idempotencyKey);
    if (existing !== undefined) return { status: "duplicate", receipt: existing };
    this.receipts.push(receipt);
    return { status: "created", receipt };
  }
  async updateWorkflowSignalReceipt(_session: DatabaseSession, receipt: Record<string, unknown>) {
    const index = this.receipts.findIndex(({ id }) => id === receipt.id);
    if (index < 0) return false;
    this.receipts[index] = receipt;
    return true;
  }
  async projectWorkflowRun(_session: DatabaseSession, next: WorkflowRun) {
    const current = this.runs.get(next.id);
    if (current === undefined) return "stale";
    if (current.projectionSequence === next.projectionSequence) {
      return current.state === next.state && current.outcomeCode === next.outcomeCode
        ? "duplicate"
        : "conflict";
    }
    if (current.projectionSequence + 1 !== next.projectionSequence) return "stale";
    this.runs.set(next.id, next);
    return "updated";
  }
  async reserveActivityInvocation(_session: DatabaseSession, invocation: Record<string, unknown>) {
    const key = String(invocation.invocationKey);
    const current = this.invocations.get(key);
    if (current !== undefined) return { status: "duplicate", invocation: current };
    this.invocations.set(key, invocation);
    return { status: "reserved", invocation };
  }
  async findActivityInvocation(_session: DatabaseSession, key: string) {
    return this.invocations.get(key);
  }
  async finishActivityInvocation(_session: DatabaseSession, invocation: Record<string, unknown>) {
    this.invocations.set(String(invocation.invocationKey), invocation);
    return true;
  }
}

function workflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run-1", taskId: "task-1", workflowName: "StoreHealthReviewWorkflowV1",
    workflowVersion: 1, planRevision: 2,
    temporalWorkflowId: "store-health-v1:run-1", state: "received",
    projectionSequence: 0, version: 1,
    createdAt: "2026-08-14T12:00:00.000Z", updatedAt: "2026-08-14T12:00:00.000Z",
    ...overrides,
  };
}
