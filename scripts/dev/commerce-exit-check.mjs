// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const databaseName = `opendx_phase6_acceptance_${process.pid}_test`;
const restoreDatabaseName = `${databaseName}_restore_test`;
const postgresPort =
  process.env.COMMERCE_ACCEPTANCE_POSTGRES_PORT ??
  process.env.POSTGRES_PORT ??
  "5432";
const databaseUrl = `postgres://opendx_local:opendx_local_password@localhost:${postgresPort}/${databaseName}`;
const evidenceDirectory =
  process.env.COMMERCE_ACCEPTANCE_EVIDENCE_DIR ??
  join(tmpdir(), "opendx-commerce-exit");
const compose = [
  "compose",
  "--env-file",
  ".env",
  "-f",
  "infra/docker/docker-compose.yml",
];

async function main() {
  await run("docker", [
    ...compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "opendx_local",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `CREATE DATABASE ${databaseName}`,
  ]);

  try {
    await mkdir(evidenceDirectory, { recursive: true });
    await run(
      "pnpm",
      [
        "--filter",
        "@opendx/api",
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
        "src/modules/payment/tests/checkout-to-paid.acceptance.integration.test.ts",
      ],
      {
        TEST_DATABASE_URL: databaseUrl,
        KEEP_ACCEPTANCE_DATABASE: "yes",
      },
    );
    const archivePath = join(evidenceDirectory, "paid-order.dump");
    await runToFile(
      "docker",
      [
        ...compose,
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "opendx_local",
        "-Fc",
        databaseName,
      ],
      archivePath,
    );
    await createDatabase(restoreDatabaseName);
    await runWithInputFile(
      "docker",
      [
        ...compose,
        "exec",
        "-T",
        "postgres",
        "pg_restore",
        "-U",
        "opendx_local",
        "-d",
        restoreDatabaseName,
        "--no-owner",
        "--exit-on-error",
        "--single-transaction",
      ],
      archivePath,
    );
    const restoredPaidOrders = await postgresScalar(
      restoreDatabaseName,
      "SELECT count(*) FROM orders WHERE status='paid'",
    );
    if (restoredPaidOrders !== "1") {
      throw new Error(`Expected one restored paid order, got ${restoredPaidOrders}`);
    }
    await run(
      "pnpm",
      ["--filter", "@opendx/api", "db:rollback:all"],
      { DATABASE_URL: databaseUrl },
    );
    const rolledBack = await postgresScalar(
      databaseName,
      "SELECT to_regclass('public.products') IS NULL AND to_regclass('public.payments') IS NULL",
    );
    if (rolledBack !== "t") throw new Error("Full migration rollback was incomplete");
    await run(
      "pnpm",
      ["--filter", "@opendx/api", "db:migrate:all"],
      { DATABASE_URL: databaseUrl },
    );
    const reapplied = await postgresScalar(
      databaseName,
      "SELECT count(*) FROM payment_migrations",
    );
    if (reapplied !== "1") throw new Error("Payment migration was not reapplied");
    await run("pnpm", [
      "--filter",
      "@opendx/api",
      "exec",
      "vitest",
      "run",
      "src/modules/checkout/tests/checkout.api.test.ts",
      "src/modules/order/tests/order.api.test.ts",
      "src/modules/payment/tests/payment-admin.api.test.ts",
      "src/modules/payment/tests/sepay-ipn.api.test.ts",
    ]);
    const evidencePath = join(evidenceDirectory, "deterministic.json");
    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          result: "passed",
          databaseIsolation: "disposable",
          checkoutConcurrency: 20,
          availableStock: 10,
          paidOrderBackupRestore: true,
          fullRollbackReapply: true,
          covered: [
            "checkout-to-order atomicity",
            "one checkout per cart snapshot",
            "changed cart preservation after payment",
            "IPN replay",
            "IPN-reconciliation-expiry race",
            "cancellation-IPN convergence",
            "amount mismatch",
            "customer ownership",
            "webhook authentication and malformed payload",
            "staff authorization",
          ],
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    console.log(`Commerce exit acceptance passed. Evidence: ${evidencePath}`);
  } finally {
    await dropDatabase(databaseName);
    await dropDatabase(restoreDatabaseName);
  }
}

async function createDatabase(name) {
  await run("docker", [
    ...compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "opendx_local",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `CREATE DATABASE ${name}`,
  ]);
}

async function dropDatabase(name) {
  await run("docker", [
      ...compose,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "opendx_local",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${name}'`,
    ]);
    await run("docker", [
      ...compose,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "opendx_local",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `DROP DATABASE IF EXISTS ${name}`,
    ]);
}

async function postgresScalar(database, query) {
  return capture("docker", [
    ...compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "opendx_local",
    "-d",
    database,
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ]).then((value) => value.trim());
}

function run(command, arguments_, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnvironment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });
}

function capture(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });
}

function runToFile(command, arguments_, path) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(path, { mode: 0o600 });
    let childCompleted = false;
    let outputCompleted = false;
    let settled = false;
    const child = spawn(command, arguments_, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout.pipe(output);
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const resolveWhenComplete = () => {
      if (!settled && childCompleted && outputCompleted) {
        settled = true;
        resolve();
      }
    };
    child.once("error", rejectOnce);
    output.once("error", rejectOnce);
    output.once("close", () => {
      outputCompleted = true;
      resolveWhenComplete();
    });
    child.once("exit", (code, signal) => {
      if (code !== 0) {
        rejectOnce(new Error(`${command} failed (${signal ?? code})`));
        return;
      }
      childCompleted = true;
      resolveWhenComplete();
    });
  });
}

function runWithInputFile(command, arguments_, path) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "inherit", "inherit"],
    });
    createReadStream(path).pipe(child.stdin);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
