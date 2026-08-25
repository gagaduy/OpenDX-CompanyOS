// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { AgenticDomainError } from "../exceptions/agentic-domain.error";
import { canonicalDigest } from "./orchestration-execution-descriptor";

export type AiCeoExecutionPurpose =
  | "orchestration_planning"
  | "executive_synthesis";

export interface AiCeoExecutionPayload {
  readonly resultSchema: Readonly<Record<string, unknown>>;
  readonly authorizedContext: Readonly<Record<string, unknown>>;
}

export interface AiCeoExecutionAuthorityDraft {
  readonly id: string;
  readonly version: number;
  readonly purpose: AiCeoExecutionPurpose;
  readonly taskId: string;
  readonly planVersion?: number;
  readonly configurationRevisionId: string;
  readonly policyVersion: number;
  readonly primaryModel: string;
  readonly fallbackModel: string;
  readonly resultSchemaName: string;
  readonly resultSchemaDigest: string;
  readonly authorizedContextDigest: string;
  readonly budgetAuthorizationMicros: number;
  readonly timeoutSeconds: number;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface AiCeoExecutionAuthority extends AiCeoExecutionAuthorityDraft {
  readonly payloadDigest: string;
  readonly authorityDigest: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$/;
const SENSITIVE_KEY = /(apikey|accesskey|authorization|credential|password|privatekey|secret|token)/;
const MAX_PAYLOAD_DEPTH = 16;

export function createAiCeoExecutionAuthority(
  draft: AiCeoExecutionAuthorityDraft,
  payload: AiCeoExecutionPayload,
): AiCeoExecutionAuthority {
  validateDraft(draft);
  validatePayload(payload);
  const normalizedDraft = {
    ...draft,
    createdAt: new Date(draft.createdAt).toISOString(),
    expiresAt: new Date(draft.expiresAt).toISOString(),
  };
  if (
    canonicalDigest(payload.resultSchema) !== normalizedDraft.resultSchemaDigest
    || canonicalDigest(payload.authorizedContext) !== normalizedDraft.authorizedContextDigest
  ) {
    fail("AI_CEO_EXECUTION_AUTHORITY_INVALID", "AI CEO authority payload binding is invalid");
  }
  const payloadDigest = canonicalDigest(payload);
  const authorityDigest = canonicalDigest({ ...normalizedDraft, payloadDigest });
  return Object.freeze({ ...normalizedDraft, payloadDigest, authorityDigest });
}

export function validateAiCeoExecutionAuthority(
  authority: AiCeoExecutionAuthority,
  payload: AiCeoExecutionPayload,
): void {
  const { payloadDigest, authorityDigest, ...draft } = authority;
  const expected = createAiCeoExecutionAuthority(draft, payload);
  if (
    payloadDigest !== expected.payloadDigest
    || authorityDigest !== expected.authorityDigest
  ) {
    fail("AI_CEO_EXECUTION_AUTHORITY_INVALID", "AI CEO authority digests are invalid");
  }
}

function validateDraft(draft: AiCeoExecutionAuthorityDraft): void {
  const createdAt = instant(draft.createdAt);
  const expiresAt = instant(draft.expiresAt);
  const planBindingValid = draft.purpose === "orchestration_planning"
    ? draft.planVersion === undefined
    : positive(draft.planVersion);
  if (
    !UUID.test(draft.id)
    || !UUID.test(draft.taskId)
    || !UUID.test(draft.configurationRevisionId)
    || !["orchestration_planning", "executive_synthesis"].includes(draft.purpose)
    || !planBindingValid
    || !positive(draft.version)
    || !positive(draft.policyVersion)
    || !positive(draft.budgetAuthorizationMicros)
    || !positive(draft.timeoutSeconds)
    || !SAFE_IDENTIFIER.test(draft.primaryModel)
    || !SAFE_IDENTIFIER.test(draft.fallbackModel)
    || !SAFE_IDENTIFIER.test(draft.resultSchemaName)
    || !DIGEST.test(draft.resultSchemaDigest)
    || !DIGEST.test(draft.authorizedContextDigest)
    || createdAt === undefined
    || expiresAt === undefined
    || expiresAt <= createdAt
  ) {
    fail("AI_CEO_EXECUTION_AUTHORITY_INVALID", "AI CEO execution authority is invalid");
  }
}

function validatePayload(payload: AiCeoExecutionPayload): void {
  if (!plainObject(payload) || !plainObject(payload.resultSchema)
    || !plainObject(payload.authorizedContext)) {
    fail("AI_CEO_EXECUTION_PAYLOAD_INVALID", "AI CEO execution payload is invalid");
  }
  inspectJson(payload, 0, new Set());
}

function inspectJson(value: unknown, depth: number, seen: Set<object>): void {
  if (depth > MAX_PAYLOAD_DEPTH) {
    fail("AI_CEO_EXECUTION_PAYLOAD_INVALID", "AI CEO execution payload is too deeply nested");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    fail("AI_CEO_EXECUTION_PAYLOAD_INVALID", "AI CEO execution payload number is invalid");
  }
  if (typeof value !== "object" || seen.has(value)) {
    fail("AI_CEO_EXECUTION_PAYLOAD_INVALID", "AI CEO execution payload must be acyclic JSON");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) inspectJson(item, depth + 1, seen);
      return;
    }
    if (!plainObject(value)) {
      fail("AI_CEO_EXECUTION_PAYLOAD_INVALID", "AI CEO execution payload object is invalid");
    }
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key.replace(/[^A-Za-z]/g, "").toLowerCase())) {
        fail("AI_CEO_EXECUTION_PAYLOAD_INVALID", "AI CEO execution payload contains a sensitive field");
      }
      inspectJson(item, depth + 1, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function instant(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fail(code: string, message: string): never {
  throw new AgenticDomainError(code, message);
}
