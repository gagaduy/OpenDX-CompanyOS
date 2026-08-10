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
  MINIO_ENDPOINT: "http://localhost:9000",
  MINIO_ACCESS_KEY: "opendx_minio",
  MINIO_SECRET_KEY: "local-only-secret",
  MINIO_BUCKET: "product-media-test",
  MINIO_SUPPORT_BUCKET: "support-attachments-test",
  CLAMAV_HOST: "clamav",
  CLAMAV_PORT: "3310",
  RUN_REPORTING_SCALE: "1",
};

test("requires isolated database and support attachment bucket", () => {
  assert.deepEqual(
    REQUIRED_ENVIRONMENT.map(({ name }) => name),
    [
      "TEST_DATABASE_URL",
      "MINIO_ENDPOINT",
      "MINIO_ACCESS_KEY",
      "MINIO_SECRET_KEY",
      "MINIO_BUCKET",
      "MINIO_SUPPORT_BUCKET",
      "CLAMAV_HOST",
      "CLAMAV_PORT",
      "RUN_REPORTING_SCALE",
    ],
  );

  assert.deepEqual(validateEnvironment(validEnvironment), { ok: true });
  assert.equal(validateEnvironment({ ...validEnvironment, TEST_DATABASE_URL: "postgres://prod" }).ok, false);
  assert.equal(validateEnvironment({ ...validEnvironment, MINIO_ENDPOINT: "https://object-store.example.com" }).ok, false);
  assert.equal(validateEnvironment({ ...validEnvironment, MINIO_BUCKET: "product-media" }).ok, false);
  assert.equal(validateEnvironment({ ...validEnvironment, MINIO_SUPPORT_BUCKET: "prod-bucket" }).ok, false);
  assert.equal(validateEnvironment({ ...validEnvironment, CLAMAV_HOST: "clamav.example.com" }).ok, false);
  assert.equal(validateEnvironment({ ...validEnvironment, CLAMAV_PORT: "0" }).ok, false);
  assert.equal(validateEnvironment({ ...validEnvironment, RUN_REPORTING_SCALE: "0" }).ok, false);
  assert.equal(validateEnvironment({ MINIO_SUPPORT_BUCKET: "support-attachments-test", MINIO_ENDPOINT: "http://localhost:9000" }).ok, false);
});

test("redacts environment values before diagnostics", () => {
  assert.equal(redactEnvironmentValue("postgres://user:pass@localhost:55432/opendx_test"), "postgres://user:***@localhost:55432/opendx_test");
  assert.equal(redactEnvironmentValue("short"), "<redacted>");
});

test("builds deterministic command list for the source exit preflight", () => {
  assert.deepEqual(buildCommands(), [
    [
      "pnpm",
      [
        "--filter",
        "@opendx/api",
        "test",
        "--",
        "src/modules/crm",
        "src/modules/support",
        "src/modules/reporting",
      ],
    ],
    [
      "pnpm",
      [
        "--filter",
        "@opendx/api",
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
        "src/modules/crm/infrastructure/database/crm-migration.integration.test.ts",
        "src/modules/crm/infrastructure/repositories/implementations/postgresql-crm.repository.integration.test.ts",
        "src/modules/crm/tests/crm.api.integration.test.ts",
        "src/modules/support/infrastructure/database/support-migration.integration.test.ts",
        "src/modules/support/infrastructure/repositories/implementations/postgresql-support.repository.integration.test.ts",
        "src/modules/support/infrastructure/security/clamd-support-attachment.scanner.integration.test.ts",
        "src/modules/support/infrastructure/storage/minio-support-attachment.storage.integration.test.ts",
        "src/modules/support/tests/support.api.integration.test.ts",
        "src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.integration.test.ts",
      ],
    ],
    [
      "pnpm",
      [
        "--filter",
        "@opendx/console",
        "test",
        "--",
        "src/features/authentication/tests/commerce-operations-routing.test.tsx",
        "src/features/customers/tests/customer-list-page.test.tsx",
        "src/features/crm/tests/customer-detail-page.test.tsx",
        "src/features/support/tests/support-page.test.tsx",
        "src/features/support/tests/ticket-detail-page.test.tsx",
        "src/features/dashboard/tests/dashboard-page.test.tsx",
      ],
    ],
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
  const failingCommandIndex = buildCommands().findIndex(([command, args]) => command === "pnpm" && args.includes("audit:repo"));
  assert.deepEqual(
    calls.map(([command, args]) => [command, args]),
    buildCommands().slice(0, failingCommandIndex + 1),
  );
});

test("stops before running commands when environment is unsafe", () => {
  const calls = [];
  const stderr = [];
  const status = runExitCheck({
    cwd: "/repo",
    env: {
      TEST_DATABASE_URL: "postgres://user:pass@localhost:5432/prod",
      MINIO_ENDPOINT: "https://object-store.example.com",
      MINIO_ACCESS_KEY: "prod-user",
      MINIO_SECRET_KEY: "prod-pass",
      MINIO_BUCKET: "product-media",
      MINIO_SUPPORT_BUCKET: "prod",
      CLAMAV_HOST: "clamav.example.com",
      CLAMAV_PORT: "0",
      RUN_REPORTING_SCALE: "0",
    },
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
