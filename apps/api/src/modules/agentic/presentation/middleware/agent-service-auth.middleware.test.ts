// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { StaffTokenVerifier } from "../../../../shared/auth/staff-auth.middleware";
import { createErrorHandler } from "../../../../shared/http/error-handler.middleware";
import type { AgentServiceIdentityResolver } from "../../application/identity/agent-service-principal";
import { authenticateAgentService } from "./agent-service-auth.middleware";

describe("authenticateAgentService", () => {
  const identities: AgentServiceIdentityResolver = {
    async resolve(clientId) {
      if (clientId === "agent-catalog") {
        return { agentKind: "catalog", active: true };
      }
      if (clientId === "agent-support") {
        return { agentKind: "support", active: false };
      }
      return undefined;
    },
  };

  it("maps an active Keycloak service account to its fixed Agent identity", async () => {
    const response = await request(createApp({
      async verify() {
        return {
          sub: "service-account-agent-catalog",
          azp: "agent-catalog",
          agentId: "finance",
        };
      },
    }))
      .get("/agent")
      .set("authorization", "Bearer signed-token")
      .expect(200);

    expect(response.body).toEqual({
      subject: "service-account-agent-catalog",
      clientId: "agent-catalog",
      agentKind: "catalog",
    });
  });

  it("accepts client_id when Keycloak omits azp", async () => {
    const response = await request(createApp({
      async verify() {
        return {
          sub: "service-account-agent-catalog",
          client_id: "agent-catalog",
        };
      },
    }))
      .get("/agent")
      .set("authorization", "Bearer signed-token")
      .expect(200);

    expect(response.body.clientId).toBe("agent-catalog");
  });

  it.each([
    ["missing bearer token", undefined, { sub: "service-account-agent-catalog", azp: "agent-catalog" }],
    ["missing subject", "Bearer signed-token", { azp: "agent-catalog" }],
    ["missing client identity", "Bearer signed-token", { sub: "service-account-agent-catalog" }],
    ["unknown staff client", "Bearer signed-token", { sub: "staff-user", azp: "opendx-console" }],
    ["inactive Agent", "Bearer signed-token", { sub: "service-account-agent-support", azp: "agent-support" }],
  ])("rejects %s", async (_case, authorization, payload) => {
    const pending = request(createApp({ async verify() { return payload; } })).get("/agent");
    if (authorization !== undefined) pending.set("authorization", authorization);

    const response = await pending.expect(401);

    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });

  function createApp(verifier: StaffTokenVerifier) {
    const app = express();
    app.get(
      "/agent",
      authenticateAgentService(verifier, identities),
      (_request, response) => response.json(response.locals.agentServicePrincipal),
    );
    app.use(createErrorHandler());
    return app;
  }
});
