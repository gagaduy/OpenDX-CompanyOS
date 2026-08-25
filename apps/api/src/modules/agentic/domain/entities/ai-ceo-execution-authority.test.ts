// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";
import {
  createAiCeoExecutionAuthority,
  type AiCeoExecutionAuthorityDraft,
  type AiCeoExecutionPayload,
} from "./ai-ceo-execution-authority";
import { canonicalDigest } from "./orchestration-execution-descriptor";

const uuid = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;

const draft = (
  overrides: Partial<AiCeoExecutionAuthorityDraft> = {},
): AiCeoExecutionAuthorityDraft => ({
  id: uuid(1),
  version: 1,
  purpose: "orchestration_planning",
  taskId: uuid(2),
  configurationRevisionId: uuid(3),
  policyVersion: 4,
  primaryModel: "provider/primary",
  fallbackModel: "provider/fallback",
  resultSchemaName: "orchestration_plan_proposal_v1",
  resultSchemaDigest: canonicalDigest(payload().resultSchema),
  authorizedContextDigest: canonicalDigest(payload().authorizedContext),
  budgetAuthorizationMicros: 10_000,
  timeoutSeconds: 30,
  expiresAt: "2026-08-25T02:10:00.000Z",
  createdAt: "2026-08-25T02:00:00.000Z",
  ...overrides,
});

const payload = (
  overrides: Partial<AiCeoExecutionPayload> = {},
): AiCeoExecutionPayload => ({
  resultSchema: {
    type: "object", additionalProperties: false,
    properties: { subtasks: { type: "array" } }, required: ["subtasks"],
  },
  authorizedContext: {
    taskBriefDigest: "c".repeat(64),
    eligibleAssignments: [{ agentKind: "catalog" }],
  },
  ...overrides,
});

describe("AI CEO execution authority", () => {
  it("binds every server-owned field and private payload into canonical digests", () => {
    const first = createAiCeoExecutionAuthority(draft(), payload());
    const reordered = createAiCeoExecutionAuthority(draft(), payload({
      authorizedContext: {
        eligibleAssignments: [{ agentKind: "catalog" }],
        taskBriefDigest: "c".repeat(64),
      },
    }));
    const changed = createAiCeoExecutionAuthority(
      draft({ primaryModel: "provider/changed" }), payload(),
    );

    expect(first.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.authorityDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toEqual(first);
    expect(changed.authorityDigest).not.toBe(first.authorityDigest);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("canonicalizes valid timestamp spellings before binding the authority digest", () => {
    const canonical = createAiCeoExecutionAuthority(draft(), payload());
    const offset = createAiCeoExecutionAuthority(draft({
      createdAt: "2026-08-25T09:00:00+07:00",
      expiresAt: "2026-08-25T09:10:00+07:00",
    }), payload());

    expect(offset).toEqual(canonical);
    expect(offset.createdAt).toBe("2026-08-25T02:00:00.000Z");
    expect(offset.expiresAt).toBe("2026-08-25T02:10:00.000Z");
  });

  it("requires planVersion only for executive synthesis", () => {
    expectCode(
      () => createAiCeoExecutionAuthority(draft({ planVersion: 1 }), payload()),
      "AI_CEO_EXECUTION_AUTHORITY_INVALID",
    );
    expectCode(
      () => createAiCeoExecutionAuthority(
        draft({ purpose: "executive_synthesis" }), payload(),
      ),
      "AI_CEO_EXECUTION_AUTHORITY_INVALID",
    );

    expect(createAiCeoExecutionAuthority(draft({
      purpose: "executive_synthesis", planVersion: 1,
      resultSchemaName: "store_health_ai_ceo_report_v1",
    }), payload()).planVersion).toBe(1);
  });

  it("rejects credential-like fields at any payload depth", () => {
    expectCode(() => createAiCeoExecutionAuthority(draft(), payload({
      authorizedContext: { nested: [{ client_secret: "must-not-persist" }] },
    })), "AI_CEO_EXECUTION_PAYLOAD_INVALID");
    for (const key of ["apiKey", "api_key", "accessKey"]) {
      expectCode(() => createAiCeoExecutionAuthority(draft(), payload({
        authorizedContext: { nested: [{ [key]: "must-not-persist" }] },
      })), "AI_CEO_EXECUTION_PAYLOAD_INVALID");
    }
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
