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

console.info("Backup/restore safety check passed.");
