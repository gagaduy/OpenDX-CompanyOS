// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApprovalRequest, ApprovalState } from "../entities/approval-request";
import type { AgentSubtaskDependency, AgentTask } from "../entities/agent-task";
import type { ConfigurationRevision } from "../entities/configuration-revision";
import type {
  AgentBudgetLimits,
  AgentModelConfiguration,
} from "../entities/governance-records";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";

export function transitionTask(
  task: AgentTask,
  command: { readonly type: "ready"; readonly revisionId: string }
    | { readonly type: "cancel" },
  at: string,
): AgentTask {
  if (task.state === "canceled") {
    fail("TASK_STATE_INVALID", "Canceled tasks are immutable");
  }
  if (command.type === "ready") {
    if (task.state !== "draft" || command.revisionId.trim().length === 0) {
      fail("TASK_STATE_INVALID", "Only draft tasks can become ready");
    }
    return {
      ...task,
      state: "ready",
      configurationRevisionId: command.revisionId,
      version: task.version + 1,
      updatedAt: at,
    };
  }
  return {
    ...task,
    state: "canceled",
    version: task.version + 1,
    updatedAt: at,
  };
}

export function transitionRevision(
  revision: ConfigurationRevision,
  command: { readonly type: "submit" }
    | { readonly type: "activate"; readonly decidedBy: string }
    | { readonly type: "reject"; readonly decidedBy: string; readonly reason: string },
  at: string,
): ConfigurationRevision {
  if (command.type === "submit") {
    if (revision.state !== "draft") {
      fail("CONFIGURATION_STATE_INVALID", "Only draft revisions can be submitted");
    }
    return nextRevision(revision, { state: "pending_approval" }, at);
  }
  if (revision.state !== "pending_approval") {
    fail("CONFIGURATION_STATE_INVALID", "Only pending revisions can be decided");
  }
  if (revision.createdBy === command.decidedBy) {
    fail("SELF_APPROVAL_FORBIDDEN", "A revision creator cannot decide it");
  }
  if (command.type === "reject" && command.reason.trim().length === 0) {
    fail("CONFIGURATION_INVALID", "A rejection reason is required");
  }
  return nextRevision(revision, {
    state: command.type === "activate" ? "active" : "rejected",
    decidedBy: command.decidedBy,
    ...(command.type === "reject" ? { decisionReason: command.reason.trim() } : {}),
  }, at);
}

export function decideApproval(
  request: ApprovalRequest,
  input: {
    readonly decidedBy: string;
    readonly decision: Exclude<ApprovalState, "pending">;
    readonly reason: string;
    readonly now: string;
  },
): ApprovalRequest {
  if (request.state !== "pending") {
    fail("APPROVAL_ALREADY_DECIDED", "Approval has already been decided");
  }
  if (request.requesterId === input.decidedBy) {
    fail("SELF_APPROVAL_FORBIDDEN", "An approval requester cannot decide it");
  }
  if (Date.parse(input.now) >= Date.parse(request.expiresAt)) {
    fail("APPROVAL_EXPIRED", "Approval has expired");
  }
  if (input.reason.trim().length === 0) {
    fail("APPROVAL_DECISION_INVALID", "A decision reason is required");
  }
  return {
    ...request,
    state: input.decision,
    decidedBy: input.decidedBy,
    decisionReason: input.reason.trim(),
    decidedAt: input.now,
    version: request.version + 1,
  };
}

export function assertAcyclicDependencies(
  subtaskIds: readonly string[],
  dependencies: readonly AgentSubtaskDependency[],
): void {
  const nodes = new Set(subtaskIds);
  if (nodes.size !== subtaskIds.length) invalidDependencies();
  const adjacency = new Map(subtaskIds.map((id) => [id, [] as string[]]));
  const edges = new Set<string>();
  for (const dependency of dependencies) {
    if (
      dependency.from === dependency.to
      || !nodes.has(dependency.from)
      || !nodes.has(dependency.to)
    ) invalidDependencies();
    const key = `${dependency.from}\0${dependency.to}`;
    if (edges.has(key)) invalidDependencies();
    edges.add(key);
    adjacency.get(dependency.from)?.push(dependency.to);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) invalidDependencies();
    if (visited.has(node)) return;
    visiting.add(node);
    for (const child of adjacency.get(node) ?? []) visit(child);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of subtaskIds) visit(node);
}

export function validateModelConfiguration(config: AgentModelConfiguration): void {
  const models = [config.primaryModel, ...config.fallbackModels];
  if (
    config.primaryModel.trim().length === 0
    || config.fallbackModels.length > 5
    || models.some((model) => model.trim().length === 0 || model.length > 255)
    || new Set(models).size !== models.length
    || !isPositiveInteger(config.maxInputTokens)
    || !isPositiveInteger(config.maxOutputTokens)
    || !isPositiveInteger(config.timeoutMs)
    || !Number.isSafeInteger(config.maxRetries)
    || config.maxRetries < 0
  ) {
    fail("CONFIGURATION_INVALID", "Model configuration is invalid");
  }
}

export function validateBudgetLimits(limits: AgentBudgetLimits): void {
  const values = [limits.taskCostMicros, limits.dailyCostMicros, limits.monthlyCostMicros];
  if (
    values.some((value) => !isPositiveInteger(value))
    || limits.taskCostMicros > limits.dailyCostMicros
    || limits.dailyCostMicros > limits.monthlyCostMicros
  ) {
    fail("CONFIGURATION_INVALID", "Budget limits are invalid");
  }
}

function nextRevision(
  revision: ConfigurationRevision,
  values: Partial<ConfigurationRevision>,
  at: string,
): ConfigurationRevision {
  return { ...revision, ...values, version: revision.version + 1, updatedAt: at };
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function invalidDependencies(): never {
  return fail("TASK_DEPENDENCIES_INVALID", "Task dependencies are invalid");
}

function fail(code: string, message: string): never {
  throw new AgenticDomainError(code, message);
}
