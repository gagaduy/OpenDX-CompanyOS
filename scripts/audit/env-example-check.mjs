#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";

const required = [
  "OPENDX_ENV",
  "LOG_FORMAT",
  "LOG_LEVEL",
  "METRICS_ENABLED",
  "READINESS_TIMEOUT_MS",
  "JSON_BODY_LIMIT",
  "PRODUCTION_SEPAY_ACCEPTANCE_AMOUNT_VND",
];
const envExample = readFileSync(".env.example", "utf8");
const productionDocs = readFileSync("docs/deployment/production.md", "utf8");

for (const name of required) {
  if (!envExample.includes(`${name}=`)) {
    throw new Error(`.env.example missing ${name}`);
  }
  if (!productionDocs.includes(name)) {
    throw new Error(`production docs missing ${name}`);
  }
}

console.info("Environment example check passed.");
