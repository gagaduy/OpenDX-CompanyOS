// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../../../../shared/observability/logger";
import { createMetricsRegistry } from "../../../../../shared/observability/metrics";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import { ZodDepartmentToolSchemaRegistry } from "../../../infrastructure/tools/zod-department-tool-schema.registry";
import { findDepartmentToolDescriptor } from "../../tools/department-tool-catalog";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import { AgenticApplicationError } from "../agentic-application.error";
import { ToolRegistryService } from "./tool-registry.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = { run: (work) => work(session), runReadOnly: (work) => work(session) };
const digest = "a".repeat(64);
const descriptor = findDepartmentToolDescriptor("catalog.product_completeness", 1)!;
const request = {
  principal: { subject: "service-account-agent-catalog", clientId: "agent-catalog", agentKind: "catalog" as const },
  taskId: "task-1", toolName: "catalog.product_completeness", toolVersion: 1, purpose: "store_health_review",
  modelId: "openai/gpt-5-mini",
  dataScope: "catalog:health:read", dataClassification: "internal", inputSchemaDigest: descriptor.inputSchemaDigest,
  parametersDigest: "b".repeat(64), costMicros: 1, idempotencyKey: "invoke-1",
  correlationId: "corr-1",
};
const invocation = {
  principal: request.principal,
  taskId: request.taskId,
  toolName: descriptor.name,
  toolVersion: 1 as const,
  purpose: "store_health_review" as const,
  modelId: request.modelId,
  dataScope: "catalog:health:read" as const,
  dataClassification: "internal" as const,
  parameters: {},
  idempotencyKey: request.idempotencyKey,
  correlationId: request.correlationId,
  causationId: "cause-1",
};

describe("ToolRegistryService", () => {
  it("fails closed for inactive identities and task assignment mismatch", async () => {
    const inactive = createHarness({ agentActive: false });
    await expect(inactive.service.authorize(request)).rejects.toMatchObject({ code: "AGENT_NOT_ACTIVE" });
    const mismatched = createHarness({ taskAssigned: false });
    await expect(mismatched.service.authorize(request)).rejects.toMatchObject({ code: "TASK_AGENT_MISMATCH" });
  });

  it("accepts a live orchestration descriptor as the Department task assignment", async () => {
    const harness = createHarness({ taskAssigned: false, orchestrationAssigned: true });

    await expect(harness.service.authorize(request)).resolves.toMatchObject({ effect: "ALLOW" });
    expect(harness.repository.hasActiveOrchestrationModelAuthority)
      .toHaveBeenCalledWith(session, "task-1", "catalog", "revision-1", expect.any(String));
    expect(harness.policy.evaluateInSession).toHaveBeenCalledWith(session, expect.objectContaining({
      department: "catalog",
    }));
  });

  it("rejects unknown tools, stale grants, scope, and parameter digests before budget", async () => {
    const cases = [
      [{ toolExists: false }, "TOOL_NOT_FOUND"],
      [{ grantExists: false }, "TOOL_GRANT_MISSING"],
      [{ grantScope: "orders:health:read" }, "TOOL_SCOPE_DENIED"],
      [{ invocationCount: 10 }, "TOOL_GRANT_EXHAUSTED"],
    ] as const;
    for (const [options, code] of cases) {
      const harness = createHarness(options);
      await expect(harness.service.invoke(invocation)).rejects.toMatchObject({ code });
      expect(harness.repository.reserveBudget).not.toHaveBeenCalled();
    }
    await expect(createHarness().service.invoke({ ...invocation, parameters: { sql: "SELECT 1" } }))
      .rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });

    const wrongScope = createHarness();
    await expect(wrongScope.service.invoke({ ...invocation, dataScope: "inventory:health:read" }))
      .rejects.toMatchObject({ code: "TOOL_SCOPE_DENIED" });
    expect(wrongScope.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      clientId: "agent-catalog",
      parametersDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      causationId: "cause-1",
      attempt: 0,
      durationMs: expect.any(Number),
      errorCode: "TOOL_SCOPE_DENIED",
      outcome: "denied",
    }));
  });

  it("honors policy denial and exact bound approval evidence", async () => {
    const denied = createHarness({ policyEffect: "DENY" });
    await expect(denied.service.invoke(invocation)).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(denied.repository.reserveBudget).not.toHaveBeenCalled();

    const approval = createHarness({ policyEffect: "REQUIRE_APPROVAL", approvalValid: false });
    await expect(approval.service.invoke({ ...invocation, approvalId: "approval-1" }))
      .rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(approval.repository.reserveBudget).not.toHaveBeenCalled();

    const wrongScope = createHarness({ policyEffect: "REQUIRE_APPROVAL", approvalScope: "emergency_revocation" });
    await expect(wrongScope.service.invoke({ ...invocation, approvalId: "approval-1" }))
      .rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });

    const budget = createHarness({ budgetResult: "exceeded" });
    await expect(budget.service.invoke(invocation)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(budget.repository.appendProvenance).not.toHaveBeenCalled();
  });

  it("denies every later authorization that selects a revoked model", async () => {
    const revoked = createHarness({ revokedTarget: "model" });

    await expect(revoked.service.authorize(request))
      .rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(revoked.repository.reserveBudget).not.toHaveBeenCalled();
  });

  it("executes an authorized adapter and stores the validated result", async () => {
    const harness = createHarness();
    const result = await harness.service.invoke<{ summary: { totalProducts: number } }>(invocation);
    expect(result.output.summary).toMatchObject({ totalProducts: 12 });
    expect(harness.adapter.execute).toHaveBeenCalledOnce();
    expect(harness.repository.reserveBudget).toHaveBeenCalledOnce();
    expect(harness.repository.reserveBudget).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ costMicros: 1 }),
    );
    expect(harness.repository.completeToolInvocation).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ resultDigest: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
    expect(harness.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      outcome: "allowed", action: "tool.invoke", resourceId: "catalog.product_completeness@1",
      clientId: "agent-catalog", parametersDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      causationId: "cause-1", attempt: 1, durationMs: expect.any(Number),
    }));
    expect(harness.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      resultDigest: expect.stringMatching(/^[a-f0-9]{64}$/), attempt: 1,
    }));
    expect(harness.repository.appendProvenance).toHaveBeenCalledWith(session, expect.objectContaining({
      sourceVersion: 1, normalizedWindow: {}, sourceSnapshotAt: "2026-08-14T12:00:00.000Z",
    }));
    expect(JSON.stringify(harness.repository.appendAudit.mock.calls)).not.toContain("totalProducts");

    const replay = createHarness({ receiptKind: "completed" });
    await expect(replay.service.invoke(invocation)).resolves.toEqual(result);
    expect(replay.adapter.execute).not.toHaveBeenCalled();
  });

  it("scopes budget idempotency by agent and task", async () => {
    const first = createHarness();
    const second = createHarness();
    await first.service.invoke(invocation);
    await second.service.invoke({ ...invocation, taskId: "task-2" });
    const firstKey = first.repository.reserveBudget.mock.calls[0]?.[1].idempotencyKey;
    const secondKey = second.repository.reserveBudget.mock.calls[0]?.[1].idempotencyKey;
    expect(firstKey).toMatch(/^[a-f0-9]{64}$/);
    expect(secondKey).toMatch(/^[a-f0-9]{64}$/);
    expect(firstKey).not.toBe(secondKey);
  });

  it("rejects stale adapter output and records a stable terminal failure", async () => {
    const stale = createHarness({ outputRetrievedAt: "2026-08-14T11:58:00.000Z" });
    await expect(stale.service.invoke(invocation))
      .rejects.toMatchObject({ code: "TOOL_RESULT_STALE" });
    expect(stale.repository.completeToolInvocation).not.toHaveBeenCalled();
    expect(stale.repository.failToolInvocation).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ errorCode: "TOOL_RESULT_STALE", retryable: false }),
    );
  });

  it("marks only bounded source failures as retryable", async () => {
    const unavailable = createHarness({ adapterErrorCode: "TOOL_SOURCE_UNAVAILABLE" });
    await expect(unavailable.service.invoke(invocation))
      .rejects.toMatchObject({ code: "TOOL_SOURCE_UNAVAILABLE" });
    expect(unavailable.repository.failToolInvocation).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ errorCode: "TOOL_SOURCE_UNAVAILABLE", retryable: true }),
    );
  });

  it("emits bounded tool telemetry and always releases the active gauge", async () => {
    const lines: string[] = [];
    const logger = createLogger({ format: "json", level: "info", sink: (line) => lines.push(line) });
    const metrics = createMetricsRegistry();
    const observability = { logger, metrics, monotonicNow: vi.fn()
      .mockReturnValueOnce(100).mockReturnValueOnce(110)
      .mockReturnValueOnce(120).mockReturnValueOnce(125)
      .mockReturnValueOnce(200).mockReturnValueOnce(210)
      .mockReturnValueOnce(220).mockReturnValueOnce(240) };
    const completed = createHarness({ observability, outputSource: "result-canary-secret" });
    await completed.service.invoke(invocation);
    const failed = createHarness({ observability, adapterErrorCode: "TOOL_SOURCE_UNAVAILABLE" });
    await expect(failed.service.invoke({ ...invocation, idempotencyKey: "invoke-failed" }))
      .rejects.toMatchObject({ code: "TOOL_SOURCE_UNAVAILABLE" });

    const serialized = lines.join("\n");
    expect(serialized).not.toContain("result-canary-secret");
    expect(serialized).not.toContain(JSON.stringify(invocation.parameters));
    expect(lines.map((line) => JSON.parse(line))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "agentic_tool_invocation", tool: descriptor.name, toolVersion: 1,
        department: "catalog", outcome: "completed", errorCode: "NONE",
        correlationId: "corr-1", causationId: "cause-1", attempt: 1, durationMs: 25,
      }),
      expect.objectContaining({
        message: "agentic_tool_invocation", outcome: "retryable_failure",
        errorCode: "TOOL_SOURCE_UNAVAILABLE", durationMs: 40,
      }),
    ]));
    const rendered = metrics.render();
    expect(rendered).toContain('opendx_agentic_tool_active{tool="catalog.product_completeness",version="1",department="catalog"} 0');
    expect(rendered).toContain('outcome="completed",error="NONE"');
    expect(rendered).toContain('outcome="retryable_failure",error="TOOL_SOURCE_UNAVAILABLE"');
    expect(rendered).not.toMatch(/correlation|causation|task|client|subject/);
  });
});

function createHarness(options: {
  readonly agentActive?: boolean; readonly taskAssigned?: boolean; readonly toolExists?: boolean;
  readonly orchestrationAssigned?: boolean;
  readonly grantExists?: boolean; readonly grantScope?: string;
  readonly policyEffect?: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  readonly approvalValid?: boolean;
  readonly approvalScope?: "tool_invocation" | "emergency_revocation";
  readonly revokedTarget?: "agent" | "tool_grant" | "model";
  readonly invocationCount?: number; readonly budgetResult?: "reserved" | "duplicate" | "exceeded";
  readonly receiptKind?: "reserved" | "completed" | "in_progress" | "failed";
  readonly outputRetrievedAt?: string;
  readonly adapterErrorCode?: string;
  readonly outputSource?: string;
  readonly observability?: ConstructorParameters<typeof ToolRegistryService>[7];
} = {}) {
  const output = completenessOutput(options.outputRetrievedAt, options.outputSource);
  const repository = {
    findAgentByClientId: vi.fn(async () => ({ kind: "catalog", keycloakClientId: "agent-catalog", active: options.agentActive ?? true, version: 1, createdAt: "", updatedAt: "" })),
    findTaskForAgent: vi.fn(async () => options.taskAssigned === false ? undefined : ({ id: "task-1", state: "ready", createdBy: "operator", goal: "g", instructions: "i", configurationRevisionId: "revision-1", version: 1, createdAt: "", updatedAt: "" })),
    findTaskById: vi.fn(async () => options.orchestrationAssigned ? ({ id: "task-1", state: "ready", createdBy: "operator", goal: "g", instructions: "i", configurationRevisionId: "revision-1", version: 1, createdAt: "", updatedAt: "" }) : undefined),
    hasActiveOrchestrationModelAuthority: vi.fn(async () => options.orchestrationAssigned ?? false),
    findRevision: vi.fn(async () => ({ id: "revision-1", state: "active", createdBy: "admin", payloadDigest: digest, version: 4, createdAt: "", updatedAt: "" })),
    findTool: vi.fn(async () => options.toolExists === false ? undefined : ({ name: descriptor.name, version: 1, inputSchemaDigest: descriptor.inputSchemaDigest, outputSchemaDigest: descriptor.outputSchemaDigest, active: true, executionCostMicros: 1, maximumAttempts: 2 })),
    findToolGrant: vi.fn(async () => options.grantExists === false ? undefined : ({ id: "grant-1", revisionId: "revision-1", agentKind: "catalog", toolName: descriptor.name, toolVersion: 1, purpose: "store_health_review", dataScope: options.grantScope ?? "catalog:health:read", maxInvocations: 10 })),
    findModelConfiguration: vi.fn(async () => ({ revisionId: "revision-1", agentKind: "catalog", primaryModel: "openai/gpt-5-mini", fallbackModels: [], maxInputTokens: 1_000, maxOutputTokens: 500, timeoutMs: 5_000, maxRetries: 1, inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0 })),
    findActiveRevocation: vi.fn(async (_session, targetType: string) => targetType === options.revokedTarget ? ({ id: "revoked" }) : undefined),
    findApproval: vi.fn(async () => options.approvalValid === false ? undefined : ({ id: "approval-1", state: "approved", requesterId: "operator", approverScope: options.approvalScope ?? "tool_invocation", action: "tool.invoke", resourceType: "tool", resourceId: `${descriptor.name}@1`, parametersDigest: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a", taskId: "task-1", policyVersion: 4, configurationRevisionId: "revision-1", expiresAt: "2026-08-15T00:00:00.000Z", version: 2, createdAt: "" })),
    countToolInvocations: vi.fn(async () => options.invocationCount ?? 0),
    reserveBudget: vi.fn(async (
      _session: unknown,
      _input: { readonly idempotencyKey: string },
    ) => options.budgetResult ?? "reserved" as const), appendAudit: vi.fn(async () => undefined),
    appendProvenance: vi.fn(async () => undefined),
    reserveToolInvocation: vi.fn(async () => options.receiptKind === "completed"
      ? { kind: "completed" as const, invocationId: "invocation-1", attempt: 1, result: output }
      : options.receiptKind === "in_progress"
        ? { kind: "in_progress" as const, invocationId: "invocation-1", attempt: 1 }
        : options.receiptKind === "failed"
          ? { kind: "failed" as const, invocationId: "invocation-1", attempt: 1, errorCode: "TOOL_OUTPUT_INVALID" }
          : { kind: "reserved" as const, invocationId: "invocation-1", attempt: 1 }),
    completeToolInvocation: vi.fn(async () => true),
    failToolInvocation: vi.fn(async () => true),
  };
  const policy = {
    evaluate: vi.fn(),
    evaluateInSession: vi.fn(async () => ({ effect: options.policyEffect ?? "ALLOW", policyVersion: 4, reasonCode: "rule", matchedRuleIds: ["rule-1"], evaluatedAt: "2026-08-14T12:00:00.000Z" })),
  };
  let id = 0;
  const adapter = { execute: vi.fn(async () => {
    if (options.adapterErrorCode !== undefined) {
      throw new AgenticApplicationError(options.adapterErrorCode, "Safe adapter failure");
    }
    return output;
  }) };
  const adapters = { resolve: vi.fn(() => adapter) };
  const schemas = new ZodDepartmentToolSchemaRegistry(() => "2026-08-14T12:00:00.000Z");
  const service = new ToolRegistryService(
    repository as unknown as AgenticRepository,
    policy as unknown as PolicyEvaluator, transactions, adapters, schemas, () => `id-${++id}`,
    () => "2026-08-14T12:00:00.000Z",
    options.observability,
  );
  return { service, repository, adapter, adapters, policy };
}

function completenessOutput(
  retrievedAt = "2026-08-14T12:00:00.000Z",
  source = "catalog.health",
) {
  return {
    source,
    sourceVersion: 1 as const,
    retrievedAt,
    window: null,
    freshness: { asOf: retrievedAt, maxAgeSeconds: 60 as const, status: "fresh" as const },
    classification: "internal" as const,
    shareability: "executive_summary" as const,
    provenanceId: "11111111-1111-4111-8111-111111111111",
    summary: {
      totalProducts: 12, draftProducts: 2, publishedProducts: 10,
      missingBrand: 0, emptyAttributes: 0, withoutActiveVariant: 0,
      withoutCurrentPrice: 0, withoutMedia: 0, withoutPrimaryMedia: 0,
      completenessBasisPoints: 10_000,
    },
  };
}
