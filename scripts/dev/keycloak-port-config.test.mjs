// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Keycloak host port is configurable without changing its container port", async () => {
  const compose = await readFile(new URL("../../infra/docker/docker-compose.yml", import.meta.url), "utf8");

  assert.match(compose, /KC_HOSTNAME: http:\/\/localhost:\$\{KEYCLOAK_PORT:-8080\}/);
  assert.match(compose, /- "\$\{KEYCLOAK_PORT:-8080\}:8080"/);
  assert.match(compose, /VITE_OIDC_AUTHORITY: http:\/\/localhost:\$\{KEYCLOAK_PORT:-8080\}\/realms\/opendx/);
  assert.equal(
    (compose.match(/KEYCLOAK_ISSUER: http:\/\/localhost:\$\{KEYCLOAK_PORT:-8080\}\/realms\/opendx/g) ?? []).length,
    2,
  );
});
