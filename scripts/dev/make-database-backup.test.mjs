/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const makefile = resolve("Makefile");
const fixedTimestamp = "20260814-120102";
const members = ["opendx.dump", "temporal.dump", "temporal_visibility.dump"];

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function createHarness() {
  const root = mkdtempSync(join(tmpdir(), "opendx-make-backup-"));
  const bin = join(root, "bin");
  const backupDirectory = join(root, "infra", "backups");
  const dockerLog = join(root, "docker-calls.jsonl");
  mkdirSync(bin, { recursive: true });
  mkdirSync(backupDirectory, { recursive: true });

  writeFileSync(join(bin, "date"), `#!/bin/sh\nprintf '%s\\n' '${fixedTimestamp}'\n`);
  chmodSync(join(bin, "date"), 0o755);

  writeFileSync(join(bin, "docker"), `#!/usr/bin/env node
const { appendFileSync } = await import("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_DOCKER_LOG, JSON.stringify(args) + "\\n");
if (process.env.FAIL_STOP_SERVICE && args.includes("stop") && args.includes(process.env.FAIL_STOP_SERVICE)) {
  process.exit(25);
}
if (process.env.FAIL_UP_SERVICE && args.includes("up") && args.includes(process.env.FAIL_UP_SERVICE)) {
  process.exit(26);
}
const databaseIndex = args.indexOf("-d");
const database = databaseIndex >= 0 ? args[databaseIndex + 1] : "";
if (args.includes("ps") && args.includes("--services")) {
  process.stdout.write("caddy\\nconsole\\nstorefront\\nai-worker\\napi\\nai-runtime\\ntemporal\\npostgres\\n");
} else if (args.includes("pg_dump")) {
  if (process.env.FAIL_DUMP_DATABASE === database) process.exit(23);
  process.stdout.write(database + " custom backup\\n");
} else if (args.includes("pg_restore") && args.includes("-l")) {
  if (process.env.FAIL_ARCHIVE_DATABASE === database) process.exit(24);
  process.stdout.write("archive listing\\n");
  } else if (args.includes("psql") && args.includes("-Atqc")) {
    const query = args[args.indexOf("-Atqc") + 1] ?? "";
    if (query.includes("server_version")) process.stdout.write("18.3\\n");
    else if (query.includes("pg_roles")) process.stdout.write("2\\n");
    else if (query.includes("agentic_policies")) process.stdout.write((process.env.ORPHANED_AGENTIC_POLICY_COUNT ?? "0") + "\\n");
  else if (database === "temporal") process.stdout.write("1.17\\n");
  else if (database === "temporal_visibility") process.stdout.write("1.9\\n");
  else process.stdout.write('{"agentic":"001_initial"}\\n');
}
`);
  chmodSync(join(bin, "docker"), 0o755);

  return {
    root,
    backupDirectory,
    dockerLog,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    runMake(target, environment = {}, makeVariables = []) {
      return spawnSync("make", ["-f", makefile, target, ...makeVariables], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ...environment,
          PATH: `${bin}:${process.env.PATH}`,
          FAKE_DOCKER_LOG: dockerLog,
          OPENDX_MAINTENANCE_LOCK_DIR: join(root, "maintenance.lock"),
        },
      });
    },
    recoverySets() {
      return readdirSync(backupDirectory).filter((name) => name.startsWith("recovery-")).sort();
    },
    dockerCalls() {
      try {
        return readFileSync(dockerLog, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
      } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
      }
    },
    createRecoverySet(name = `recovery-${fixedTimestamp}`) {
      const directory = join(backupDirectory, name);
      mkdirSync(directory);
      const checksums = {};
      const files = {};
      for (const member of members) {
        const contents = `${member} contents\n`;
        writeFileSync(join(directory, member), contents);
        checksums[member] = sha256(contents);
        files[member] = { bytes: Buffer.byteLength(contents), sha256: checksums[member] };
      }
      writeFileSync(join(directory, "checksums.sha256"), members
        .map((member) => `${checksums[member]}  ${member}`).join("\n") + "\n");
      writeFileSync(join(directory, "manifest.json"), JSON.stringify({
        manifestVersion: 1,
        createdAt: "2026-08-14T12:01:02Z",
        dumpFormat: "postgresql-custom",
        databases: {
          opendx: { archive: "opendx.dump" },
          temporal: { archive: "temporal.dump" },
          temporal_visibility: { archive: "temporal_visibility.dump" },
        },
        versions: {
          postgresql: "18.3",
          temporal: "1.31.2",
          schemas: { opendx: { agentic: "001_initial" }, temporal: "1.17", temporal_visibility: "1.9" },
        },
        files,
      }, null, 2) + "\n");
      return directory;
    },
  };
}

test("db-backup publishes one complete three-database recovery set", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);

  const result = harness.runMake("db-backup");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(harness.recoverySets(), [`recovery-${fixedTimestamp}`]);
  const directory = join(harness.backupDirectory, harness.recoverySets()[0]);
  assert.deepEqual(readdirSync(directory).sort(), [
    "checksums.sha256", "manifest.json", ...members,
  ].sort());
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.databases).sort(), ["opendx", "temporal", "temporal_visibility"]);
  assert.equal(manifest.versions.temporal, "1.31.2");
  assert(!JSON.stringify(manifest).match(/password|secret/i));

  const calls = harness.dockerCalls();
  assert(calls.some((call) => call.includes("stop") && call.includes("console") && call.includes("storefront")));
  assert(calls.some((call) => call.includes("stop") && call.includes("ai-worker")));
  assert.equal(calls.filter((call) => call.includes("pg_dump")).length, 3);
  assert.equal(calls.filter((call) => call.includes("pg_restore") && call.includes("-l")).length, 3);
  assert(calls.some((call) => call.includes("up") && call.includes("--wait") && call.includes("temporal")));
});

test("db-backup publishes no set and restarts services when a dump fails", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);

  const result = harness.runMake("db-backup", { FAIL_DUMP_DATABASE: "temporal" });

  assert.notEqual(result.status, 0);
  assert.deepEqual(harness.recoverySets(), []);
  assert(harness.dockerCalls().some((call) => call.includes("up") && call.includes("--wait") && call.includes("ai-worker")));
});

test("db-backup restores prior services when quiescing fails midway", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);

  const result = harness.runMake("db-backup", { FAIL_STOP_SERVICE: "api" });

  assert.notEqual(result.status, 0);
  const calls = harness.dockerCalls();
  assert(calls.some((call) => call.includes("up") && call.includes("--wait") && call.includes("temporal")));
  assert(calls.some((call) => call.includes("up") && call.includes("--wait") && call.includes("console")));
});

test("db-backup reports any restart failure while attempting later services", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);

  const result = harness.runMake("db-backup", { FAIL_UP_SERVICE: "ai-runtime" });

  assert.notEqual(result.status, 0);
  const calls = harness.dockerCalls();
  assert(calls.some((call) => call.includes("up") && call.includes("ai-runtime")));
  assert(calls.some((call) => call.includes("up") && call.includes("api")));
  assert(calls.some((call) => call.includes("up") && call.includes("storefront")));
});

test("db-backup rejects a recovery-set collision", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const existing = harness.createRecoverySet();

  const result = harness.runMake("db-backup");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists/i);
  assert(readFileSync(join(existing, "opendx.dump"), "utf8").includes("contents"));
});

test("database operations reject an active lifecycle checker lock", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const lock = join(harness.root, "lifecycle.lock");
  writeFileSync(lock, "active");

  const result = harness.runMake("db-backup", { AGENTIC_WORKFLOW_LOCK_FILE: lock });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checker lock is held/i);
  assert.deepEqual(harness.dockerCalls(), []);
});

test("database operations acquire one atomic maintenance lock", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  mkdirSync(join(harness.root, "maintenance.lock"));

  const result = harness.runMake("db-backup");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already running/i);
  assert.deepEqual(harness.dockerCalls(), []);
});

test("db-restore verifies and restores all recovery-set members in order", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const recoverySet = harness.createRecoverySet();

  const result = harness.runMake("db-restore", {}, [`BACKUP=${recoverySet}`]);

  assert.equal(result.status, 0, result.stderr);
  const calls = harness.dockerCalls();
  assert.equal(calls.filter((call) => call.includes("pg_restore") && call.includes("-l")).length, 3);
  const restores = calls.filter((call) => call.includes("pg_restore") && !call.includes("-l"));
  assert.equal(restores.length, 4);
  assert(restores[0].includes("opendx") && restores[0].includes("--section=pre-data") && restores[0].includes("--section=data"));
  assert(restores[1].includes("opendx") && restores[1].includes("--section=post-data"));
  assert(calls.some((call) => call.includes("run") && call.includes("migrate")));
  assert(calls.some((call) => call.includes("run") && call.includes("temporal-schema")));
  assert(calls.some((call) => call.includes("run") && call.includes("temporal-namespace")));
});

test("production restore validates and uses the production application owner", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const recoverySet = harness.createRecoverySet();

  const result = harness.runMake("db-restore", {
    OPENDX_DEPLOYMENT_MODE: "production",
  }, [`BACKUP=${recoverySet}`]);

  assert.equal(result.status, 0, result.stderr);
  const opendxRestore = harness.dockerCalls().find((call) =>
    call.includes("pg_restore") && call.includes("opendx") && !call.includes("-l"));
  assert(opendxRestore);
  assert.equal(opendxRestore[opendxRestore.indexOf("-U") + 1], "opendx");
  assert(harness.dockerCalls().some((call) => call.some((argument) => argument.includes("pg_roles"))));
});

test("production restore refuses orphaned Agentic policies", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const recoverySet = harness.createRecoverySet();

  const result = harness.runMake("db-restore", {
    OPENDX_DEPLOYMENT_MODE: "production",
    ORPHANED_AGENTIC_POLICY_COUNT: "4",
  }, [`BACKUP=${recoverySet}`]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /4 orphaned Agentic policies/);
  assert.equal(harness.dockerCalls().filter((call) => call.includes("stop")).length, 0);
  assert.equal(harness.dockerCalls().filter((call) => call.includes("DELETE FROM agentic_policies")).length, 0);
});

test("db-restore rejects checksum mismatch before stopping services", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const recoverySet = harness.createRecoverySet();
  writeFileSync(join(recoverySet, "temporal.dump"), "tampered\n");

  const result = harness.runMake("db-restore", {}, [`BACKUP=${recoverySet}`]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum/i);
  assert.deepEqual(harness.dockerCalls(), []);
});

test("db-restore rejects an incomplete or substituted recovery set", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const recoverySet = harness.createRecoverySet();
  const manifestPath = join(recoverySet, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.databases.temporal.archive = "opendx.dump";
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const result = harness.runMake("db-restore", {}, [`BACKUP=${recoverySet}`]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /database member/i);
  assert.deepEqual(harness.dockerCalls(), []);
});

test("db-restore rejects an incompatible manifest before stopping services", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const recoverySet = harness.createRecoverySet();
  const manifestPath = join(recoverySet, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.manifestVersion = 2;
  writeFileSync(manifestPath, JSON.stringify(manifest));

  const result = harness.runMake("db-restore", {}, [`BACKUP=${recoverySet}`]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest version/i);
  assert.deepEqual(harness.dockerCalls(), []);
});

test("legacy opendx-only restore requires an explicit local-only flag", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const legacy = join(harness.backupDirectory, "legacy.dump");
  writeFileSync(legacy, "legacy custom backup\n");

  const rejected = harness.runMake("db-restore", {}, [`BACKUP=${legacy}`]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /ALLOW_OPENDX_ONLY_RESTORE=1/);
  assert.deepEqual(harness.dockerCalls(), []);

  const allowed = harness.runMake("db-restore", { ALLOW_OPENDX_ONLY_RESTORE: "1" }, [`BACKUP=${legacy}`]);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(harness.dockerCalls().filter((call) => call.includes("pg_restore") && !call.includes("-l")).length, 1);

  const production = harness.runMake("db-restore", {
    ALLOW_OPENDX_ONLY_RESTORE: "1",
    OPENDX_DEPLOYMENT_MODE: "production",
  }, [`BACKUP=${legacy}`]);
  assert.notEqual(production.status, 0);
  assert.match(production.stderr, /production/i);
});
