#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const runId = `crm-support-dashboard-${randomUUID()}`;
const evidenceDir = process.env.CRM_SUPPORT_DASHBOARD_EVIDENCE_DIR ?? "/tmp/opendx-crm-support-dashboard-exit";
const required = [
  ["TEST_DATABASE_URL", /opendx_test|crm|support/i],
  ["MINIO_SUPPORT_BUCKET", /test|support/i],
];

const missing = required.filter(([name]) => !process.env[name]);
if (missing.length > 0) {
  console.error("Phase 7 exit check requires isolated test configuration.");
  for (const [name] of missing) console.error(`Missing ${name}`);
  process.exit(2);
}

for (const [name, pattern] of required) {
  const value = process.env[name] ?? "";
  if (!pattern.test(value)) {
    console.error(`${name} must target an isolated Phase 7 test resource.`);
    process.exit(2);
  }
}

const commands = [
  ["pnpm", ["--filter", "@opendx/api", "typecheck"]],
  ["pnpm", ["--filter", "@opendx/console", "typecheck"]],
  ["pnpm", ["--filter", "@opendx/console", "build"]],
  ["pnpm", ["audit:repo"]],
  ["git", ["diff", "--check"]],
];

console.log(`Phase 7 exit run: ${runId}`);
console.log(`Evidence directory: ${evidenceDir}`);

for (const [command, args] of commands) {
  console.log(`Running ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`Command failed: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

console.log("Phase 7 source exit preflight passed.");
