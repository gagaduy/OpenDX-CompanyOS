// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { DepartmentToolResult } from "../../tools/department-tool-contracts";
import { ToolSharingService } from "./tool-sharing.service";

const now = "2026-08-16T05:00:00.000Z";
const sharing = new ToolSharingService();

describe("ToolSharingService", () => {
  it("rejects department-only results", () => {
    expect(() => sharing.toExecutiveSummary(result({
      classification: "restricted",
      shareability: "department_only",
    }))).toThrowError(expect.objectContaining({ code: "TOOL_SHARING_DENIED" }));
  });

  it("returns only the approved executive summary envelope", () => {
    const source = result({
      classification: "internal",
      shareability: "executive_summary",
    });

    expect(sharing.toExecutiveSummary(source)).toEqual({
      source: source.source,
      sourceVersion: 1,
      retrievedAt: source.retrievedAt,
      window: null,
      freshness: source.freshness,
      classification: "internal",
      provenanceId: source.provenanceId,
      summary: source.summary,
    });
    expect(JSON.stringify(sharing.toExecutiveSummary(source))).not.toContain("evidence");
    expect(JSON.stringify(sharing.toExecutiveSummary(source))).not.toContain("nextCursor");
    expect(JSON.stringify(sharing.toExecutiveSummary(source))).not.toContain("shareability");
  });
});

function result(overrides: Pick<DepartmentToolResult<{ totalProducts: number }, { productId: string }>, "classification" | "shareability">) {
  return {
    source: "catalog.health",
    sourceVersion: 1,
    retrievedAt: now,
    window: null,
    freshness: { asOf: now, maxAgeSeconds: 60, status: "fresh" },
    provenanceId: "11111111-1111-4111-8111-111111111111",
    summary: { totalProducts: 2 },
    evidence: [{ productId: "22222222-2222-4222-8222-222222222222" }],
    nextCursor: "opaque",
    ...overrides,
  } as const;
}
