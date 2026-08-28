// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const realm = JSON.parse(
  await readFile(new URL("../../infra/keycloak/realm-export.json", import.meta.url), "utf8"),
);

const staffRoles = [
  "agentic_operator",
  "agentic_approver",
  "agentic_governance_admin",
  "agentic_auditor",
];
const agentClients = [
  "agent-ai-ceo",
  "agent-catalog",
  "agent-inventory",
  "agent-order",
  "agent-finance",
  "agent-crm",
  "agent-support",
  "agent-marketing-content",
  "agent-marketing-visual",
  "agent-marketing-publisher",
];

test("defines the four Agentic staff roles exactly once", () => {
  const names = realm.roles.realm.map((role) => role.name);
  for (const role of staffRoles) {
    assert.equal(names.filter((name) => name === role).length, 1);
  }
});

test("reconciles Agent clients for existing local Keycloak volumes", () => {
  const rendered = spawnSync(
    "docker",
    ["compose", "-f", "infra/docker/docker-compose.yml", "config", "--format", "json"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(rendered.status, 0, rendered.stderr);
  const services = JSON.parse(rendered.stdout).services;
  const reconciler = services["keycloak-reconcile"];
  assert.ok(reconciler);
  assert.equal(reconciler.environment.KEYCLOAK_PRESERVE_DEVELOPMENT_IDENTITIES, "true");
  for (const kind of ["CATALOG", "INVENTORY", "ORDER", "FINANCE", "CRM", "SUPPORT", "MARKETING_CONTENT", "MARKETING_VISUAL", "MARKETING_PUBLISHER"]) {
    assert.ok(reconciler.environment[`AGENT_${kind}_CLIENT_SECRET`]);
  }
  assert.equal(services.api.depends_on["keycloak-reconcile"].condition, "service_completed_successfully");
  assert.equal(services["ai-runtime"].depends_on["keycloak-reconcile"].condition, "service_completed_successfully");
});

test("defines ten confidential Agent service clients without committed secrets", () => {
  const clients = realm.clients.filter((client) => client.clientId.startsWith("agent-"));

  assert.deepEqual(clients.map((client) => client.clientId).sort(), agentClients.toSorted());
  for (const client of clients) {
    assert.equal(client.enabled, true);
    assert.equal(client.protocol, "openid-connect");
    assert.equal(client.publicClient, false);
    assert.equal(client.serviceAccountsEnabled, true);
    assert.equal(client.standardFlowEnabled, false);
    assert.equal(client.directAccessGrantsEnabled, false);
    const kind = client.clientId.slice("agent-".length).replaceAll("-", "_").toUpperCase();
    assert.equal(client.secret, `\${AGENT_${kind}_CLIENT_SECRET}`);
    assert.equal(
      client.protocolMappers.some((mapper) => mapper.name === "realm-roles"),
      false,
    );
  }
});
