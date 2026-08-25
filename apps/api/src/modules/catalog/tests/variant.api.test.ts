// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../../../shared/http/application-error";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { CatalogApplicationError } from "../application/services/catalog-application.error";
import type { VariantServiceContract } from "../application/services/interfaces/variant.service";
import { VariantController } from "../presentation/controllers/variant.controller";
import { createVariantRouter } from "../presentation/routes/variant.routes";

const productId = "72000000-0000-4000-8000-000000000001";
const variantId = "73000000-0000-4000-8000-000000000001";
const variant = {
  id: variantId,
  productId,
  sku: "BOTTLE-BLACK",
  title: "Black",
  optionValues: { color: "Black" },
  status: "active" as const,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 1,
};

const authenticate: RequestHandler = (request_, response, next) => {
  const token = request_.header("authorization");
  if (token === undefined) return next(new ApplicationError(401, "UNAUTHORIZED", "Authentication required"));
  response.locals.staffPrincipal = {
    subject: "user_catalog",
    displayName: "Staff",
    roles: token === "Bearer viewer" ? [] : ["catalog_manager"],
  };
  next();
};

function fixture(overrides: Partial<VariantServiceContract> = {}) {
  const service: VariantServiceContract = {
    create: vi.fn(async () => variant),
    update: vi.fn(async () => ({ ...variant, title: "Updated", version: 2 })),
    archive: vi.fn(async () => ({ ...variant, status: "archived" as const, version: 2 })),
    replacePrice: vi.fn(async () => ({
      id: "74000000-0000-4000-8000-000000000001",
      variantId,
      amountMinor: 299000,
      currency: "VND" as const,
      taxInclusive: true as const,
      validFrom: "2026-08-05T00:00:00.000Z",
      createdBy: "user_catalog",
    })),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/v1/admin/catalog", createVariantRouter(new VariantController(service), authenticate));
  app.use(createErrorHandler());
  return { app, service };
}

describe("Variant API", () => {
  it("creates, updates, archives variants and replaces current VND price", async () => {
    const { app, service } = fixture();
    const headers = { authorization: "Bearer manager", "x-correlation-id": "corr_variant" };
    await request(app).post(`/v1/admin/catalog/products/${productId}/variants`).set(headers).send({ sku: "bottle-black", title: "Black", optionValues: { color: "Black" } }).expect(201);
    await request(app).patch(`/v1/admin/catalog/products/${productId}/variants/${variantId}`).set(headers).send({ title: "Updated", version: 1 }).expect(200);
    await request(app).post(`/v1/admin/catalog/products/${productId}/variants/${variantId}/archive`).set(headers).send({ version: 1 }).expect(200);
    await request(app).put(`/v1/admin/catalog/products/${productId}/variants/${variantId}/price`).set(headers).send({ amountMinor: 299000, currency: "VND" }).expect(200);
    expect(service.replacePrice).toHaveBeenCalledWith(
      productId,
      variantId,
      { amountMinor: 299000, currency: "VND" },
      { actorId: "user_catalog", correlationId: "corr_variant" },
    );
  });

  it.each([
    [undefined, 401, "UNAUTHORIZED"],
    ["Bearer viewer", 403, "FORBIDDEN"],
  ])("enforces backend roles", async (authorization, status, code) => {
    const pending = request(fixture().app).post(`/v1/admin/catalog/products/${productId}/variants`);
    if (authorization !== undefined) pending.set("authorization", authorization);
    const response = await pending.send({}).expect(status);
    expect(response.body.errorCode).toBe(code);
  });

  it("validates SKU/options and safe VND price input", async () => {
    const app = fixture().app;
    expect((await request(app).post(`/v1/admin/catalog/products/${productId}/variants`).set("authorization", "Bearer manager").send({ sku: "", title: "", optionValues: {} }).expect(400)).body.errorCode).toBe("VALIDATION_ERROR");
    expect((await request(app).put(`/v1/admin/catalog/products/${productId}/variants/${variantId}/price`).set("authorization", "Bearer manager").send({ amountMinor: 0, currency: "USD" }).expect(400)).body.errorCode).toBe("VALIDATION_ERROR");
  });

  it.each(["NOT_FOUND" as const, "CONFLICT" as const, "STALE_VERSION" as const])(
    "maps %s service errors",
    async (code) => {
      const app = fixture({
        update: vi.fn(async () => {
          throw new CatalogApplicationError(code, "Variant write failed");
        }),
      }).app;
      const response = await request(app)
        .patch(`/v1/admin/catalog/products/${productId}/variants/${variantId}`)
        .set("authorization", "Bearer manager")
        .send({ title: "Updated", version: 1 })
        .expect(code === "NOT_FOUND" ? 404 : 409);
      expect(response.body.errorCode).toBe(code);
    },
  );
});
