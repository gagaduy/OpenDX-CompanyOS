// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import { generateKeyPair, jwtVerify, SignJWT, type JWTPayload } from "jose";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createErrorHandler } from "../http/error-handler.middleware";
import {
  authenticateWorkload,
  type WorkloadTokenVerifier,
} from "./workload-auth.middleware";

const issuer = "https://identity.example.test/realms/opendx";
const audience = "opendx-api";

describe("authenticateWorkload", () => {
  let verifier: WorkloadTokenVerifier;
  let sign: (claims?: JWTPayload) => Promise<string>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    verifier = {
      async verify(token) {
        return (await jwtVerify(token, publicKey, { issuer, audience })).payload;
      },
    };
    sign = async (claims = {}) => {
      const token = new SignJWT({
        azp: claims.azp ?? "opendx-agentic-worker",
        ...(claims.client_id === undefined ? {} : { client_id: claims.client_id }),
        ...(claims.realm_access === undefined ? {} : { realm_access: claims.realm_access }),
      })
        .setProtectedHeader({ alg: "RS256" })
        .setSubject("service-account-opendx-agentic-worker")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("5m");
      if (claims.sub !== undefined) token.setSubject(claims.sub);
      if (claims.iss !== undefined) token.setIssuer(claims.iss);
      if (claims.aud !== undefined) token.setAudience(claims.aud);
      if (claims.exp !== undefined) token.setExpirationTime(claims.exp);
      return token.sign(privateKey);
    };
  });

  it("accepts only the fixed Agentic worker workload identity", async () => {
    const response = await request(createApp())
      .get("/internal")
      .set("authorization", `Bearer ${await sign()}`)
      .expect(200);

    expect(response.body).toEqual({
      subject: "service-account-opendx-agentic-worker",
      clientId: "opendx-agentic-worker",
      workload: "agentic_worker",
    });
  });

  it.each([
    "agent-ai-ceo",
    "agent-catalog",
    "agent-inventory",
    "agent-order",
    "agent-finance",
    "agent-crm",
    "agent-support",
    "opendx-console",
  ])("rejects cross-boundary client %s", async (clientId) => {
    const response = await request(createApp())
      .get("/internal")
      .set("authorization", `Bearer ${await sign({
        azp: clientId,
        realm_access: { roles: ["agentic_operator", "administrator"] },
      })}`)
      .expect(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });

  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 60 }],
    ["wrong issuer", { iss: "https://attacker.example.test" }],
    ["wrong audience", { aud: "another-api" }],
    ["missing subject", { sub: "" }],
  ])("rejects a token with %s", async (_case, claims) => {
    const response = await request(createApp())
      .get("/internal")
      .set("authorization", `Bearer ${await sign(claims)}`)
      .expect(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid signature and malformed authorization", async () => {
    await request(createApp()).get("/internal")
      .set("authorization", `Bearer ${await sign()}.forged`)
      .expect(401);
    await request(createApp()).get("/internal")
      .set("authorization", "Basic credentials")
      .expect(401);
  });

  function createApp() {
    const app = express();
    app.get("/internal", authenticateWorkload(verifier), (_request, response) => {
      response.json(response.locals.workloadPrincipal);
    });
    app.use(createErrorHandler());
    return app;
  }
});
