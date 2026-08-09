// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import { generateKeyPair, jwtVerify, SignJWT, type JWTPayload } from "jose";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createErrorHandler } from "../http/error-handler.middleware";
import {
  authenticateStaff,
  type StaffTokenVerifier,
} from "./staff-auth.middleware";

const issuer = "https://identity.example.test/realms/opendx";
const audience = "opendx-api";

describe("authenticateStaff", () => {
  let verifier: StaffTokenVerifier;
  let sign: (claims?: JWTPayload) => Promise<string>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    verifier = {
      async verify(token) {
        const result = await jwtVerify(token, publicKey, { issuer, audience });
        return result.payload;
      },
    };
    sign = async (claims = {}) => {
      const token = new SignJWT({
        name: "Catalog Manager",
        email: "catalog@novacommerce.example",
        realm_access: claims.realm_access ?? { roles: ["catalog_manager", "offline_access"] },
      })
        .setProtectedHeader({ alg: "RS256" })
        .setSubject("user_catalog")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("5m");
      if (claims.iss !== undefined) token.setIssuer(claims.iss);
      if (claims.aud !== undefined) token.setAudience(claims.aud);
      if (claims.exp !== undefined) token.setExpirationTime(claims.exp);
      return token.sign(privateKey);
    };
  });

  it("accepts Phase 7 roles and discards unknown roles", async () => {
    const response = await request(createApp())
      .get("/staff")
      .set("authorization", `Bearer ${await sign({
        realm_access: {
          roles: [
            "crm_operator",
            "support_operator",
            "executive_viewer",
            "offline_access",
          ],
        },
      })}`)
      .expect(200);

    expect(response.body.roles).toEqual([
      "crm_operator",
      "support_operator",
      "executive_viewer",
    ]);
  });

  function createApp() {
    const app = express();
    app.get("/staff", authenticateStaff(verifier), (_request, response) => {
      response.json(response.locals.staffPrincipal);
    });
    app.use(createErrorHandler());
    return app;
  }

  it("verifies a signed token and exposes a constrained principal", async () => {
    const response = await request(createApp())
      .get("/staff")
      .set("authorization", `Bearer ${await sign()}`)
      .expect(200);

    expect(response.body).toEqual({
      subject: "user_catalog",
      displayName: "Catalog Manager",
      email: "catalog@novacommerce.example",
      roles: ["catalog_manager"],
    });
  });

  it.each([
    ["missing token", undefined],
    ["malformed token", "Bearer not-a-jwt"],
  ])("rejects %s", async (_case, authorization) => {
    const pending = request(createApp()).get("/staff");
    if (authorization !== undefined) pending.set("authorization", authorization);
    const response = await pending.expect(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });

  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 60 }],
    ["wrong issuer", { iss: "https://attacker.example.test" }],
    ["wrong audience", { aud: "another-api" }],
  ])("rejects a signed token with %s claims", async (_case, claims) => {
    const response = await request(createApp())
      .get("/staff")
      .set("authorization", `Bearer ${await sign(claims)}`)
      .expect(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });
});
