// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticConsoleEmployeeRecord, AgenticConsoleTaskOperationsRecord, AgenticConsoleTaskScope, AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { AgentTask } from "../../../domain/entities/agent-task";
import type { ApprovalRequest } from "../../../domain/entities/approval-request";
import type { AgentKind } from "../../../domain/entities/agent-profile";
import { canonicalDigest } from "../../../domain/entities/orchestration-execution-descriptor";
import { parseAiCeoExecutiveReport } from "../../orchestration/ai-ceo-execution-catalog";
import { STORE_HEALTH_EXECUTION_CATALOG } from "../../orchestration/store-health-execution-catalog";
import { AgenticApplicationError } from "../agentic-application.error";
import type { AgenticApprovalDetailDto, AgenticEmployeeDetailDto, AgenticFileGovernancePreviewDto, AgenticTaskIntakeResultDto, AgenticTaskOperationsDto, AgenticTaskOverviewDto } from "../../dtos/responses/agentic-console.dto";
import type { AgenticAuditFilter, AgenticConsoleService, AgenticTaskFilter, CreateTaskIntakeInput } from "../interfaces/agentic-console.service";

type ConsoleRepository = Pick<AgenticRepository,
  | "bindStaffIntake" | "findStaffIntakeBinding" | "createTask" | "findTaskById"
  | "replaceTaskGraph" | "listTaskGraph" | "appendProvenance" | "appendAudit"
  | "listConsoleTasks" | "getConsoleTaskOverview" | "findActiveRevision" | "getRevisionChildren"
  | "hasConsoleTaskAccess" | "getConsoleTaskOperations"
  | "findWorkflowSignalReceiptForApproval" | "listProvenance"
  | "listAgents" | "getConsoleEmployee" | "listConsoleAudit">;

const GOVERNANCE_AUDIT_RESOURCE_TYPES = ["configuration_revision", "approval_request", "agent", "tool_grant", "model"] as const;
const AUDITOR_RESOURCE_TYPES = [...GOVERNANCE_AUDIT_RESOURCE_TYPES, "agentic_task", "tool"] as const;

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

  async getApprovalDetail(approval: ApprovalRequest): Promise<AgenticApprovalDetailDto> {
    return this.transactions.runReadOnly(async (session) => {
      const receipt = await this.repository.findWorkflowSignalReceiptForApproval(session, approval.id);
      const provenance = approval.taskId === undefined ? [] : await this.repository.listProvenance(session, approval.taskId);
      const rule = approvalRule(approval.approverScope, approval.action);
      return {
        approval: {
          id: approval.id, state: approval.state, requesterId: approval.requesterId,
          approverScope: approval.approverScope, action: approval.action,
          resourceType: approval.resourceType, resourceId: approval.resourceId,
          parametersDigest: approval.parametersDigest, policyVersion: approval.policyVersion,
          ...(approval.workflowVersion === undefined ? {} : { workflowVersion: approval.workflowVersion }),
          configurationRevisionId: approval.configurationRevisionId,
          expiresAt: approval.expiresAt, version: approval.version, createdAt: approval.createdAt,
        },
        ...(receipt === undefined ? {} : { payloadDigest: receipt.payloadDigest }),
        risk: rule.risk,
        expectedEffect: rule.expectedEffect,
        sources: provenance.map(({ sourceType, sourceId, sourceDigest }) => ({ sourceType, sourceId, sourceDigest })),
        refreshedAt: this.now(),
      };
    });
  }

  async listEmployees(principal: StaffPrincipal) {
    requireWorkforceReader(principal);
    return this.transactions.runReadOnly(async (session) => (await this.repository.listAgents(session))
      .map((agent) => ({ kind: agent.kind, department: department(agent.kind), active: agent.active })));
  }

  async getEmployee(agentKind: AgentKind, principal: StaffPrincipal): Promise<AgenticEmployeeDetailDto> {
    requireWorkforceReader(principal);
    return this.transactions.runReadOnly(async (session) => {
      const record = await this.repository.getConsoleEmployee(session, agentKind, 5);
      if (record === undefined) fail("AGENT_NOT_FOUND", "Digital Employee was not found");
      const latestRun = record.recentRuns[0];
      const health = employeeHealth(record, latestRun);
      return {
        kind: record.agent.kind,
        department: department(record.agent.kind),
        governance: {
          active: record.agent.active && record.configuration !== undefined,
          revoked: record.revocation !== undefined,
          configurationVersion: record.configuration?.version ?? 0,
        },
        models: { primary: record.model?.primaryModel ?? "unconfigured", fallbacks: record.model?.fallbackModels ?? [] },
        tools: record.tools.map(({ toolName, toolVersion, dataScope }) => ({ name: toolName, version: toolVersion, dataScope })),
        budgets: record.budget ?? { taskCostMicros: 0, dailyCostMicros: 0, monthlyCostMicros: 0 },
        executionHealth: health,
        recentRuns: record.recentRuns,
      };
    });
  }

  async listAudit(filter: AgenticAuditFilter, principal: StaffPrincipal) {
    const resourceTypes = auditScope(principal);
    return this.transactions.runReadOnly(async (session) => {
      const result = await this.repository.listConsoleAudit(session, { ...filter, ...(resourceTypes === undefined ? {} : { resourceTypes }) });
      return { items: result.items.map(safeAuditEvent), totalItems: result.totalItems, refreshedAt: this.now() };
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
function requireWorkforceReader(principal: StaffPrincipal): void { if (!principal.roles.some((role) => ["administrator", "agentic_operator", "agentic_approver", "agentic_governance_admin", "agentic_auditor"].includes(role))) fail("FORBIDDEN", "Digital Employee access is required"); }
function department(kind: AgentKind): string { return kind === "ai_ceo" ? "Executive" : kind === "crm" ? "CRM" : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`; }
function employeeHealth(record: AgenticConsoleEmployeeRecord, latestRun: { readonly state: string; readonly completedAt?: string } | undefined): AgenticEmployeeDetailDto["executionHealth"] {
  if (record.revocation !== undefined) return { state: "revoked", basis: "active_revocation", freshness: record.revocation.activatedAt };
  if (!record.agent.active || record.configuration === undefined) return { state: "unknown", basis: "no_active_configuration", freshness: record.agent.updatedAt };
  if (latestRun === undefined) return { state: "available", basis: "active_configuration", freshness: record.configuration.updatedAt };
  return { state: latestRun.state === "completed" ? "available" : "degraded", basis: "recent_runs", freshness: latestRun.completedAt ?? record.configuration.updatedAt };
}
function auditScope(principal: StaffPrincipal): readonly string[] | undefined {
  if (principal.roles.includes("administrator")) return undefined;
  if (principal.roles.includes("agentic_auditor")) return AUDITOR_RESOURCE_TYPES;
  if (principal.roles.includes("agentic_governance_admin")) return GOVERNANCE_AUDIT_RESOURCE_TYPES;
  fail("FORBIDDEN", "Audit access is not permitted");
}
function safeAuditEvent(event: Awaited<ReturnType<ConsoleRepository["listConsoleAudit"]>>["items"][number]) {
  const { id, actorId, actorType, action, resourceType, resourceId, outcome, correlationId, occurredAt } = event;
  return { id, actorId, actorType, action, resourceType, resourceId, outcome, correlationId, occurredAt,
    ...(event.taskId === undefined ? {} : { taskId: event.taskId }), ...(event.policyVersion === undefined ? {} : { policyVersion: event.policyVersion }),
    ...(event.modelVersion === undefined ? {} : { modelVersion: event.modelVersion }), ...(event.toolVersion === undefined ? {} : { toolVersion: event.toolVersion }),
    ...(event.causationId === undefined ? {} : { causationId: event.causationId }), ...(event.parametersDigest === undefined ? {} : { parametersDigest: event.parametersDigest }),
    ...(event.attempt === undefined ? {} : { attempt: event.attempt }), ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
    ...(event.resultDigest === undefined ? {} : { resultDigest: event.resultDigest }), ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }) };
}
function approvalRule(scope: ApprovalRequest["approverScope"], action: string): { readonly risk: AgenticApprovalDetailDto["risk"]; readonly expectedEffect: string } {
  switch (scope) {
    case "workflow_execution": return { risk: { level: "high", basis: `The ${action} decision changes a durable workflow outcome.` }, expectedEffect: "Resume the workflow with the recorded human decision." };
    case "emergency_revocation": return { risk: { level: "high", basis: `The ${action} decision changes active execution authority.` }, expectedEffect: "Apply or deny the requested emergency authority revocation." };
    case "governance_configuration": return { risk: { level: "high", basis: `The ${action} decision changes the governed runtime configuration.` }, expectedEffect: "Apply or deny the exact digest-bound configuration revision." };
    case "tool_invocation": return { risk: { level: "medium", basis: `The ${action} decision controls a bounded external tool effect.` }, expectedEffect: "Allow or deny the exact policy-bound tool invocation." };
  }
}
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
