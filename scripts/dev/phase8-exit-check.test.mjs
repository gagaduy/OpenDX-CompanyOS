/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { plannedCommands } from "./phase8-exit-check.mjs";

test("phase 8 exit check keeps production payment opt-in out of default gate", () => {
  assert(
    !plannedCommands().some((command) =>
      command.includes("check:sepay-production"),
    ),
  );
});

test("phase 8 exit check includes hardening, backup, accessibility, performance, and source gates", () => {
  const commands = plannedCommands().join("\n");
  for (const expected of [
    "pnpm check:production-compose",
    "pnpm check:authorization-matrix",
    "pnpm test:sepay-production-acceptance",
    "node scripts/dev/backup-restore-check.mjs",
    "pnpm check:phase8-accessibility",
    "pnpm check:phase8-performance",
    "pnpm audit:repo",
  ]) {
    assert(commands.includes(expected), `missing ${expected}`);
  }
});
