#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from "node:child_process";

const checks = [
  {
    name: "storefront",
    command: "node",
    arguments: ["scripts/dev/storefront-browser-check.mjs"],
  },
  {
    name: "console-orders-payments",
    command: "node",
    arguments: ["scripts/dev/console-browser-check.mjs"],
  },
  {
    name: "crm-support-dashboard",
    command: "node",
    arguments: ["scripts/dev/crm-support-dashboard-browser-check.mjs"],
  },
];

for (const check of checks) {
  await run(check);
}

console.info("Phase 8 accessibility check passed.");

function run(check) {
  return new Promise((resolve, reject) => {
    const child = spawn(check.command, check.arguments, {
      stdio: "inherit",
      env: {
        ...process.env,
        BROWSER_EVIDENCE_DIR:
          process.env.BROWSER_EVIDENCE_DIR ??
          `/tmp/opendx-phase8-accessibility/${check.name}`,
      },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${check.name} accessibility check failed with ${
            signal ?? `exit ${code}`
          }`,
        ),
      );
    });
  });
}
