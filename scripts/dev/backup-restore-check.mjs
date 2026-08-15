#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";

for (const path of [
  "scripts/ops/postgres-backup.sh",
  "scripts/ops/postgres-restore.sh",
  "scripts/ops/minio-backup.sh",
  "scripts/ops/minio-restore.sh",
]) {
  const source = readFileSync(path, "utf8");
  if (!source.includes("set -euo pipefail")) {
    throw new Error(`${path} must fail closed`);
  }
  if (!source.includes("SPDX-License-Identifier: Apache-2.0")) {
    throw new Error(`${path} missing SPDX`);
  }
  if (source.includes("rm -rf $") || source.includes("rm -rf \"${")) {
    throw new Error(`${path} must not use recursive deletion through variables`);
  }
  if (!source.includes("realpath")) {
    throw new Error(`${path} must resolve target paths`);
  }
}

const recoveryHelper = readFileSync("scripts/ops/postgres-recovery-set.mjs", "utf8");
for (const required of [
  "opendx.dump",
  "temporal.dump",
  "temporal_visibility.dump",
  "manifest.json",
  "checksums.sha256",
  "manifestVersion",
  "Recovery checksum",
]) {
  if (!recoveryHelper.includes(required)) {
    throw new Error(`PostgreSQL recovery-set validation is missing: ${required}`);
  }
}

const backup = readFileSync("scripts/ops/postgres-backup.sh", "utf8");
const restore = readFileSync("scripts/ops/postgres-restore.sh", "utf8");
if (!backup.includes("pg_restore -l") || !restore.includes("pg_restore -l")) {
  throw new Error("Every PostgreSQL archive must be inspected before publication or restore");
}
if (!restore.includes("ALLOW_OPENDX_ONLY_RESTORE") || !restore.includes("forbidden in production")) {
  throw new Error("Legacy opendx-only restore must be explicit and local-only");
}
for (const checker of [
  "scripts/dev/agentic-workflow-lifecycle-check.mjs",
  "scripts/dev/agentic-workflow-recovery-check.mjs",
]) {
  if (!readFileSync(checker, "utf8").includes("opendx-database-maintenance.lock")) {
    throw new Error(`${checker} must share the atomic database maintenance lock`);
  }
}

console.info("Backup/restore safety check passed.");
