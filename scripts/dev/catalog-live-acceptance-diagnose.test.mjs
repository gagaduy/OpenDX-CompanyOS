// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("catalog acceptance diagnosis is read-only and redacted", () => {
  const source = readFileSync(
    new URL("./catalog-live-acceptance-diagnose.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /--run-id/);
  assert.match(source, /agentic_model_runs/);
  assert.match(source, /agentic_audit_events/);
  assert.match(source, /agentic_provenance_records/);
  assert.match(source, /provider_unknown/);
  assert.match(source, /OPENROUTER_REQUEST_REJECTED/);
  assert.match(source, /OPENROUTER_MODEL_UNAVAILABLE/);
  assert.match(source, /OPENROUTER_SCHEMA_REJECTED/);
  assert.match(source, /settledCostMicros/);
  assert.doesNotMatch(source, /OPENROUTER_API_KEY/);
  assert.doesNotMatch(source, /chat\/completions/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /\b(POST|PUT|PATCH|DELETE)\b/);
});

test("catalog acceptance diagnosis accepts pnpm's argument separator", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/dev/catalog-live-acceptance-diagnose.mjs", "--", "--run-id", "00000000-0000-4000-8000-000000000000"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.doesNotMatch(result.stderr, /Usage: pnpm diagnose:catalog-live/);
  assert.match(result.stderr, /No model run exists for the supplied run ID/);
});
