// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z, ZodError } from "zod";
import { ApplicationError } from "../../../../shared/http/application-error";
import {
  WORKFLOW_OUTCOME_CODES,
  WORKFLOW_RUN_STATES,
} from "../../domain/entities/workflow-run";

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
  inputCostMicrosPerMillion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  outputCostMicrosPerMillion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
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
const reasonCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/);
const invocationKey = z.string().trim().min(1).max(1_000);
const activityKind = z.enum([
  "load_frozen_plan",
  "project_state",
  "execute_fake_analysis",
  "execute_fake_quality_review",
  "execute_fake_collaboration",
  "execute_fake_synthesis",
]);
const startWorkflow = z.object({
  expectedVersion: positiveVersion,
  workflowVersion: z.literal(1),
}).strict();
const cancelWorkflow = z.object({
  expectedVersion: positiveVersion,
  reasonCode,
}).strict();
const projectWorkflowState = z.object({
  projectionSequence: positiveVersion,
  state: z.enum(WORKFLOW_RUN_STATES),
  outcomeCode: z.enum(WORKFLOW_OUTCOME_CODES).optional(),
}).strict();
const reserveActivity = z.object({
  invocationKey,
  runId: uuid,
  activityKind,
  branchId: uuid.optional(),
  inputDigest: digest,
}).strict();
const completeActivity = z.object({
  expectedVersion: positiveVersion,
  outcomeCode: reasonCode,
  safeResult: z.record(z.string(), z.unknown()),
}).strict();
const failActivity = z.object({
  expectedVersion: positiveVersion,
  outcomeCode: reasonCode,
}).strict();
const safeIdentifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,219}$/);
const modelId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$/);
const nonnegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const modelRunProvenanceIds = z.array(uuid).min(1).max(128).refine(
  (values) => new Set(values).size === values.length,
  "Provenance identifiers must be unique",
);
const modelQualityFields = {
  idempotencyKey: safeIdentifier,
  inputTokens: nonnegativeSafeInteger,
  outputTokens: nonnegativeSafeInteger,
  latencyMs: nonnegativeSafeInteger,
  statusCode: reasonCode,
  qualityReasonCodes: z.array(reasonCode).max(32).refine(
    (values) => new Set(values).size === values.length,
    "Quality reason codes must be unique",
  ),
  provenanceIds: modelRunProvenanceIds,
  evidenceDigest: digest,
};
const reserveModelRun = z.object({
  taskId: uuid,
  agentKind,
  generationRound: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  idempotencyKey: safeIdentifier,
  inputDigest: digest,
  primaryModel: modelId,
  fallbackModel: modelId,
}).strict();
const startModelRun = z.object({
  expectedVersion: positiveVersion,
  returnedModel: modelId,
  fallbackPosition: z.union([z.literal(0), z.literal(1)]),
}).strict();
const completeModelRun = z.object({
  expectedVersion: positiveVersion,
  ...modelQualityFields,
  status: z.enum(["completed", "partial", "escalated"]),
  outputDigest: digest,
  providerRequestIdDigest: digest,
  qualityOutcome: z.enum(["accepted", "partial", "escalate"]),
}).strict();
const failModelRun = z.object({
  expectedVersion: positiveVersion,
  ...modelQualityFields,
  outputDigest: digest.optional(),
  providerRequestIdDigest: digest.optional(),
  errorCode: reasonCode,
  qualityOutcome: z.enum(["correct", "escalate"]),
}).strict();
const fileAction = z.object({ expectedFileVersion: positiveVersion }).strict();
const fileApproval = z.object({
  expectedFileVersion: positiveVersion,
  previewVersion: positiveVersion,
  previewPayloadDigest: digest,
}).strict();
const idempotencyKey = z.string().trim().min(1).max(255);

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
export const parseInvocationKey = (value: unknown): string => parse(invocationKey, value);
export const parseStartWorkflow = (value: unknown) => parse(startWorkflow, value);
export const parseCancelWorkflow = (value: unknown) => parse(cancelWorkflow, value);
export const parseProjectWorkflowState = (value: unknown) => parse(projectWorkflowState, value);
export const parseReserveActivity = (value: unknown) => parse(reserveActivity, value);
export const parseCompleteActivity = (value: unknown) => parse(completeActivity, value);
export const parseFailActivity = (value: unknown) => parse(failActivity, value);
export const parseReserveModelRun = (value: unknown) => parse(reserveModelRun, value);
export const parseStartModelRun = (value: unknown) => parse(startModelRun, value);
export const parseCompleteModelRun = (value: unknown) => parse(completeModelRun, value);
export const parseFailModelRun = (value: unknown) => parse(failModelRun, value);
export const parseFileAction = (value: unknown) => parse(fileAction, value);
export const parseFileApproval = (value: unknown) => parse(fileApproval, value);
export const parseIdempotencyKey = (value: unknown) => parse(idempotencyKey, value);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new ApplicationError(400, "VALIDATION_ERROR", "Validation failed",
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
}
