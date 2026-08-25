// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createErrorHandler } from "../http/error-handler.middleware";
import type { StaffPrincipal } from "./staff-principal";
import { requireStaffRole } from "./require-role.middleware";

function createApp(principal?: StaffPrincipal) {
  const app = express();
  app.get(
    "/catalog",
    (_request, response, next) => {
      response.locals.staffPrincipal = principal;
      next();
    },
    requireStaffRole("administrator", "catalog_manager", "inventory_manager"),
    (_request, response) => response.json({ allowed: true }),
  );
  app.use(createErrorHandler());
  return app;
}

describe("requireStaffRole", () => {
  it("allows a principal with an accepted role", async () => {
    await request(
      createApp({
        subject: "user_catalog",
        displayName: "Catalog Manager",
        roles: ["catalog_manager"],
      }),
    )
      .get("/catalog")
      .expect(200, { allowed: true });
  });

  it("recognizes the inventory manager staff role", async () => {
    await request(
      createApp({
        subject: "user_inventory",
        displayName: "Inventory Manager",
        roles: ["inventory_manager"],
      }),
    )
      .get("/catalog")
      .expect(200, { allowed: true });
  });

  it("rejects a principal without an accepted role", async () => {
    const response = await request(
      createApp({ subject: "user_viewer", displayName: "Viewer", roles: [] }),
    )
      .get("/catalog")
      .expect(403);
    expect(response.body.errorCode).toBe("FORBIDDEN");
  });

  it("rejects a request without an authenticated principal", async () => {
    const response = await request(createApp()).get("/catalog").expect(401);
    expect(response.body.errorCode).toBe("UNAUTHORIZED");
  });
});
