// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import { ToolRegistryService } from "./tool-registry.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const digest = "a".repeat(64);
const request = {
  principal: { subject: "service-account-agent-catalog", clientId: "agent-catalog", agentKind: "catalog" as const },
  taskId: "task-1", toolName: "catalog.health", toolVersion: 1, purpose: "analysis",
  modelId: "openai/gpt-5-mini",
  dataScope: "catalog:read", dataClassification: "internal", inputSchemaDigest: digest,
  parametersDigest: "b".repeat(64), costMicros: 10, idempotencyKey: "invoke-1",
  correlationId: "corr-1",
};

describe("ToolRegistryService", () => {
  it("fails closed for inactive identities and task assignment mismatch", async () => {
    const inactive = createHarness({ agentActive: false });
    await expect(inactive.service.authorize(request)).rejects.toMatchObject({ code: "AGENT_NOT_ACTIVE" });
    const mismatched = createHarness({ taskAssigned: false });
    await expect(mismatched.service.authorize(request)).rejects.toMatchObject({ code: "TASK_AGENT_MISMATCH" });
  });

  it("rejects unknown tools, stale grants, scope, and parameter digests before budget", async () => {
    const cases = [
      [{ toolExists: false }, "TOOL_NOT_FOUND"],
      [{ grantExists: false }, "TOOL_GRANT_MISSING"],
      [{ grantScope: "orders:read" }, "TOOL_SCOPE_DENIED"],
      [{ invocationCount: 10 }, "TOOL_GRANT_EXHAUSTED"],
    ] as const;
    for (const [options, code] of cases) {
      const harness = createHarness(options);
      await expect(harness.service.invoke(request)).rejects.toMatchObject({ code });
      expect(harness.repository.reserveBudget).not.toHaveBeenCalled();
    }
    await expect(createHarness().service.invoke({ ...request, parametersDigest: "unsafe" }))
      .rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
  });

  it("honors policy denial and exact bound approval evidence", async () => {
    const denied = createHarness({ policyEffect: "DENY" });
    await expect(denied.service.invoke(request)).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(denied.repository.reserveBudget).not.toHaveBeenCalled();

    const approval = createHarness({ policyEffect: "REQUIRE_APPROVAL", approvalValid: false });
    await expect(approval.service.invoke({ ...request, approvalId: "approval-1" }))
      .rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(approval.repository.reserveBudget).not.toHaveBeenCalled();

    const wrongScope = createHarness({ policyEffect: "REQUIRE_APPROVAL", approvalScope: "emergency_revocation" });
    await expect(wrongScope.service.invoke({ ...request, approvalId: "approval-1" }))
      .rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });

    const budget = createHarness({ budgetResult: "exceeded" });
    await expect(budget.service.invoke(request)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(budget.repository.appendProvenance).not.toHaveBeenCalled();
  });

  it("denies every later authorization that selects a revoked model", async () => {
    const revoked = createHarness({ revokedTarget: "model" });

    await expect(revoked.service.authorize(request))
      .rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(revoked.repository.reserveBudget).not.toHaveBeenCalled();
  });

  it("reserves budget and records provenance/audit before the inert adapter result", async () => {
    const harness = createHarness();
    await expect(harness.service.invoke(request)).rejects.toMatchObject({ code: "TOOL_UNAVAILABLE" });
    expect(harness.repository.reserveBudget).toHaveBeenCalledOnce();
    expect(harness.repository.appendProvenance).toHaveBeenCalledOnce();
    expect(harness.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      outcome: "allowed", action: "tool.invoke", resourceId: "catalog.health@1",
    }));

    const replay = createHarness({ budgetResult: "duplicate" });
    await expect(replay.service.invoke(request)).rejects.toMatchObject({ code: "TOOL_UNAVAILABLE" });
    expect(replay.repository.appendProvenance).not.toHaveBeenCalled();
    expect(replay.repository.appendAudit).not.toHaveBeenCalled();
  });
});

function createHarness(options: {
  readonly agentActive?: boolean; readonly taskAssigned?: boolean; readonly toolExists?: boolean;
  readonly grantExists?: boolean; readonly grantScope?: string;
  readonly policyEffect?: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  readonly approvalValid?: boolean;
  readonly approvalScope?: "tool_invocation" | "emergency_revocation";
  readonly revokedTarget?: "agent" | "tool_grant" | "model";
  readonly invocationCount?: number; readonly budgetResult?: "reserved" | "duplicate" | "exceeded";
} = {}) {
  const repository = {
    findAgentByClientId: vi.fn(async () => ({ kind: "catalog", keycloakClientId: "agent-catalog", active: options.agentActive ?? true, version: 1, createdAt: "", updatedAt: "" })),
    findTaskForAgent: vi.fn(async () => options.taskAssigned === false ? undefined : ({ id: "task-1", state: "ready", createdBy: "operator", goal: "g", instructions: "i", configurationRevisionId: "revision-1", version: 1, createdAt: "", updatedAt: "" })),
    findRevision: vi.fn(async () => ({ id: "revision-1", state: "active", createdBy: "admin", payloadDigest: digest, version: 4, createdAt: "", updatedAt: "" })),
    findTool: vi.fn(async () => options.toolExists === false ? undefined : ({ name: "catalog.health", version: 1, inputSchemaDigest: digest, outputSchemaDigest: digest, active: true })),
    findToolGrant: vi.fn(async () => options.grantExists === false ? undefined : ({ id: "grant-1", revisionId: "revision-1", agentKind: "catalog", toolName: "catalog.health", toolVersion: 1, purpose: "analysis", dataScope: options.grantScope ?? "catalog:read", maxInvocations: 10 })),
    findModelConfiguration: vi.fn(async () => ({ revisionId: "revision-1", agentKind: "catalog", primaryModel: "openai/gpt-5-mini", fallbackModels: [], maxInputTokens: 1_000, maxOutputTokens: 500, timeoutMs: 5_000, maxRetries: 1 })),
    findActiveRevocation: vi.fn(async (_session, targetType: string) => targetType === options.revokedTarget ? ({ id: "revoked" }) : undefined),
    findApproval: vi.fn(async () => options.approvalValid === false ? undefined : ({ id: "approval-1", state: "approved", requesterId: "operator", approverScope: options.approvalScope ?? "tool_invocation", action: "tool.invoke", resourceType: "tool", resourceId: "catalog.health@1", parametersDigest: request.parametersDigest, taskId: "task-1", policyVersion: 4, configurationRevisionId: "revision-1", expiresAt: "2026-08-15T00:00:00.000Z", version: 2, createdAt: "" })),
    countToolInvocations: vi.fn(async () => options.invocationCount ?? 0),
    reserveBudget: vi.fn(async () => options.budgetResult ?? "reserved" as const), appendAudit: vi.fn(async () => undefined),
    appendProvenance: vi.fn(async () => undefined),
  };
  const policy = {
    evaluate: vi.fn(),
    evaluateInSession: vi.fn(async () => ({ effect: options.policyEffect ?? "ALLOW", policyVersion: 4, reasonCode: "rule", matchedRuleIds: ["rule-1"], evaluatedAt: "2026-08-14T12:00:00.000Z" })),
  };
  let id = 0;
  const service = new ToolRegistryService(
    repository as unknown as Pick<AgenticRepository, "findAgentByClientId" | "findTaskForAgent" | "findRevision" | "findTool" | "findToolGrant" | "findModelConfiguration" | "findActiveRevocation" | "findApproval" | "reserveBudget" | "appendAudit" | "appendProvenance" | "countToolInvocations">,
    policy as unknown as PolicyEvaluator, transactions, () => `id-${++id}`,
    () => "2026-08-14T12:00:00.000Z",
  );
  return { service, repository };
}
