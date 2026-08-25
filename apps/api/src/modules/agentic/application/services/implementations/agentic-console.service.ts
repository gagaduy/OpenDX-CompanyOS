// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticConsoleTaskOperationsRecord, AgenticConsoleTaskScope, AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { AgentTask } from "../../../domain/entities/agent-task";
import { canonicalDigest } from "../../../domain/entities/orchestration-execution-descriptor";
import { parseAiCeoExecutiveReport } from "../../orchestration/ai-ceo-execution-catalog";
import { STORE_HEALTH_EXECUTION_CATALOG } from "../../orchestration/store-health-execution-catalog";
import { AgenticApplicationError } from "../agentic-application.error";
import type { AgenticFileGovernancePreviewDto, AgenticTaskIntakeResultDto, AgenticTaskOperationsDto, AgenticTaskOverviewDto } from "../../dtos/responses/agentic-console.dto";
import type { AgenticConsoleService, AgenticTaskFilter, CreateTaskIntakeInput } from "../interfaces/agentic-console.service";

type ConsoleRepository = Pick<AgenticRepository,
  | "bindStaffIntake" | "findStaffIntakeBinding" | "createTask" | "findTaskById"
  | "replaceTaskGraph" | "listTaskGraph" | "appendProvenance" | "appendAudit"
  | "listConsoleTasks" | "getConsoleTaskOverview" | "findActiveRevision" | "getRevisionChildren"
  | "hasConsoleTaskAccess" | "getConsoleTaskOperations">;

export class AgenticConsoleServiceImpl implements AgenticConsoleService {
  constructor(
    private readonly repository: ConsoleRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async createTaskIntake(input: CreateTaskIntakeInput, principal: StaffPrincipal): Promise<AgenticTaskIntakeResultDto> {
    requireOperator(principal);
    const normalized = normalizeInput(input, this.now());
    const requestDigest = digest(normalized);
    const at = this.now();
    const task: AgentTask = {
      id: this.generateId(), state: "draft", createdBy: principal.subject,
      goal: normalized.goal, instructions: normalized.instructions,
      ...(normalized.deadline === undefined ? {} : { deadline: normalized.deadline }),
      version: 1, createdAt: at, updatedAt: at,
    };
    return this.transactions.run(async (session) => {
      const binding = {
        kind: "task_intake" as const, actorId: principal.subject,
        idempotencyKey: input.idempotencyKey, requestDigest, resourceId: task.id, createdAt: at,
      };
      const bound = await this.repository.bindStaffIntake(session, binding);
      if (bound !== "created") {
        const existing = await this.repository.findStaffIntakeBinding(
          session, binding.kind, binding.actorId, binding.idempotencyKey,
        );
        if (existing === undefined || existing.requestDigest !== requestDigest) {
          fail("IDEMPOTENCY_CONFLICT", "Idempotency key is already bound to another task intake");
        }
        return { disposition: "replayed", detail: await this.loadDetail(session, existing.resourceId) };
      }
      const subtask = {
        id: this.generateId(), taskId: task.id, agentKind: "ai_ceo" as const,
        title: "Coordinate Store Health Review", version: 1, createdAt: at,
      };
      await this.repository.createTask(session, task);
      if (!await this.repository.replaceTaskGraph(session, task.id, principal.subject, [subtask], [])) {
        fail("TASK_STATE_INVALID", "Task graph could not be stored");
      }
      await this.repository.appendProvenance(session, {
        id: this.generateId(), taskId: task.id, sourceType: "staff_task_intake",
        sourceId: principal.subject, sourceDigest: requestDigest,
        classification: "internal", recordedBy: principal.subject, recordedAt: at,
      });
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorId: principal.subject, actorType: "staff", taskId: task.id,
        action: "agentic_task.intake", resourceType: "agentic_task", resourceId: task.id,
        outcome: "allowed", correlationId: task.id, occurredAt: at,
      });
      return {
        disposition: "created",
        detail: { task, subtasks: [{ id: subtask.id, agentKind: subtask.agentKind, title: subtask.title }], dependencies: [] },
      };
    });
  }

  async listTasks(filter: AgenticTaskFilter, principal: StaffPrincipal) {
    if (principal.roles.includes("agentic_auditor")) {
      return { items: [], totalItems: 0, refreshedAt: this.now() };
    }
    const scope = taskScope(principal);
    return this.transactions.runReadOnly(async (session) => ({
      ...await this.repository.listConsoleTasks(session, { ...filter, scope }),
      refreshedAt: this.now(),
    }));
  }

  async getOverview(principal: StaffPrincipal): Promise<AgenticTaskOverviewDto> {
    if (principal.roles.includes("agentic_auditor")) return emptyOverview(this.now());
    const scope = taskScope(principal);
    return this.transactions.runReadOnly(async (session) => ({
      ...await this.repository.getConsoleTaskOverview(session, scope),
      refreshedAt: this.now(),
    }));
  }

  async getFileGovernancePreview(principal: StaffPrincipal): Promise<AgenticFileGovernancePreviewDto> {
    requireGovernance(principal);
    return this.transactions.runReadOnly(async (session) => {
      const revision = await this.repository.findActiveRevision(session);
      if (revision === undefined) fail("NO_ACTIVE_CONFIGURATION", "An active Agentic configuration is required");
      const children = await this.repository.getRevisionChildren(session, revision.id);
      const configured = new Set(children.toolGrants.map(({ agentKind, toolName, toolVersion }) =>
        `${agentKind}:${toolName}:${toolVersion}`));
      const grants = STORE_HEALTH_EXECUTION_CATALOG.flatMap((entry) => entry.toolGrants
        .filter(({ name, version }) => configured.has(`${entry.agentKind}:${name}:${version}`)));
      return {
        coordinator: "ai_ceo",
        eligibleDepartments: ["catalog", "inventory", "order", "finance", "crm", "support"],
        allowedTools: [...new Set(grants.map(({ name }) => name))].sort(),
        dataClasses: [...new Set(grants.map(({ dataClassification }) => dataClassification))].sort(),
        riskSignals: [],
        dependencyStatus: "planned_after_task_start",
        configurationRevisionId: revision.id,
        configurationVersion: revision.version,
      };
    });
  }

  async getTaskOperations(taskId: string, principal: StaffPrincipal): Promise<AgenticTaskOperationsDto> {
    if (principal.roles.includes("agentic_auditor")) fail("FORBIDDEN", "Task operations access is not permitted");
    const scope = taskScope(principal);
    return this.transactions.runReadOnly(async (session) => {
      if (!await this.repository.hasConsoleTaskAccess(session, taskId, scope)) {
        fail("TASK_NOT_FOUND", "Task operations were not found");
      }
      const record = await this.repository.getConsoleTaskOperations(session, taskId);
      if (record === undefined) fail("TASK_NOT_FOUND", "Task operations were not found");
      const report = safeReport(record.report, new Set(record.provenance.map(({ id }) => id)));
      return {
        task: { id: record.task.id, goal: record.task.goal, state: record.workflow?.state ?? record.task.state, version: record.task.version },
        ...(record.workflow === undefined ? {} : { workflow: {
          id: record.workflow.id, state: record.workflow.state, stage: record.workflow.resumeState ?? record.workflow.state,
          version: record.workflow.version, updatedAt: record.workflow.updatedAt,
        } }),
        timeline: [...record.timeline].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)),
        branches: record.branches.map((branch) => ({ ...branch, dependencies: [...branch.dependencies], toolNames: [...branch.toolNames], dataClasses: [...branch.dataClasses] })),
        costs: { reservedMicros: record.reservedMicros, settledMicros: record.settledMicros },
        approvals: record.approvals.map(({ id, state, expiresAt, version }) => ({ id, state, expiresAt, version })),
        provenance: record.provenance.map(({ id, sourceType, sourceId, classification }) => ({ id, sourceType, sourceId, classification })),
        ...(report === undefined ? {} : { report }),
        refreshedAt: this.now(),
      };
    });
  }

  private async loadDetail(session: DatabaseSession, taskId: string) {
    const task = await this.repository.findTaskById(session, taskId);
    if (task === undefined) fail("TASK_NOT_FOUND", "Task intake replay could not be loaded");
    const graph = await this.repository.listTaskGraph(session, task.id);
    return {
      task,
      subtasks: graph.subtasks.map(({ id, agentKind, title }) => ({ id, agentKind, title })),
      dependencies: graph.dependencies.map(({ from, to }) => ({ from, to })),
    };
  }
}

function normalizeInput(input: CreateTaskIntakeInput, now: string) {
  const goal = input.goal.trim();
  const instructions = input.instructions.trim();
  if (goal.length === 0 || goal.length > 500 || instructions.length === 0 || instructions.length > 8_000) fail("TASK_INPUT_INVALID", "Task intake is invalid");
  if (input.deadline !== undefined && (!Number.isFinite(Date.parse(input.deadline)) || Date.parse(input.deadline) <= Date.parse(now))) fail("TASK_INPUT_INVALID", "Task deadline is invalid");
  if (input.mode === "store_health_review" && input.reviewWindow === undefined) fail("TASK_INPUT_INVALID", "Store Health review window is required");
  if (input.reviewWindow !== undefined && Date.parse(input.reviewWindow.start) > Date.parse(input.reviewWindow.end)) fail("TASK_INPUT_INVALID", "Review window is invalid");
  return { mode: input.mode, goal, instructions, ...(input.deadline === undefined ? {} : { deadline: input.deadline }), ...(input.reviewWindow === undefined ? {} : { reviewWindow: input.reviewWindow }) };
}

function taskScope(principal: StaffPrincipal): AgenticConsoleTaskScope {
  if (principal.roles.includes("administrator")) return { kind: "all" };
  if (principal.roles.includes("agentic_governance_admin")) return { kind: "oversight" };
  if (principal.roles.includes("agentic_approver")) return { kind: "approval", actorId: principal.subject };
  if (principal.roles.includes("agentic_operator")) return { kind: "owner", actorId: principal.subject };
  fail("FORBIDDEN", "Task access is not permitted");
}
function emptyOverview(refreshedAt: string): AgenticTaskOverviewDto { return { counts: { running: 0, waiting: 0, failed: 0, completed: 0, canceled: 0 }, pendingApprovals: 0, settledCostMicros: 0, refreshedAt }; }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function requireOperator(principal: StaffPrincipal): void { if (!principal.roles.includes("administrator") && !principal.roles.includes("agentic_operator")) fail("FORBIDDEN", "Operator role is required"); }
function requireGovernance(principal: StaffPrincipal): void { if (!principal.roles.includes("administrator") && !principal.roles.includes("agentic_governance_admin")) fail("FORBIDDEN", "Governance administrator role is required"); }
function safeReport(record: AgenticConsoleTaskOperationsRecord["report"], provenance: ReadonlySet<string>) {
  if (record === undefined || record.reportDigest !== record.payloadDigest || canonicalDigest(record.payload) !== record.reportDigest) return undefined;
  try {
    const report = parseAiCeoExecutiveReport(record.payload);
    if (report.completionState !== record.completionState
      || [...report.conclusions, ...report.risks, ...report.recommendedActions, ...report.conflicts]
        .some(({ provenanceIds }) => provenanceIds.some((id) => !provenance.has(id)))) return undefined;
    const { acceptedResultReferences: _references, schemaVersion: _schemaVersion, ...publicReport } = report;
    return publicReport;
  } catch { return undefined; }
}
function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
