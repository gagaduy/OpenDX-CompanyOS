// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { AgenticRepository } from "../../repositories/interfaces/agentic.repository";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";
import { ModelRunServiceImpl } from "./model-run.service";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = {
  run: (work) => work(session),
  runReadOnly: (work) => work(session),
};
const now = "2026-08-20T03:00:00.000Z";
const digest = "a".repeat(64);
const evidenceDigest = "b".repeat(64);
const providerDigest = "c".repeat(64);
const outputDigest = "d".repeat(64);
const provenanceId = "11111111-1111-4111-8111-111111111111";
const alternateProvenanceId = "12121212-1212-4212-8212-121212121212";
const principal = {
  subject: "service-account-opendx-agentic-worker",
  clientId: "opendx-agentic-worker",
  workload: "agentic_worker" as const,
};
const primaryModel = "google/gemma-4-26b-a4b-it:free";
const fallbackModel = "liquid/lfm-2.5-2.6b:free";
const reserveCommand = {
  taskId: "22222222-2222-4222-8222-222222222222",
  agentKind: "catalog" as const,
  generationRound: 0 as const,
  idempotencyKey: "catalog-round-0",
  inputDigest: digest,
  resultSchemaName: "store_health_catalog_v1",
  resultSchemaDigest: "7".repeat(64),
  primaryModel,
  fallbackModel,
};

describe("ModelRunServiceImpl", () => {
  it("reserves the pinned approved model pair and exact maximum cost atomically", async () => {
    const harness = createHarness();

    const result = await harness.service.reserve(reserveCommand, principal);

    expect(result).toMatchObject({
      runId: "00000000-0000-4000-8000-000000000001",
      primaryModel,
      fallbackModel,
      maxInputTokens: 1_000,
      maxOutputTokens: 500,
      timeoutMs: 5_000,
      schemaVersion: 1,
      inputCostMicrosPerMillion: 2_000,
      outputCostMicrosPerMillion: 4_000,
      maxReservedCostMicros: 4,
      version: 1,
    });
    expect(harness.repository.reserveModelRun).toHaveBeenCalledWith(session, expect.objectContaining({
      taskId: reserveCommand.taskId,
      configurationRevisionId: "33333333-3333-4333-8333-333333333333",
      requestedModel: primaryModel,
      maxReservedCostMicros: 4,
      inputDigest: digest,
    }));
    expect(harness.repository.reserveBudget).toHaveBeenCalledWith(session, expect.objectContaining({
      taskId: reserveCommand.taskId,
      modelRunId: "00000000-0000-4000-8000-000000000001",
      costMicros: 4,
    }));
    expect(harness.transactionRuns()).toBe(1);
  });

  it("accepts a distinct configured paid and free model pair without a source-code allow-list", async () => {
    const configuredPrimary = "provider/paid-model";
    const configuredFallback = "provider/free-model";
    const harness = createHarness({
      primaryModel: configuredPrimary,
      fallbackModel: configuredFallback,
    });

    await expect(harness.service.reserve({
      ...reserveCommand,
      primaryModel: configuredPrimary,
      fallbackModel: configuredFallback,
    }, principal)).resolves.toMatchObject({
      primaryModel: configuredPrimary,
      fallbackModel: configuredFallback,
    });
  });

  it("fails closed before budget for assignment, configuration, model, revocation, and policy errors", async () => {
    const cases = [
      [{ taskAssigned: false }, "TASK_AGENT_MISMATCH"],
      [{ revisionState: "draft" as const }, "CONFIGURATION_INVALID"],
      [{ agentActive: false }, "AGENT_NOT_ACTIVE"],
      [{ revokedTarget: "agent" as const }, "MODEL_EXECUTION_REVOKED"],
      [{ revokedTarget: "model" as const }, "MODEL_EXECUTION_REVOKED"],
      [{ policyEffect: "DENY" as const }, "MODEL_POLICY_DENIED"],
    ] as const;
    for (const [options, code] of cases) {
      const harness = createHarness(options);
      await expect(harness.service.reserve(reserveCommand, principal)).rejects.toMatchObject({ code });
      expect(harness.repository.reserveBudget).not.toHaveBeenCalled();
    }

    const wrongPair = createHarness();
    await expect(wrongPair.service.reserve({ ...reserveCommand, fallbackModel: primaryModel }, principal))
      .rejects.toMatchObject({ code: "MODEL_CONFIGURATION_MISMATCH" });
    expect(wrongPair.repository.reserveBudget).not.toHaveBeenCalled();
  });

  it("returns exact duplicate reservations and rejects conflicting reuse or exhausted budgets", async () => {
    await expect(createHarness({ reservationResult: "duplicate" }).service.reserve(reserveCommand, principal))
      .resolves.toMatchObject({ runId: "00000000-0000-4000-8000-000000000001", version: 1 });
    await expect(createHarness({ reservationResult: "conflict" }).service.reserve(reserveCommand, principal))
      .rejects.toMatchObject({ code: "MODEL_RUN_CONFLICT" });
    await expect(createHarness({ budgetResult: "exceeded" }).service.reserve(reserveCommand, principal))
      .rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it.each(["running", "completed"] as const)(
    "returns the original reservation receipt after the run is %s and converges start replay",
    async (runState) => {
      const harness = createHarness({ reservationResult: "duplicate", runState });

      const receipt = await harness.service.reserve(reserveCommand, principal);

      expect(receipt).toEqual({
        runId: "00000000-0000-4000-8000-000000000001",
        primaryModel,
        fallbackModel,
        maxInputTokens: 1_000,
        maxOutputTokens: 500,
        timeoutMs: 5_000,
        schemaVersion: 1,
        inputCostMicrosPerMillion: 2_000,
        outputCostMicrosPerMillion: 4_000,
        maxReservedCostMicros: 4,
        version: 1,
      });
      await expect(harness.service.start({
        runId: receipt.runId,
        expectedVersion: receipt.version,
        returnedModel: primaryModel,
        fallbackPosition: 0,
      }, principal)).resolves.toMatchObject({ runId: receipt.runId, status: runState });
    },
  );

  it.each([
    [{ taskAssigned: false }, reserveCommand, "TASK_AGENT_MISMATCH"],
    [{ policyEffect: "DENY" as const }, reserveCommand, "MODEL_POLICY_DENIED"],
    [{ revokedTarget: "model" as const }, reserveCommand, "MODEL_EXECUTION_REVOKED"],
    [{ budgetResult: "exceeded" as const }, reserveCommand, "BUDGET_EXCEEDED"],
    [{}, { ...reserveCommand, fallbackModel: primaryModel }, "MODEL_CONFIGURATION_MISMATCH"],
  ] as const)("durably audits rejected reservation %s after rollback", async (options, command, code) => {
    const harness = createHarness(options);

    await expect(harness.service.reserve(command, principal)).rejects.toMatchObject({ code });

    expect(harness.transactionRuns()).toBe(2);
    expect(harness.repository.appendAudit).toHaveBeenCalledOnce();
    expect(harness.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      actorId: principal.subject,
      clientId: principal.clientId,
      action: "model_run.reserve.denied",
      resourceType: "agentic_task",
      resourceId: reserveCommand.taskId,
      outcome: "denied",
      parametersDigest: digest,
      errorCode: code,
    }));
    const auditText = JSON.stringify(harness.repository.appendAudit.mock.calls);
    expect(auditText).not.toContain("secret prompt");
    expect(auditText).not.toContain(primaryModel);
    expect(auditText).not.toContain(fallbackModel);
  });

  it("fails closed with a safe signal when denial audit persistence fails", async () => {
    const harness = createHarness({ policyEffect: "DENY", auditFailure: true });

    await expect(harness.service.reserve(reserveCommand, principal))
      .rejects.toMatchObject({
        code: "AUDIT_UNAVAILABLE",
        message: "Audit evidence is unavailable",
      });
    expect(harness.transactionRuns()).toBe(2);
  });

  it("starts only the exact primary or fallback and handles replay and stale versions", async () => {
    const harness = createHarness();
    await expect(harness.service.start({
      runId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 1,
      returnedModel: fallbackModel,
      fallbackPosition: 1,
    }, principal)).resolves.toMatchObject({ status: "running", version: 2 });

    await expect(createHarness().service.start({
      runId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 1,
      returnedModel: "openai/not-approved",
      fallbackPosition: 1,
    }, principal)).rejects.toMatchObject({ code: "MODEL_RETURN_MISMATCH" });

    await expect(createHarness({ runState: "running" }).service.start({
      runId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 1,
      returnedModel: primaryModel,
      fallbackPosition: 0,
    }, principal)).resolves.toMatchObject({ status: "running", version: 2 });
    await expect(createHarness({ updateAccepted: false }).service.start({
      runId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 1,
      returnedModel: primaryModel,
      fallbackPosition: 0,
    }, principal)).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("converges an identical concurrent start after losing the optimistic update", async () => {
    const harness = createHarness({ updateAccepted: false, concurrentStart: true });

    await expect(harness.service.start({
      runId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 1,
      returnedModel: primaryModel,
      fallbackPosition: 0,
    }, principal)).resolves.toMatchObject({ status: "running", version: 2 });

    expect(harness.repository.findModelRun).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["model", { returnedModel: fallbackModel }],
    ["fallback", { fallbackPosition: 1 as const }],
    ["start time", { startedAt: "2026-08-20T03:00:01.000Z" }],
    ["idempotency", { idempotencyKey: "different-start" }],
    ["version", { version: 3 }],
  ])("rejects a concurrent start with changed %s", async (_field, concurrentStartChange) => {
    const harness = createHarness({
      updateAccepted: false,
      concurrentStart: true,
      concurrentStartChange,
    });

    await expect(harness.service.start({
      runId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 1,
      returnedModel: primaryModel,
      fallbackPosition: 0,
    }, principal)).rejects.toMatchObject({ code: "MODEL_RUN_CONFLICT" });
  });

  it("rechecks Agent and model revocation immediately before execution starts", async () => {
    const command = {
      runId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 1,
      returnedModel: primaryModel,
      fallbackPosition: 0 as const,
    };
    await expect(createHarness({ agentActive: false }).service.start(command, principal))
      .rejects.toMatchObject({ code: "AGENT_NOT_ACTIVE" });
    await expect(createHarness({ revokedTarget: "model" }).service.start(command, principal))
      .rejects.toMatchObject({ code: "MODEL_EXECUTION_REVOKED" });
  });

  it("durably audits rejected start without transitioning the run", async () => {
    const harness = createHarness();

    await expect(harness.service.start({
      runId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 1,
      returnedModel: "openai/not-approved",
      fallbackPosition: 0,
    }, principal)).rejects.toMatchObject({ code: "MODEL_RETURN_MISMATCH" });

    expect(harness.repository.markModelRunRunning).not.toHaveBeenCalled();
    expect(harness.transactionRuns()).toBe(2);
    expect(harness.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      action: "model_run.start.denied",
      resourceId: "00000000-0000-4000-8000-000000000001",
      outcome: "denied",
      errorCode: "MODEL_RETURN_MISMATCH",
    }));
  });

  it.each([
    ["completed", "accepted"],
    ["partial", "partial"],
    ["escalated", "escalate"],
  ] as const)("atomically settles %s with quality evidence, audit, and provenance", async (status, qualityOutcome) => {
    const harness = createHarness({ runState: "running" });
    const result = await harness.service.complete(terminalCommand(status, qualityOutcome), principal);

    expect(result).toMatchObject({ status, settledCostMicros: 2, version: 3 });
    expect(harness.repository.settleModelRunTerminal).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ status, settledCostMicros: 2, provenanceIds: [provenanceId] }),
      2,
    );
    expect(harness.repository.settleBudget).toHaveBeenCalledWith(session, expect.objectContaining({
      actualCostMicros: 2,
      modelRunId: "00000000-0000-4000-8000-000000000001",
    }));
    expect(harness.repository.appendModelQualityEvidence).toHaveBeenCalledWith(session, expect.objectContaining({
      outcome: qualityOutcome,
      evidenceDigest,
    }));
    expect(harness.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      action: "model_run.complete",
      parametersDigest: digest,
      resultDigest: outputDigest,
    }));
    expect(harness.repository.appendProvenance).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(harness.repository.appendAudit.mock.calls)).not.toContain("prompt");
    expect(harness.transactionRuns()).toBe(1);
  });

  it("rejects atomic orchestration settlements with any inexact execution binding", async () => {
    const binding = { taskId: reserveCommand.taskId, agentKind: "catalog" as const,
      configurationRevisionId: "33333333-3333-4333-8333-333333333333",
      policyVersion: 4, resultSchemaVersion: 1, inputDigest: digest,
      resultSchemaName: reserveCommand.resultSchemaName,
      resultSchemaDigest: reserveCommand.resultSchemaDigest };
    const conflicts = [
      { ...binding, taskId: "99999999-9999-4999-8999-999999999999" },
      { ...binding, agentKind: "inventory" as const },
      { ...binding, configurationRevisionId: "99999999-9999-4999-8999-999999999999" },
      { ...binding, policyVersion: 5 },
      { ...binding, resultSchemaVersion: 2 },
      { ...binding, resultSchemaName: "other_schema_v1" },
      { ...binding, resultSchemaDigest: "8".repeat(64) },
      { ...binding, inputDigest: "9".repeat(64) },
    ];
    for (const conflict of conflicts) {
      const harness = createHarness({ runState: "running" });
      await expect(harness.service.completeInSession(
        terminalCommand("completed", "accepted"), principal, session, conflict,
      )).rejects.toMatchObject({ code: "MODEL_RUN_BINDING_INVALID" });
      expect(harness.repository.settleModelRunTerminal).not.toHaveBeenCalled();
    }
  });

  it("allows empty atomic provenance only when the orchestration binding authorizes it", async () => {
    const harness = createHarness({ runState: "running", provenanceExists: false });
    const command = { ...terminalCommand("completed", "accepted"), provenanceIds: [] };
    const binding = { taskId: reserveCommand.taskId, agentKind: "catalog" as const,
      configurationRevisionId: "33333333-3333-4333-8333-333333333333",
      policyVersion: 4, resultSchemaVersion: 1, inputDigest: digest,
      resultSchemaName: reserveCommand.resultSchemaName,
      resultSchemaDigest: reserveCommand.resultSchemaDigest };

    await expect(harness.service.completeInSession(
      command, principal, session, { ...binding, allowEmptyProvenance: true },
    )).resolves.toMatchObject({ status: "completed" });
  });

  it("settles failed and zero-cost runs without requiring provider bodies", async () => {
    const failed = createHarness({ runState: "running" });
    await expect(failed.service.fail(failureCommand(), principal))
      .resolves.toMatchObject({ status: "failed", settledCostMicros: 2 });
    expect(failed.repository.settleModelRunTerminal).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ errorCode: "PROVIDER_TIMEOUT" }),
      2,
    );
    const terminalCall = (failed.repository.settleModelRunTerminal.mock.calls as unknown as
      readonly (readonly [unknown, { readonly outputDigest?: string }, number])[])[0];
    expect(terminalCall?.[1].outputDigest).toBeUndefined();
    expect(failed.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      action: "model_run.fail", outcome: "failed", errorCode: "PROVIDER_TIMEOUT",
    }));

    const free = createHarness({ runState: "running", inputPrice: 0, outputPrice: 0, maxReservedCost: 0 });
    await expect(free.service.fail(failureCommand(), principal))
      .resolves.toMatchObject({ settledCostMicros: 0 });
    expect(free.repository.settleBudget).toHaveBeenCalledWith(session, expect.objectContaining({ actualCostMicros: 0 }));
  });

  it("rejects stale, conflicting, over-budget, bad provenance, and illegal terminal payloads", async () => {
    const cases = [
      [{ terminalResult: "stale" as const }, terminalCommand(), "STALE_VERSION"],
      [{ terminalResult: "conflict" as const }, terminalCommand(), "MODEL_RUN_CONFLICT"],
      [{ maxReservedCost: 1 }, terminalCommand(), "MODEL_RUN_COST_EXCEEDED"],
      [{ provenanceExists: false }, terminalCommand(), "MODEL_PROVENANCE_INVALID"],
      [{ runState: "running" as const }, terminalCommand("completed", "partial"), "MODEL_QUALITY_OUTCOME_INVALID"],
    ] as const;
    for (const [options, command, code] of cases) {
      const harness = createHarness({ runState: "running", ...options });
      await expect(harness.service.complete(command, principal)).rejects.toMatchObject({ code });
    }
  });

  it("durably audits terminal semantic validation without business writes", async () => {
    const harness = createHarness({ runState: "running" });

    await expect(harness.service.complete(
      terminalCommand("completed", "partial"), principal,
    )).rejects.toMatchObject({ code: "MODEL_QUALITY_OUTCOME_INVALID" });

    expect(harness.repository.settleModelRunTerminal).not.toHaveBeenCalled();
    expect(harness.repository.settleBudget).not.toHaveBeenCalled();
    expect(harness.transactionRuns()).toBe(1);
    expect(harness.repository.appendAudit).toHaveBeenCalledWith(session, expect.objectContaining({
      action: "model_run.complete.denied",
      resourceId: "00000000-0000-4000-8000-000000000001",
      outcome: "denied",
      errorCode: "MODEL_QUALITY_OUTCOME_INVALID",
    }));
  });

  it("returns exact terminal replay and rejects payload conflicts", async () => {
    await expect(createHarness({
      runState: "completed", evidenceExists: true, settlementExists: true,
    }).service.complete(
      terminalCommand(), principal,
    )).resolves.toMatchObject({ status: "completed", version: 3 });
    await expect(createHarness({
      runState: "completed", evidenceExists: true, settlementExists: true,
    }).service.complete(
      { ...terminalCommand(), evidenceDigest: "e".repeat(64) }, principal,
    )).rejects.toMatchObject({ code: "MODEL_RUN_CONFLICT" });
  });

  it("accepts repository duplicate and equivalent concurrent terminal replay", async () => {
    const duplicate = createHarness({
      runState: "running", terminalResult: "duplicate", concurrentReplay: true,
      evidenceExists: true, settlementExists: true,
    });
    await expect(duplicate.service.complete(terminalCommand(), principal))
      .resolves.toMatchObject({ status: "completed", settledCostMicros: 2, version: 3 });
    expect(duplicate.repository.settleBudget).not.toHaveBeenCalled();
    expect(duplicate.repository.appendModelQualityEvidence).not.toHaveBeenCalled();
    expect(duplicate.repository.findModelRunBudgetSettlementByIdempotencyKey).toHaveBeenCalledWith(
      session, "catalog-round-0-terminal:budget",
    );

    const concurrent = createHarness({
      runState: "running",
      terminalResult: "conflict",
      concurrentReplay: true,
      evidenceExists: true,
      settlementExists: true,
    });
    await expect(concurrent.service.complete(terminalCommand(), principal))
      .resolves.toMatchObject({ status: "completed", settledCostMicros: 2, version: 3 });
    expect(concurrent.repository.settleBudget).not.toHaveBeenCalled();
  });

  it.each([
    ["evidence digest", { evidenceDigest: "e".repeat(64) }],
    ["quality reasons", { qualityReasonCodes: ["ARITHMETIC_MISMATCH"] }],
    ["provenance", { provenanceIds: [alternateProvenanceId] }],
    ["terminal idempotency", { idempotencyKey: "catalog-round-0-other-terminal" }],
  ] as const)("rejects repository duplicate with changed %s", async (_label, change) => {
    const harness = createHarness({
      runState: "running", terminalResult: "duplicate", concurrentReplay: true,
      evidenceExists: true, settlementExists: true,
    });

    await expect(harness.service.complete({ ...terminalCommand(), ...change }, principal))
      .rejects.toMatchObject({ code: "MODEL_RUN_CONFLICT" });
    expect(harness.repository.settleBudget).not.toHaveBeenCalled();
  });

  it("rejects equivalent terminal payload when persisted immutable run identity differs", async () => {
    const harness = createHarness({
      runState: "running", terminalResult: "duplicate", concurrentReplay: true,
      concurrentTaskId: "23232323-2323-4232-8232-232323232323",
      evidenceExists: true, settlementExists: true,
    });

    await expect(harness.service.complete(terminalCommand(), principal))
      .rejects.toMatchObject({ code: "MODEL_RUN_CONFLICT" });
  });
});

function terminalCommand(status: "completed" | "partial" | "escalated" = "completed", qualityOutcome: "accepted" | "partial" | "escalate" = "accepted") {
  return {
    runId: "00000000-0000-4000-8000-000000000001",
    expectedVersion: 2,
    idempotencyKey: "catalog-round-0-terminal",
    status,
    outputDigest,
    inputTokens: 500,
    outputTokens: 250,
    providerRequestIdDigest: providerDigest,
    latencyMs: 250,
    statusCode: "QUALITY_ACCEPTED",
    qualityOutcome,
    qualityReasonCodes: ["EVIDENCE_VALID"],
    provenanceIds: [provenanceId],
    evidenceDigest,
  } as const;
}

function failureCommand() {
  return {
    runId: "00000000-0000-4000-8000-000000000001",
    expectedVersion: 2,
    idempotencyKey: "catalog-round-0-failed",
    inputTokens: 500,
    outputTokens: 250,
    latencyMs: 250,
    statusCode: "PROVIDER_FAILED",
    errorCode: "PROVIDER_TIMEOUT",
    qualityOutcome: "correct" as const,
    qualityReasonCodes: ["PROVIDER_UNAVAILABLE"],
    provenanceIds: [provenanceId],
    evidenceDigest,
  };
}

function createHarness(options: {
  readonly taskAssigned?: boolean;
  readonly revisionState?: "active" | "superseded" | "draft";
  readonly agentActive?: boolean;
  readonly revokedTarget?: "agent" | "model";
  readonly policyEffect?: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  readonly reservationResult?: "reserved" | "duplicate" | "conflict";
  readonly budgetResult?: "reserved" | "duplicate" | "conflict" | "exceeded";
  readonly runState?: "reserved" | "running" | "completed";
  readonly updateAccepted?: boolean;
  readonly terminalResult?: "updated" | "duplicate" | "stale" | "conflict";
  readonly inputPrice?: number;
  readonly outputPrice?: number;
  readonly primaryModel?: string;
  readonly fallbackModel?: string;
  readonly maxReservedCost?: number;
  readonly provenanceExists?: boolean;
  readonly evidenceExists?: boolean;
  readonly concurrentReplay?: boolean;
  readonly concurrentStart?: boolean;
  readonly concurrentStartChange?: Readonly<Record<string, unknown>>;
  readonly auditFailure?: boolean;
  readonly settlementExists?: boolean;
  readonly concurrentTaskId?: string;
} = {}) {
  let transactionCount = 0;
  const countedTransactions: TransactionRunner = {
    run: async (work) => { transactionCount += 1; return work(session); },
    runReadOnly: (work) => work(session),
  };
  const inputPrice = options.inputPrice ?? 2_000;
  const outputPrice = options.outputPrice ?? 4_000;
  const configuredPrimaryModel = options.primaryModel ?? primaryModel;
  const configuredFallbackModel = options.fallbackModel ?? fallbackModel;
  const maxReservedCost = options.maxReservedCost ?? 4;
  const baseRun = {
    id: "00000000-0000-4000-8000-000000000001",
    taskId: reserveCommand.taskId,
    agentKind: "catalog" as const,
    configurationRevisionId: "33333333-3333-4333-8333-333333333333",
    schemaVersion: 1,
    generationRound: 0 as const,
    idempotencyKey: reserveCommand.idempotencyKey,
    requestedModel: configuredPrimaryModel,
    policyVersion: 4,
    configurationVersion: 4,
    resultSchemaVersion: 1,
    resultSchemaName: reserveCommand.resultSchemaName,
    resultSchemaDigest: reserveCommand.resultSchemaDigest,
    inputDigest: digest,
    inputCostMicrosPerMillion: inputPrice,
    outputCostMicrosPerMillion: outputPrice,
    maxReservedCostMicros: maxReservedCost,
    status: "reserved" as const,
    qualityReasonCodes: [],
    provenanceIds: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const runningRun = {
    ...baseRun,
    status: "running" as const,
    returnedModel: configuredPrimaryModel,
    fallbackPosition: 0 as const,
    version: 2,
    startedAt: now,
  };
  const completedRun = {
    ...runningRun,
    status: "completed" as const,
    outputDigest,
    inputTokens: 500,
    outputTokens: 250,
    settledCostMicros: 2,
    providerRequestIdDigest: providerDigest,
    latencyMs: 250,
    statusCode: "QUALITY_ACCEPTED",
    qualityReasonCodes: ["EVIDENCE_VALID"],
    provenanceIds: [provenanceId],
    version: 3,
    completedAt: now,
  };
  const concurrentStoredRun = options.concurrentTaskId === undefined
    ? completedRun
    : { ...completedRun, taskId: options.concurrentTaskId };
  const currentRun = options.runState === "running"
    ? runningRun
    : options.runState === "completed"
      ? completedRun
      : baseRun;
  const qualityEvidence = {
    id: "44444444-4444-4444-8444-444444444444",
    modelRunId: baseRun.id,
    generationRound: 0 as const,
    idempotencyKey: "catalog-round-0-terminal:quality",
    outcome: "accepted" as const,
    reasonCodes: ["EVIDENCE_VALID"],
    provenanceIds: [provenanceId],
    evidenceDigest,
    recordedAt: now,
  };
  const repository = {
    findTaskForAgent: vi.fn(async () => options.taskAssigned === false ? undefined : ({
      id: reserveCommand.taskId, state: "ready", createdBy: "operator", goal: "g", instructions: "secret prompt",
      configurationRevisionId: baseRun.configurationRevisionId, version: 2, createdAt: now, updatedAt: now,
    })),
    findTaskById: vi.fn().mockResolvedValue(undefined),
    hasActiveOrchestrationModelAuthority: vi.fn().mockResolvedValue(false),
    findRevision: vi.fn(async () => ({
      id: baseRun.configurationRevisionId, state: options.revisionState ?? "active", createdBy: "admin",
      payloadDigest: digest, version: 4, createdAt: now, updatedAt: now,
    })),
    findAgentByKind: vi.fn(async () => ({
      kind: "catalog", keycloakClientId: "agent-catalog", active: options.agentActive ?? true,
      version: 1, createdAt: now, updatedAt: now,
    })),
    findModelConfiguration: vi.fn(async () => ({
      revisionId: baseRun.configurationRevisionId, agentKind: "catalog", primaryModel: configuredPrimaryModel,
      fallbackModels: [configuredFallbackModel], maxInputTokens: 1_000, maxOutputTokens: 500,
      timeoutMs: 5_000, maxRetries: 1, inputCostMicrosPerMillion: inputPrice,
      outputCostMicrosPerMillion: outputPrice,
    })),
    findActiveRevocation: vi.fn(async (_session: unknown, targetType: string) =>
      targetType === options.revokedTarget ? { id: "revoked" } : undefined),
    reserveModelRun: vi.fn(async (_session: unknown, run: typeof baseRun) => ({
      status: options.reservationResult ?? "reserved",
      run: options.reservationResult === "duplicate" ? currentRun : run,
    })),
    reserveBudget: vi.fn(async () => options.budgetResult ?? "reserved"),
    findModelRun: options.concurrentReplay
      ? vi.fn().mockResolvedValueOnce(currentRun).mockResolvedValue(concurrentStoredRun)
      : options.concurrentStart
        ? vi.fn().mockResolvedValueOnce(baseRun).mockResolvedValue({
            ...runningRun,
            ...options.concurrentStartChange,
          })
        : vi.fn(async () => currentRun),
    markModelRunRunning: vi.fn(async () => options.updateAccepted ?? true),
    settleModelRunTerminal: vi.fn(async () => options.terminalResult ?? "updated"),
    findModelRunBudgetReservation: vi.fn(async () => ({ id: "55555555-5555-4555-8555-555555555555", costMicros: maxReservedCost })),
    settleBudget: vi.fn(async () => "settled" as const),
    appendModelQualityEvidence: vi.fn(async () => "created" as const),
    findModelQualityEvidenceByIdempotencyKey: vi.fn(async (_session: unknown, idempotencyKey: string) =>
      options.evidenceExists && idempotencyKey === qualityEvidence.idempotencyKey
        ? qualityEvidence
        : undefined),
    findModelRunBudgetSettlementByIdempotencyKey: vi.fn(async (_session: unknown, idempotencyKey: string) =>
      options.settlementExists && idempotencyKey === "catalog-round-0-terminal:budget"
        ? {
            reservationId: "55555555-5555-4555-8555-555555555555",
            modelRunId: baseRun.id,
            costMicros: 2,
          }
        : undefined),
    listProvenance: vi.fn(async () => options.provenanceExists === false
      ? []
      : [{ id: provenanceId }, { id: alternateProvenanceId }]),
    appendAudit: vi.fn(async () => {
      if (options.auditFailure === true) throw new Error("audit unavailable");
    }),
    appendProvenance: vi.fn(async () => undefined),
  };
  const policy = {
    evaluate: vi.fn(),
    evaluateInSession: vi.fn(async () => ({
      effect: options.policyEffect ?? "ALLOW", policyVersion: 4,
      reasonCode: "MODEL_EXECUTION_ALLOWED", matchedRuleIds: ["rule-1"], evaluatedAt: now,
    })),
  };
  let nextId = 0;
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "55555555-5555-4555-8555-555555555555",
    "66666666-6666-4666-8666-666666666666",
    "44444444-4444-4444-8444-444444444444",
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
  ];
  const service = new ModelRunServiceImpl(
    repository as unknown as AgenticRepository,
    countedTransactions,
    policy as unknown as PolicyEvaluator,
    () => ids[nextId++] ?? "99999999-9999-4999-8999-999999999999",
    () => now,
  );
  return { service, repository, transactionRuns: () => transactionCount };
}
