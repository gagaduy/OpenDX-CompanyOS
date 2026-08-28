// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { AgentKind } from "./agent-profile";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";

export type DepartmentAgentKind = Exclude<AgentKind, "ai_ceo">;

export interface ExecutionToolGrant {
  readonly name: string;
  readonly version: 1;
  readonly purpose: "store_health_review" | "marketing_publication";
  readonly dataScope: string;
  readonly dataClassification: "internal" | "confidential" | "restricted";
  readonly maximumInvocations: number;
  readonly parameterTemplate: "empty" | "aggregate_window_24h" | "evidence_window_24h" | "marketing_brief_campaign" | "marketing_content_draft" | "marketing_visual_spec" | "marketing_package_assemble" | "marketing_facebook_publish";
}

export interface ExecutionDescriptorPayload {
  readonly taskBrief: Readonly<Record<string, unknown>>;
  readonly resultSchema: Readonly<Record<string, unknown>>;
  readonly authorizedContext: readonly Readonly<Record<string, unknown>>[];
  readonly toolGrants: readonly ExecutionToolGrant[];
}

export interface ExecutionDescriptorDraft {
  readonly id: string;
  readonly version: number;
  readonly taskId: string;
  readonly planVersion: number;
  readonly subtaskId: string;
  readonly agentKind: DepartmentAgentKind;
  readonly configurationRevisionId: string;
  readonly policyVersion: number;
  readonly primaryModel: string;
  readonly fallbackModel: string;
  readonly resultSchemaName: string;
  readonly resultSchemaDigest: string;
  readonly authorizedContextDigest: string;
  readonly allowedToolsDigest: string;
  readonly budgetAuthorizationMicros: number;
  readonly timeoutSeconds: number;
  readonly freshnessSeconds: number;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface ExecutionDescriptor extends ExecutionDescriptorDraft {
  readonly payloadDigest: string;
  readonly descriptorDigest: string;
}

const DEPARTMENT_KINDS = new Set<AgentKind>([
  "catalog", "inventory", "order", "finance", "crm", "support",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$/;
const SENSITIVE_KEY = /(authorization|credential|password|secret|token)/;
const MAX_PAYLOAD_DEPTH = 16;
const MAX_CONTEXT_REFERENCES = 128;
const MAX_TOOL_GRANTS = 32;

export function createExecutionDescriptor(
  draft: ExecutionDescriptorDraft,
  payload: ExecutionDescriptorPayload,
): ExecutionDescriptor {
  validateDraft(draft);
  validatePayload(payload);
  const payloadDigest = canonicalDigest(payload);
  const descriptorDigest = canonicalDigest({ ...draft, payloadDigest });
  return Object.freeze({ ...draft, payloadDigest, descriptorDigest });
}

export function validateExecutionDescriptor(
  descriptor: ExecutionDescriptor,
  payload: ExecutionDescriptorPayload,
): void {
  const { payloadDigest, descriptorDigest, ...draft } = descriptor;
  const expected = createExecutionDescriptor(draft, payload);
  if (payloadDigest !== expected.payloadDigest || descriptorDigest !== expected.descriptorDigest) {
    fail("EXECUTION_DESCRIPTOR_INVALID", "Execution descriptor digests do not match its authority");
  }
}

export function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value, 0, new Set(), false))).digest("hex");
}

function validateDraft(draft: ExecutionDescriptorDraft): void {
  const createdAt = instant(draft.createdAt);
  const expiresAt = instant(draft.expiresAt);
  if (
    !UUID.test(draft.id)
    || !UUID.test(draft.taskId)
    || !UUID.test(draft.subtaskId)
    || !UUID.test(draft.configurationRevisionId)
    || !DEPARTMENT_KINDS.has(draft.agentKind)
    || !positive(draft.version)
    || !positive(draft.planVersion)
    || !positive(draft.policyVersion)
    || !positive(draft.budgetAuthorizationMicros)
    || !positive(draft.timeoutSeconds)
    || !positive(draft.freshnessSeconds)
    || !SAFE_IDENTIFIER.test(draft.primaryModel)
    || !SAFE_IDENTIFIER.test(draft.fallbackModel)
    || !SAFE_IDENTIFIER.test(draft.resultSchemaName)
    || !DIGEST.test(draft.resultSchemaDigest)
    || !DIGEST.test(draft.authorizedContextDigest)
    || !DIGEST.test(draft.allowedToolsDigest)
    || createdAt === undefined
    || expiresAt === undefined
    || expiresAt <= createdAt
  ) {
    fail("EXECUTION_DESCRIPTOR_INVALID", "Execution descriptor authority is invalid");
  }
}

function validatePayload(payload: ExecutionDescriptorPayload): void {
  try {
    canonicalize(payload, 0, new Set(), true);
  } catch (error) {
    if (error instanceof AgenticDomainError) throw error;
    fail("EXECUTION_DESCRIPTOR_PAYLOAD_INVALID", "Execution descriptor payload is invalid");
  }
  if (
    !plainObject(payload.taskBrief)
    || !plainObject(payload.resultSchema)
    || !Array.isArray(payload.authorizedContext)
    || payload.authorizedContext.length > MAX_CONTEXT_REFERENCES
    || !payload.authorizedContext.every(plainObject)
    || !Array.isArray(payload.toolGrants)
    || payload.toolGrants.length < 1
    || payload.toolGrants.length > MAX_TOOL_GRANTS
    || new Set(payload.toolGrants.map(({ name }) => name)).size !== payload.toolGrants.length
    || !payload.toolGrants.every(validToolGrant)
  ) {
    fail("EXECUTION_DESCRIPTOR_PAYLOAD_INVALID", "Execution descriptor payload is invalid");
  }
}

function validToolGrant(grant: ExecutionToolGrant): boolean {
  return plainObject(grant)
    && SAFE_IDENTIFIER.test(grant.name)
    && grant.version === 1
    && grant.purpose === "store_health_review"
    && SAFE_IDENTIFIER.test(grant.dataScope)
    && ["internal", "confidential", "restricted"].includes(grant.dataClassification)
    && positive(grant.maximumInvocations)
    && ["empty", "aggregate_window_24h", "evidence_window_24h"].includes(grant.parameterTemplate);
}

function canonicalize(value: unknown, depth: number, seen: Set<object>, rejectSensitive: boolean): unknown {
  if (depth > MAX_PAYLOAD_DEPTH) {
    fail("EXECUTION_DESCRIPTOR_PAYLOAD_INVALID", "Execution descriptor payload is too deeply nested");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("EXECUTION_DESCRIPTOR_PAYLOAD_INVALID", "Payload numbers must be finite");
    return value;
  }
  if (typeof value !== "object") {
    fail("EXECUTION_DESCRIPTOR_PAYLOAD_INVALID", "Payload values must be JSON compatible");
  }
  if (seen.has(value)) fail("EXECUTION_DESCRIPTOR_PAYLOAD_INVALID", "Payload must not contain cycles");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => canonicalize(item, depth + 1, seen, rejectSensitive));
    if (!plainObject(value)) fail("EXECUTION_DESCRIPTOR_PAYLOAD_INVALID", "Payload objects must be plain records");
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (rejectSensitive && SENSITIVE_KEY.test(key.replace(/[^A-Za-z]/g, "").toLowerCase())) {
        fail("EXECUTION_DESCRIPTOR_PAYLOAD_INVALID", "Payload contains a forbidden sensitive field");
      }
      result[key] = canonicalize(value[key], depth + 1, seen, rejectSensitive);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function instant(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fail(code: string, message: string): never {
  throw new AgenticDomainError(code, message);
}
