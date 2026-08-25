// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  canonicalDigest,
  type DepartmentAgentKind,
  type ExecutionToolGrant,
} from "../../domain/entities/orchestration-execution-descriptor";
import { z } from "zod";
import { AgenticApplicationError } from "../services/agentic-application.error";
import { DEPARTMENT_TOOL_CATALOG } from "../tools/department-tool-catalog";

export interface StoreHealthExecutionCatalogEntry {
  readonly agentKind: DepartmentAgentKind;
  readonly resultSchemaName: string;
  readonly resultSchema: Readonly<Record<string, unknown>>;
  readonly resultSchemaDigest: string;
  readonly toolGrants: readonly ExecutionToolGrant[];
  readonly allowedToolsDigest: string;
}

const DEPARTMENTS: readonly DepartmentAgentKind[] = [
  "catalog", "inventory", "order", "finance", "crm", "support",
];

export const STORE_HEALTH_EXECUTION_CATALOG: readonly StoreHealthExecutionCatalogEntry[] =
  deepFreeze(DEPARTMENTS.map((agentKind) => {
    const toolGrants = DEPARTMENT_TOOL_CATALOG
      .filter((tool) => tool.agentKind === agentKind && tool.name !== "support.related_order_context")
      .map((tool): ExecutionToolGrant => ({
        name: tool.name,
        version: tool.version,
        purpose: tool.purpose,
        dataScope: tool.dataScope,
        dataClassification: tool.classification,
        maximumInvocations: tool.maximumInvocations,
        parameterTemplate: parameterTemplate(tool.name),
      }));
    const resultSchema = departmentResultSchema(agentKind, toolGrants.map(({ name }) => name));
    return {
      agentKind,
      resultSchemaName: `store_health_${agentKind}_v1`,
      resultSchema,
      resultSchemaDigest: canonicalDigest(resultSchema),
      toolGrants,
      allowedToolsDigest: canonicalDigest(toolGrants),
    };
  }));

function parameterTemplate(name: string): ExecutionToolGrant["parameterTemplate"] {
  if (["catalog.product_completeness", "catalog.merchandising_summary"].includes(name)) {
    return "empty";
  }
  if (["finance.pending_payments", "finance.provider_evidence_status",
    "crm.segment_summary", "crm.followup_opportunities",
    "support.classification_summary"].includes(name)) {
    return "aggregate_window_24h";
  }
  return "evidence_window_24h";
}

export function resolveStoreHealthExecution(
  agentKind: DepartmentAgentKind,
  resultSchemaDigest: string,
  allowedToolsDigest: string,
): StoreHealthExecutionCatalogEntry | undefined {
  return STORE_HEALTH_EXECUTION_CATALOG.find((entry) =>
    entry.agentKind === agentKind
    && entry.resultSchemaDigest === resultSchemaDigest
    && entry.allowedToolsDigest === allowedToolsDigest);
}

export function parseStoreHealthResult(
  agentKind: DepartmentAgentKind,
  value: unknown,
): StoreHealthResult {
  const result = departmentResult.safeParse(value);
  const entry = STORE_HEALTH_EXECUTION_CATALOG.find((candidate) => candidate.agentKind === agentKind);
  if (!result.success || entry === undefined || result.data.agentKind !== agentKind) {
    throw new AgenticApplicationError("RESULT_SCHEMA_INVALID", "Department result does not match its server-owned schema");
  }
  return result.data;
}

export function validateStoreHealthResultBindings(
  agentKind: DepartmentAgentKind,
  result: StoreHealthResult,
): void {
  const entry = STORE_HEALTH_EXECUTION_CATALOG.find((candidate) => candidate.agentKind === agentKind);
  if (entry === undefined || result.agentKind !== agentKind) {
    throw new AgenticApplicationError("RESULT_SCHEMA_INVALID", "Department result agent binding is invalid");
  }
  const allowedTools = new Set(entry.toolGrants.map(({ name }) => name));
  const summaries = result.payload.toolSummaries;
  const provenance = new Set(summaries.map(({ provenanceId }) => provenanceId));
  if (new Set(summaries.map(({ toolName }) => toolName)).size !== summaries.length
    || new Set(summaries.map(({ provenanceId }) => provenanceId)).size !== summaries.length
    || summaries.some(({ toolName }) => !allowedTools.has(toolName))
    || [...result.conclusions, ...result.risks, ...result.recommendedActions]
      .some(({ provenanceIds: ids }) => ids.some((id) => !provenance.has(id)))) {
    throw new AgenticApplicationError("RESULT_SCHEMA_INVALID", "Department result provenance or tool references are invalid");
  }
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reason = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/);
const ids = z.array(z.uuid()).min(1).max(8).refine((values) => new Set(values).size === values.length);
const resultConclusion = z.strictObject({
  code: reason, statement: z.string().trim().min(1).max(1_000),
  confidenceBasis: z.string().trim().min(1).max(1_000), provenanceIds: ids,
});
const resultRisk = z.strictObject({
  code: reason, severity: z.enum(["low", "medium", "high"]),
  statement: z.string().trim().min(1).max(1_000), provenanceIds: ids,
});
const resultAction = z.strictObject({
  code: reason, statement: z.string().trim().min(1).max(1_000),
  requiresHumanApproval: z.boolean(), provenanceIds: ids,
});
const departmentResult = z.strictObject({
  schemaVersion: z.literal(1),
  agentKind: z.enum(DEPARTMENTS),
  status: z.enum(["complete", "partial"]),
  summary: z.string().trim().min(1).max(1_000),
  conclusions: z.array(resultConclusion).max(8),
  risks: z.array(resultRisk).max(8),
  recommendedActions: z.array(resultAction).max(8),
  payload: z.strictObject({
    toolSummaries: z.array(z.strictObject({
      toolName: z.string().trim().min(1).max(255), provenanceId: z.uuid(), summaryDigest: digest,
    })).min(1).max(16),
  }),
});
export type StoreHealthResult = z.infer<typeof departmentResult>;

function departmentResultSchema(
  agentKind: DepartmentAgentKind,
  toolNames: readonly string[],
): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "agentKind", "status", "summary", "conclusions",
      "risks", "recommendedActions", "payload"],
    properties: {
      schemaVersion: { const: 1 },
      agentKind: { const: agentKind },
      status: { type: "string", enum: ["complete", "partial"] },
      summary: boundedString(1_000),
      conclusions: { type: "array", maxItems: 8, items: conclusionSchema() },
      risks: { type: "array", maxItems: 8, items: riskSchema() },
      recommendedActions: { type: "array", maxItems: 8, items: actionSchema() },
      payload: {
        type: "object",
        additionalProperties: false,
        required: ["toolSummaries"],
        properties: {
          toolSummaries: {
            type: "array", minItems: 1, maxItems: toolNames.length, uniqueItems: true,
            allOf: toolNames.map((toolName) => ({
              contains: toolSummarySchema(toolNames, toolName),
              minContains: 0, maxContains: 1,
            })),
            items: toolSummarySchema(toolNames),
          },
        },
      },
    },
  };
}

function toolSummarySchema(
  toolNames: readonly string[],
  toolName?: string,
): Readonly<Record<string, unknown>> {
  return strictObject({
    toolName: toolName === undefined
      ? { type: "string", enum: toolNames }
      : { const: toolName },
    provenanceId: uuidSchema(),
    summaryDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
  });
}

function conclusionSchema(): Readonly<Record<string, unknown>> {
  return strictObject({
    code: reasonCode(), statement: boundedString(1_000), confidenceBasis: boundedString(1_000),
    provenanceIds: provenanceIds(),
  });
}

function riskSchema(): Readonly<Record<string, unknown>> {
  return strictObject({
    code: reasonCode(), severity: riskLevel(), statement: boundedString(1_000),
    provenanceIds: provenanceIds(),
  });
}

function actionSchema(): Readonly<Record<string, unknown>> {
  return strictObject({
    code: reasonCode(), statement: boundedString(1_000), requiresHumanApproval: { type: "boolean" },
    provenanceIds: provenanceIds(),
  });
}

function strictObject(properties: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

function provenanceIds(): Readonly<Record<string, unknown>> {
  return { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: uuidSchema() };
}

function uuidSchema(): Readonly<Record<string, unknown>> {
  return { type: "string", format: "uuid" };
}

function reasonCode(): Readonly<Record<string, unknown>> {
  return { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,99}$" };
}

function boundedString(maxLength: number): Readonly<Record<string, unknown>> {
  return { type: "string", minLength: 1, maxLength };
}

function riskLevel(): Readonly<Record<string, unknown>> {
  return { type: "string", enum: ["low", "medium", "high"] };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
