// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { AgenticApplicationError } from "../services/agentic-application.error";
import { canonicalDigest } from "../../domain/entities/orchestration-execution-descriptor";
import {
  AI_CEO_EXECUTION_CATALOG,
  parseAiCeoExecutiveReport,
  parseAiCeoPlanningProposal,
  validateAiCeoExecutiveReportBindings,
} from "./ai-ceo-execution-catalog";

describe("AI CEO execution catalog", () => {
  it("owns frozen canonical planning and synthesis schemas", () => {
    expect(AI_CEO_EXECUTION_CATALOG.planning.resultSchemaName)
      .toBe("orchestration_plan_proposal_v1");
    expect(AI_CEO_EXECUTION_CATALOG.synthesis.resultSchemaName)
      .toBe("store_health_ai_ceo_report_v1");
    for (const entry of Object.values(AI_CEO_EXECUTION_CATALOG)) {
      expect(entry.resultSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(entry.resultSchemaDigest).toBe(canonicalDigest(entry.resultSchema));
      expect(Object.isFrozen(entry.resultSchema)).toBe(true);
      expect(hasOnlyStrictObjectSchemas(entry.resultSchema)).toBe(true);
      expect(hasTypedConstants(entry.resultSchema)).toBe(true);
    }
  });

  it("accepts only unique eligible owners and an acyclic dependency graph", () => {
    const proposal = { schemaVersion: 1, subtasks: [
      { owner: "catalog", dependencies: [] },
      { owner: "inventory", dependencies: ["catalog"] },
    ] };
    expect(parseAiCeoPlanningProposal(proposal, new Set(["catalog", "inventory"])))
      .toEqual(proposal);
    expectCode(() => parseAiCeoPlanningProposal({ ...proposal, subtasks: [
      ...proposal.subtasks, { owner: "catalog", dependencies: [] },
    ] }, new Set(["catalog", "inventory"])), "INVALID_PLAN");
    expectCode(() => parseAiCeoPlanningProposal({ schemaVersion: 1, subtasks: [
      { owner: "catalog", dependencies: ["inventory"] },
      { owner: "inventory", dependencies: ["catalog"] },
    ] }, new Set(["catalog", "inventory"])), "INVALID_PLAN");
  });

  it("rejects model-selected authority and conclusions without provenance", () => {
    expectCode(() => parseAiCeoPlanningProposal({
      schemaVersion: 1,
      primaryModel: "unapproved/model",
      subtasks: [{ owner: "catalog", dependencies: [] }],
    }, new Set(["catalog"])), "INVALID_PLAN");
    expectCode(() => parseAiCeoExecutiveReport({
      schemaVersion: 1,
      completionState: "complete",
      summary: "Store health reviewed",
      conclusions: [{ code: "CATALOG_HEALTH", statement: "Catalog is healthy", provenanceIds: [] }],
      risks: [], recommendedActions: [], conflicts: [],
      acceptedResultReferences: [], unavailableBranches: [],
    }), "EXECUTIVE_REPORT_INVALID");
  });

  it("publishes structural report constraints and separates contextual branch validation", () => {
    expect(JSON.stringify(AI_CEO_EXECUTION_CATALOG)).not.toContain("uniqueItems");
    const report = parseAiCeoExecutiveReport({
      schemaVersion: 1, completionState: "partial", summary: "Partial review",
      conclusions: [], risks: [], recommendedActions: [], conflicts: [],
      acceptedResultReferences: [{ resultId: "00000000-0000-4000-8000-000000000001",
        subtaskId: "00000000-0000-4000-8000-000000000002", resultDigest: "a".repeat(64) }],
      unavailableBranches: [{ subtaskId: "00000000-0000-4000-8000-000000000002",
        reasonCode: "DEPARTMENT_UNAVAILABLE" }],
    });
    expectCode(() => validateAiCeoExecutiveReportBindings(report), "EXECUTIVE_REPORT_INVALID");
  });
});

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error("Expected AgenticApplicationError");
  } catch (error) {
    expect(error).toBeInstanceOf(AgenticApplicationError);
    expect((error as AgenticApplicationError).code).toBe(code);
  }
}

function hasTypedConstants(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(hasTypedConstants);
  if (value === null || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  return (!("const" in record) || typeof record.type === "string")
    && Object.values(record).every(hasTypedConstants);
}

function hasOnlyStrictObjectSchemas(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(hasOnlyStrictObjectSchemas);
  if (value === null || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  const objectSchema = record.type === "object"
    || ["properties", "required", "dependentSchemas"].some((key) => key in record);
  return (!objectSchema || record.additionalProperties === false)
    && Object.values(record).every(hasOnlyStrictObjectSchemas);
}
