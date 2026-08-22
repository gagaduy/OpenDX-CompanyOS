// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";
import {
  createExecutionDescriptor,
  type ExecutionDescriptorDraft,
  type ExecutionDescriptorPayload,
} from "./orchestration-execution-descriptor";

const uuid = (suffix: number): string => `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;

const draft = (overrides: Partial<ExecutionDescriptorDraft> = {}): ExecutionDescriptorDraft => ({
  id: uuid(1),
  version: 1,
  taskId: uuid(2),
  planVersion: 1,
  subtaskId: uuid(3),
  agentKind: "catalog",
  configurationRevisionId: uuid(4),
  policyVersion: 2,
  primaryModel: "provider/primary",
  fallbackModel: "provider/fallback",
  resultSchemaName: "store_health.catalog.v1",
  resultSchemaDigest: "a".repeat(64),
  authorizedContextDigest: "b".repeat(64),
  allowedToolsDigest: "c".repeat(64),
  budgetAuthorizationMicros: 10_000,
  timeoutSeconds: 30,
  freshnessSeconds: 60,
  expiresAt: "2026-08-22T15:10:00.000Z",
  createdAt: "2026-08-22T15:00:00.000Z",
  ...overrides,
});

const payload = (overrides: Partial<ExecutionDescriptorPayload> = {}): ExecutionDescriptorPayload => ({
  taskBrief: { goal: "Review store health", taskId: uuid(2) },
  resultSchema: { additionalProperties: false, properties: {}, type: "object" },
  authorizedContext: [{ classification: "internal", provenanceId: uuid(5), sourceDigest: "d".repeat(64) }],
  toolGrants: [{
    name: "catalog.product_completeness",
    version: 1,
    purpose: "store_health_review",
    dataScope: "catalog:health:read",
    dataClassification: "internal",
    maximumInvocations: 5,
    parameterTemplate: "empty",
  }],
  ...overrides,
});

describe("orchestration execution descriptor", () => {
  it("binds the payload and every authority field into canonical digests", () => {
    const first = createExecutionDescriptor(draft(), payload());
    const reordered = createExecutionDescriptor(draft(), payload({
      taskBrief: { taskId: uuid(2), goal: "Review store health" },
    }));
    const changed = createExecutionDescriptor(draft({ primaryModel: "provider/changed" }), payload());

    expect(first.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.descriptorDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered.payloadDigest).toBe(first.payloadDigest);
    expect(reordered.descriptorDigest).toBe(first.descriptorDigest);
    expect(changed.descriptorDigest).not.toBe(first.descriptorDigest);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("rejects secrets in the private payload at any depth", () => {
    expectCode(() => createExecutionDescriptor(draft(), payload({
      authorizedContext: [{ nested: { accessToken: "must-not-persist" } }],
    })), "EXECUTION_DESCRIPTOR_PAYLOAD_INVALID");
  });

  it("rejects non-department owners and expired descriptors", () => {
    expectCode(() => createExecutionDescriptor(
      draft({ agentKind: "ai_ceo" as "catalog" }), payload(),
    ), "EXECUTION_DESCRIPTOR_INVALID");
    expectCode(() => createExecutionDescriptor(draft({
      expiresAt: "2026-08-22T15:00:00.000Z",
    }), payload()), "EXECUTION_DESCRIPTOR_INVALID");
  });
});

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error("Expected AgenticDomainError");
  } catch (error) {
    expect(error).toBeInstanceOf(AgenticDomainError);
    expect((error as AgenticDomainError).code).toBe(code);
  }
}
