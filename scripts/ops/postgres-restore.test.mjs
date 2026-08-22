// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("recovery-set restore removes only orphaned Agentic policies before constraints", async () => {
  const script = await readFile(new URL("./postgres-restore.sh", import.meta.url), "utf8");

  assert.match(script, /--section=pre-data --section=data/);
  assert.match(script, /to_regclass\('public\.agentic_policies'\)/);
  assert.match(script, /to_regclass\('public\.agentic_configuration_revisions'\)/);
  assert.match(script, /DELETE FROM agentic_policies p[\s\S]*agentic_configuration_revisions/);
  assert.match(script, /--section=post-data/);
});
