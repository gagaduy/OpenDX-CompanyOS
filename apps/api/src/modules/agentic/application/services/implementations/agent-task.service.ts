// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type {
  AgenticRepository, AgentSubtaskDependencyRecord, AgentSubtaskRecord,
} from "../../repositories/interfaces/agentic.repository";
import type { AgentTask } from "../../../domain/entities/agent-task";
import { assertAcyclicDependencies, transitionTask } from "../../../domain/services/agent-governance-rules";
import { AgenticApplicationError } from "../agentic-application.error";
import type {
  AgentTaskDetail, AgentTaskPage, AgentTaskQuery, AgentTaskService,
  CancelAgentTaskInput, CreateAgentTaskInput, ReadyAgentTaskInput, UpdateAgentTaskInput,
} from "../interfaces/agent-task.service";

type TaskRepository = Pick<AgenticRepository,
  | "createTask" | "findTask" | "findTaskById" | "findTaskForApproval" | "listTasks"
  | "listAllTasks" | "updateTask" | "replaceTaskGraph" | "listTaskGraph"
  | "findActiveRevision" | "appendAudit">;

interface PreparedGraph {
  readonly taskId: string;
  readonly subtasks: readonly { readonly id: string; readonly agentKind: AgentSubtaskRecord["agentKind"]; readonly title: string }[];
  readonly dependencies: readonly { readonly from: string; readonly to: string }[];
}

export class AgentTaskServiceImpl implements AgentTaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async create(input: CreateAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail> {
    requireOperator(principal);
    const graph = this.prepareGraph(input, "pending");
    return this.transactions.run(async (session) => {
      const at = this.now();
      assertInput(input, at);
      const task: AgentTask = {
        id: this.generateId(), state: "draft", createdBy: principal.subject,
        goal: input.goal.trim(), instructions: input.instructions,
        ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
        version: 1, createdAt: at, updatedAt: at,
      };
      const storedGraph = withTaskId(task.id, graph, at);
      await this.repository.createTask(session, task);
      if (!await this.repository.replaceTaskGraph(session, task.id, principal.subject, storedGraph.subtasks, storedGraph.dependencies)) {
        fail("TASK_STATE_INVALID", "Task graph could not be stored");
      }
      await this.audit(session, principal, task.id, "task.create", at);
      return detail(task, storedGraph);
    });
  }

  async updateDraft(input: UpdateAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail> {
    requireOperator(principal);
    const graph = this.prepareGraph(input, input.taskId);
    return this.transactions.run(async (session) => {
      const at = this.now();
      assertInput(input, at);
      const current = await this.requireOwnedTask(session, input.taskId, principal);
      if (current.state !== "draft") fail("TASK_STATE_INVALID", "Only draft tasks can be updated");
      assertVersion(current, input.expectedVersion);
      const next: AgentTask = {
        ...withoutDeadline(current), goal: input.goal.trim(), instructions: input.instructions,
        ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
        version: current.version + 1, updatedAt: at,
      };
      if (!await this.repository.updateTask(session, next, input.expectedVersion)) fail("STALE_VERSION", "Task version is stale");
      const storedGraph = withTaskId(current.id, graph, at);
      if (!await this.repository.replaceTaskGraph(session, current.id, current.createdBy, storedGraph.subtasks, storedGraph.dependencies)) {
        fail("TASK_STATE_INVALID", "Task graph could not be stored");
      }
      await this.audit(session, principal, current.id, "task.update", at);
      return detail(next, storedGraph);
    });
  }

  async ready(input: ReadyAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail> {
    requireOperator(principal);
    return this.transactions.run(async (session) => {
      const current = await this.requireOwnedTask(session, input.taskId, principal);
      assertVersion(current, input.expectedVersion);
      const active = await this.repository.findActiveRevision(session);
      if (active === undefined) fail("NO_ACTIVE_CONFIGURATION", "No active configuration exists");
      const at = this.now();
      const next = transitionTask(current, { type: "ready", revisionId: active.id }, at);
      if (!await this.repository.updateTask(session, next, input.expectedVersion)) fail("STALE_VERSION", "Task version is stale");
      await this.audit(session, principal, current.id, "task.ready", at);
      return this.loadDetail(session, next);
    });
  }

  async cancel(input: CancelAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail> {
    requireOperator(principal);
    return this.transactions.run(async (session) => {
      const current = await this.requireOwnedTask(session, input.taskId, principal);
      assertVersion(current, input.expectedVersion);
      const at = this.now();
      const next = transitionTask(current, { type: "cancel" }, at);
      if (!await this.repository.updateTask(session, next, input.expectedVersion)) fail("STALE_VERSION", "Task version is stale");
      await this.audit(session, principal, current.id, "task.cancel", at);
      return this.loadDetail(session, next);
    });
  }

  async get(taskId: string, principal: StaffPrincipal): Promise<AgentTaskDetail> {
    if (principal.roles.includes("agentic_auditor")) fail("FORBIDDEN", "Auditors cannot read task bodies");
    return this.transactions.runReadOnly(async (session) => {
      let task: AgentTask | undefined;
      if (isOversight(principal)) task = await this.repository.findTaskById(session, taskId);
      else if (principal.roles.includes("agentic_approver")) task = await this.repository.findTaskForApproval(session, taskId);
      else if (principal.roles.includes("agentic_operator")) task = await this.repository.findTask(session, taskId, principal.subject);
      else fail("FORBIDDEN", "Task access is not permitted");
      if (task === undefined) fail("TASK_NOT_FOUND", "Task was not found");
      return this.loadDetail(session, task);
    });
  }

  async list(query: AgentTaskQuery, principal: StaffPrincipal): Promise<AgentTaskPage> {
    if (isOversight(principal)) {
      return this.transactions.runReadOnly((session) => this.repository.listAllTasks(session, query.page, query.pageSize));
    }
    if (!principal.roles.includes("agentic_operator")) fail("FORBIDDEN", "Task list access is not permitted");
    return this.transactions.runReadOnly((session) => this.repository.listTasks(session, principal.subject, query.page, query.pageSize));
  }

  private prepareGraph(input: CreateAgentTaskInput, taskId: string): PreparedGraph {
    const subtasks = input.subtasks.map((subtask) => ({ ...subtask, id: subtask.id ?? this.generateId() }));
    assertAcyclicDependencies(subtasks.map(({ id }) => id), input.dependencies);
    return { taskId, subtasks, dependencies: input.dependencies };
  }

  private async requireOwnedTask(session: DatabaseSession, taskId: string, principal: StaffPrincipal): Promise<AgentTask> {
    const task = principal.roles.includes("administrator")
      ? await this.repository.findTaskById(session, taskId)
      : await this.repository.findTask(session, taskId, principal.subject);
    if (task === undefined) fail("TASK_NOT_FOUND", "Task was not found");
    return task;
  }

  private async loadDetail(session: DatabaseSession, task: AgentTask): Promise<AgentTaskDetail> {
    const graph = await this.repository.listTaskGraph(session, task.id);
    return detail(task, graph);
  }

  private async audit(session: DatabaseSession, principal: StaffPrincipal, taskId: string, action: string, occurredAt: string): Promise<void> {
    await this.repository.appendAudit(session, {
      id: this.generateId(), actorId: principal.subject, actorType: "staff", taskId,
      action, resourceType: "agentic_task", resourceId: taskId, outcome: "allowed",
      correlationId: taskId, occurredAt,
    });
  }
}

function withTaskId(taskId: string, graph: PreparedGraph, createdAt: string): {
  readonly subtasks: readonly AgentSubtaskRecord[];
  readonly dependencies: readonly AgentSubtaskDependencyRecord[];
} {
  return {
    subtasks: graph.subtasks.map((subtask) => ({ ...subtask, taskId, version: 1, createdAt })),
    dependencies: graph.dependencies.map((dependency) => ({ taskId, ...dependency })),
  };
}

function detail(task: AgentTask, graph: { readonly subtasks: readonly { readonly id: string; readonly agentKind: AgentSubtaskRecord["agentKind"]; readonly title: string }[]; readonly dependencies: readonly { readonly from: string; readonly to: string }[] }): AgentTaskDetail {
  return {
    task,
    subtasks: graph.subtasks.map(({ id, agentKind, title }) => ({ id, agentKind, title })),
    dependencies: graph.dependencies.map(({ from, to }) => ({ from, to })),
  };
}

function assertInput(input: CreateAgentTaskInput, now: string): void {
  if (
    input.goal.trim().length === 0 || input.goal.trim().length > 500
    || input.instructions.length === 0 || input.instructions.length > 8000
    || input.subtasks.some(({ title }) => title.trim().length === 0 || title.trim().length > 500)
    || (input.deadline !== undefined && (!Number.isFinite(Date.parse(input.deadline)) || Date.parse(input.deadline) <= Date.parse(now)))
  ) fail("TASK_INPUT_INVALID", "Task input is invalid");
}

function assertVersion(task: AgentTask, expectedVersion: number): void {
  if (task.version !== expectedVersion) fail("STALE_VERSION", "Task version is stale");
}
function withoutDeadline(task: AgentTask): Omit<AgentTask, "deadline"> {
  const copy = { ...task };
  delete copy.deadline;
  return copy;
}
function requireOperator(principal: StaffPrincipal): void {
  if (!principal.roles.includes("agentic_operator") && !principal.roles.includes("administrator")) fail("FORBIDDEN", "Operator role is required");
}
function isOversight(principal: StaffPrincipal): boolean {
  return principal.roles.includes("administrator") || principal.roles.includes("agentic_governance_admin");
}
function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
