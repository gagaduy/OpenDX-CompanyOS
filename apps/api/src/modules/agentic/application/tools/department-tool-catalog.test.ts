// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEPARTMENT_TOOL_CATALOG,
  findDepartmentToolDescriptor,
} from "./department-tool-catalog";

describe("department tool catalog", () => {
  it("defines 17 unique immutable version-one descriptors", () => {
    expect(DEPARTMENT_TOOL_CATALOG).toHaveLength(17);
    expect(new Set(
      DEPARTMENT_TOOL_CATALOG.map((tool) => `${tool.name}@${tool.version}`),
    ).size).toBe(17);
    expect(DEPARTMENT_TOOL_CATALOG.every((tool) => tool.version === 1)).toBe(true);
    expect(Object.isFrozen(DEPARTMENT_TOOL_CATALOG)).toBe(true);
    expect(DEPARTMENT_TOOL_CATALOG.every(Object.isFrozen)).toBe(true);
  });

  it("binds every descriptor to one Agent, scope, classification, and digest", () => {
    for (const tool of DEPARTMENT_TOOL_CATALOG) {
      expect(tool.agentKind).not.toBe("ai_ceo");
      expect(tool.dataScope).toBe(`${tool.agentKind}:health:read`);
      expect(tool.purpose).toBe("store_health_review");
      expect(tool.inputSchemaDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(tool.outputSchemaDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(tool.executionCostMicros).toBe(1);
      expect(tool.maximumAttempts).toBe(2);
      expect([5, 10]).toContain(tool.maximumInvocations);
    }
  });

  it("uses canonical schemas rather than names as descriptor digests", () => {
    for (const tool of DEPARTMENT_TOOL_CATALOG) {
      expect(tool.inputSchemaDigest).not.toBe(sha256(tool.name));
      expect(tool.outputSchemaDigest).not.toBe(sha256(tool.name));
    }
  });

  it("looks up only exact name and version pairs", () => {
    expect(findDepartmentToolDescriptor("catalog.product_completeness", 1))
      .toMatchObject({ agentKind: "catalog", maximumInvocations: 10 });
    expect(findDepartmentToolDescriptor("catalog.product_completeness", 2))
      .toBeUndefined();
    expect(findDepartmentToolDescriptor("catalog.query", 1)).toBeUndefined();
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
