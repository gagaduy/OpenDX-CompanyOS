// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("lifecycle gate directly activates configuration but keeps workflow approval separate", async () => {
  const source = await readFile(new URL("./agentic-workflow-lifecycle-check.mjs", import.meta.url), "utf8");

  assert.match(source, /configuration-revisions\/\$\{revision\.id\}\/activate/);
  assert.match(source, /token: tokens\.creator, method: "POST", body: \{ expectedVersion: 2 \}/);
  assert.match(source, /approvals\/\$\{approval\.id\}\/decision/);
  assert.match(source, /token: tokens\.approver/);
  assert.doesNotMatch(source, /configuration-revisions\/\$\{revision\.id\}\/submit/);
  assert.doesNotMatch(source, /configuration-revisions\/\$\{revision\.id\}\/decision/);
});
