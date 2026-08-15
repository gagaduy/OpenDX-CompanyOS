// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as productionCheck from "./agentic-production-compose-check.mjs";
import {
  productionFixtureEnvironment,
  renderProductionConfig,
  validateAgenticProductionConfig,
} from "./agentic-production-compose-check.mjs";

const composePath = "infra/deploy/compose.production.yml";
const caddy = `{$STOREFRONT_HOST:shop.example.com} { reverse_proxy storefront:3100 }
{$CONSOLE_HOST:console.example.com} { reverse_proxy console:3000 }
{$API_HOST:api.example.com} {
@internalAgentic path /v1/internal/agentic*
respond @internalAgentic 404
reverse_proxy api:4000
}
{$KEYCLOAK_HOST:auth.example.com} { reverse_proxy keycloak:8080 }`;

function render() {
  const result = spawnSync(
    "docker",
    ["compose", "-f", composePath, "config", "--format", "json"],
    { cwd: process.cwd(), encoding: "utf8", env: productionFixtureEnvironment() },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function clone(value) {
  return structuredClone(value);
}

function validate(config, options = {}) {
  return validateAgenticProductionConfig({
    config,
    caddy,
    trackedFiles: [],
    trackedPrivateKeyFiles: [],
    keycloakRealm: existsSync("infra/keycloak/realm-production.json")
      ? JSON.parse(readFileSync("infra/keycloak/realm-production.json", "utf8"))
      : {},
    productionDockerfiles: {
      api: readFileSync("apps/api/Dockerfile", "utf8"),
      console: readFileSync("apps/console/Dockerfile", "utf8"),
      storefront: readFileSync("apps/storefront/Dockerfile", "utf8"),
    },
    ...options,
  });
}

test("accepts the hardened single-VPS Agentic topology", () => {
  const config = render();
  assert.match(
    config.services.temporal.healthcheck.test.join(" "),
    /for ip in .*hostname -i.*nc -z "\${1,2}ip" 7233/,
  );
  assert.doesNotThrow(() => validate(config));
});

test("rejects a public Temporal port or edge route", () => {
  const publicTemporal = clone(render());
  publicTemporal.services.temporal.ports = [{ target: 7233, published: "7233" }];
  assert.throws(() => validate(publicTemporal), /Temporal.*public/i);
  const publicRuntime = clone(render());
  publicRuntime.services["ai-runtime"].ports = [{ target: 8000, published: "8000" }];
  assert.throws(() => validate(publicRuntime), /Only Caddy/i);
  assert.throws(() => validate(render(), { caddy: `${caddy}\nreverse_proxy temporal:7233` }), /Caddy.*Temporal/i);
});

test("rejects plaintext clients or missing Temporal client authentication", () => {
  const plaintext = clone(render());
  plaintext.services["ai-runtime"].environment.TEMPORAL_TLS_ENABLED = "false";
  assert.throws(() => validate(plaintext), /TLS-enabled/i);

  const noClientAuth = clone(render());
  noClientAuth.services.temporal.environment.TEMPORAL_TLS_REQUIRE_CLIENT_AUTH = "false";
  assert.throws(() => validate(noClientAuth), /client authentication/i);
});

test("rejects writable certificate mounts and tracked private key material", () => {
  const writable = clone(render());
  const keyMount = writable.services["ai-worker"].volumes.find(
    ({ target }) => target === "/run/temporal-tls",
  );
  keyMount.read_only = false;
  assert.throws(() => validate(writable), /read-only/i);
  assert.throws(
    () => validate(render(), { trackedFiles: ["infra/deploy/temporal-client.key"] }),
    /key material/i,
  );
});

test("rejects placeholders, unpinned images, and missing operational bounds", () => {
  const placeholder = clone(render());
  placeholder.services["ai-worker"].environment.AGENTIC_WORKER_CLIENT_SECRET = "change_me";
  assert.throws(() => validate(placeholder), /placeholder secret/i);

  const unpinned = clone(render());
  unpinned.services.caddy.image = "caddy:2.10.2-alpine";
  assert.throws(() => validate(unpinned), /digest-pinned/i);

  const noLimits = clone(render());
  delete noLimits.services.temporal.deploy.resources.limits;
  assert.throws(() => validate(noLimits), /resource limits/i);

  const noHealth = clone(render());
  delete noHealth.services["ai-runtime"].healthcheck;
  assert.throws(() => validate(noHealth), /health check/i);

  const noRestart = clone(render());
  delete noRestart.services["ai-worker"].restart;
  assert.throws(() => validate(noRestart), /restart policy/i);

  const noGrace = clone(render());
  delete noGrace.services["ai-worker"].stop_grace_period;
  assert.throws(() => validate(noGrace), /graceful stop/i);

  const writableRoot = clone(render());
  writableRoot.services["ai-runtime"].read_only = false;
  assert.throws(() => validate(writableRoot), /read-only filesystem/i);

  const capabilities = clone(render());
  capabilities.services["ai-runtime"].cap_drop = [];
  assert.throws(() => validate(capabilities), /capabilities/i);
});

test("rejects accidental UI and development services", () => {
  const ui = clone(render());
  ui.services["temporal-ui"] = {
    image: "temporalio/ui:2.42.0@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  assert.throws(() => validate(ui), /UI/i);

  const dev = clone(render());
  dev.services.api.command = ["pnpm", "dev"];
  assert.throws(() => validate(dev), /development command/i);
});

test("separates the production database bootstrap and application roles", () => {
  const services = render().services;
  assert.ok(services["postgres-role-init"]);
  assert.notEqual(
    services.postgres.environment.POSTGRES_USER,
    services["postgres-role-init"].environment.POSTGRES_APP_USER,
  );
  assert.equal(
    services["temporal-db-init"].depends_on["postgres-role-init"].condition,
    "service_completed_successfully",
  );
});

test("requires the API analytics connection to use the isolated reader role", () => {
  const config = clone(render());
  config.services.api.environment.AGENTIC_ANALYTICS_DATABASE_URL =
    config.services.api.environment.DATABASE_URL;
  assert.throws(() => validate(config), /analytics.*reader role/i);
});

test("hardens the privileged database bootstrap jobs", () => {
  const services = render().services;
  for (const name of ["postgres-role-init", "temporal-db-init"]) {
    assert.notEqual(services[name].user, undefined);
    assert.equal(services[name].read_only, true);
    assert.ok(services[name].cap_drop.includes("ALL"));
    assert.ok(services[name].security_opt.includes("no-new-privileges:true"));
  }
});

test("denies internal Agentic routes at the public API edge", () => {
  const productionCaddy = readFileSync("infra/deploy/Caddyfile", "utf8");
  assert.match(productionCaddy, /@internalAgentic path \/v1\/internal\/agentic\*/);
  assert.match(productionCaddy, /respond @internalAgentic 404[\s\S]*reverse_proxy api:4000/);
});

test("binds Caddy routes to configurable production hostnames", () => {
  const services = render().services;
  const productionCaddy = readFileSync("infra/deploy/Caddyfile", "utf8");
  const expected = {
    STOREFRONT_HOST: "shop.example.com",
    CONSOLE_HOST: "console.example.com",
    API_HOST: "api.example.com",
    KEYCLOAK_HOST: "auth.example.com",
  };

  for (const [key, fallback] of Object.entries(expected)) {
    assert.equal(services.caddy.environment[key], fallback);
    assert.match(productionCaddy, new RegExp(`\\{\\$${key}:${fallback.replaceAll(".", "\\.")}\\}`));
  }
});

test("imports a user-free production realm and reconciles workload clients", () => {
  const services = render().services;
  const realmMount = services.keycloak.volumes.find(
    ({ target }) => target === "/opt/keycloak/data/import/opendx-realm.json",
  );
  assert.match(realmMount.source, /realm-production\.json$/);
  assert.ok(services["keycloak-reconcile"]);
  assert.equal(
    services.api.depends_on["keycloak-reconcile"].condition,
    "service_completed_successfully",
  );
  const realmPath = "infra/keycloak/realm-production.json";
  assert.equal(existsSync(realmPath), true);
  const realm = JSON.parse(readFileSync(realmPath, "utf8"));
  assert.deepEqual(realm.users ?? [], []);
  assert.equal(realm.clients.some(({ clientId }) => clientId === "opendx-lifecycle-check"), false);

  const localRealm = clone(services);
  localRealm.keycloak.volumes.find(
    ({ target }) => target === "/opt/keycloak/data/import/opendx-realm.json",
  ).source = "/repo/infra/keycloak/realm-export.json";
  assert.throws(
    () => validate({ ...render(), services: localRealm }),
    /production-safe Keycloak realm/i,
  );
  assert.throws(
    () => validate(render(), { keycloakRealm: { users: [{ username: "admin" }], clients: [] } }),
    /must not contain users/i,
  );
});

test("binds production browser redirects to the configured console origin", () => {
  const services = render().services;
  const realm = JSON.parse(readFileSync("infra/keycloak/realm-production.json", "utf8"));
  const consoleClient = realm.clients.find(({ clientId }) => clientId === "opendx-console");

  assert.equal(services.keycloak.environment.CONSOLE_ORIGIN, "https://console.example.com");
  assert.equal(
    services["keycloak-reconcile"].environment.CONSOLE_ORIGIN,
    "https://console.example.com",
  );
  assert.deepEqual(consoleClient.redirectUris, ["${CONSOLE_ORIGIN}/auth/callback"]);
  assert.deepEqual(consoleClient.webOrigins, ["${CONSOLE_ORIGIN}"]);
  assert.doesNotMatch(JSON.stringify(realm), /localhost|127\.0\.0\.1/i);
  const reconcile = readFileSync("infra/keycloak/reconcile-production-realm.sh", "utf8");
  assert.match(reconcile, /opendx-console/);
  assert.match(reconcile, /redirectUris/);
  assert.match(reconcile, /post\.logout\.redirect\.uris/);
});

test("removes legacy development identities during production reconciliation", () => {
  const reconcile = readFileSync("infra/keycloak/reconcile-production-realm.sh", "utf8");

  assert.match(reconcile, /opendx-lifecycle-check/);
  for (const username of [
    "admin@novacommerce.example",
    "catalog@novacommerce.example",
    "inventory@novacommerce.example",
    "operations@novacommerce.example",
    "finance@novacommerce.example",
    "agentic-operator@novacommerce.example",
    "agentic-approver@novacommerce.example",
    "agentic-governance-creator@novacommerce.example",
    "agentic-governance-reviewer@novacommerce.example",
  ]) {
    assert.match(reconcile, new RegExp(username.replace(".", "\\.")));
  }
  assert.match(reconcile, /KEYCLOAK_RECONCILE_PAGE_SIZE/);
  assert.match(reconcile, /-q "first=\$first" -q "max=\$page_size"/);
});

test("requires a tested replacement before disabling the bootstrap admin", () => {
  const deployment = readFileSync("docs/deployment/production.md", "utf8");
  assert.match(deployment, /Do not disable the bootstrap administrator/i);
  assert.match(deployment, /replacement.*master realm/is);
  assert.match(deployment, /KEYCLOAK_ADMIN/);
});

test("enforces one public URL contract across Caddy Keycloak and frontend bundles", () => {
  const wrongConsoleRedirect = clone(render());
  wrongConsoleRedirect.services.console.build.args.VITE_OIDC_REDIRECT_URI =
    "https://other.example.net/auth/callback";
  assert.throws(() => validate(wrongConsoleRedirect), /Console redirect/i);

  const wrongStorefront = clone(render());
  wrongStorefront.services.storefront.build.args.VITE_STOREFRONT_ORIGIN =
    "https://other.example.net";
  assert.throws(() => validate(wrongStorefront), /Storefront origin/i);

  const wrongAuthority = clone(render());
  wrongAuthority.services.console.build.args.VITE_OIDC_AUTHORITY =
    "https://other.example.net/realms/opendx";
  assert.throws(() => validate(wrongAuthority), /OIDC authority/i);

  assert.throws(
    () => validate(render(), { strictDeploymentValues: true }),
    /placeholder production hostname/i,
  );
});

test("documents traversable TLS directories for the shared reader group", () => {
  const deployment = readFileSync("docs/deployment/production.md", "utf8");
  assert.match(deployment, /install -d -o root -g 20000 -m 0750/);
});

test("validates host TLS access for the configured container reader group", () => {
  assert.equal(typeof productionCheck.validateTlsHostAccess, "function");
  const root = mkdtempSync(join(tmpdir(), "opendx-tls-access-"));
  const server = join(root, "server");
  const client = join(root, "client");
  const groupId = String(process.getgid());

  try {
    mkdirSync(server, { mode: 0o750 });
    mkdirSync(client, { mode: 0o750 });
    for (const [directory, files] of [
      [server, ["ca.pem", "server.pem", "server-key.pem"]],
      [client, ["ca.pem", "client.pem", "client-key.pem"]],
    ]) {
      for (const file of files) {
        const path = join(directory, file);
        writeFileSync(path, "test-only-certificate-material");
        chmodSync(path, file.endsWith("-key.pem") ? 0o440 : 0o444);
      }
    }
    const config = {
      services: {
        temporal: {
          group_add: [groupId],
          volumes: [{ source: server, target: "/run/temporal-tls", read_only: true }],
        },
        "ai-runtime": {
          group_add: [groupId],
          volumes: [{ source: client, target: "/run/temporal-tls", read_only: true }],
        },
      },
    };

    assert.doesNotThrow(() => productionCheck.validateTlsHostAccess(config));
    chmodSync(client, 0o700);
    assert.throws(
      () => productionCheck.validateTlsHostAccess(config),
      /reader group.*traverse/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("passes public frontend configuration into Vite production builds", () => {
  const services = render().services;
  const dockerfiles = {
    console: readFileSync("apps/console/Dockerfile", "utf8"),
    storefront: readFileSync("apps/storefront/Dockerfile", "utf8"),
  };
  const expected = {
    console: [
      "VITE_API_BASE_URL", "VITE_OIDC_AUTHORITY", "VITE_OIDC_CLIENT_ID",
      "VITE_OIDC_REDIRECT_URI", "VITE_OIDC_POST_LOGOUT_REDIRECT_URI",
    ],
    storefront: ["VITE_API_BASE_URL", "VITE_STOREFRONT_ORIGIN", "VITE_GOOGLE_CLIENT_ID"],
  };

  for (const [name, keys] of Object.entries(expected)) {
    for (const key of keys) {
      assert.ok(services[name].build.args[key], `${name} build arg ${key} is required`);
      assert.match(dockerfiles[name], new RegExp(`ARG ${key}`));
      assert.match(dockerfiles[name], new RegExp(`${key}=\\$${key}`));
      assert.equal(services[name].environment?.[key], undefined);
    }
  }
});

test("preserves caller secrets so production preflight can reject placeholders", () => {
  const environment = productionFixtureEnvironment({
    AGENTIC_WORKER_CLIENT_SECRET: "change_me",
  });
  assert.equal(environment.AGENTIC_WORKER_CLIENT_SECRET, "change_me");
  assert.throws(
    () => validate(renderProductionConfig(environment)),
    /placeholder secret/i,
  );
  for (const knownLocalSecret of [
    "opendx_admin_password",
    "opendx_local_password",
    "temporal_local_password",
    "opendx_minio_password",
  ]) {
    const config = clone(render());
    config.services["ai-worker"].environment.AGENTIC_WORKER_CLIENT_SECRET = knownLocalSecret;
    assert.throws(() => validate(config), /local.*credential|placeholder secret/i);
  }
});

test("mounts rotatable TLS directories with a shared reader group", () => {
  const services = render().services;
  for (const name of ["temporal", "temporal-namespace", "ai-runtime", "ai-worker"]) {
    const mounts = services[name].volumes.filter(
      ({ target }) => target === "/run/temporal-tls",
    );
    assert.equal(mounts.length, 1, `${name} must mount one TLS directory`);
    assert.equal(mounts[0].read_only, true);
    assert.ok(services[name].group_add.includes("20000"));
  }
});

test("rejects tracked private keys and key stores anywhere in the repository", () => {
  assert.throws(
    () => validate(render(), { trackedFiles: ["docs/operator/client.p12"] }),
    /key material/i,
  );
  assert.throws(
    () => validate(render(), { trackedPrivateKeyFiles: ["fixtures/disguised.txt"] }),
    /private key/i,
  );
});

test("uses production runtime commands instead of TypeScript or Vite preview", () => {
  const dockerfiles = {
    api: readFileSync("apps/api/Dockerfile", "utf8"),
    console: readFileSync("apps/console/Dockerfile", "utf8"),
    storefront: readFileSync("apps/storefront/Dockerfile", "utf8"),
  };
  assert.match(dockerfiles.api, /CMD \["node", "dist\/server\.mjs"\]/);
  for (const name of ["console", "storefront"]) {
    assert.match(dockerfiles[name], /CMD \["caddy", "run", "--config", "\/etc\/caddy\/Caddyfile"\]/);
  }
  assert.throws(
    () => validate(render(), {
      productionDockerfiles: { ...dockerfiles, api: dockerfiles.api.replace("node\", \"dist/server.mjs", "tsx\", \"src/server.ts") },
    }),
    /development runtime/i,
  );
});

test("checks the exact Temporal worker poller in container health", () => {
  const worker = render().services["ai-worker"];
  assert.deepEqual(worker.healthcheck.test, [
    "CMD",
    "python",
    "-m",
    "app.agentic.worker_healthcheck",
  ]);
  assert.equal(worker.environment.WORKER_READINESS_PATH, "/tmp/opendx-worker-ready");
});
