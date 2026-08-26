// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import type { DepartmentAgentKind } from "../../domain/entities/orchestration-execution-descriptor";
import { canonicalDigest } from "../../domain/entities/orchestration-execution-descriptor";
import { AgenticApplicationError } from "../services/agentic-application.error";

const DEPARTMENTS = ["catalog", "inventory", "order", "finance", "crm", "support"] as const;
const department = z.enum(DEPARTMENTS);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reasonCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/);
const provenanceIds = z.array(z.uuid()).min(1).max(8)
  .refine((values) => new Set(values).size === values.length);
const planningProposal = z.strictObject({
  schemaVersion: z.literal(1),
  subtasks: z.array(z.strictObject({
    owner: department,
    dependencies: z.array(department).max(5)
      .refine((values) => new Set(values).size === values.length),
  })).min(1).max(6),
});
const conclusion = z.strictObject({
  code: reasonCode, statement: z.string().trim().min(1).max(1_000), provenanceIds,
});
const risk = conclusion.extend({ severity: z.enum(["low", "medium", "high"]) }).strict();
const action = conclusion.extend({ requiresHumanApproval: z.boolean() }).strict();
const executiveReport = z.strictObject({
  schemaVersion: z.literal(1),
  completionState: z.enum(["complete", "partial", "quality_escalated", "canceled"]),
  summary: z.string().trim().min(1).max(2_000),
  conclusions: z.array(conclusion).max(12),
  risks: z.array(risk).max(12),
  recommendedActions: z.array(action).max(12),
  conflicts: z.array(conclusion).max(12),
  acceptedResultReferences: z.array(z.strictObject({
    resultId: z.uuid(), subtaskId: z.uuid(), resultDigest: digest,
  })).max(6),
  unavailableBranches: z.array(z.strictObject({
    subtaskId: z.uuid(), reasonCode,
  })).max(6),
});

export function validateAiCeoExecutiveReportBindings(value: AiCeoExecutiveReport): void {
  if (value.completionState === "complete" && value.unavailableBranches.length > 0) {
    fail("EXECUTIVE_REPORT_INVALID", "A complete report cannot contain unavailable branches");
  }
  const acceptedIds = value.acceptedResultReferences.map(({ resultId }) => resultId);
  const acceptedSubtasks = value.acceptedResultReferences.map(({ subtaskId }) => subtaskId);
  const unavailableSubtasks = value.unavailableBranches.map(({ subtaskId }) => subtaskId);
  if (new Set(acceptedIds).size !== acceptedIds.length
    || new Set(acceptedSubtasks).size !== acceptedSubtasks.length
    || new Set(unavailableSubtasks).size !== unavailableSubtasks.length
    || unavailableSubtasks.some((id) => acceptedSubtasks.includes(id))) {
    fail("EXECUTIVE_REPORT_INVALID", "Report branch references must be unique and disjoint");
  }
}

export type AiCeoPlanningProposal = z.infer<typeof planningProposal>;
export type AiCeoExecutiveReport = z.infer<typeof executiveReport>;

export interface AiCeoExecutionCatalogEntry {
  readonly resultSchemaName: string;
  readonly resultSchema: Readonly<Record<string, unknown>>;
  readonly resultSchemaDigest: string;
}

const planningResultSchema = strictObject({
  schemaVersion: { type: "integer", const: 1 },
  subtasks: {
    type: "array", minItems: 1, maxItems: 6,
    items: strictObject({
      owner: { type: "string", enum: DEPARTMENTS },
      dependencies: {
        type: "array", maxItems: 0,
        items: { type: "string", enum: DEPARTMENTS },
      },
    }),
  },
});
const reportResultSchema = strictObject({
  schemaVersion: { type: "integer", const: 1 },
  completionState: { type: "string", enum: ["complete", "partial", "quality_escalated", "canceled"] },
  summary: boundedString(2_000),
  conclusions: { type: "array", maxItems: 12, items: conclusionJsonSchema() },
  risks: { type: "array", maxItems: 12, items: strictObject({
    code: reasonCodeJson(), statement: boundedString(1_000), provenanceIds: provenanceIdsJson(),
    severity: { type: "string", enum: ["low", "medium", "high"] },
  }) },
  recommendedActions: { type: "array", maxItems: 12, items: strictObject({
    code: reasonCodeJson(), statement: boundedString(1_000), provenanceIds: provenanceIdsJson(),
    requiresHumanApproval: { type: "boolean" },
  }) },
  conflicts: { type: "array", maxItems: 12, items: conclusionJsonSchema() },
  acceptedResultReferences: { type: "array", maxItems: 6, items: strictObject({
    resultId: uuidJson(), subtaskId: uuidJson(), resultDigest: digestJson(),
  }) },
  unavailableBranches: { type: "array", maxItems: 6, items: strictObject({
    subtaskId: uuidJson(), reasonCode: reasonCodeJson(),
  }) },
});

export const AI_CEO_EXECUTION_CATALOG = deepFreeze({
  planning: catalogEntry("orchestration_plan_proposal_v1", planningResultSchema),
  synthesis: catalogEntry("store_health_ai_ceo_report_v1", reportResultSchema),
});

export function parseAiCeoPlanningProposal(
  value: unknown,
  eligibleOwners: ReadonlySet<DepartmentAgentKind>,
): AiCeoPlanningProposal {
  const proposal = parse(planningProposal, value, "INVALID_PLAN");
  const nodes = new Map(proposal.subtasks.map((subtask) => [subtask.owner, subtask]));
  if (nodes.size !== proposal.subtasks.length
    || proposal.subtasks.some(({ owner, dependencies }) =>
      !eligibleOwners.has(owner) || dependencies.includes(owner)
      || dependencies.some((dependency) => !nodes.has(dependency)))) {
    fail("INVALID_PLAN", "AI CEO planning proposal is outside eligible authority");
  }
  const visiting = new Set<DepartmentAgentKind>();
  const visited = new Set<DepartmentAgentKind>();
  const visit = (owner: DepartmentAgentKind): void => {
    if (visiting.has(owner)) fail("INVALID_PLAN", "AI CEO planning proposal must be acyclic");
    if (visited.has(owner)) return;
    visiting.add(owner);
    for (const dependency of nodes.get(owner)!.dependencies) visit(dependency);
    visiting.delete(owner);
    visited.add(owner);
  };
  for (const owner of nodes.keys()) visit(owner);
  return proposal;
}

export function parseAiCeoExecutiveReport(value: unknown): AiCeoExecutiveReport {
  return parse(executiveReport, value, "EXECUTIVE_REPORT_INVALID");
}

function catalogEntry(
  resultSchemaName: string,
  resultSchema: Readonly<Record<string, unknown>>,
): AiCeoExecutionCatalogEntry {
  return { resultSchemaName, resultSchema, resultSchemaDigest: canonicalDigest(resultSchema) };
}

function parse<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const result = schema.safeParse(value);
  if (!result.success) fail(code, "AI CEO structured result does not match its server-owned schema");
  return result.data;
}

function conclusionJsonSchema(): Readonly<Record<string, unknown>> {
  return strictObject({ code: reasonCodeJson(), statement: boundedString(1_000), provenanceIds: provenanceIdsJson() });
}

function strictObject(properties: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

function boundedString(maxLength: number): Readonly<Record<string, unknown>> {
  return { type: "string", minLength: 1, maxLength };
}

function provenanceIdsJson(): Readonly<Record<string, unknown>> {
  return { type: "array", minItems: 1, maxItems: 8, items: uuidJson() };
}

function uuidJson(): Readonly<Record<string, unknown>> {
  return { type: "string", format: "uuid" };
}

function digestJson(): Readonly<Record<string, unknown>> {
  return { type: "string", pattern: "^[a-f0-9]{64}$" };
}

function reasonCodeJson(): Readonly<Record<string, unknown>> {
  return { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,99}$" };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new AgenticApplicationError(code, message);
}
