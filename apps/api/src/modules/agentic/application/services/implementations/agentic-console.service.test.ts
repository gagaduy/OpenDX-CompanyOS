// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository, StaffIntakeBinding } from "../../repositories/interfaces/agentic.repository";
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
});

function harness() {
  const tasks = new Map<string, any>();
  const graphs = new Map<string, any>();
  const bindings = new Map<string, StaffIntakeBinding>();
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
