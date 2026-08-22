// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the fast gate excludes full-only acceptance checks", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url)));
  const script = await readFile(new URL("./check-fast.sh", import.meta.url), "utf8");

  assert.equal(packageJson.scripts.check, "pnpm check:fast");
  assert.equal(packageJson.scripts["check:full"], "bash scripts/dev/check.sh");
  assert.match(script, /pnpm --workspace-concurrency=1 .* test/);
  assert.doesNotMatch(script, /agentic-phase-b-exit/);
  assert.doesNotMatch(script, /test:py/);
});
