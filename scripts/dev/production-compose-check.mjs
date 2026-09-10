#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  findTrackedPrivateKeyFiles,
  productionFixtureEnvironment,
  renderProductionConfig,
  readProductionDockerfiles,
  validateAgenticProductionConfig,
  validateTlsHostAccess,
} from "./agentic-production-compose-check.mjs";

const composePath = "infra/deploy/compose.production.yml";
const developmentComposePath = "infra/docker/docker-compose.yml";
const caddyPath = "infra/deploy/Caddyfile";
const keycloakRealmPath = "infra/keycloak/realm-production.json";
const compose = readFileSync(composePath, "utf8");
const developmentCompose = readFileSync(developmentComposePath, "utf8");
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
  "temporal:",
  "ai-runtime:",
  "ai-worker:",
  "target: production",
  "COOKIE_SECURE: \"true\"",
  "OPENDX_ENV: production",
  "FACEBOOK_PAGE_ACCESS_TOKEN: ${FACEBOOK_PAGE_ACCESS_TOKEN:?FACEBOOK_PAGE_ACCESS_TOKEN is required}",
];
for (const fragment of requiredComposeFragments) {
  if (!compose.includes(fragment)) {
    throw new Error(`Missing production Compose fragment: ${fragment}`);
  }
}

if (!developmentCompose.includes("FACEBOOK_PAGE_ACCESS_TOKEN: ${FACEBOOK_PAGE_ACCESS_TOKEN:-}")) {
  throw new Error("Development API must receive FACEBOOK_PAGE_ACCESS_TOKEN from the local environment");
}

for (const hostnameVariable of [
  "STOREFRONT_HOST",
  "CONSOLE_HOST",
  "API_HOST",
  "KEYCLOAK_HOST",
]) {
  if (!caddy.includes(`{$${hostnameVariable}:`)) {
    throw new Error(`Missing configurable Caddy route for ${hostnameVariable}`);
  }
}

const envFile = process.argv.slice(2).find((argument) => argument !== "--");
const environment = envFile ? process.env : productionFixtureEnvironment(process.env);
const composeArgs = ["compose"];
if (envFile) composeArgs.push("--env-file", envFile);
composeArgs.push("-f", composePath, "config", "--quiet");
const result = spawnSync(
  "docker",
  composeArgs,
  {
    stdio: "inherit",
    env: environment,
  },
);

if (result.status !== 0) process.exit(result.status ?? 1);
const tracked = spawnSync("git", ["ls-files"], { encoding: "utf8" });
if (tracked.status !== 0) process.exit(tracked.status ?? 1);
const productionConfig = renderProductionConfig(environment, envFile);
validateAgenticProductionConfig({
  config: productionConfig,
  caddy,
  keycloakRealm: JSON.parse(readFileSync(keycloakRealmPath, "utf8")),
  trackedFiles: tracked.stdout.split("\n").filter(Boolean),
  trackedPrivateKeyFiles: findTrackedPrivateKeyFiles(),
  productionDockerfiles: readProductionDockerfiles(),
  strictDeploymentValues: Boolean(envFile),
});
if (envFile) validateTlsHostAccess(productionConfig);
console.info("Production Compose check passed.");
