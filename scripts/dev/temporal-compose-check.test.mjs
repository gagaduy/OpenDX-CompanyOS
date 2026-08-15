// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const composePath = "infra/docker/docker-compose.yml";
const serverImage = "temporalio/server:1.31.2@sha256:b5ecdb8282bededae2a10c36e8d862e27d0bc2d247fc73c5416025997ab4a1da";
const adminImage = "temporalio/admin-tools:1.31.2@sha256:dbc5fcd6ee8f0f4d808bf765af9a87dea9d8a283abfdcfbd2fc148496ba66107";

function compose() {
  const result = spawnSync(
    "docker",
    ["compose", "-f", composePath, "config", "--format", "json"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("defines explicit pinned Temporal jobs and private server topology", () => {
  const config = compose();
  const services = config.services;

  for (const name of [
    "postgres-role-init",
    "temporal-db-init",
    "temporal-schema",
    "temporal",
    "temporal-namespace",
    "ai-runtime",
    "ai-worker",
  ]) {
    assert.ok(services[name], `${name} service is required`);
  }
  assert.equal(services.temporal.image, serverImage);
  assert.equal(services["temporal-schema"].image, adminImage);
  assert.equal(services["temporal-namespace"].image, adminImage);
  assert.equal(services.temporal.ports, undefined);
  assert.deepEqual(services.temporal.expose, ["7233"]);
  assert.equal(services.temporal.environment.DBNAME, "temporal");
  assert.equal(services.temporal.environment.VISIBILITY_DBNAME, "temporal_visibility");
  assert.equal(services.temporal.environment.POSTGRES_USER, "temporal");
  assert.equal(services.postgres.environment.POSTGRES_USER, "opendx_admin");
  assert.match(services.postgres.healthcheck.test.join(" "), /pg_isready -h 127\.0\.0\.1/);
  assert.ok(services.postgres.volumes.some(({ source }) => source === "opendx_postgres"));
  assert.deepEqual(services["ai-worker"].command, ["python", "-m", "app.agentic.worker"]);
  assert.equal(services["ai-runtime"].command, null);
  assert.equal(Object.keys(services).some((name) => name.includes("temporal-ui")), false);
  assert.equal(JSON.stringify(config).includes("auto-setup"), false);
});

test("orders database schema namespace API and worker by truthful health", () => {
  const services = compose().services;

  assert.equal(services["postgres-role-init"].depends_on.postgres.condition, "service_healthy");
  assert.equal(services.migrate.depends_on["postgres-role-init"].condition, "service_completed_successfully");
  assert.equal(services["temporal-db-init"].depends_on["postgres-role-init"].condition, "service_completed_successfully");
  assert.equal(services["temporal-schema"].depends_on["temporal-db-init"].condition, "service_completed_successfully");
  assert.equal(services.temporal.depends_on["temporal-schema"].condition, "service_completed_successfully");
  assert.equal(services["temporal-namespace"].depends_on.temporal.condition, "service_healthy");
  assert.equal(services["ai-runtime"].depends_on["temporal-namespace"].condition, "service_completed_successfully");
  assert.equal(services["ai-worker"].depends_on["ai-runtime"].condition, "service_healthy");
  assert.equal(services["ai-worker"].depends_on.api.condition, "service_healthy");
  assert.equal(services.temporal.restart, "unless-stopped");
  assert.equal(services["ai-runtime"].restart, "unless-stopped");
  assert.equal(services["ai-worker"].restart, "unless-stopped");
  assert.equal(services["ai-runtime"].environment.AGENTIC_API_BASE_URL, "http://api:4000/v1/internal/agentic");
});

test("uses idempotent separate database schema and namespace scripts", () => {
  const roles = readFileSync("infra/temporal/scripts/prepare-postgres-roles.sh", "utf8");
  const create = readFileSync("infra/temporal/scripts/create-databases.sh", "utf8");
  const schema = readFileSync("infra/temporal/scripts/setup-schema.sh", "utf8");
  const namespace = readFileSync("infra/temporal/scripts/register-namespace.sh", "utf8");

  assert.match(roles, /POSTGRES_LEGACY_USER="\$\{POSTGRES_APP_USER\}_bootstrap_legacy"/);
  assert.match(roles, /ALTER DATABASE %I OWNER TO %I/);
  assert.match(roles, /REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'app_database'/);
  assert.match(roles, /REVOKE CONNECT ON DATABASE postgres FROM PUBLIC/);
  assert.match(roles, /ALTER ROLE %I WITH LOGIN NOSUPERUSER/);
  assert.match(create, /CREATE ROLE %I LOGIN PASSWORD %L/);
  assert.match(create, /POSTGRES_APP_USER/);
  assert.match(create, /temporal_visibility/);
  assert.match(create, /REVOKE CONNECT ON DATABASE opendx FROM temporal/);
  assert.match(create, /REVOKE CONNECT ON DATABASE postgres FROM PUBLIC/);
  assert.match(create, /REVOKE CONNECT ON DATABASE temporal FROM %I/);
  assert.match(schema, /setup-schema -v 0\.0/);
  assert.match(schema, /postgresql\/v12\/temporal\/versioned/);
  assert.match(schema, /postgresql\/v12\/visibility\/versioned/);
  assert.match(namespace, /temporal operator "\$@" namespace describe --namespace "\$TEMPORAL_NAMESPACE"/);
  assert.match(namespace, /temporal operator "\$@" namespace create --namespace "\$TEMPORAL_NAMESPACE" --retention 168h/);
  assert.match(namespace, /temporal operator "\$@" --command-timeout 5s cluster health/);
  assert.match(namespace, /MAX_ATTEMPTS=30/);
  assert.match(namespace, /TEMPORAL_TLS_ENABLED/);
  assert.match(namespace, /--tls-server-name/);
});
