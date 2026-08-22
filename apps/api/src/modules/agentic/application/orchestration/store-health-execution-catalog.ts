// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import {
  canonicalDigest,
  type DepartmentAgentKind,
  type ExecutionToolGrant,
} from "../../domain/entities/orchestration-execution-descriptor";
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

const PAYLOAD_FIELDS: Readonly<Record<DepartmentAgentKind, Readonly<Record<string, unknown>>>> = {
  catalog: {
    completenessBasisPoints: basisPoints(), productsAtRisk: nonnegativeInteger(),
    publicationBlockerCount: nonnegativeInteger(), merchandisingSignalCount: nonnegativeInteger(),
    riskLevel: riskLevel(),
  },
  inventory: {
    atRiskSkuCount: nonnegativeInteger(), slowStockSkuCount: nonnegativeInteger(),
    reservationAnomalyCount: nonnegativeInteger(), affectedProductCount: nonnegativeInteger(),
    riskLevel: riskLevel(),
  },
  order: {
    stalledOrderCount: nonnegativeInteger(), invalidTransitionCount: nonnegativeInteger(),
    expiryRiskCount: nonnegativeInteger(), affectedOrderCount: nonnegativeInteger(),
    riskLevel: riskLevel(),
  },
  finance: {
    pendingPaymentCount: nonnegativeInteger(), pendingAmountVnd: nonnegativeInteger(),
    discrepancyCount: nonnegativeInteger(), discrepancyAmountVnd: nonnegativeInteger(),
    providerEvidenceCoverageBasisPoints: basisPoints(), riskLevel: riskLevel(),
  },
  crm: {
    segmentCount: nonnegativeInteger(), followupOpportunityCount: nonnegativeInteger(),
    repeatCustomerCount: nonnegativeInteger(), lifetimePaidRevenueVnd: nonnegativeInteger(),
    riskLevel: riskLevel(),
  },
  support: {
    slaRiskCount: nonnegativeInteger(), overdueCount: nonnegativeInteger(),
    classificationCount: nonnegativeInteger(), relatedOrderContextCount: nonnegativeInteger(),
    riskLevel: riskLevel(),
  },
};

export const STORE_HEALTH_EXECUTION_CATALOG: readonly StoreHealthExecutionCatalogEntry[] =
  deepFreeze(DEPARTMENTS.map((agentKind) => {
    const resultSchema = departmentResultSchema(agentKind);
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

function departmentResultSchema(agentKind: DepartmentAgentKind): Readonly<Record<string, unknown>> {
  const payloadProperties = PAYLOAD_FIELDS[agentKind];
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "agentKind", "status", "summary", "conclusions",
      "risks", "recommendedActions", "evidence", "payload"],
    properties: {
      schemaVersion: { const: 1 },
      agentKind: { const: agentKind },
      status: { type: "string", enum: ["complete", "partial"] },
      summary: boundedString(1_000),
      conclusions: { type: "array", maxItems: 8, items: conclusionSchema() },
      risks: { type: "array", maxItems: 8, items: riskSchema() },
      recommendedActions: { type: "array", maxItems: 8, items: actionSchema() },
      evidence: { type: "array", maxItems: 24, items: evidenceSchema() },
      payload: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(payloadProperties),
        properties: payloadProperties,
      },
    },
  };
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

function evidenceSchema(): Readonly<Record<string, unknown>> {
  return strictObject({
    provenanceId: boundedString(255), source: boundedString(255),
    retrievedAt: boundedString(100), freshnessStatus: { type: "string", enum: ["fresh", "stale"] },
    classification: { const: "internal" },
  });
}

function strictObject(properties: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

function provenanceIds(): Readonly<Record<string, unknown>> {
  return { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: boundedString(255) };
}

function reasonCode(): Readonly<Record<string, unknown>> {
  return { type: "string", pattern: "^[A-Z][A-Z0-9_]{0,99}$" };
}

function boundedString(maxLength: number): Readonly<Record<string, unknown>> {
  return { type: "string", minLength: 1, maxLength };
}

function nonnegativeInteger(): Readonly<Record<string, unknown>> {
  return { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
}

function basisPoints(): Readonly<Record<string, unknown>> {
  return { type: "integer", minimum: 0, maximum: 10_000 };
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
