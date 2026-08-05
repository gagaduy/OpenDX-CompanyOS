// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../../../shared/http/application-error";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { CatalogApplicationError } from "../application/services/catalog-application.error";
import type { ProductServiceContract } from "../application/services/interfaces/product.service";
import { ProductController } from "../presentation/controllers/product.controller";
import { createProductRouter } from "../presentation/routes/product.routes";

const id = "20000000-0000-4000-8000-000000000001";
const categoryId = "10000000-0000-4000-8000-000000000001";
const product = {
  id,
  categoryId,
  name: "Steel Bottle",
  slug: "steel-bottle",
  description: "Reusable bottle",
  attributes: {},
  status: "draft" as const,
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

function fixture(overrides: Partial<ProductServiceContract> = {}) {
  const service: ProductServiceContract = {
    list: vi.fn(async (query) => ({
      items: [{
        id,
        categoryId,
        categoryName: "Drinkware",
        name: product.name,
        slug: product.slug,
        status: "draft" as const,
        variantCount: 0,
        updatedAt: product.updatedAt,
        version: 1,
      }],
      page: query.page,
      pageSize: query.pageSize,
      totalItems: 1,
      totalPages: 1,
    })),
    get: vi.fn(async () => product),
    getAudit: vi.fn(async () => []),
    create: vi.fn(async () => product),
    update: vi.fn(async () => ({ ...product, name: "Updated", version: 2 })),
    archive: vi.fn(async () => ({ ...product, status: "archived" as const, version: 2 })),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/v1/admin/catalog", createProductRouter(new ProductController(service), authenticate));
  app.use(createErrorHandler());
  return { app, service };
}

describe("Product API", () => {
  it("lists with validated filters, pagination defaults, and meta", async () => {
    const { app, service } = fixture();
    const response = await request(app)
      .get(`/v1/admin/catalog/products?query=bottle&categoryId=${categoryId}`)
      .set("authorization", "Bearer manager")
      .expect(200);
    expect(service.list).toHaveBeenCalledWith({
      query: "bottle",
      categoryId,
      page: 1,
      pageSize: 20,
    });
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
  });

  it("creates, reads, updates, and archives through stable envelopes", async () => {
    const { app, service } = fixture();
    const authorization = { authorization: "Bearer manager", "x-correlation-id": "corr_product" };
    await request(app).post("/v1/admin/catalog/products").set(authorization).send({
      categoryId,
      name: product.name,
      description: product.description,
      attributes: {},
    }).expect(201);
    await request(app).get(`/v1/admin/catalog/products/${id}`).set(authorization).expect(200);
    await request(app).patch(`/v1/admin/catalog/products/${id}`).set(authorization).send({ name: "Updated", version: 1 }).expect(200);
    await request(app).post(`/v1/admin/catalog/products/${id}/archive`).set(authorization).send({ version: 1 }).expect(200);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: product.name }),
      { actorId: "user_catalog", correlationId: "corr_product" },
    );
  });

  it.each([
    [undefined, 401, "UNAUTHORIZED"],
    ["Bearer viewer", 403, "FORBIDDEN"],
  ])("enforces product roles", async (authorization, status, code) => {
    const pending = request(fixture().app).get("/v1/admin/catalog/products");
    if (authorization !== undefined) pending.set("authorization", authorization);
    expect((await pending.expect(status)).body.errorCode).toBe(code);
  });

  it("rejects invalid pagination and payloads", async () => {
    const app = fixture().app;
    expect((await request(app).get("/v1/admin/catalog/products?pageSize=101").set("authorization", "Bearer manager").expect(400)).body.errorCode).toBe("VALIDATION_ERROR");
    expect((await request(app).post("/v1/admin/catalog/products").set("authorization", "Bearer manager").send({ name: "" }).expect(400)).body.errorCode).toBe("VALIDATION_ERROR");
  });

  it.each([
    ["NOT_FOUND" as const, 404],
    ["CONFLICT" as const, 409],
    ["STALE_VERSION" as const, 409],
  ])("maps %s failures", async (code, status) => {
    const app = fixture({
      update: vi.fn(async () => {
        throw new CatalogApplicationError(code, "Product write failed");
      }),
    }).app;
    const response = await request(app)
      .patch(`/v1/admin/catalog/products/${id}`)
      .set("authorization", "Bearer manager")
      .send({ name: "Changed", version: 1 })
      .expect(status);
    expect(response.body.errorCode).toBe(code);
  });
});
