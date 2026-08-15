#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "node:crypto";
import {
  lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const archives = {
  opendx: "opendx.dump",
  temporal: "temporal.dump",
  temporal_visibility: "temporal_visibility.dump",
};
const payloadFiles = Object.values(archives);
const completeFiles = [...payloadFiles, "checksums.sha256", "manifest.json"].sort();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function inspectPayload(directory) {
  return Object.fromEntries(payloadFiles.map((file) => {
    const path = join(directory, file);
    const details = statSync(path);
    invariant(details.isFile() && details.size > 0, `Recovery member is empty or invalid: ${file}`);
    return [file, { bytes: details.size, sha256: hash(path) }];
  }));
}

function create(directory, metadataPath) {
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  const files = inspectPayload(directory);
  const manifest = {
    manifestVersion: 1,
    createdAt: metadata.createdAt,
    dumpFormat: "postgresql-custom",
    databases: Object.fromEntries(
      Object.entries(archives).map(([database, archive]) => [database, { archive }]),
    ),
    versions: metadata.versions,
    files,
  };
  writeFileSync(
    join(directory, "checksums.sha256"),
    payloadFiles.map((file) => `${files[file].sha256}  ${file}`).join("\n") + "\n",
    { flag: "wx" },
  );
  writeFileSync(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" },
  );
}

function verify(directory, expectedTemporalVersion) {
  invariant(!lstatSync(directory).isSymbolicLink(), "Recovery set path must not be a symbolic link");
  const resolved = realpathSync(directory);
  const entries = readdirSync(resolved).sort();
  invariant(
    JSON.stringify(entries) === JSON.stringify(completeFiles),
    "Recovery set has missing or unexpected members",
  );
  for (const entry of entries) {
    invariant(basename(entry) === entry && !lstatSync(join(resolved, entry)).isSymbolicLink(), "Unsafe recovery member path");
  }

  const manifest = JSON.parse(readFileSync(join(resolved, "manifest.json"), "utf8"));
  invariant(manifest.manifestVersion === 1, "Unsupported recovery manifest version");
  invariant(manifest.dumpFormat === "postgresql-custom", "Unsupported recovery dump format");
  invariant(
    JSON.stringify(manifest.databases) === JSON.stringify(Object.fromEntries(
      Object.entries(archives).map(([database, archive]) => [database, { archive }]),
    )),
    "Recovery database member mapping is invalid",
  );
  invariant(
    !expectedTemporalVersion || manifest.versions?.temporal === expectedTemporalVersion,
    "Recovery set Temporal version is incompatible with this deployment",
  );
  invariant(
    manifest.versions?.schemas?.opendx
      && typeof manifest.versions.schemas.opendx === "object"
      && Object.keys(manifest.versions.schemas.opendx).length > 0,
    "Recovery manifest is missing opendx schema versions",
  );
  for (const schema of ["temporal", "temporal_visibility"]) {
    invariant(
      typeof manifest.versions?.schemas?.[schema] === "string"
        && manifest.versions.schemas[schema].length > 0,
      `Recovery manifest is missing ${schema} schema version`,
    );
  }

  const actualFiles = inspectPayload(resolved);
  invariant(JSON.stringify(manifest.files) === JSON.stringify(actualFiles), "Recovery checksum or file size mismatch");
  const expectedChecksums = payloadFiles
    .map((file) => `${actualFiles[file].sha256}  ${file}`).join("\n") + "\n";
  invariant(
    readFileSync(join(resolved, "checksums.sha256"), "utf8") === expectedChecksums,
    "Recovery checksum file mismatch",
  );
}

try {
  const [command, directory, argument] = process.argv.slice(2);
  invariant(command === "create" || command === "verify", "Expected create or verify command");
  invariant(directory, "Recovery set directory is required");
  if (command === "create") create(directory, argument);
  else verify(directory, argument);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
