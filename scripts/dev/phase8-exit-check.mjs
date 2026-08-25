#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from "node:child_process";

export function plannedCommands() {
  return [
    "pnpm check:production-compose",
    "pnpm check:authorization-matrix",
    "pnpm test:sepay-production-acceptance",
    "node scripts/dev/backup-restore-check.mjs",
    "pnpm check:phase8-accessibility",
    "pnpm check:phase8-performance",
    "pnpm audit:env",
    "pnpm audit:secrets",
    "pnpm audit:repo",
    "git diff --check",
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runId = `phase8-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.info(`Phase 8 exit preflight ${runId}`);
  for (const command of plannedCommands()) {
    console.info(`Running: ${command}`);
    const result = spawnSync(command, { shell: true, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  console.info(`Phase 8 exit preflight passed: ${runId}`);
}
