#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const composePath = "infra/deploy/compose.production.yml";
const caddyPath = "infra/deploy/Caddyfile";
const compose = readFileSync(composePath, "utf8");
const caddy = readFileSync(caddyPath, "utf8");

const requiredComposeFragments = [
  "caddy:",
  "api:",
  "console:",
  "storefront:",
  "postgres:",
  "minio:",
  "keycloak:",
  "clamav:",
  "target: production",
  "COOKIE_SECURE: \"true\"",
  "OPENDX_ENV: production",
];
for (const fragment of requiredComposeFragments) {
  if (!compose.includes(fragment)) {
    throw new Error(`Missing production Compose fragment: ${fragment}`);
  }
}

for (const hostname of [
  "shop.example.com",
  "console.example.com",
  "api.example.com",
  "auth.example.com",
]) {
  if (!caddy.includes(hostname)) {
    throw new Error(`Missing Caddy route for ${hostname}`);
  }
}

const result = spawnSync(
  "docker",
  ["compose", "-f", composePath, "config", "--quiet"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      POSTGRES_PASSWORD: "change-me-postgres",
      MINIO_ROOT_PASSWORD: "change-me-minio",
      KEYCLOAK_ADMIN_PASSWORD: "change-me-keycloak",
      GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
      SEPAY_MERCHANT_ID: "merchant",
      SEPAY_SECRET_KEY: "secret",
      SEPAY_IPN_SECRET: "ipn-secret",
    },
  },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.info("Production Compose check passed.");
