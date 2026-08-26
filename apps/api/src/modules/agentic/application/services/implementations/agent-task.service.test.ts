// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { STORE_HEALTH_EXECUTION_CATALOG } from "../../orchestration/store-health-execution-catalog";
import type { AgentTask } from "../../../domain/entities/agent-task";
import { AgentTaskServiceImpl } from "./agent-task.service";

const session = {} as DatabaseSession;
const tx: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const operator = (subject = "operator"): StaffPrincipal => ({ subject, displayName: subject, roles: ["agentic_operator"] });
const input = {
  goal: "Review inventory", instructions: "Use approved evidence only",
  provenance: { sourceType: "staff_intake", sourceId: "operator", sourceDigest: "a".repeat(64), classification: "internal" },
  subtasks: [{ id: "subtask-1", agentKind: "inventory" as const, title: "Inspect stock" }], dependencies: [],
};
const draft: AgentTask = { id: "task-1", state: "draft", createdBy: "operator", goal: input.goal, instructions: input.instructions, version: 1, createdAt: "2026-08-14T12:00:00.000Z", updatedAt: "2026-08-14T12:00:00.000Z" };

describe("AgentTaskServiceImpl", () => {
  it("validates bounded input and creates an owned draft with graph and audit", async () => {
    const { service, repository } = harness();
    await expect(service.create(input, operator())).resolves.toMatchObject({ task: { state: "draft", createdBy: "operator" } });
    expect(repository.replaceTaskGraph).toHaveBeenCalledOnce();
    expect(repository.appendProvenance).toHaveBeenCalledWith(session, expect.objectContaining({
      taskId: "00000000-0000-4000-8000-000000000001",
      sourceType: "staff_intake", sourceId: "operator", recordedBy: "operator",
    }));
    expect(repository.appendAudit).toHaveBeenCalledOnce();
    await expect(service.create({ ...input, goal: "x".repeat(501) }, operator()))
      .rejects.toMatchObject({ code: "TASK_INPUT_INVALID" });
  });

  it("pins the active revision when the owner marks a draft ready", async () => {
    const { service, repository } = harness({ task: draft, activeRevision: { id: "revision-2" } });
    await expect(service.ready({ taskId: "task-1", expectedVersion: 1 }, operator()))
      .resolves.toMatchObject({ task: { state: "ready", configurationRevisionId: "revision-2", version: 2 } });
    expect(repository.updateTask).toHaveBeenCalledOnce();
  });

  it("fails ready without an active revision and denies cross-owner mutation", async () => {
    await expect(harness({ task: draft }).service.ready({ taskId: "task-1", expectedVersion: 1 }, operator()))
      .rejects.toMatchObject({ code: "NO_ACTIVE_CONFIGURATION" });
    await expect(harness({ task: undefined }).service.updateDraft({ ...input, taskId: "task-1", expectedVersion: 1 }, operator("other")))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("rejects Advanced live ready when models and tools exist without live policies", async () => {
    const task = { ...draft, executionProfile: "advanced_live" as const };
    const agentKinds = ["ai_ceo" as const, ...STORE_HEALTH_EXECUTION_CATALOG.map(({ agentKind }) => agentKind)];
    const { service, repository } = harness({
      task,
      activeRevision: { id: "revision-empty" },
      revisionChildren: {
        policies: [],
        toolGrants: STORE_HEALTH_EXECUTION_CATALOG.flatMap((entry) => entry.toolGrants.map((grant) => ({
          id: `${entry.agentKind}-${grant.name}`, revisionId: "revision-empty",
          agentKind: entry.agentKind, toolName: grant.name, toolVersion: grant.version,
          purpose: grant.purpose, dataScope: grant.dataScope, maxInvocations: grant.maximumInvocations,
        }))),
        modelConfigurations: agentKinds.map((agentKind) => ({
          revisionId: "revision-empty", agentKind, primaryModel: "provider/primary",
          fallbackModels: ["provider/fallback"], maxInputTokens: 1_000, maxOutputTokens: 1_000,
          timeoutMs: 30_000, maxRetries: 1,
          inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1,
        })),
        budgetLimits: agentKinds.map((agentKind) => ({
          revisionId: "revision-empty", agentKind, taskCostMicros: 1,
          dailyCostMicros: 10, monthlyCostMicros: 100,
        })),
      },
    });

    await expect(service.ready({ taskId: task.id, expectedVersion: 1 }, operator()))
      .rejects.toMatchObject({ code: "LIVE_CONFIGURATION_INCOMPLETE" });
    expect(repository.updateTask).not.toHaveBeenCalled();
  });

  it("cancels draft or ready tasks with optimistic version and keeps canceled tasks immutable", async () => {
    await expect(harness({ task: draft }).service.cancel({ taskId: "task-1", expectedVersion: 1 }, operator()))
      .resolves.toMatchObject({ task: { state: "canceled", version: 2 } });
    await expect(harness({ task: { ...draft, state: "canceled" } }).service.cancel({ taskId: "task-1", expectedVersion: 1 }, operator()))
      .rejects.toMatchObject({ code: "TASK_STATE_INVALID" });
  });

  it("requires run cancellation after a workflow has started", async () => {
    const activeRun = {
      id: "run-1", taskId: "task-1", workflowName: "StoreHealthReviewWorkflowV1",
      workflowVersion: 1, planRevision: 1, temporalWorkflowId: "store-health-v1:run-1",
      state: "planning", projectionSequence: 1, version: 2,
      createdAt: "", updatedAt: "",
    } as const;
    const { service, repository } = harness({ task: draft, activeRun });

    await expect(service.cancel({ taskId: "task-1", expectedVersion: 1 }, operator()))
      .rejects.toMatchObject({ code: "WORKFLOW_RUN_ACTIVE" });
    expect(repository.updateTask).not.toHaveBeenCalled();
  });

  it("does not expose task bodies to auditors", async () => {
    const auditor: StaffPrincipal = { subject: "auditor", displayName: "Auditor", roles: ["agentic_auditor"] };
    await expect(harness({ task: draft }).service.get("task-1", auditor))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

function harness(options: { readonly task?: AgentTask; readonly activeRevision?: Record<string, unknown>; readonly activeRun?: Record<string, unknown>; readonly revisionChildren?: Record<string, unknown> } = {}) {
  const hasTaskOption = Object.prototype.hasOwnProperty.call(options, "task");
  const repository = {
    createTask: vi.fn(async () => undefined), replaceTaskGraph: vi.fn(async () => true),
    findTask: vi.fn(async () => hasTaskOption ? options.task : draft),
    findTaskById: vi.fn(async () => hasTaskOption ? options.task : draft),
    findTaskForApproval: vi.fn(async () => hasTaskOption ? options.task : draft),
    findActiveRevision: vi.fn(async () => options.activeRevision), updateTask: vi.fn(async () => true),
    getRevisionChildren: vi.fn(async () => options.revisionChildren),
    listTaskGraph: vi.fn(async () => ({ subtasks: [], dependencies: [] })),
    listTasks: vi.fn(async () => ({ items: [draft], totalItems: 1 })),
    listAllTasks: vi.fn(async () => ({ items: [draft], totalItems: 1 })),
    findActiveWorkflowRunForTask: vi.fn(async () => options.activeRun),
    appendAudit: vi.fn(async () => undefined), appendProvenance: vi.fn(async () => undefined),
  };
  let id = 0;
  const service = new AgentTaskServiceImpl(repository as unknown as AgenticRepository, tx,
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    () => "2026-08-14T12:00:00.000Z");
  return { service, repository };
}
