// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository, StaffIntakeBinding } from "../../repositories/interfaces/agentic.repository";
import { canonicalDigest } from "../../../domain/entities/orchestration-execution-descriptor";
import type { WorkflowSignalReceipt } from "../../../domain/entities/workflow-run";
import { AgenticConsoleServiceImpl } from "./agentic-console.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = {
  run: (work) => work(session),
  runReadOnly: (work) => work(session),
};
const operator: StaffPrincipal = {
  subject: "operator-a", displayName: "Operator A", roles: ["agentic_operator"],
};
const governance: StaffPrincipal = {
  subject: "governance-a", displayName: "Governance A", roles: ["agentic_governance_admin"],
};
const auditor: StaffPrincipal = {
  subject: "auditor-a", displayName: "Auditor A", roles: ["agentic_auditor"],
};

describe("AgenticConsoleServiceImpl", () => {
  it("creates one AI CEO bootstrap task and exactly replays it", async () => {
    const { service, repository } = harness();
    const input = {
      mode: "store_health_review" as const,
      goal: "Review Store Health",
      instructions: "Use approved aggregate evidence only.",
      reviewWindow: { start: "2026-08-18", end: "2026-08-25" },
      idempotencyKey: "console:task:1",
    };

    const created = await service.createTaskIntake(input, operator);
    const replayed = await service.createTaskIntake(input, operator);

    expect(created).toMatchObject({
      disposition: "created",
      detail: {
        subtasks: [{ agentKind: "ai_ceo", title: "Coordinate Store Health Review" }],
        dependencies: [],
      },
    });
    expect(replayed).toEqual({ disposition: "replayed", detail: created.detail });
    expect(repository.createTask).toHaveBeenCalledOnce();
    expect(repository.replaceTaskGraph).toHaveBeenCalledOnce();
    expect(repository.appendProvenance).toHaveBeenCalledOnce();
    expect(repository.appendAudit).toHaveBeenCalledOnce();
    expect(repository.appendProvenance).toHaveBeenCalledWith(session, expect.objectContaining({
      sourceType: "staff_task_intake",
      sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it("rejects changed task intake for the same actor-bound key", async () => {
    const { service } = harness();
    const input = {
      mode: "advanced" as const,
      goal: "Review operations",
      instructions: "Use governed evidence.",
      idempotencyKey: "console:task:changed",
    };
    await service.createTaskIntake(input, operator);
    await expect(service.createTaskIntake({ ...input, goal: "Changed goal" }, operator))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("binds Advanced intake to the live execution profile", async () => {
    const { service } = harness();

    const created = await service.createTaskIntake({
      mode: "advanced",
      goal: "Review cross-department operational risks",
      instructions: "Use governed evidence and return an executive report.",
      idempotencyKey: "console:task:advanced-live",
    }, operator);

    expect(created.detail.task).toMatchObject({ executionProfile: "advanced_live" });
  });

  it.each([
    ["operator", operator, { kind: "owner", actorId: "operator-a" }],
    ["approver", { subject: "approver-a", displayName: "Approver", roles: ["agentic_approver"] } as StaffPrincipal, { kind: "approval", actorId: "approver-a" }],
    ["governance", { subject: "governance-a", displayName: "Governance", roles: ["agentic_governance_admin"] } as StaffPrincipal, { kind: "oversight" }],
    ["administrator", { subject: "admin-a", displayName: "Admin", roles: ["administrator"] } as StaffPrincipal, { kind: "all" }],
  ])("applies the %s task scope before repository access", async (_name, principal, scope) => {
    const { service, repository } = harness();
    await service.listTasks({ page: 1, pageSize: 25, state: "ready" }, principal);
    expect(repository.listConsoleTasks).toHaveBeenCalledWith(session, expect.objectContaining({ scope, state: "ready" }));
  });

  it("returns no task data to auditors without querying task projections", async () => {
    const { service, repository } = harness();
    const auditor: StaffPrincipal = {
      subject: "auditor-a", displayName: "Auditor", roles: ["agentic_auditor"],
    };
    await expect(service.listTasks({ page: 1, pageSize: 25 }, auditor))
      .resolves.toEqual({ items: [], totalItems: 0, refreshedAt: "2026-08-25T00:00:00.000Z" });
    await expect(service.getOverview(auditor)).resolves.toMatchObject({
      counts: { running: 0, waiting: 0, failed: 0, completed: 0, canceled: 0 },
      pendingApprovals: 0,
      settledCostMicros: 0,
    });
    expect(repository.listConsoleTasks).not.toHaveBeenCalled();
    expect(repository.getConsoleTaskOverview).not.toHaveBeenCalled();
  });

  it("projects file governance from the active revision and approved execution catalog", async () => {
    const { service, repository } = harness();

    await expect(service.getFileGovernancePreview(governance)).resolves.toEqual({
      coordinator: "ai_ceo",
      eligibleDepartments: ["catalog", "inventory", "order", "finance", "crm", "support"],
      allowedTools: ["catalog.product_completeness"],
      dataClasses: ["internal"],
      riskSignals: [],
      dependencyStatus: "planned_after_task_start",
      configurationRevisionId: "00000000-0000-4000-8000-000000000099",
      configurationVersion: 3,
    });
    expect(repository.getRevisionChildren).toHaveBeenCalledWith(
      session,
      "00000000-0000-4000-8000-000000000099",
    );
  });

  it("projects task operations without private execution payloads", async () => {
    const { service } = harness();
    const created = await service.createTaskIntake({
      mode: "advanced", goal: "Review operations", instructions: "private prompt",
      idempotencyKey: "console:operations:1",
    }, operator);
    const taskId = created.detail.task.id;

    const operations = await (service as any).getTaskOperations(taskId, operator);

    expect(operations).toMatchObject({
      task: { id: taskId, goal: "Review operations", state: "partially_completed", version: 1 },
      workflow: { state: "partially_completed", stage: "partially_completed", version: 4 },
      branches: [{ owner: "catalog", state: "completed", dependencies: [], toolNames: ["catalog.product_completeness"], dataClasses: ["internal"] }],
      costs: { reservedMicros: 200, settledMicros: 125 },
      report: { completionState: "partial", summary: "One branch unavailable", unavailableBranches: [{ subtaskId: expect.any(String), reasonCode: "RETRY_EXHAUSTED" }] },
    });
    expect(operations.timeline.map(({ occurredAt, id }: any) => [occurredAt, id]))
      .toEqual([...operations.timeline].sort((left: any, right: any) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)).map(({ occurredAt, id }: any) => [occurredAt, id]));
    expect(JSON.stringify(operations)).not.toContain("private prompt");
    expect(JSON.stringify(operations)).not.toContain("objectKey");
  });

  it("enforces task scope before loading operations and withholds an unbound report", async () => {
    const { service, repository } = harness();
    const created = await service.createTaskIntake({ mode: "advanced", goal: "Scoped", instructions: "private", idempotencyKey: "console:operations:scope" }, operator);
    const other = { ...operator, subject: "operator-b" };
    await expect(service.getTaskOperations(created.detail.task.id, other)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    expect(repository.getConsoleTaskOperations).not.toHaveBeenCalled();

    const record = await repository.getConsoleTaskOperations(session, created.detail.task.id);
    vi.mocked(repository.getConsoleTaskOperations).mockResolvedValueOnce({
      ...record!, report: { ...record!.report!, payloadDigest: "0".repeat(64) },
    });
    await expect(service.getTaskOperations(created.detail.task.id, operator))
      .resolves.not.toHaveProperty("report");
  });

  it("projects purpose-specific approval evidence without fabricating signal payloads", async () => {
    const { service, repository } = harness();
    const approval = (await repository.getConsoleTaskOperations(session, "missing"))?.approvals[0] ?? {
      id: "00000000-0000-4000-8000-000000000093", state: "pending" as const,
      requesterId: "system:workflow", approverScope: "workflow_execution" as const,
      action: "agentic.workflow.complete", resourceType: "workflow_run",
      resourceId: "00000000-0000-4000-8000-000000000092", parametersDigest: "a".repeat(64),
      taskId: "00000000-0000-4000-8000-000000000001", policyVersion: 1, workflowVersion: 1,
      configurationRevisionId: "00000000-0000-4000-8000-000000000099",
      expiresAt: "2026-08-26T00:00:00.000Z", version: 1, createdAt: "2026-08-25T00:00:00.000Z",
    };

    await expect((service as any).getApprovalDetail(approval, operator)).resolves.toMatchObject({
      approval: { id: approval.id, approverScope: "workflow_execution" },
      payloadDigest: "a".repeat(64),
      risk: { level: "high", basis: expect.stringContaining("workflow") },
      expectedEffect: expect.stringContaining("workflow"),
    });
    vi.mocked(repository.findWorkflowSignalReceiptForApproval).mockResolvedValueOnce(undefined);
    await expect((service as any).getApprovalDetail(approval, operator)).resolves.not.toHaveProperty("payloadDigest");
  });

  it("projects seven read-only Digital Employees and evidence-backed governance detail", async () => {
    const { service } = harness();

    await expect(service.listEmployees(auditor)).resolves.toHaveLength(7);
    const employee = await service.getEmployee("inventory", auditor);

    expect(employee).toMatchObject({
      kind: "inventory",
      department: "Inventory",
      governance: { active: true, revoked: false, configurationVersion: 3 },
      models: { primary: "openai/inventory-primary", fallbacks: ["openai/inventory-fallback"] },
      tools: [{ name: "inventory.stock_health", version: 1, dataScope: "inventory:health:read" }],
      budgets: { taskCostMicros: 10_000, dailyCostMicros: 100_000, monthlyCostMicros: 1_000_000 },
      executionHealth: { state: "available", basis: "recent_runs", freshness: "2026-08-25T00:00:00.000Z" },
      recentRuns: [{ taskId: expect.any(String), state: "completed", settledCostMicros: 125 }],
    });
    expect(JSON.stringify(employee)).not.toMatch(/secret|credential|clientSecret|prompt/i);
  });

  it.each([
    ["governance", governance, ["configuration_revision", "approval_request", "agent", "tool_grant", "model"]],
    ["auditor", auditor, ["configuration_revision", "approval_request", "agent", "tool_grant", "model", "agentic_task", "tool"]],
    ["administrator", { subject: "admin-a", displayName: "Admin", roles: ["administrator"] } as StaffPrincipal, undefined],
  ])("applies %s audit scope and pagination before repository access", async (_name, principal, resourceTypes) => {
    const { service, repository } = harness();
    await expect(service.listAudit({ page: 2, pageSize: 25, actorId: "actor-a", outcome: "denied" }, principal)).resolves.toMatchObject({ totalItems: 1, refreshedAt: "2026-08-25T00:00:00.000Z" });
    expect(repository.listConsoleAudit).toHaveBeenCalledWith(session, { page: 2, pageSize: 25, actorId: "actor-a", outcome: "denied", ...(resourceTypes === undefined ? {} : { resourceTypes }) });
  });

  it.each([operator, { subject: "approver-a", displayName: "Approver", roles: ["agentic_approver"] } as StaffPrincipal])("returns no audit data to unauthorized workforce readers", async (principal) => {
    const { service, repository } = harness();
    await expect(service.listAudit({ page: 1, pageSize: 25 }, principal)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.listConsoleAudit).not.toHaveBeenCalled();
  });
});

function harness() {
  const tasks = new Map<string, any>();
  const graphs = new Map<string, any>();
  const bindings = new Map<string, StaffIntakeBinding>();
  const provenanceId = "00000000-0000-4000-8000-000000000090";
  const branchId = "00000000-0000-4000-8000-000000000091";
  const reportPayload = {
    schemaVersion: 1 as const, completionState: "partial" as const, summary: "One branch unavailable",
    conclusions: [{ code: "CATALOG_REVIEWED", statement: "Catalog evidence was reviewed", provenanceIds: [provenanceId] }],
    risks: [], recommendedActions: [], conflicts: [], acceptedResultReferences: [],
    unavailableBranches: [{ subtaskId: branchId, reasonCode: "RETRY_EXHAUSTED" }],
  };
  const reportDigest = canonicalDigest(reportPayload);
  const repository = {
    bindStaffIntake: vi.fn(async (_session: DatabaseSession, binding: StaffIntakeBinding) => {
      const key = `${binding.kind}:${binding.actorId}:${binding.idempotencyKey}`;
      const existing = bindings.get(key);
      if (existing === undefined) { bindings.set(key, binding); return "created" as const; }
      return existing.requestDigest === binding.requestDigest && existing.resourceId === binding.resourceId
        ? "duplicate" as const : "conflict" as const;
    }),
    findStaffIntakeBinding: vi.fn(async (_session: DatabaseSession, kind: string, actorId: string, key: string) => bindings.get(`${kind}:${actorId}:${key}`)),
    createTask: vi.fn(async (_session: DatabaseSession, task: any) => { tasks.set(task.id, task); }),
    findTaskById: vi.fn(async (_session: DatabaseSession, taskId: string) => tasks.get(taskId)),
    replaceTaskGraph: vi.fn(async (_session: DatabaseSession, taskId: string, _owner: string, subtasks: any[], dependencies: any[]) => { graphs.set(taskId, { subtasks, dependencies }); return true; }),
    listTaskGraph: vi.fn(async (_session: DatabaseSession, taskId: string) => graphs.get(taskId)),
    appendProvenance: vi.fn(async () => undefined),
    appendAudit: vi.fn(async () => undefined),
    listConsoleTasks: vi.fn(async () => ({ items: [], totalItems: 0 })),
    getConsoleTaskOverview: vi.fn(async () => ({ counts: { running: 0, waiting: 0, failed: 0, completed: 0, canceled: 0 }, pendingApprovals: 0, settledCostMicros: 0 })),
    findActiveRevision: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000099", state: "active" as const,
      createdBy: "governance-b", payloadDigest: "a".repeat(64), version: 3,
      createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
    })),
    getRevisionChildren: vi.fn(async () => ({
      policies: [], modelConfigurations: [], budgetLimits: [],
      toolGrants: [{
        id: "grant-1", revisionId: "00000000-0000-4000-8000-000000000099",
        agentKind: "catalog" as const, toolName: "catalog.product_completeness",
        toolVersion: 1, purpose: "Review product completeness", dataScope: "aggregate",
        maxInvocations: 1,
      }],
    })),
    hasConsoleTaskAccess: vi.fn(async (_session: DatabaseSession, taskId: string, scope: { kind: string; actorId?: string }) => {
      const task = tasks.get(taskId);
      return task !== undefined && (scope.kind !== "owner" || scope.actorId === task.createdBy);
    }),
    getConsoleTaskOperations: vi.fn(async (_session: DatabaseSession, taskId: string) => {
      const task = tasks.get(taskId);
      if (task === undefined) return undefined;
      return {
        task,
        workflow: { id: "00000000-0000-4000-8000-000000000092", taskId, workflowName: "StoreHealthReviewWorkflowV1" as const, workflowVersion: 1 as const, planRevision: 1, temporalWorkflowId: `store-health-${taskId}`, state: "partially_completed" as const, projectionSequence: 4, outcomeCode: "PARTIAL_ACTIVITY_FAILURE" as const, version: 4, createdAt: "2026-08-25T00:00:01.000Z", updatedAt: "2026-08-25T00:00:04.000Z", completedAt: "2026-08-25T00:00:04.000Z" },
        timeline: [
          { id: "z", kind: "workflow", state: "partially_completed", occurredAt: "2026-08-25T00:00:04.000Z", reasonCode: "PARTIAL_ACTIVITY_FAILURE" },
          { id: "a", kind: "quality_review", state: "completed", occurredAt: "2026-08-25T00:00:03.000Z", branchId },
        ],
        branches: [{ id: branchId, owner: "catalog", state: "completed", dependencies: [], toolNames: ["catalog.product_completeness"], dataClasses: ["internal"] }],
        reservedMicros: 200, settledMicros: 125,
        approvals: [{ id: "00000000-0000-4000-8000-000000000093", state: "approved" as const, requesterId: "operator-a", approverScope: "workflow_execution" as const, action: "execute", resourceType: "agentic_workflow", resourceId: taskId, parametersDigest: "a".repeat(64), taskId, policyVersion: 1, configurationRevisionId: "00000000-0000-4000-8000-000000000099", expiresAt: "2026-08-26T00:00:00.000Z", decidedBy: "approver-a", decisionReason: "Approved", decidedAt: "2026-08-25T00:00:02.000Z", version: 2, createdAt: "2026-08-25T00:00:01.000Z" }],
        provenance: [{ id: provenanceId, taskId, sourceType: "staff_task_intake", sourceId: "operator-a", sourceDigest: "b".repeat(64), classification: "internal", recordedBy: "operator-a", recordedAt: "2026-08-25T00:00:00.000Z" }],
        report: { reportDigest, payloadDigest: reportDigest, completionState: "partial" as const, payload: reportPayload },
      };
    }),
    findWorkflowSignalReceiptForApproval: vi.fn(async (): Promise<WorkflowSignalReceipt | undefined> => ({
      id: "00000000-0000-4000-8000-000000000094", workflowRunId: "00000000-0000-4000-8000-000000000092",
      signalKind: "approval" as const, idempotencyKey: "approval-signal-1",
      approvalId: "00000000-0000-4000-8000-000000000093", payloadDigest: "a".repeat(64),
      decision: "approved" as const, applicationDecisionVersion: 2, deliveryState: "pending" as const,
      createdAt: "2026-08-25T00:00:02.000Z",
    })),
    listProvenance: vi.fn(async () => [{ id: provenanceId, taskId: "00000000-0000-4000-8000-000000000001", sourceType: "staff_task_intake", sourceId: "operator-a", sourceDigest: "b".repeat(64), classification: "internal", recordedBy: "operator-a", recordedAt: "2026-08-25T00:00:00.000Z" }]),
    listAgents: vi.fn(async () => ["ai_ceo", "catalog", "crm", "finance", "inventory", "order", "support"].map((kind) => ({ kind, active: true, version: 1, createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }))),
    getConsoleEmployee: vi.fn(async (_session: DatabaseSession, kind: string) => ({
      agent: { kind, active: true, version: 1, createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
      configuration: { id: "00000000-0000-4000-8000-000000000099", version: 3, updatedAt: "2026-08-25T00:00:00.000Z" },
      model: { primaryModel: `openai/${kind}-primary`, fallbackModels: [`openai/${kind}-fallback`] },
      tools: kind === "inventory" ? [{ toolName: "inventory.stock_health", toolVersion: 1, dataScope: "inventory:health:read" }] : [],
      budget: { taskCostMicros: 10_000, dailyCostMicros: 100_000, monthlyCostMicros: 1_000_000 },
      revoked: false,
      recentRuns: [{ taskId: "00000000-0000-4000-8000-000000000001", state: "completed", settledCostMicros: 125, completedAt: "2026-08-25T00:00:00.000Z" }],
    })),
    listConsoleAudit: vi.fn(async () => ({ items: [{ id: "00000000-0000-4000-8000-000000000095", actorId: "actor-a", actorType: "staff" as const, action: "configuration.activate", resourceType: "configuration_revision", resourceId: "00000000-0000-4000-8000-000000000099", outcome: "denied" as const, correlationId: "corr-1", parametersDigest: "a".repeat(64), occurredAt: "2026-08-25T00:00:00.000Z" }], totalItems: 1 })),
  };
  let id = 0;
  return {
    service: new AgenticConsoleServiceImpl(
      repository as unknown as AgenticRepository,
      transactions,
      () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
      () => "2026-08-25T00:00:00.000Z",
    ),
    repository,
  };
}
