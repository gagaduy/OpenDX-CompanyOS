#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const forbidden = [
  { name: "SePay API key", pattern: /spsk_(live|test)_[A-Za-z0-9]/g },
  {
    name: "PostgreSQL credential URL",
    pattern: /postgres:\/\/[^:\s]+:[^@\s]+@[^/\s]+\/[^\s`'")]+/g,
  },
];
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((path) => path !== ".env")
  .filter((path) => !path.endsWith(".png"));
const violations = [];

for (const path of files) {
  const source = readFileSync(path, "utf8");
  for (const rule of forbidden) {
    for (const match of source.matchAll(rule.pattern)) {
      const value = match[0];
      if (isAllowedPlaceholder(path, value)) continue;
      violations.push(`${path}: ${rule.name}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Secret fixture audit failed:\n${violations.join("\n")}`);
}

console.info("Secret fixture audit passed.");

function isAllowedPlaceholder(path, value) {
  if (path === ".env.example") return true;
  if (value.includes("localhost") || value.includes("@postgres:")) return true;
  if (value.includes("@database/")) return true;
  if (value.includes("opendx_local:opendx_local_password")) return true;
  if (value.includes("user:password") || value.includes("user:pass")) return true;
  if (value.includes("opendx:secret")) return true;
  return false;
}
