// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
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
];

test("defines the four Agentic staff roles exactly once", () => {
  const names = realm.roles.realm.map((role) => role.name);
  for (const role of staffRoles) {
    assert.equal(names.filter((name) => name === role).length, 1);
  }
});

test("defines seven secret-free confidential Agent service clients", () => {
  const clients = realm.clients.filter((client) => client.clientId.startsWith("agent-"));

  assert.deepEqual(clients.map((client) => client.clientId).sort(), agentClients.toSorted());
  for (const client of clients) {
    assert.equal(client.enabled, true);
    assert.equal(client.protocol, "openid-connect");
    assert.equal(client.publicClient, false);
    assert.equal(client.serviceAccountsEnabled, true);
    assert.equal(client.standardFlowEnabled, false);
    assert.equal(client.directAccessGrantsEnabled, false);
    assert.equal("secret" in client, false);
    assert.equal(
      client.protocolMappers.some((mapper) => mapper.name === "realm-roles"),
      false,
    );
  }
});
