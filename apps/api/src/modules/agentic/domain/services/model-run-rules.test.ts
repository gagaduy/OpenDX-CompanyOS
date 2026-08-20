// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { ModelRun } from "../entities/model-run";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";
import {
  calculateMaximumModelRunReservation,
  transitionModelRun,
  validateModelQualityEvidence,
  validateModelRun,
} from "./model-run-rules";

describe("model run rules", () => {
  it("calculates each token component with exact integer ceiling", () => {
    expect(calculateMaximumModelRunReservation({
      maxInputTokens: 1_000_001,
      maxOutputTokens: 1,
      inputCostMicrosPerMillion: 1,
      outputCostMicrosPerMillion: 1,
    })).toBe(3);
  });

  it("allows a zero reservation for a free model", () => {
    expect(calculateMaximumModelRunReservation({
      maxInputTokens: 8_000,
      maxOutputTokens: 2_000,
      inputCostMicrosPerMillion: 0,
      outputCostMicrosPerMillion: 0,
    })).toBe(0);
  });

  it.each([
    ["boolean", true],
    ["fraction", 1.5],
    ["negative", -1],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects a %s pricing operand", (_case, value) => {
    expectDomainError(() => calculateMaximumModelRunReservation({
      maxInputTokens: 1,
      maxOutputTokens: 1,
      inputCostMicrosPerMillion: value as number,
      outputCostMicrosPerMillion: 1,
    }), "MODEL_RUN_COST_INVALID");
  });

  it("rejects a reservation that exceeds the safe integer range", () => {
    expectDomainError(() => calculateMaximumModelRunReservation({
      maxInputTokens: Number.MAX_SAFE_INTEGER,
      maxOutputTokens: Number.MAX_SAFE_INTEGER,
      inputCostMicrosPerMillion: Number.MAX_SAFE_INTEGER,
      outputCostMicrosPerMillion: Number.MAX_SAFE_INTEGER,
    }), "MODEL_RUN_COST_INVALID");
  });

  it("transitions reserved to running with optimistic versioning", () => {
    const transitioned = transitionModelRun(modelRun(), {
      type: "start",
      returnedModel: "z-ai/glm-5.2:free",
      fallbackPosition: 0,
    }, "2026-08-19T01:01:00.000Z");

    expect(transitioned).toMatchObject({
      status: "running",
      returnedModel: "z-ai/glm-5.2:free",
      fallbackPosition: 0,
      version: 2,
      startedAt: "2026-08-19T01:01:00.000Z",
    });
  });

  it.each(["completed", "failed", "partial", "escalated"] as const)(
    "transitions running to terminal %s",
    (status) => {
      const running = transitionModelRun(modelRun(), {
        type: "start",
        returnedModel: "z-ai/glm-5.2:free",
        fallbackPosition: 0,
      }, "2026-08-19T01:01:00.000Z");
      const transitioned = transitionModelRun(running, {
        type: "settle",
        status,
        outputDigest: "b".repeat(64),
        inputTokens: 11,
        outputTokens: 7,
        settledCostMicros: 0,
        providerRequestIdDigest: "c".repeat(64),
        latencyMs: 25,
        statusCode: status === "completed" ? "MODEL_RESULT_ACCEPTED" : "MODEL_RESULT_NOT_ACCEPTED",
        errorCode: status === "failed" ? "PROVIDER_UNAVAILABLE" : undefined,
        qualityReasonCodes: status === "completed" ? [] : ["AUTHORITATIVE_EVIDENCE_MISSING"],
        provenanceIds: ["evidence-1"],
      }, "2026-08-19T01:02:00.000Z");

      expect(transitioned).toMatchObject({ status, version: 3, completedAt: "2026-08-19T01:02:00.000Z" });
    },
  );

  it("rejects illegal and terminal lifecycle transitions", () => {
    expectDomainError(() => transitionModelRun(modelRun(), {
      type: "settle",
      status: "failed",
      inputTokens: 0,
      outputTokens: 0,
      settledCostMicros: 0,
      latencyMs: 0,
      statusCode: "PROVIDER_UNAVAILABLE",
      errorCode: "PROVIDER_UNAVAILABLE",
      qualityReasonCodes: [],
      provenanceIds: [],
    }, "2026-08-19T01:01:00.000Z"), "MODEL_RUN_STATE_INVALID");

    const running = transitionModelRun(modelRun(), {
      type: "start", returnedModel: "z-ai/glm-5.2:free", fallbackPosition: 0,
    }, "2026-08-19T01:01:00.000Z");
    const completed = transitionModelRun(running, {
      type: "settle", status: "completed", outputDigest: "b".repeat(64),
      inputTokens: 1, outputTokens: 1, settledCostMicros: 0,
      providerRequestIdDigest: "c".repeat(64), latencyMs: 1,
      statusCode: "MODEL_RESULT_ACCEPTED", qualityReasonCodes: [], provenanceIds: ["evidence-1"],
    }, "2026-08-19T01:02:00.000Z");
    expectDomainError(() => transitionModelRun(completed, {
      type: "start", returnedModel: "other", fallbackPosition: 1,
    }, "2026-08-19T01:03:00.000Z"), "MODEL_RUN_STATE_INVALID");
  });

  it("rejects a completed run without output and provider request digests", () => {
    const running = transitionModelRun(modelRun(), {
      type: "start", returnedModel: "z-ai/glm-5.2:free", fallbackPosition: 0,
    }, "2026-08-19T01:01:00.000Z");
    expectDomainError(() => transitionModelRun(running, {
      type: "settle", status: "completed", inputTokens: 1, outputTokens: 1,
      settledCostMicros: 0, latencyMs: 1, statusCode: "MODEL_RESULT_ACCEPTED",
      qualityReasonCodes: [], provenanceIds: ["evidence-1"],
    }, "2026-08-19T01:02:00.000Z"), "MODEL_RUN_INVALID");
  });

  it("rejects settlement cost above the reserved maximum", () => {
    const running = transitionModelRun(modelRun(), {
      type: "start", returnedModel: "z-ai/glm-5.2:free", fallbackPosition: 0,
    }, "2026-08-19T01:01:00.000Z");
    expectDomainError(() => transitionModelRun(running, {
      type: "settle", status: "failed", inputTokens: 0, outputTokens: 0,
      settledCostMicros: 1, latencyMs: 1, statusCode: "PROVIDER_UNAVAILABLE",
      errorCode: "PROVIDER_UNAVAILABLE", qualityReasonCodes: [], provenanceIds: [],
    }, "2026-08-19T01:02:00.000Z"), "MODEL_RUN_INVALID");
  });

  it("validates bounded append-only quality evidence metadata", () => {
    const evidence = {
      id: "a1900000-0000-4000-8000-000000000004",
      modelRunId: "a1900000-0000-4000-8000-000000000001",
      generationRound: 0 as const,
      idempotencyKey: "quality:ai-ceo:0",
      outcome: "accepted" as const,
      reasonCodes: ["MODEL_RESULT_ACCEPTED"],
      provenanceIds: ["evidence-1"],
      evidenceDigest: "d".repeat(64),
      recordedAt: "2026-08-19T01:02:00.000Z",
    };
    expect(() => validateModelQualityEvidence(evidence)).not.toThrow();
    for (const overrides of [
      { generationRound: 3 },
      { idempotencyKey: "unsafe key" },
      { reasonCodes: ["unsafe reason"] },
      { provenanceIds: ["duplicate", "duplicate"] },
      { evidenceDigest: "not-a-digest" },
    ]) {
      expectDomainError(
        () => validateModelQualityEvidence({ ...evidence, ...overrides } as typeof evidence),
        "MODEL_QUALITY_EVIDENCE_INVALID",
      );
    }
  });

  it("accepts strict ISO timestamps with an explicit numeric offset", () => {
    expect(() => validateModelRun(modelRun({
      createdAt: "2026-08-19T08:00:00.000+07:00",
      updatedAt: "2026-08-19T08:00:01.000+07:00",
    }))).not.toThrow();
  });

  it.each([
    { createdAt: "not-a-date" },
    { createdAt: "2026-08-19T01:00:00" },
    { updatedAt: "2026-08-19T00:59:59.999Z" },
    { completedAt: "2026-08-19T01:01:00.000Z" },
  ])("rejects malformed or inconsistent reservation timestamps %#", (overrides) => {
    expectDomainError(
      () => validateModelRun(modelRun(overrides)),
      "MODEL_RUN_INVALID",
    );
  });

  it("rejects running timestamps before creation or after update", () => {
    for (const overrides of [
      { startedAt: "2026-08-19T00:59:59.999Z", updatedAt: "2026-08-19T01:01:00.000Z" },
      { startedAt: "2026-08-19T01:02:00.000Z", updatedAt: "2026-08-19T01:01:00.000Z" },
      { startedAt: "2026-08-19T01:01:00" },
    ]) {
      expectDomainError(() => validateModelRun(modelRun({
        status: "running",
        returnedModel: "z-ai/glm-5.2:free",
        fallbackPosition: 0,
        ...overrides,
      })), "MODEL_RUN_INVALID");
    }
  });

  it("rejects terminal completion before start or after update", () => {
    const terminal = modelRun({
      status: "failed",
      returnedModel: "z-ai/glm-5.2:free",
      fallbackPosition: 0,
      inputTokens: 0,
      outputTokens: 0,
      settledCostMicros: 0,
      latencyMs: 1,
      statusCode: "PROVIDER_UNAVAILABLE",
      errorCode: "PROVIDER_UNAVAILABLE",
      startedAt: "2026-08-19T01:02:00.000Z",
      completedAt: "2026-08-19T01:01:00.000Z",
      updatedAt: "2026-08-19T01:03:00.000Z",
    });
    expectDomainError(() => validateModelRun(terminal), "MODEL_RUN_INVALID");
    expectDomainError(() => validateModelRun({
      ...terminal,
      completedAt: "2026-08-19T01:04:00.000Z",
    }), "MODEL_RUN_INVALID");
  });

  it.each([
    { generationRound: 3 },
    { fallbackPosition: 2 },
    { inputDigest: "raw-input" },
    { requestedModel: "" },
    { idempotencyKey: "x".repeat(257) },
    { qualityReasonCodes: ["unsafe reason with spaces"] },
    { provenanceIds: ["x".repeat(257)] },
  ])("rejects unsafe bounded model run fields %#", (overrides) => {
    expectDomainError(() => validateModelRun({ ...modelRun(), ...overrides } as ModelRun), "MODEL_RUN_INVALID");
  });
});

function modelRun(overrides: Partial<ModelRun> = {}): ModelRun {
  return {
    id: "a1900000-0000-4000-8000-000000000001",
    taskId: "a1900000-0000-4000-8000-000000000002",
    agentKind: "ai_ceo",
    configurationRevisionId: "a1900000-0000-4000-8000-000000000003",
    schemaVersion: 1,
    generationRound: 0,
    idempotencyKey: "model-run:task:ai-ceo:0",
    requestedModel: "z-ai/glm-5.2:free",
    policyVersion: 1,
    configurationVersion: 1,
    resultSchemaVersion: 1,
    inputDigest: "a".repeat(64),
    inputCostMicrosPerMillion: 0,
    outputCostMicrosPerMillion: 0,
    maxReservedCostMicros: 0,
    status: "reserved",
    qualityReasonCodes: [],
    provenanceIds: [],
    version: 1,
    createdAt: "2026-08-19T01:00:00.000Z",
    updatedAt: "2026-08-19T01:00:00.000Z",
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
