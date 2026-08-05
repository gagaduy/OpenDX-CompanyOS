// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { InventoryServiceContract } from "../application/services/interfaces/inventory.service";
import { InventoryController } from "../presentation/controllers/inventory.controller";
import { createInventoryRouter } from "../presentation/routes/inventory.routes";

const variantId = "d1000000-0000-4000-8000-000000000001";

function fixture(role?: "catalog_manager" | "inventory_manager") {
  const service: InventoryServiceContract = {
    list: vi.fn(async (query) => ({ items: [], ...query, totalItems: 0, totalPages: 0 })),
    get: vi.fn(),
    receive: vi.fn(async () => ({
      id: "d2000000-0000-4000-8000-000000000001",
      variantId,
      sku: "PHONE-X",
      onHand: 5,
      reserved: 0,
      available: 5,
      stockStatus: "low" as const,
      version: 1,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    })),
    adjust: vi.fn(),
    listMovements: vi.fn(),
  };
  const authenticate: RequestHandler = (pending, response, next) => {
    if (pending.header("authorization") === undefined) return next();
    response.locals.staffPrincipal = {
      subject: "staff-user",
      displayName: "Staff",
      roles: role === undefined ? [] : [role],
    };
    next();
  };
  const appendDenied = vi.fn(async () => undefined);
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(
    "/v1/admin/inventory",
    createInventoryRouter(new InventoryController(service), authenticate, appendDenied),
  );
  app.use(createErrorHandler());
  return { app, appendDenied, service };
}

describe("Inventory API", () => {
  it.each([
    [undefined, 401],
    ["catalog_manager" as const, 403],
  ])("protects stock receipt for role %s", async (role, status) => {
    const { app, service } = fixture(role);
    const call = request(app).post("/v1/admin/inventory/receipts");
    if (role !== undefined) call.set("authorization", "Bearer token");
    await call
      .send({ variantId, quantity: 5, idempotencyKey: "receipt-5" })
      .expect(status);
    expect(service.receive).not.toHaveBeenCalled();
  });

  it("allows inventory_manager to receive validated stock", async () => {
    const { app, service } = fixture("inventory_manager");
    await request(app)
      .post("/v1/admin/inventory/receipts")
      .set("authorization", "Bearer token")
      .set("x-correlation-id", "corr-receive")
      .send({ variantId, quantity: 5, idempotencyKey: "receipt-5" })
      .expect(201);
    expect(service.receive).toHaveBeenCalledWith(
      { variantId, quantity: 5, idempotencyKey: "receipt-5" },
      {
        actorId: "staff-user",
        roles: ["inventory_manager"],
        correlationId: "corr-receive",
      },
    );
  });
});
