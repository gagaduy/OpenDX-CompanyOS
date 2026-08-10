#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";

const matrix = readFileSync("docs/security/authorization-matrix.md", "utf8");
const requiredFragments = [
  "administrator",
  "catalog_manager",
  "inventory_manager",
  "inventory_operator",
  "operations_manager",
  "finance_operator",
  "crm_operator",
  "support_operator",
  "executive_viewer",
  "customer session",
  "guest",
  "anonymous",
  "SePay IPN secret",
  "| deny |",
  "| allow |",
];

for (const fragment of requiredFragments) {
  if (!matrix.includes(fragment)) {
    throw new Error(`Authorization matrix missing ${fragment}`);
  }
}

console.info("Authorization matrix check passed.");
