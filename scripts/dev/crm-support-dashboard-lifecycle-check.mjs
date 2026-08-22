#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const databaseName = `opendx_phase7_lifecycle_${process.pid}_test`;
const restoreDatabaseName = `${databaseName}_restore_test`;
const databaseUrl = `postgres://opendx_local:opendx_local_password@localhost:${process.env.POSTGRES_PORT ?? "55432"}/${databaseName}`;
const evidenceDirectory = process.env.CRM_SUPPORT_DASHBOARD_EVIDENCE_DIR ?? join(tmpdir(), "opendx-crm-support-dashboard-exit");
const compose = ["compose", "--env-file", ".env", "-f", "infra/docker/docker-compose.yml"];

async function main() {
  await run("docker", [...compose, "up", "-d", "postgres"]);
  await createDatabase(databaseName);
  try {
    await mkdir(evidenceDirectory, { recursive: true });
    await run("pnpm", ["--filter", "@opendx/api", "db:migrate:all"], { DATABASE_URL: databaseUrl });
    await postgresExec(databaseName, fixtureSql());
    await run("docker", [...compose, "restart", "postgres"]);
    const postRestartTickets = await postgresScalar(databaseName, "SELECT count(*) FROM support_tickets");
    if (postRestartTickets !== "1") throw new Error(`Expected one support ticket after restart, got ${postRestartTickets}`);

    const archivePath = join(evidenceDirectory, "crm-support-dashboard.dump");
    await runToFile("docker", [...compose, "exec", "-T", "postgres", "pg_dump", "-U", "opendx_local", "-Fc", databaseName], archivePath);
    await createDatabase(restoreDatabaseName);
    await runWithInputFile("docker", [...compose, "exec", "-T", "postgres", "pg_restore", "-U", "opendx_local", "-d", restoreDatabaseName, "--no-owner", "--exit-on-error", "--single-transaction"], archivePath);
    const restored = await postgresScalar(restoreDatabaseName, "SELECT (SELECT count(*) FROM crm_notes) || ':' || (SELECT count(*) FROM support_tickets)");
    if (restored !== "1:1") throw new Error(`Expected restored CRM/Support counts 1:1, got ${restored}`);

    await run("pnpm", ["--filter", "@opendx/api", "db:rollback:support:all"], { DATABASE_URL: databaseUrl });
    await run("pnpm", ["--filter", "@opendx/api", "db:rollback:crm:all"], { DATABASE_URL: databaseUrl });
    const rolledBack = await postgresScalar(databaseName, "SELECT to_regclass('public.crm_notes') IS NULL AND to_regclass('public.support_tickets') IS NULL AND to_regclass('public.orders') IS NOT NULL");
    if (rolledBack !== "t") throw new Error("CRM/Support rollback did not preserve earlier commerce tables");
    await run("pnpm", ["--filter", "@opendx/api", "db:migrate:crm"], { DATABASE_URL: databaseUrl });
    await run("pnpm", ["--filter", "@opendx/api", "db:migrate:support"], { DATABASE_URL: databaseUrl });
    const reapplied = await postgresScalar(databaseName, "SELECT (SELECT count(*) FROM crm_migrations) || ':' || (SELECT count(*) FROM support_migrations)");
    if (reapplied !== "1:2") throw new Error(`Expected CRM/Support migrations 1:2 after reapply, got ${reapplied}`);

    const evidencePath = join(evidenceDirectory, "lifecycle.json");
    await writeFile(evidencePath, `${JSON.stringify({ result: "passed", databaseIsolation: "disposable", restartPersistence: true, customFormatBackupRestore: true, crmSupportRollbackReapply: true, preservedEarlierCommerceTruth: true, generatedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    console.log(`Phase 7 lifecycle acceptance passed. Evidence: ${evidencePath}`);
  } finally {
    await dropDatabase(databaseName);
    await dropDatabase(restoreDatabaseName);
  }
}

function fixtureSql() {
  return `
    INSERT INTO customers(id,email,email_verified_at,full_name,phone_number,status,version,created_at,updated_at)
    VALUES ('b1000000-0000-4000-8000-000000000001','phase7@example.invalid','2026-08-10T00:00:00.000Z','Phase Seven','0901000001','active',1,'2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z');
    INSERT INTO crm_notes(id,customer_id,author_id,body,created_at)
    VALUES ('f4000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','staff-crm','Lifecycle note','2026-08-10T00:00:00.000Z');
    INSERT INTO crm_followups(id,customer_id,due_at,description,status,version,created_by_id,created_at,updated_at)
    VALUES ('f5000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','2026-08-11T00:00:00.000Z','Lifecycle follow-up','open',1,'staff-crm','2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z');
    INSERT INTO support_tickets(id,customer_id,subject,description,priority,status,version,created_by_id,created_at,updated_at)
    VALUES ('f2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Lifecycle ticket','Lifecycle support ticket','urgent','new',1,'staff-crm','2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z');
  `;
}

async function createDatabase(name) {
  await run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "opendx_local", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${name}`]);
}

async function dropDatabase(name) {
  await run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "opendx_local", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${name}'`]).catch(() => undefined);
  await run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "opendx_local", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${name}`]).catch(() => undefined);
}

async function postgresExec(database, query) {
  await run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "opendx_local", "-d", database, "-v", "ON_ERROR_STOP=1", "-c", query]);
}

async function postgresScalar(database, query) {
  return capture("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "opendx_local", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", query]).then((value) => value.trim());
}

function run(command, arguments_, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd: process.cwd(), env: { ...process.env, ...extraEnvironment }, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`)));
  });
}

function capture(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve(output) : reject(new Error(`${command} failed (${signal ?? code})`)));
  });
}

function runToFile(command, arguments_, path) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(path, { mode: 0o600 });
    const child = spawn(command, arguments_, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.pipe(output);
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`)));
  });
}

function runWithInputFile(command, arguments_, path) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd: process.cwd(), env: process.env, stdio: ["pipe", "inherit", "inherit"] });
    createReadStream(path).pipe(child.stdin);
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`)));
  });
}

await main();
