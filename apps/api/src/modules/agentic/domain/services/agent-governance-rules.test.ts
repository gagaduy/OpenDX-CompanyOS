// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { ApprovalRequest } from "../entities/approval-request";
import type { AgentTask } from "../entities/agent-task";
import type { ConfigurationRevision } from "../entities/configuration-revision";
import { AGENT_KINDS } from "../entities/agent-profile";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";
import {
  assertAcyclicDependencies,
  decideApproval,
  transitionRevision,
  transitionTask,
  validateBudgetLimits,
  validateModelConfiguration,
} from "./agent-governance-rules";

const at = "2026-08-14T01:00:00.000Z";

describe("Agent governance rules", () => {
  it("defines exactly the approved Digital Employee kinds", () => {
    expect(AGENT_KINDS).toEqual([
      "ai_ceo",
      "catalog",
      "inventory",
      "order",
      "finance",
      "crm",
      "support",
    ]);
    expect(new Set(AGENT_KINDS).size).toBe(7);
  });

  it("readies a draft task by pinning one configuration revision", () => {
    const result = transitionTask(task(), {
      type: "ready",
      revisionId: "revision-1",
    }, at);

    expect(result).toMatchObject({
      state: "ready",
      configurationRevisionId: "revision-1",
      version: 2,
      updatedAt: at,
    });
  });

  it.each(["draft", "ready"] as const)("cancels a %s task", (state) => {
    const result = transitionTask(task({ state }), { type: "cancel" }, at);
    expect(result).toMatchObject({ state: "canceled", version: 2, updatedAt: at });
  });

  it("rejects task transitions from a canceled task", () => {
    expectDomainError(
      () => transitionTask(task({ state: "canceled" }), { type: "cancel" }, at),
      "TASK_STATE_INVALID",
    );
  });

  it("allows a draft creator to activate their own configuration", () => {
    const result = transitionRevision(revision(), { type: "activate", activatedBy: "governance-a" }, at);
    expect(result).toMatchObject({
      state: "active",
      createdBy: "governance-a",
      decidedBy: "governance-a",
      version: 2,
      updatedAt: at,
    });
  });

  it.each(["pending_approval", "active", "superseded"] as const)("rejects direct activation from %s", (state) => {
    expectDomainError(
      () => transitionRevision(revision({ state, version: 2 }), { type: "activate", activatedBy: "governance-a" }, at),
      "CONFIGURATION_STATE_INVALID",
    );
  });

  it("requires a rejection reason and freezes terminal revisions", () => {
    expectDomainError(
      () => transitionRevision(
        revision({ state: "pending_approval", version: 2 }),
        { type: "reject", decidedBy: "governance-b", reason: " " },
        at,
      ),
      "CONFIGURATION_INVALID",
    );
    expectDomainError(
      () => transitionRevision(
        revision({ state: "active", version: 3, decidedBy: "governance-b" }),
        { type: "activate", activatedBy: "governance-b" },
        at,
      ),
      "CONFIGURATION_STATE_INVALID",
    );
  });

  it.each(["approved", "rejected", "revision_requested"] as const)(
    "records one %s approval decision",
    (decision) => {
      const result = decideApproval(approval(), {
        decidedBy: "approver-b",
        decision,
        reason: "Reviewed evidence",
        now: at,
      });
      expect(result).toMatchObject({
        state: decision,
        decidedBy: "approver-b",
        version: 2,
        decidedAt: at,
      });
    },
  );

  it("rejects approval self-decision", () => {
    expectDomainError(
      () => decideApproval(approval(), {
        decidedBy: "requester-a",
        decision: "approved",
        reason: "Approve myself",
        now: at,
      }),
      "SELF_APPROVAL_FORBIDDEN",
    );
  });

  it("treats the exact expiry boundary as expired", () => {
    expectDomainError(
      () => decideApproval(approval({ expiresAt: at }), {
        decidedBy: "approver-b",
        decision: "approved",
        reason: "Too late",
        now: at,
      }),
      "APPROVAL_EXPIRED",
    );
  });

  it("rejects a second approval decision", () => {
    expectDomainError(
      () => decideApproval(approval({ state: "approved", version: 2 }), {
        decidedBy: "approver-c",
        decision: "rejected",
        reason: "Replay",
        now: at,
      }),
      "APPROVAL_ALREADY_DECIDED",
    );
  });

  it("accepts an acyclic dependency graph within one subtask set", () => {
    expect(() => assertAcyclicDependencies(
      ["catalog", "inventory", "report"],
      [
        { from: "catalog", to: "report" },
        { from: "inventory", to: "report" },
      ],
    )).not.toThrow();
  });

  it.each([
    ["self edge", [{ from: "catalog", to: "catalog" }]],
    ["unknown node", [{ from: "catalog", to: "unknown" }]],
    ["duplicate edge", [
      { from: "catalog", to: "report" },
      { from: "catalog", to: "report" },
    ]],
    ["cycle", [
      { from: "catalog", to: "inventory" },
      { from: "inventory", to: "catalog" },
    ]],
  ])("rejects a dependency graph with %s", (_case, dependencies) => {
    expectDomainError(
      () => assertAcyclicDependencies(["catalog", "inventory", "report"], dependencies),
      "TASK_DEPENDENCIES_INVALID",
    );
  });

  it("accepts bounded model configuration with ordered unique fallbacks", () => {
    expect(() => validateModelConfiguration({
      primaryModel: "openai/gpt-primary",
      fallbackModels: ["anthropic/model-a", "google/model-b"],
      maxInputTokens: 8_000,
      maxOutputTokens: 2_000,
      timeoutMs: 30_000,
      maxRetries: 2,
      inputCostMicrosPerMillion: 0,
      outputCostMicrosPerMillion: 0,
    })).not.toThrow();
  });

  it.each([
    ["primary repeated", ["openai/gpt-primary"]],
    ["duplicate fallback", ["anthropic/model-a", "anthropic/model-a"]],
  ])("rejects model configuration with %s", (_case, fallbackModels) => {
    expectDomainError(
      () => validateModelConfiguration({
        primaryModel: "openai/gpt-primary",
        fallbackModels,
        maxInputTokens: 8_000,
        maxOutputTokens: 2_000,
        timeoutMs: 30_000,
        maxRetries: 2,
        inputCostMicrosPerMillion: 0,
        outputCostMicrosPerMillion: 0,
      }),
      "CONFIGURATION_INVALID",
    );
  });

  it.each([true, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid model pricing %s",
    (inputCostMicrosPerMillion) => {
      expectDomainError(() => validateModelConfiguration({
        primaryModel: "openai/gpt-primary",
        fallbackModels: [],
        maxInputTokens: 8_000,
        maxOutputTokens: 2_000,
        timeoutMs: 30_000,
        maxRetries: 2,
        inputCostMicrosPerMillion: inputCostMicrosPerMillion as number,
        outputCostMicrosPerMillion: 0,
      }), "CONFIGURATION_INVALID");
    },
  );

  it("rejects unsafe, negative, fractional, or inverted budget limits", () => {
    for (const values of [
      { taskCostMicros: -1, dailyCostMicros: 2, monthlyCostMicros: 3 },
      { taskCostMicros: 1.5, dailyCostMicros: 2, monthlyCostMicros: 3 },
      { taskCostMicros: 2, dailyCostMicros: 1, monthlyCostMicros: 3 },
      { taskCostMicros: 1, dailyCostMicros: 3, monthlyCostMicros: 2 },
      { taskCostMicros: Number.MAX_SAFE_INTEGER + 1, dailyCostMicros: 2, monthlyCostMicros: 3 },
    ]) {
      expectDomainError(() => validateBudgetLimits(values), "CONFIGURATION_INVALID");
    }
  });
});

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    state: "draft",
    createdBy: "operator-a",
    goal: "Review store health",
    instructions: "Use authoritative evidence",
    version: 1,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

function revision(overrides: Partial<ConfigurationRevision> = {}): ConfigurationRevision {
  return {
    id: "revision-1",
    state: "draft",
    createdBy: "governance-a",
    payloadDigest: "a".repeat(64),
    version: 1,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

function approval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: "approval-1",
    state: "pending",
    requesterId: "requester-a",
    approverScope: "governance_configuration",
    action: "configuration.activate",
    resourceType: "configuration_revision",
    resourceId: "revision-1",
    parametersDigest: "b".repeat(64),
    policyVersion: 1,
    configurationRevisionId: "revision-1",
    expiresAt: "2026-08-14T02:00:00.000Z",
    version: 1,
    createdAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

function expectDomainError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AgenticDomainError);
    expect((error as AgenticDomainError).code).toBe(code);
  }
}
