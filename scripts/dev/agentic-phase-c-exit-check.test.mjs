// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectAgenticPhaseCSnapshot,
  validateAgenticPhaseC,
} from "./agentic-phase-c-exit-check.mjs";

function clone(value) {
  return structuredClone(value);
}

test("accepts the bounded Phase C repository surface", () => {
  assert.doesNotThrow(() => validateAgenticPhaseC(collectAgenticPhaseCSnapshot()));
});

test("rejects a missing tool or cross-Agent ownership", () => {
  const missing = clone(collectAgenticPhaseCSnapshot());
  missing.sources.toolCatalog = missing.sources.toolCatalog.replace(
    'source("catalog.product_completeness"',
    'source("catalog.removed"',
  );
  assert.throws(() => validateAgenticPhaseC(missing), /17 version-one tools/i);

  const crossAgent = clone(collectAgenticPhaseCSnapshot());
  crossAgent.sources.toolCatalog = crossAgent.sources.toolCatalog.replace(
    'source("catalog.product_completeness", "catalog"',
    'source("catalog.product_completeness", "inventory"',
  );
  assert.throws(() => validateAgenticPhaseC(crossAgent), /tool owner/i);
});

test("rejects private imports, generic SQL, and public internal routes", () => {
  for (const [field, addition, expected] of [
    ["agenticSources", '\nimport "../../catalog/infrastructure/repositories/private";', /private Commerce import/i],
    ["toolSurface", '\nexport const genericSqlTool = "generic.sql.query";', /generic SQL/i],
    ["caddy", "\nreverse_proxy /v1/internal/agentic api:4000", /Caddy denial/i],
  ]) {
    const snapshot = clone(collectAgenticPhaseCSnapshot());
    snapshot.sources[field] += addition;
    if (field === "caddy") {
      snapshot.sources[field] = snapshot.sources[field].replace(
        "respond @internalAgentic 404",
        "# removed",
      );
    }
    assert.throws(() => validateAgenticPhaseC(snapshot), expected);
  }
});

test("rejects base-table grants and mutation methods", () => {
  const grant = clone(collectAgenticPhaseCSnapshot());
  grant.sources.analyticsMigrations +=
    "\nGRANT SELECT ON customers TO opendx_agentic_reader;";
  assert.throws(() => validateAgenticPhaseC(grant), /base-table grant/i);

  const mutation = clone(collectAgenticPhaseCSnapshot());
  mutation.sources.readerContracts += "\nreadonly updateOrder: () => Promise<void>;";
  assert.throws(() => validateAgenticPhaseC(mutation), /mutation method/i);
});

test("rejects reconciliation that restores the retired analytics view", () => {
  const snapshot = clone(collectAgenticPhaseCSnapshot());
  snapshot.sources.roleReconciliation = snapshot.sources.roleReconciliation.replace(
    "'reporting_agentic_customer_segment_snapshot_v2'",
    "'reporting_agentic_customer_segment_snapshot_v1'",
  );
  assert.throws(() => validateAgenticPhaseC(snapshot), /reconciliation.*three view grants/i);
});

test("rejects a missing zero-leakage fixture", () => {
  const snapshot = clone(collectAgenticPhaseCSnapshot());
  snapshot.sources.leakageTest = snapshot.sources.leakageTest.replace(
    '"Canary ticket text",',
    "",
  );
  assert.throws(() => validateAgenticPhaseC(snapshot), /leakage fixture/i);
});

test("rejects later Console scope and production payment activation", () => {
  for (const [field, addition, expected] of [
    ["consoleSources", "\nexport const AgenticDashboard = () => null;", /Agentic Console/i],
    ["agenticSources", "\nSEPAY_PRODUCTION_API_URL", /production SePay/i],
  ]) {
    const snapshot = clone(collectAgenticPhaseCSnapshot());
    snapshot.sources[field] += addition;
    assert.throws(() => validateAgenticPhaseC(snapshot), expected);
  }
});
