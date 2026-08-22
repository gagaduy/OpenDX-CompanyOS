#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const composePath = "infra/deploy/compose.production.yml";
const caddyPath = "infra/deploy/Caddyfile";
const keycloakRealmPath = "infra/keycloak/realm-production.json";
const longRunningServices = [
  "caddy", "postgres", "keycloak", "minio", "clamav", "api", "console",
  "storefront", "temporal", "ai-runtime", "ai-worker",
];
const temporalClientServices = ["ai-runtime", "ai-worker"];
const hardenedServices = [
  "caddy", "postgres-role-init", "temporal-db-init", "keycloak-reconcile", "api", "console",
  "storefront", "temporal", "ai-runtime", "ai-worker",
];
const clientTlsTargets = [
  "/run/temporal-tls",
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function productionFixtureEnvironment(base = process.env) {
  return {
    POSTGRES_PASSWORD: "test-only-postgres-7e4f0c31",
    POSTGRES_ADMIN_PASSWORD: "test-only-postgres-admin-5d8a2f10",
    POSTGRES_AGENTIC_READER_PASSWORD: "test-only-agentic-reader-8c63b420",
    TEMPORAL_DB_PASSWORD: "test-only-temporal-a018c923",
    MINIO_ROOT_PASSWORD: "test-only-minio-55bd9c87",
    KEYCLOAK_ADMIN_PASSWORD: "test-only-keycloak-813dea24",
    GOOGLE_CLIENT_ID: "test-only.apps.googleusercontent.com",
    SEPAY_MERCHANT_ID: "test-only-merchant",
    SEPAY_SECRET_KEY: "test-only-sepay-91d2a477",
    SEPAY_IPN_SECRET: "test-only-ipn-c56a218d",
    AGENTIC_CONTROL_CLIENT_SECRET: "test-only-control-51e30db8",
    AGENTIC_WORKER_CLIENT_SECRET: "test-only-worker-2c06b537",
    AGENT_CATALOG_CLIENT_SECRET: "test-only-agent-catalog-5fc08e31",
    AGENT_INVENTORY_CLIENT_SECRET: "test-only-agent-inventory-8b962ad4",
    AGENT_ORDER_CLIENT_SECRET: "test-only-agent-order-a71c409e",
    AGENT_FINANCE_CLIENT_SECRET: "test-only-agent-finance-c394fb61",
    AGENT_CRM_CLIENT_SECRET: "test-only-agent-crm-3d27a580",
    AGENT_SUPPORT_CLIENT_SECRET: "test-only-agent-support-e0427bc9",
    TEMPORAL_TLS_SERVER_DIR: "/tmp/opendx-production-fixtures/server",
    TEMPORAL_TLS_CLIENT_DIR: "/tmp/opendx-production-fixtures/client",
    TEMPORAL_TLS_SERVER_NAME: "temporal.internal",
    ...base,
  };
}

export function validateAgenticProductionConfig({
  config,
  caddy,
  trackedFiles,
  trackedPrivateKeyFiles = [],
  keycloakRealm,
  productionDockerfiles = {},
  strictDeploymentValues = false,
}) {
  const services = config.services ?? {};
  for (const required of [
    "postgres-role-init", "temporal-db-init", "temporal-schema", "temporal", "temporal-namespace",
    "keycloak-reconcile",
    "ai-runtime", "ai-worker",
  ]) {
    invariant(services[required], `Missing production Agentic service: ${required}`);
  }

  invariant(
    services.postgres.environment?.POSTGRES_USER
      !== services["postgres-role-init"].environment?.POSTGRES_APP_USER,
    "Production PostgreSQL bootstrap and application roles must be separate",
  );
  const applicationDatabase = new URL(services.api.environment.DATABASE_URL);
  const analyticsDatabase = new URL(
    services.api.environment.AGENTIC_ANALYTICS_DATABASE_URL,
  );
  invariant(
    analyticsDatabase.username === "opendx_agentic_reader"
      && analyticsDatabase.hostname === applicationDatabase.hostname
      && analyticsDatabase.pathname === applicationDatabase.pathname
      && analyticsDatabase.password !== applicationDatabase.password
      && services["postgres-role-init"].environment?.POSTGRES_AGENTIC_READER_USER
        === analyticsDatabase.username
      && services["postgres-role-init"].environment?.POSTGRES_AGENTIC_READER_PASSWORD
        === analyticsDatabase.password,
    "Production analytics database must use the isolated analytics reader role and secret",
  );
  const departmentSecretFields = [
    "AGENT_CATALOG_CLIENT_SECRET", "AGENT_INVENTORY_CLIENT_SECRET",
    "AGENT_ORDER_CLIENT_SECRET", "AGENT_FINANCE_CLIENT_SECRET",
    "AGENT_CRM_CLIENT_SECRET", "AGENT_SUPPORT_CLIENT_SECRET",
  ];
  const reconciler = services["keycloak-reconcile"].environment ?? {};
  const departmentSecrets = departmentSecretFields.map((field) => {
    const secret = reconciler[field];
    invariant(
      typeof secret === "string" && secret.length > 0
        && services.api.environment?.[field] === secret
        && services.keycloak.environment?.[field] === secret,
      `Production ${field} must be required and consistent across API and Keycloak`,
    );
    return secret;
  });
  const forbiddenSharedSecrets = new Set([
    reconciler.AGENTIC_CONTROL_CLIENT_SECRET,
    reconciler.AGENTIC_WORKER_CLIENT_SECRET,
    services.postgres.environment?.POSTGRES_PASSWORD,
    services.api.environment?.MINIO_SECRET_KEY,
    services.api.environment?.SEPAY_SECRET_KEY,
    services.api.environment?.SEPAY_IPN_SECRET,
    reconciler.KEYCLOAK_ADMIN_PASSWORD,
    applicationDatabase.password,
  ].filter(Boolean));
  invariant(
    new Set(departmentSecrets).size === departmentSecrets.length
      && departmentSecrets.every((secret) => !forbiddenSharedSecrets.has(secret)),
    "Production department Agent secrets must be distinct from every Agent and service credential",
  );

  const realmMount = services.keycloak.volumes?.find(
    (mount) => mount.target === "/opt/keycloak/data/import/opendx-realm.json",
  );
  invariant(
    realmMount?.source?.endsWith("/infra/keycloak/realm-production.json"),
    "Production must import the production-safe Keycloak realm",
  );
  invariant(
    keycloakRealm && (!keycloakRealm.users
      || (Array.isArray(keycloakRealm.users) && keycloakRealm.users.length === 0)),
    "The production Keycloak realm must not contain users",
  );
  invariant(
    Array.isArray(keycloakRealm?.clients)
      && !keycloakRealm.clients.some((client) => client.clientId === "opendx-lifecycle-check"),
    "The production Keycloak realm must not contain the lifecycle client",
  );
  for (const clientId of [
    "agent-catalog", "agent-inventory", "agent-order",
    "agent-finance", "agent-crm", "agent-support",
  ]) {
    const client = keycloakRealm.clients.find((candidate) => candidate.clientId === clientId);
    invariant(
      client?.publicClient === false
        && client.serviceAccountsEnabled === true
        && client.standardFlowEnabled === false
        && client.directAccessGrantsEnabled === false,
      `${clientId} must remain a confidential service-account-only client`,
    );
  }
  const consoleClient = keycloakRealm.clients.find(
    (client) => client.clientId === "opendx-console",
  );
  invariant(
    consoleClient
      && consoleClient.redirectUris?.join(",") === "${CONSOLE_ORIGIN}/auth/callback"
      && consoleClient.webOrigins?.join(",") === "${CONSOLE_ORIGIN}"
      && !/localhost|127\.0\.0\.1/i.test(JSON.stringify(keycloakRealm)),
    "The production Keycloak realm must bind browser redirects to CONSOLE_ORIGIN",
  );
  invariant(
    services.api.depends_on?.["keycloak-reconcile"]?.condition
      === "service_completed_successfully",
    "API startup must wait for Keycloak workload client reconciliation",
  );
  invariant(
    services["temporal-db-init"].depends_on?.["postgres-role-init"]?.condition
      === "service_completed_successfully",
    "Temporal database setup must wait for application role isolation",
  );

  invariant(!services.temporal.ports?.length, "Temporal must not expose a public port");
  invariant(
    Object.entries(services).every(([name, service]) => name === "caddy" || !service.ports?.length),
    "Only Caddy may publish production ports",
  );
  invariant(
    !/temporal(?::7233)?|ai-runtime/i.test(caddy),
    "Caddy must not route Temporal or AI Runtime endpoints",
  );
  invariant(
    /@internalAgentic\s+path\s+\/v1\/internal\/agentic\*[\s\S]*respond\s+@internalAgentic\s+404[\s\S]*reverse_proxy\s+api:4000/i.test(caddy),
    "Caddy must deny internal Agentic endpoints before the public API proxy",
  );
  const expectedCaddyHosts = {
    STOREFRONT_HOST: new URL(services.api.environment.STOREFRONT_ORIGIN).hostname,
    CONSOLE_HOST: new URL(services.api.environment.CONSOLE_ORIGIN).hostname,
    API_HOST: new URL(services.console.build.args.VITE_API_BASE_URL).hostname,
    KEYCLOAK_HOST: new URL(services.keycloak.environment.KC_HOSTNAME).hostname,
  };
  for (const [key, expectedHost] of Object.entries(expectedCaddyHosts)) {
    invariant(caddy.includes(`{$${key}:`), `Caddy must expose a configurable ${key} route`);
    invariant(
      services.caddy.environment?.[key] === expectedHost,
      `Caddy ${key} must match the configured production URL`,
    );
  }

  const consoleOrigin = new URL(services.api.environment.CONSOLE_ORIGIN).origin;
  const storefrontOrigin = new URL(services.api.environment.STOREFRONT_ORIGIN).origin;
  const apiOrigin = `https://${services.caddy.environment.API_HOST}`;
  const keycloakOrigin = new URL(services.keycloak.environment.KC_HOSTNAME).origin;
  const keycloakIssuer = `${keycloakOrigin}/realms/opendx`;
  invariant(
    services.console.build.args.VITE_OIDC_REDIRECT_URI
      === `${consoleOrigin}/auth/callback`,
    "Console redirect URI must match CONSOLE_ORIGIN",
  );
  invariant(
    services.console.build.args.VITE_OIDC_POST_LOGOUT_REDIRECT_URI
      === `${consoleOrigin}/sign-in`,
    "Console post-logout redirect URI must match CONSOLE_ORIGIN",
  );
  invariant(
    new URL(services.storefront.build.args.VITE_STOREFRONT_ORIGIN).origin
      === storefrontOrigin,
    "Storefront origin must match STOREFRONT_ORIGIN",
  );
  invariant(
    services.console.build.args.VITE_API_BASE_URL === apiOrigin
      && services.storefront.build.args.VITE_API_BASE_URL === apiOrigin,
    "Frontend API origins must match the public Caddy API origin",
  );
  invariant(
    services.api.environment.KEYCLOAK_ISSUER === keycloakIssuer
      && services.console.build.args.VITE_OIDC_AUTHORITY === keycloakIssuer,
    "OIDC authority and API issuer must match the public Keycloak realm",
  );
  if (strictDeploymentValues) {
    const publicHostnames = [
      ...Object.values(expectedCaddyHosts),
      new URL(consoleOrigin).hostname,
      new URL(storefrontOrigin).hostname,
      new URL(apiOrigin).hostname,
      new URL(keycloakOrigin).hostname,
    ];
    invariant(
      publicHostnames.every(
        (hostname) => hostname !== "localhost"
          && hostname !== "127.0.0.1"
          && hostname !== "example.com"
          && !hostname.endsWith(".example.com"),
      ),
      "Production configuration contains a placeholder production hostname",
    );
  }

  invariant(
    String(services.temporal.environment?.TEMPORAL_TLS_REQUIRE_CLIENT_AUTH) === "true",
    "Temporal must require TLS client authentication",
  );
  invariant(
    String(services.temporal.environment?.TEMPORAL_ALLOW_NO_AUTH) === "true",
    "Temporal no-authorizer mode must be explicit inside the private mTLS boundary",
  );
  for (const serviceName of temporalClientServices) {
    const service = services[serviceName];
    invariant(
      String(service.environment?.TEMPORAL_TLS_ENABLED) === "true",
      `${serviceName} must be TLS-enabled in production`,
    );
    invariant(
      service.environment?.TEMPORAL_TLS_SERVER_NAME,
      `${serviceName} must validate the Temporal TLS server name`,
    );
    requireReadOnlyMounts(serviceName, service, clientTlsTargets);
  }
  const tlsReaderGroup = services.temporal.group_add?.[0];
  invariant(/^\d+$/.test(String(tlsReaderGroup)), "Temporal TLS reader group must be numeric");
  for (const serviceName of ["temporal", "temporal-namespace", ...temporalClientServices]) {
    invariant(
      services[serviceName].group_add?.includes(tlsReaderGroup),
      `${serviceName} must join the Temporal TLS reader group`,
    );
  }
  requireReadOnlyMounts("temporal", services.temporal, [
    "/run/temporal-tls",
  ]);
  requireReadOnlyMounts("temporal-namespace", services["temporal-namespace"], clientTlsTargets);

  for (const [name, service] of Object.entries(services)) {
    if (service.image) {
      invariant(!/:latest(?:@|$)/.test(service.image), `${name} must not use a latest image`);
      invariant(/@sha256:[a-f0-9]{64}$/.test(service.image), `${name} image must be digest-pinned`);
    }
    if (service.build) {
      invariant(service.build.target === "production", `${name} must build the production target`);
    }
    const limits = service.deploy?.resources?.limits;
    invariant(limits?.cpus && limits?.memory, `${name} must define CPU and memory resource limits`);
    invariant(
      service.logging?.options?.["max-size"] && service.logging?.options?.["max-file"],
      `${name} must configure bounded log rotation`,
    );
    const command = Array.isArray(service.command) ? service.command.join(" ") : String(service.command ?? "");
    invariant(!/(?:^|\s)(?:dev|start-dev|vite|tsx)(?:\s|$)|auto-setup/i.test(command), `${name} uses a development command`);
  }
  for (const [name, dockerfile] of Object.entries(productionDockerfiles)) {
    const productionStage = dockerfile.match(
      /FROM[^\n]+ AS production\n([\s\S]*?)(?=\nFROM |$)/,
    )?.[1] ?? "";
    invariant(productionStage, `${name} must define a production image stage`);
    invariant(
      !/(?:\btsx\b|vite\s+preview|pnpm[^\n]*\bdev\b)/i.test(productionStage),
      `${name} production image uses a development runtime`,
    );
  }
  const frontendBuildArgs = {
    console: [
      "VITE_API_BASE_URL", "VITE_OIDC_AUTHORITY", "VITE_OIDC_CLIENT_ID",
      "VITE_OIDC_REDIRECT_URI", "VITE_OIDC_POST_LOGOUT_REDIRECT_URI",
    ],
    storefront: ["VITE_API_BASE_URL", "VITE_STOREFRONT_ORIGIN", "VITE_GOOGLE_CLIENT_ID"],
  };
  for (const [name, keys] of Object.entries(frontendBuildArgs)) {
    for (const key of keys) {
      invariant(services[name].build?.args?.[key], `${name} must pass ${key} at build time`);
      invariant(
        services[name].environment?.[key] === undefined,
        `${name} must not defer static ${key} configuration to container runtime`,
      );
    }
  }
  invariant(
    /CMD \["node", "dist\/server\.mjs"\]/.test(productionDockerfiles.api ?? ""),
    "API production image must run its bundled Node artifact",
  );
  for (const name of ["console", "storefront"]) {
    invariant(
      /CMD \["caddy", "run", "--config", "\/etc\/caddy\/Caddyfile"\]/.test(
        productionDockerfiles[name] ?? "",
      ),
      `${name} production image must use the static Caddy server`,
    );
  }

  for (const name of longRunningServices) {
    invariant(services[name]?.healthcheck, `${name} must define a health check`);
    invariant(services[name]?.restart === "unless-stopped", `${name} must define an unless-stopped restart policy`);
    invariant(services[name]?.stop_grace_period, `${name} must define a graceful stop period`);
  }
  for (const name of hardenedServices) {
    invariant(services[name]?.read_only === true, `${name} must use a read-only filesystem`);
    invariant(services[name]?.cap_drop?.includes("ALL"), `${name} must drop Linux capabilities`);
  }

  invariant(
    !Object.keys(services).some((name) => /temporal.*ui|ui.*temporal/i.test(name)),
    "Temporal UI must not be present in production",
  );
  invariant(
    config.networks?.workflow?.internal === true,
    "The Temporal workflow network must be private",
  );
  invariant(
    services.temporal.networks && Object.hasOwn(services.temporal.networks, "workflow"),
    "Temporal must attach to the private workflow network",
  );

  for (const [name, service] of Object.entries(services)) {
    for (const [key, value] of Object.entries(service.environment ?? {})) {
      if (!/(?:PASSWORD|SECRET|KEY)$/.test(key)) continue;
      invariant(
        !/(?:change|replace)[_-]?me|changeme|example[_-]?secret/i.test(String(value)),
        `${name}.${key} contains a placeholder secret`,
      );
      invariant(
        !/^(?:opendx_admin_password|opendx_local_password|temporal_local_password|opendx_minio_password)$/i.test(String(value)),
        `${name}.${key} contains a repository-known local credential`,
      );
    }
  }
  invariant(
    !trackedFiles.some((file) => /\.(?:key|pem|p12|pfx|jks|keystore)$/i.test(file)),
    "Deployment-managed TLS key material must not be committed",
  );
  invariant(
    trackedPrivateKeyFiles.length === 0,
    `Tracked private key content is forbidden: ${trackedPrivateKeyFiles.join(", ")}`,
  );
}

export function findTrackedPrivateKeyFiles() {
  const result = spawnSync(
    "git",
    ["grep", "-Il", "-E", "-e", "-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----", "--"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || "Unable to scan tracked private keys");
  }
  return result.stdout.split("\n").filter(Boolean);
}

export function validateTlsHostAccess(config) {
  const groupId = Number(config.services?.temporal?.group_add?.[0]);
  invariant(Number.isSafeInteger(groupId), "Temporal TLS reader group must be numeric");
  const checks = [
    ["temporal", ["ca.pem", "server.pem", "server-key.pem"]],
    ["ai-runtime", ["ca.pem", "client.pem", "client-key.pem"]],
  ];

  for (const [serviceName, files] of checks) {
    const mount = config.services?.[serviceName]?.volumes?.find(
      (candidate) => candidate.target === "/run/temporal-tls",
    );
    invariant(mount?.source, `${serviceName} TLS host directory is missing`);
    const directory = statSync(mount.source);
    const directoryMode = directory.mode & 0o777;
    invariant(
      directory.isDirectory() && directory.gid === groupId && (directoryMode & 0o050) === 0o050,
      `${serviceName} TLS directory must let reader group ${groupId} read and traverse it`,
    );
    for (const file of files) {
      const fileStat = statSync(join(mount.source, file));
      const fileMode = fileStat.mode & 0o777;
      if (file.endsWith("-key.pem")) {
        invariant(
          fileStat.gid === groupId && (fileMode & 0o040) === 0o040 && (fileMode & 0o007) === 0,
          `${serviceName} private key must be group-readable and inaccessible to others`,
        );
      } else {
        invariant(
          (fileStat.gid === groupId && (fileMode & 0o040) === 0o040) || (fileMode & 0o004) === 0o004,
          `${serviceName} certificate ${file} is not readable by the container`,
        );
      }
    }
  }
}

export function readProductionDockerfiles() {
  return Object.fromEntries(
    ["api", "console", "storefront"].map((name) => [
      name,
      readFileSync(`apps/${name}/Dockerfile`, "utf8"),
    ]),
  );
}

function requireReadOnlyMounts(serviceName, service, targets) {
  for (const target of targets) {
    const mount = service.volumes?.find((candidate) => candidate.target === target);
    invariant(mount, `${serviceName} must mount ${target}`);
    invariant(mount.read_only === true, `${serviceName} TLS mounts must be read-only`);
  }
}

export function renderProductionConfig(environment = productionFixtureEnvironment(), envFile) {
  const args = ["compose"];
  if (envFile) args.push("--env-file", envFile);
  args.push("-f", composePath, "config", "--format", "json");
  const result = spawnSync(
    "docker",
    args,
    { cwd: process.cwd(), encoding: "utf8", env: environment },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "Unable to render production Compose");
  }
  return JSON.parse(result.stdout);
}

function main() {
  const envFile = process.argv.slice(2).find((argument) => argument !== "--");
  const environment = envFile ? process.env : productionFixtureEnvironment(process.env);
  const tracked = spawnSync("git", ["ls-files"], {
    cwd: process.cwd(), encoding: "utf8",
  });
  if (tracked.status !== 0) throw new Error(tracked.stderr);
  const productionConfig = renderProductionConfig(environment, envFile);
  validateAgenticProductionConfig({
    config: productionConfig,
    caddy: readFileSync(caddyPath, "utf8"),
    keycloakRealm: JSON.parse(readFileSync(keycloakRealmPath, "utf8")),
    trackedFiles: tracked.stdout.split("\n").filter(Boolean),
    trackedPrivateKeyFiles: findTrackedPrivateKeyFiles(),
    productionDockerfiles: readProductionDockerfiles(),
    strictDeploymentValues: Boolean(envFile),
  });
  if (envFile) validateTlsHostAccess(productionConfig);
  console.info("Agentic production Compose check passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
