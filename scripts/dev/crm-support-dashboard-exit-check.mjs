#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export const REQUIRED_ENVIRONMENT = [
  { name: "TEST_DATABASE_URL", pattern: /opendx_test|crm|support/i },
  { name: "MINIO_SUPPORT_BUCKET", pattern: /test|support/i },
];

export function redactEnvironmentValue(value) {
  if (!value || value.length < 8) return "<redacted>";
  try {
    const url = new URL(value);
    if (url.password) url.password = "***";
    if (url.username) return url.toString();
  } catch {
    // Non-URL environment values are intentionally not echoed.
  }

  return "<redacted>";
}

export function validateEnvironment(env) {
  const missing = REQUIRED_ENVIRONMENT.filter(({ name }) => !env[name]).map(({ name }) => name);
  const unsafe = REQUIRED_ENVIRONMENT.filter(({ name, pattern }) => env[name] && !pattern.test(env[name] ?? "")).map(
    ({ name }) => name,
  );

  if (missing.length === 0 && unsafe.length === 0) return { ok: true };

  return { ok: false, missing, unsafe };
}

export function buildRunId(uuid = randomUUID) {
  return `crm-support-dashboard-${uuid()}`;
}

export function buildCommands() {
  return [
    ["pnpm", ["--filter", "@opendx/api", "typecheck"]],
    ["pnpm", ["--filter", "@opendx/console", "typecheck"]],
    ["pnpm", ["--filter", "@opendx/console", "build"]],
    ["pnpm", ["audit:repo"]],
    ["git", ["diff", "--check"]],
  ];
}

export function runExitCheck({
  cwd = process.cwd(),
  env = process.env,
  randomUUID: uuid = randomUUID,
  spawnSync: runCommand = spawnSync,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const environment = validateEnvironment(env);
  if (!environment.ok) {
    stderr("Phase 7 exit check requires isolated test configuration.");
    for (const name of environment.missing) stderr(`Missing ${name}`);
    for (const name of environment.unsafe) stderr(`${name} must target an isolated Phase 7 test resource.`);
    return 2;
  }

  const evidenceDir = env.CRM_SUPPORT_DASHBOARD_EVIDENCE_DIR ?? "/tmp/opendx-crm-support-dashboard-exit";
  const runId = buildRunId(uuid);

  stdout(`Phase 7 exit run: ${runId}`);
  stdout(`Evidence directory: ${evidenceDir}`);

  for (const [command, args] of buildCommands()) {
    stdout(`Running ${command} ${args.join(" ")}`);
    const result = runCommand(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      stderr(`Command failed: ${command} ${args.join(" ")}`);
      return result.status ?? 1;
    }
  }

  stdout("Phase 7 source exit preflight passed.");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runExitCheck());
}
