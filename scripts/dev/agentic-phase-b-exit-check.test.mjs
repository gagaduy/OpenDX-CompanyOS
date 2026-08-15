// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectAgenticPhaseBSnapshot,
  validateAgenticPhaseB,
} from "./agentic-phase-b-exit-check.mjs";

function clone(value) {
  return structuredClone(value);
}

test("accepts the complete bounded Phase B repository surface", () => {
  assert.doesNotThrow(() => validateAgenticPhaseB(collectAgenticPhaseBSnapshot()));
});

test("rejects a missing durable workflow contract", () => {
  const snapshot = clone(collectAgenticPhaseBSnapshot());
  snapshot.sources.apiRoutes = snapshot.sources.apiRoutes.replace(
    'router.get("/workflow-runs/:runId"',
    'router.get("/removed/:runId"',
  );
  assert.throws(() => validateAgenticPhaseB(snapshot), /workflow run read route/i);

  const missingTable = clone(collectAgenticPhaseBSnapshot());
  missingTable.sources.workflowMigration = missingTable.sources.workflowMigration.replace(
    "CREATE TABLE agentic_workflow_signal_receipts",
    "CREATE TABLE removed_signal_receipts",
  );
  assert.throws(() => validateAgenticPhaseB(missingTable), /signal receipt table/i);
});

test("rejects an incomplete recovery set or missing live gate", () => {
  const snapshot = clone(collectAgenticPhaseBSnapshot());
  snapshot.sources.recoveryHelper = snapshot.sources.recoveryHelper.replace(
    '"temporal_visibility.dump"',
    '"removed.dump"',
  );
  assert.throws(() => validateAgenticPhaseB(snapshot), /temporal_visibility\.dump/i);

  const missingGate = clone(collectAgenticPhaseBSnapshot());
  missingGate.sources.packageJson = missingGate.sources.packageJson.replace(
    '"check:agentic-workflow"',
    '"removed:agentic-workflow"',
  );
  assert.throws(() => validateAgenticPhaseB(missingGate), /live workflow lifecycle gate/i);
});

test("rejects Phase C-H runtime and unsafe Temporal exposure", () => {
  for (const [field, addition, expected] of [
    ["runtimeSources", "\nOPENROUTER_API_KEY=x", /OpenRouter/i],
    ["consoleSources", "\nexport const AgenticDashboard = () => null", /Console Agentic page/i],
    ["localCompose", "\n  temporal-ui:\n    image: temporalio/ui:latest", /Temporal UI/i],
    ["productionCompose", '\n    ports: ["7233:7233"]', /public Temporal port/i],
  ]) {
    const snapshot = clone(collectAgenticPhaseBSnapshot());
    snapshot.sources[field] += addition;
    assert.throws(() => validateAgenticPhaseB(snapshot), expected);
  }

  const longPort = clone(collectAgenticPhaseBSnapshot());
  longPort.sources.productionCompose += "\nports:\n  - target: 7233\n    published: 7233";
  assert.throws(() => validateAgenticPhaseB(longPort), /public Temporal port/i);
});

test("rejects production SePay activation in the Phase B change set", () => {
  const snapshot = clone(collectAgenticPhaseBSnapshot());
  snapshot.sources.agenticSources += "\nSEPAY_PRODUCTION_API_URL";
  assert.throws(() => validateAgenticPhaseB(snapshot), /production SePay/i);
});

test("rejects a Commerce tool adapter in the Phase B change set", () => {
  const snapshot = clone(collectAgenticPhaseBSnapshot());
  snapshot.agenticFiles.push(
    "services/ai-runtime/app/agentic/tools/catalog_read_tool.py",
  );
  assert.throws(() => validateAgenticPhaseB(snapshot), /Commerce tool/i);

  const disguised = clone(collectAgenticPhaseBSnapshot());
  disguised.agenticFiles.push(
    "services/ai-runtime/app/agentic/activities/catalog_reader.py",
  );
  disguised.sources.agenticSources += '\nawait client.get("/v1/catalog/products")';
  assert.throws(() => validateAgenticPhaseB(disguised), /Commerce tool/i);
});
