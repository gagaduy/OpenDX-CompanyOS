/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const makefile = resolve("Makefile");
const fixedTimestamp = "20260814-120102";

function createHarness() {
  const root = mkdtempSync(join(tmpdir(), "opendx-make-backup-"));
  const bin = join(root, "bin");
  const backupDirectory = join(root, "infra", "backups");
  const dockerLog = join(root, "docker-calls.jsonl");
  mkdirSync(bin, { recursive: true });
  mkdirSync(backupDirectory, { recursive: true });

  const datePath = join(bin, "date");
  writeFileSync(datePath, `#!/bin/sh\nprintf '%s\\n' '${fixedTimestamp}'\n`);
  chmodSync(datePath, 0o755);

  const dockerPath = join(bin, "docker");
  writeFileSync(dockerPath, `#!/usr/bin/env node
const { appendFileSync } = await import("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_DOCKER_LOG, JSON.stringify(args) + "\\n");
const formatArgument = args.find((argument) => argument.startsWith("--format="));
const format = formatArgument?.slice("--format=".length);
if (format !== undefined && process.env.FAIL_DUMP_FORMAT === format) {
  process.stderr.write("forced " + format + " dump failure\\n");
  process.exit(23);
}
if (format !== undefined && process.env.EMPTY_DUMP_FORMAT !== format) {
  process.stdout.write(format + " backup\\n");
}
`);
  chmodSync(dockerPath, 0o755);

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
        },
      });
    },
    backupNames() {
      return readdirSync(backupDirectory)
        .filter((name) => name.endsWith(".sql") || name.endsWith(".dump"))
        .sort();
    },
    temporaryBackupNames() {
      return readdirSync(backupDirectory).filter((name) => name.includes(".tmp."));
    },
    readBackup(extension) {
      const name = readdirSync(backupDirectory).find((candidate) => candidate.endsWith(extension));
      assert(name, `missing ${extension} backup`);
      return readFileSync(join(backupDirectory, name), "utf8");
    },
    seedBackup(name, contents) {
      const path = join(backupDirectory, name);
      writeFileSync(path, contents);
      return path;
    },
    readNamedBackup(name) {
      return readFileSync(join(backupDirectory, name), "utf8");
    },
    dockerCalls() {
      try {
        return readFileSync(dockerLog, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
      } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
      }
    },
  };
}

test("db-backup publishes one SQL/custom pair with one UTC timestamp", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);

  const result = harness.runMake("db-backup");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(harness.backupNames(), [
    `opendx-${fixedTimestamp}.dump`,
    `opendx-${fixedTimestamp}.sql`,
  ]);
  assert.match(harness.readBackup(".sql"), /plain backup/);
  assert.match(harness.readBackup(".dump"), /custom backup/);
  assert(harness.dockerCalls().some((call) =>
    ["--format=plain", "--clean", "--if-exists", "--no-owner", "--no-privileges"]
      .every((argument) => call.includes(argument))));
  assert(harness.dockerCalls().some((call) =>
    ["--format=custom", "--no-owner", "--no-privileges"]
      .every((argument) => call.includes(argument))));
});

test("db-backup publishes neither final file when either dump fails", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);

  const result = harness.runMake("db-backup", { FAIL_DUMP_FORMAT: "custom" });

  assert.notEqual(result.status, 0);
  assert.deepEqual(harness.backupNames(), []);
  assert.deepEqual(harness.temporaryBackupNames(), []);
});

test("db-backup rejects a final-path collision without overwriting it", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  harness.seedBackup(`opendx-${fixedTimestamp}.sql`, "keep-me");

  const result = harness.runMake("db-backup");

  assert.notEqual(result.status, 0);
  assert.equal(harness.readNamedBackup(`opendx-${fixedTimestamp}.sql`), "keep-me");
  assert.deepEqual(harness.temporaryBackupNames(), []);
});

test("db-restore sends SQL to psql with fail-fast transaction flags", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const backup = harness.seedBackup("backup with spaces.sql", "SELECT 1;");

  const result = harness.runMake("db-restore", {}, [`BACKUP=${backup}`]);

  assert.equal(result.status, 0, result.stderr);
  assert(harness.dockerCalls().some((call) =>
    ["psql", "-X", "--set", "ON_ERROR_STOP=1", "--single-transaction"]
      .every((argument) => call.includes(argument))));
  assert(!harness.dockerCalls().some((call) => call.includes("pg_restore")));
});

test("db-restore sends custom archives to pg_restore", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const backup = harness.seedBackup("backup.dump", "custom backup");

  const result = harness.runMake("db-restore", {}, [`BACKUP=${backup}`]);

  assert.equal(result.status, 0, result.stderr);
  assert(harness.dockerCalls().some((call) =>
    ["pg_restore", "--clean", "--if-exists", "--no-owner", "--exit-on-error", "--single-transaction"]
      .every((argument) => call.includes(argument))));
});

test("db-restore rejects unsupported formats before stopping services", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const backup = harness.seedBackup("backup.zip", "not supported");

  const result = harness.runMake("db-restore", {}, [`BACKUP=${backup}`]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must end in \.sql or \.dump/);
  assert.deepEqual(harness.dockerCalls(), []);
});

test("db-restore treats shell metacharacters in a SQL path as literal data", (context) => {
  const harness = createHarness();
  context.after(harness.cleanup);
  const backup = harness.seedBackup("backup-`touch PWNED`.sql", "SELECT 1;");

  const result = harness.runMake("db-restore", {}, [`BACKUP=${backup}`]);

  assert.equal(result.status, 0, result.stderr);
  assert(!readdirSync(harness.root).includes("PWNED"));
  assert(harness.dockerCalls().some((call) => call.includes("psql")));
});
