// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";

const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const positiveVersion = z.number().int().positive();
const agentKind = z.enum(["ai_ceo", "catalog", "inventory", "order", "finance", "crm", "support"]);
const page = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}).strict();
const subtask = z.object({ id: uuid.optional(), agentKind, title: z.string().trim().min(1).max(500) }).strict();
const dependency = z.object({ from: uuid, to: uuid }).strict();
const intakeProvenance = z.object({
  sourceType: z.string().trim().min(1).max(100), sourceId: z.string().trim().min(1).max(255),
  sourceDigest: digest, classification: z.string().trim().min(1).max(100),
}).strict();
const taskContent = z.object({
  goal: z.string().trim().min(1).max(500), instructions: z.string().min(1).max(8_000),
  deadline: z.iso.datetime({ offset: true }).optional(),
  subtasks: z.array(subtask).max(100), dependencies: z.array(dependency).max(500),
}).strict();
const task = taskContent.extend({ provenance: intakeProvenance }).strict();
const taskUpdate = taskContent.extend({ expectedVersion: positiveVersion }).strict();
const expectedVersion = z.object({ expectedVersion: positiveVersion }).strict();
const approvalDecision = z.object({
  expectedVersion: positiveVersion,
  decision: z.enum(["approved", "rejected", "revision_requested"]),
  reason: z.string().trim().min(1).max(1_000),
}).strict();
const revisionDecision = z.object({
  expectedVersion: positiveVersion, decision: z.enum(["activate", "reject"]),
  reason: z.string().trim().min(1).max(1_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "reject" && value.reason === undefined) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Rejection reason is required" });
  }
});
const policy = z.object({
  id: uuid, revisionId: uuid, ruleOrder: z.number().int().nonnegative(),
  effect: z.enum(["ALLOW", "REQUIRE_APPROVAL", "DENY"]), actorType: z.string().trim().min(1).max(100),
  agentKind: agentKind.optional(), department: z.string().trim().min(1).max(100).optional(),
  resource: z.string().trim().min(1).max(255), action: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(1).max(255), dataClassification: z.string().trim().min(1).max(100),
  reasonCode: z.string().trim().min(1).max(100),
}).strict();
const toolGrant = z.object({
  id: uuid, revisionId: uuid, agentKind, toolName: z.string().trim().min(1).max(255),
  toolVersion: positiveVersion, purpose: z.string().trim().min(1).max(255),
  dataScope: z.string().trim().min(1).max(255), maxInvocations: positiveVersion,
}).strict();
const model = z.object({
  revisionId: uuid, agentKind, primaryModel: z.string().trim().min(1).max(255),
  fallbackModels: z.array(z.string().trim().min(1).max(255)).max(5),
  maxInputTokens: positiveVersion, maxOutputTokens: positiveVersion,
  timeoutMs: positiveVersion, maxRetries: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (new Set([value.primaryModel, ...value.fallbackModels]).size !== value.fallbackModels.length + 1) {
    context.addIssue({ code: "custom", path: ["fallbackModels"], message: "Models must be unique" });
  }
});
const safePositive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const budget = z.object({
  revisionId: uuid, agentKind, taskCostMicros: safePositive,
  dailyCostMicros: safePositive, monthlyCostMicros: safePositive,
}).strict();
const children = z.object({
  policies: z.array(policy).max(500), toolGrants: z.array(toolGrant).max(500),
  modelConfigurations: z.array(model).max(7), budgetLimits: z.array(budget).max(7),
}).strict();
const createRevision = z.object({ children }).strict();
const updateRevision = z.object({ expectedVersion: positiveVersion, children }).strict();
const revocation = z.object({
  targetType: z.enum(["agent", "tool_grant", "model"]),
  targetId: z.string().trim().min(1).max(255), reason: z.string().trim().min(1).max(1_000),
  idempotencyKey: z.string().trim().min(1).max(255), approvalId: uuid.optional(),
}).strict();
const auditQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  actorId: z.string().trim().min(1).max(255).optional(),
  action: z.string().trim().min(1).max(255).optional(),
  outcome: z.enum(["allowed", "denied", "failed"]).optional(),
}).strict();

export const parseUuid = (value: unknown): string => parse(uuid, value);
export const parseAgentKind = (value: unknown) => parse(agentKind, value);
export const parsePage = (value: unknown) => parse(page, value);
export const parseAuditQuery = (value: unknown) => parse(auditQuery, value);
export const parseCreateTask = (value: unknown) => parse(task, value);
export const parseUpdateTask = (value: unknown) => parse(taskUpdate, value);
export const parseExpectedVersion = (value: unknown) => parse(expectedVersion, value);
export const parseDecision = (value: unknown) => parse(approvalDecision, value);
export const parseRevisionDecision = (value: unknown) => parse(revisionDecision, value);
export const parseCreateRevision = (value: unknown) => parse(createRevision, value);
export const parseUpdateRevision = (value: unknown) => parse(updateRevision, value);
export const parseRevocation = (value: unknown) => parse(revocation, value);
export const parseDigest = (value: unknown): string => parse(digest, value);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
}
