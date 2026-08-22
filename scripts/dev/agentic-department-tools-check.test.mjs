// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEPARTMENT_TOOLS,
  parametersFor,
  toExecutiveSummary,
} from "./agentic-department-tools-check.mjs";

test("defines exactly 17 tools owned by six departments", () => {
  assert.equal(DEPARTMENT_TOOLS.length, 17);
  assert.deepEqual(
    [...new Set(DEPARTMENT_TOOLS.map(({ department }) => department))].sort(),
    ["catalog", "crm", "finance", "inventory", "order", "support"],
  );
  for (const tool of DEPARTMENT_TOOLS) {
    assert.ok(tool.name.startsWith(`${tool.department}.`));
    assert.equal(tool.version, 1);
    assert.doesNotThrow(() => parametersFor(tool.name, {
      start: "2026-08-17T00:00:00.000Z",
      end: "2026-08-18T00:00:00.000Z",
      ticketId: "11111111-1111-4111-8111-111111111111",
    }));
  }
});

test("shares only an explicitly shareable summary envelope", () => {
  const result = {
    source: "catalog.health",
    sourceVersion: 1,
    retrievedAt: "2026-08-18T00:00:00.000Z",
    window: null,
    freshness: { asOf: "2026-08-18T00:00:00.000Z", maxAgeSeconds: 60, status: "fresh" },
    classification: "internal",
    shareability: "executive_summary",
    provenanceId: "11111111-1111-4111-8111-111111111111",
    summary: { totalProducts: 1 },
    evidence: [{ productId: "22222222-2222-4222-8222-222222222222" }],
    nextCursor: "private",
  };
  const shared = toExecutiveSummary(result);
  assert.deepEqual(shared, {
    source: result.source,
    sourceVersion: 1,
    retrievedAt: result.retrievedAt,
    window: null,
    freshness: result.freshness,
    classification: "internal",
    provenanceId: result.provenanceId,
    summary: result.summary,
  });
  assert.doesNotMatch(JSON.stringify(shared), /evidence|nextCursor|shareability/);
  assert.throws(
    () => toExecutiveSummary({ ...result, shareability: "department_only" }),
    /not executive-shareable/i,
  );
});

test("runner owns maintenance lock, cleans in finally, and never prints credentials", () => {
  const source = readFileSync(new URL("./agentic-department-tools-check.mjs", import.meta.url), "utf8");
  assert.match(source, /opendx-database-maintenance\.lock/);
  assert.match(source, /mkdirSync\(maintenanceLockPath/);
  assert.match(source, /finally\s*\{/);
  assert.match(source, /await cleanup\(\)/);
  assert.match(source, /grant_type:\s*"client_credentials"/);
  assert.doesNotMatch(source, /console\.(?:log|info|error)\([^\n]*(?:token|secret)/i);
});
