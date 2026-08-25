// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { DEPARTMENT_TOOL_CATALOG } from "../../application/tools/department-tool-catalog";
import { ZodDepartmentToolSchemaRegistry } from "./zod-department-tool-schema.registry";

const now = "2026-08-16T05:00:00.000Z";
const registry = new ZodDepartmentToolSchemaRegistry(() => now);

describe("ZodDepartmentToolSchemaRegistry", () => {
  it("binds runtime input and output schemas to every descriptor digest", () => {
    for (const descriptor of DEPARTMENT_TOOL_CATALOG) {
      expect(registry.schemaDigests(descriptor.name, descriptor.version)).toEqual({
        inputSchemaDigest: descriptor.inputSchemaDigest,
        outputSchemaDigest: descriptor.outputSchemaDigest,
      });
    }
  });

  it("accepts a bounded window and applies evidence defaults", () => {
    expect(registry.parseInput("catalog.publication_readiness", 1, {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-08-16T05:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
    })).toEqual({
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-08-16T05:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
      limit: 25,
    });
  });

  it.each([
    ["unknown field", { start: "2026-08-01T00:00:00.000Z", end: now, timezone: "Asia/Ho_Chi_Minh", sql: "SELECT 1" }],
    ["window over 90 days", { start: "2026-05-01T00:00:00.000Z", end: now, timezone: "Asia/Ho_Chi_Minh" }],
    ["future end", { start: "2026-08-01T00:00:00.000Z", end: "2026-08-16T05:02:00.000Z", timezone: "Asia/Ho_Chi_Minh" }],
  ])("rejects %s", (_name, input) => {
    expect(() => registry.parseInput("catalog.publication_readiness", 1, input))
      .toThrowError(expect.objectContaining({ code: "TOOL_INPUT_INVALID" }));
  });

  it("rejects output fields outside the exact safe schema", () => {
    const output = validCompletenessOutput();
    expect(registry.parseOutput("catalog.product_completeness", 1, output)).toEqual(output);
    expect(() => registry.parseOutput("catalog.product_completeness", 1, {
      ...output,
      customerEmail: "leak@example.com",
    })).toThrowError(expect.objectContaining({ code: "TOOL_OUTPUT_INVALID" }));
  });

  it("rejects unknown tool versions before parsing", () => {
    expect(() => registry.parseInput("catalog.product_completeness", 2, {}))
      .toThrowError(expect.objectContaining({ code: "TOOL_NOT_FOUND" }));
  });
});

function validCompletenessOutput() {
  return {
    source: "catalog.health",
    sourceVersion: 1,
    retrievedAt: now,
    window: null,
    freshness: { asOf: now, maxAgeSeconds: 60, status: "fresh" },
    classification: "internal",
    shareability: "executive_summary",
    provenanceId: "11111111-1111-4111-8111-111111111111",
    summary: {
      totalProducts: 2,
      draftProducts: 1,
      publishedProducts: 1,
      missingBrand: 0,
      emptyAttributes: 0,
      withoutActiveVariant: 0,
      withoutCurrentPrice: 0,
      withoutMedia: 0,
      withoutPrimaryMedia: 0,
      completenessBasisPoints: 10_000,
    },
  } as const;
}
