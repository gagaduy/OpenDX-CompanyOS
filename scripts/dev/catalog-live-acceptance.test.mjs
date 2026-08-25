// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("catalog live acceptance has an explicit one-call local safety contract", () => {
  const source = readFileSync(new URL("./catalog-live-acceptance.mjs", import.meta.url), "utf8");
  assert.match(source, /OPENROUTER_LIVE_ACCEPTANCE_CONFIRM/);
  assert.match(source, /run-one-catalog/);
  assert.match(source, /agent_kind='catalog'/);
  assert.match(source, /provenanceId/);
  assert.match(source, /admin@novacommerce\.example/);
  assert.match(source, /docker compose/);
  assert.match(source, /"python", "-m", "app\.agentic\.cli\.catalog_live_acceptance"/);
  assert.doesNotMatch(source, /sk-or-v1-/);
  assert.doesNotMatch(source, /chat\/completions/);
});
