// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import request from "supertest";
import { Router } from "express";
import { describe, expect, it } from "vitest";
import { createApiApp } from "./app";

describe("api health", () => {
  it("returns deterministic health JSON", async () => {
    const response = await request(createApiApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "opendx-api",
    });
  });
});

describe("API route audiences", () => {
  const consoleOrigin = "http://localhost:3000";
  const storefrontOrigin = "http://localhost:3100";
  const admin = Router().get("/", (_request, response) =>
    response.json({ audience: "staff" }),
  );
  const storefront = Router().get("/account", (_request, response) =>
    response.json({ audience: "customer" }),
  );
  const app = createApiApp({
    consoleOrigin,
    storefrontOrigin,
    catalogAdminRouter: admin,
    storefrontRouter: storefront,
  });

  it("allows credentialed customer responses only to the Storefront origin", async () => {
    expect(
      (
        await request(app)
          .get("/v1/storefront/account")
          .set("Origin", storefrontOrigin)
      ).headers["access-control-allow-origin"],
    ).toBe(storefrontOrigin);
    expect(
      (
        await request(app)
          .get("/v1/storefront/account")
          .set("Origin", consoleOrigin)
      ).headers["access-control-allow-origin"],
    ).toBeUndefined();
  });

  it("allows credentialed staff responses only to the Console origin", async () => {
    expect(
      (await request(app).get("/v1/admin/catalog").set("Origin", consoleOrigin))
        .headers["access-control-allow-origin"],
    ).toBe(consoleOrigin);
    expect(
      (
        await request(app)
          .get("/v1/admin/catalog")
          .set("Origin", storefrontOrigin)
      ).headers["access-control-allow-origin"],
    ).toBeUndefined();
  });
});
