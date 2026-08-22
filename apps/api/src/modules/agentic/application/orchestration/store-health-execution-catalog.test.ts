// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../domain/entities/orchestration-execution-descriptor";
import { DEPARTMENT_TOOL_CATALOG } from "../tools/department-tool-catalog";
import {
  STORE_HEALTH_EXECUTION_CATALOG,
  resolveStoreHealthExecution,
} from "./store-health-execution-catalog";

describe("Store Health execution catalog", () => {
  it("owns one frozen strict result schema and exact tool set per Department", () => {
    expect(STORE_HEALTH_EXECUTION_CATALOG).toHaveLength(6);
    expect(STORE_HEALTH_EXECUTION_CATALOG.map(({ agentKind }) => agentKind)).toEqual([
      "catalog", "inventory", "order", "finance", "crm", "support",
    ]);
    const allTools = STORE_HEALTH_EXECUTION_CATALOG.flatMap(({ toolGrants }) =>
      toolGrants.map(({ name }) => name));
    expect(allTools).toEqual(DEPARTMENT_TOOL_CATALOG.map(({ name }) => name));
    for (const entry of STORE_HEALTH_EXECUTION_CATALOG) {
      expect(entry.resultSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["schemaVersion", "agentKind", "status", "summary", "conclusions",
          "risks", "recommendedActions", "evidence", "payload"],
        properties: { agentKind: { const: entry.agentKind } },
      });
      expect(entry.resultSchemaDigest).toBe(canonicalDigest(entry.resultSchema));
      expect(entry.allowedToolsDigest).toBe(canonicalDigest(entry.toolGrants));
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.resultSchema)).toBe(true);
      expect(Object.isFrozen(entry.toolGrants)).toBe(true);
    }
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
});
