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

  it("fails readiness when the readiness probe exceeds the configured timeout", async () => {
    const app = createApiApp({
      readinessTimeoutMs: 1,
      readiness: () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                postgres: "up",
                keycloak: "up",
                minio: "up",
                migrations: "up",
              }),
            50,
          ),
        ),
    });

    const response = await request(app).get("/health/ready").expect(503);

    expect(response.body.dependencies.readiness).toBe("down");
  });

  it("keeps liveness healthy when an enabled Agentic workflow gateway is down", async () => {
    const app = createApiApp({
      readiness: async () => ({
        postgres: "up",
        keycloak: "up",
        minio: "up",
        migrations: "up",
        agenticWorkflow: "down",
      }),
    });

    await request(app).get("/health/live").expect(200);
    const readiness = await request(app).get("/health/ready").expect(503);
    expect(readiness.body.dependencies.agenticWorkflow).toBe("down");
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

  it("mounts Support tickets exactly below the staff admin prefix", async () => {
    const support = Router().get("/", (_request, response) => response.json({ audience: "support" }));
    const supportApp = createApiApp({ supportAdminRouter: support });
    await request(supportApp).get("/v1/admin/support/tickets").expect(200, { audience: "support" });
    await request(supportApp).get("/v1/admin/support").expect(404);
  });

  it("mounts Agent governance exactly below the Console-only staff prefix", async () => {
    const agentic = Router().get("/employees", (_request, response) => response.json({ audience: "agentic" }));
    const agenticApp = createApiApp({ consoleOrigin, storefrontOrigin, agenticAdminRouter: agentic });
    const allowed = await request(agenticApp).get("/v1/admin/agentic/employees").set("Origin", consoleOrigin).expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(consoleOrigin);
    expect((await request(agenticApp).get("/v1/admin/agentic/employees").set("Origin", storefrontOrigin)).headers["access-control-allow-origin"]).toBeUndefined();
    await request(agenticApp).get("/v1/admin/agents/employees").expect(404);
  });

  it("mounts internal Agentic routes without browser CORS", async () => {
    const internal = Router().get("/workflow-runs/run/plan", (_request, response) =>
      response.json({ audience: "agentic-worker" }));
    const internalApp = createApiApp({
      consoleOrigin,
      storefrontOrigin,
      agenticInternalRouter: internal,
    });

    const consoleRequest = await request(internalApp)
      .get("/v1/internal/agentic/workflow-runs/run/plan")
      .set("Origin", consoleOrigin)
      .expect(200);
    expect(consoleRequest.headers["access-control-allow-origin"]).toBeUndefined();
    const storefrontRequest = await request(internalApp)
      .get("/v1/internal/agentic/workflow-runs/run/plan")
      .set("Origin", storefrontOrigin)
      .expect(200);
    expect(storefrontRequest.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("mounts public Marketing media without credentialed browser CORS", async () => {
    const media = Router().get("/:assetId", (_request, response) =>
      response.type("image/jpeg").send(Buffer.from([0xff, 0xd8, 0xff])));
    const publicMediaApp = createApiApp({
      consoleOrigin,
      storefrontOrigin,
      marketingPublicRouter: media,
    });
    const mediaPath = "/v1/public/marketing/media/7c1466de-4f31-4598-9552-c84b9e20a7b2";

    const consoleRequest = await request(publicMediaApp)
      .get(mediaPath)
      .set("Origin", consoleOrigin)
      .expect(200);
    expect(consoleRequest.headers["access-control-allow-origin"]).toBeUndefined();
    expect(consoleRequest.headers["access-control-allow-credentials"]).toBeUndefined();

    const storefrontRequest = await request(publicMediaApp)
      .get(mediaPath)
      .set("Origin", storefrontOrigin)
      .expect(200);
    expect(storefrontRequest.headers["access-control-allow-origin"]).toBeUndefined();
    expect(storefrontRequest.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("applies the configured JSON body limit", async () => {
    const limitedApp = createApiApp({ jsonBodyLimit: "10b" });

    await request(limitedApp)
      .post("/v1/storefront/cart/items")
      .set("Content-Type", "application/json")
      .send({ payload: "larger than ten bytes" })
      .expect(413);
  });
});
