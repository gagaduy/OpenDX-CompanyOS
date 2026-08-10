/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_ENVIRONMENT,
  buildCommands,
  buildRunId,
  redactEnvironmentValue,
  runExitCheck,
  validateEnvironment,
} from "./crm-support-dashboard-exit-check.mjs";

const validEnvironment = {
  TEST_DATABASE_URL: "postgres://opendx_local:secret@localhost:55432/opendx_test",
  MINIO_SUPPORT_BUCKET: "support-attachments-test",
};

test("requires isolated database and support attachment bucket", () => {
  assert.deepEqual(
    REQUIRED_ENVIRONMENT.map(({ name }) => name),
    ["TEST_DATABASE_URL", "MINIO_SUPPORT_BUCKET"],
  );

  assert.deepEqual(validateEnvironment(validEnvironment), { ok: true });
  assert.equal(validateEnvironment({ ...validEnvironment, TEST_DATABASE_URL: "postgres://prod" }).ok, false);
  assert.equal(validateEnvironment({ ...validEnvironment, MINIO_SUPPORT_BUCKET: "prod-bucket" }).ok, false);
  assert.equal(validateEnvironment({ MINIO_SUPPORT_BUCKET: "support-attachments-test" }).ok, false);
});

test("redacts environment values before diagnostics", () => {
  assert.equal(redactEnvironmentValue("postgres://user:pass@localhost:55432/opendx_test"), "postgres://user:***@localhost:55432/opendx_test");
  assert.equal(redactEnvironmentValue("short"), "<redacted>");
});

test("builds deterministic command list for the source exit preflight", () => {
  assert.deepEqual(buildCommands(), [
    ["pnpm", ["--filter", "@opendx/api", "typecheck"]],
    ["pnpm", ["--filter", "@opendx/console", "typecheck"]],
    ["pnpm", ["--filter", "@opendx/console", "build"]],
    ["pnpm", ["audit:repo"]],
    ["git", ["diff", "--check"]],
  ]);
});

test("runs commands in order and returns the failing command status", () => {
  const calls = [];
  const stdout = [];
  const stderr = [];
  const status = runExitCheck({
    cwd: "/repo",
    env: validEnvironment,
    randomUUID: () => "fixed-id",
    spawnSync: (command, args, options) => {
      calls.push([command, args, options.cwd, options.stdio]);
      return command === "pnpm" && args.includes("audit:repo") ? { status: 7 } : { status: 0 };
    },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });

  assert.equal(status, 7);
  assert.equal(stdout[0], "Phase 7 exit run: crm-support-dashboard-fixed-id");
  assert.equal(stdout.some((line) => line.includes("secret")), false);
  assert.equal(stderr.at(-1), "Command failed: pnpm audit:repo");
  assert.deepEqual(
    calls.map(([command, args]) => [command, args]),
    buildCommands().slice(0, 4),
  );
});

test("stops before running commands when environment is unsafe", () => {
  const calls = [];
  const stderr = [];
  const status = runExitCheck({
    cwd: "/repo",
    env: { TEST_DATABASE_URL: "postgres://user:pass@localhost:5432/prod", MINIO_SUPPORT_BUCKET: "prod" },
    randomUUID: () => "fixed-id",
    spawnSync: () => {
      calls.push("spawned");
      return { status: 0 };
    },
    stdout: () => undefined,
    stderr: (line) => stderr.push(line),
  });

  assert.equal(status, 2);
  assert.deepEqual(calls, []);
  assert.equal(stderr.some((line) => line.includes("pass")), false);
  assert.equal(stderr.some((line) => line.includes("requires isolated test configuration")), true);
});
