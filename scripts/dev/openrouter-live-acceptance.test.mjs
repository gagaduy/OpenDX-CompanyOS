// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/dev/openrouter-live-acceptance.py", "utf8");
test("live runner is credential-owned and payload-safe", () => {
  assert.match(source, /OPENROUTER_API_KEY/);
  assert.match(source, /tempfile\.mkdtemp/);
  assert.match(source, /"internal"/);
  assert.match(source, /zip\(AGENTS, MODELS/);
  assert.doesNotMatch(source, /google\/gemma-4-31b-it:free/);
  assert.doesNotMatch(source, /print\(\s*(?:api_key|response\.text|payload)/i);
});
