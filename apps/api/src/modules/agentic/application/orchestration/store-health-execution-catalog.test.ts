// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../domain/entities/orchestration-execution-descriptor";
import { DEPARTMENT_TOOL_CATALOG } from "../tools/department-tool-catalog";
import {
  STORE_HEALTH_EXECUTION_CATALOG,
  parseStoreHealthResult,
  resolveStoreHealthCollaboration,
  resolveStoreHealthExecution,
  validateStoreHealthResultBindings,
} from "./store-health-execution-catalog";

describe("Store Health execution catalog", () => {
  it("owns one frozen strict result schema and exact tool set per Department", () => {
    expect(STORE_HEALTH_EXECUTION_CATALOG).toHaveLength(6);
    expect(STORE_HEALTH_EXECUTION_CATALOG.map(({ agentKind }) => agentKind)).toEqual([
      "catalog", "inventory", "order", "finance", "crm", "support",
    ]);
    const allTools = STORE_HEALTH_EXECUTION_CATALOG.flatMap(({ toolGrants }) =>
      toolGrants.map(({ name }) => name));
    expect(allTools).toEqual(DEPARTMENT_TOOL_CATALOG.map(({ name }) => name)
      .filter((name) => name !== "support.related_order_context"));
    expect(STORE_HEALTH_EXECUTION_CATALOG.flatMap(({ toolGrants }) => toolGrants)
      .every(({ parameterTemplate }) => ["empty", "aggregate_window_24h", "evidence_window_24h"]
        .includes(parameterTemplate))).toBe(true);
    for (const entry of STORE_HEALTH_EXECUTION_CATALOG) {
      expect(entry.resultSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["schemaVersion", "agentKind", "status", "summary", "conclusions",
          "risks", "recommendedActions", "payload"],
        properties: { agentKind: { const: entry.agentKind } },
      });
      expect(entry.resultSchema.properties).toMatchObject({
        payload: {
          additionalProperties: false,
          required: ["toolSummaries"],
          properties: {
            toolSummaries: {
              items: {
                required: ["toolName", "provenanceId", "summaryDigest"],
                properties: { provenanceId: { type: "string", format: "uuid" } },
              },
            },
          },
        },
      });
      expect(entry.resultSchema.properties).toMatchObject({
        conclusions: { items: { properties: {
          provenanceIds: { items: { format: "uuid" } },
        } } },
        risks: { items: { properties: {
          provenanceIds: { items: { format: "uuid" } },
        } } },
        recommendedActions: { items: { properties: {
          provenanceIds: { items: { format: "uuid" } },
        } } },
      });
      expect(JSON.stringify(entry.resultSchema)).not.toContain("completenessBasisPoints");
      expect(JSON.stringify(entry.resultSchema)).not.toContain('"evidence"');
      expect(entry.resultSchemaDigest).toBe(canonicalDigest(entry.resultSchema));
      expect(entry.allowedToolsDigest).toBe(canonicalDigest(entry.toolGrants));
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.resultSchema)).toBe(true);
      expect(Object.isFrozen(entry.toolGrants)).toBe(true);
      expect(hasOnlyStrictObjectSchemas(entry.resultSchema)).toBe(true);
      expect(hasTypedConstants(entry.resultSchema)).toBe(true);
      expect(JSON.stringify(entry.resultSchema)).not.toContain("uniqueItems");
      expect(JSON.stringify(entry.resultSchema)).not.toContain("allOf");
    }
  });

  it("separates structural result parsing from contextual provenance binding", () => {
    const provenanceId = "00000000-0000-4000-8000-000000000001";
    const result = parseStoreHealthResult("catalog", {
      schemaVersion: 1, agentKind: "catalog", status: "complete", summary: "Reviewed",
      conclusions: [{ code: "CATALOG_HEALTH", statement: "Healthy",
        confidenceBasis: "Tool evidence", provenanceIds: [
          "00000000-0000-4000-8000-000000000002",
        ] }],
      risks: [], recommendedActions: [], payload: { toolSummaries: [{
        toolName: "catalog.product_completeness", provenanceId,
        summaryDigest: "a".repeat(64),
      }] },
    });
    expect(() => validateStoreHealthResultBindings("catalog", result))
      .toThrowError("Department result provenance or tool references are invalid");
  });

  it("resolves only an exact server-owned schema and tool digest", () => {
    const catalog = STORE_HEALTH_EXECUTION_CATALOG[0]!;
    expect(resolveStoreHealthExecution(
      catalog.agentKind, catalog.resultSchemaDigest, catalog.allowedToolsDigest,
    )).toBe(catalog);
    expect(resolveStoreHealthExecution(
      catalog.agentKind, "0".repeat(64), catalog.allowedToolsDigest,
    )).toBeUndefined();
  });

  it("owns the single Slice 1 cross-Department collaboration route", () => {
    expect(resolveStoreHealthCollaboration("catalog", "inventory")).toEqual({
      purpose: "compare_availability", requestedDataClassification: "internal",
    });
    expect(resolveStoreHealthCollaboration("inventory", "catalog")).toBeUndefined();
    expect(resolveStoreHealthCollaboration("catalog", "support")).toBeUndefined();
  });
});

function hasOnlyStrictObjectSchemas(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(hasOnlyStrictObjectSchemas);
  if (value === null || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  const objectSchema = record.type === "object"
    || ["properties", "required", "dependentSchemas"].some((key) => key in record);
  return (!objectSchema || record.additionalProperties === false)
    && Object.values(record).every(hasOnlyStrictObjectSchemas);
}

function hasTypedConstants(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(hasTypedConstants);
  if (value === null || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  return (!("const" in record) || typeof record.type === "string")
    && Object.values(record).every(hasTypedConstants);
}
