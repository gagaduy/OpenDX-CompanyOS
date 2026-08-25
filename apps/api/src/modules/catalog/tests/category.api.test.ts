// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { ApplicationError } from "../../../shared/http/application-error";
import type { CategoryServiceContract } from "../application/services/interfaces/category.service";
import { CatalogApplicationError } from "../application/services/catalog-application.error";
import { CategoryController } from "../presentation/controllers/category.controller";
import { createCategoryRouter } from "../presentation/routes/category.routes";

const category = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Drinkware",
  slug: "drinkware",
  sortOrder: 0,
  status: "active" as const,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 1,
};

const authenticate: RequestHandler = (request_, response, next) => {
  const token = request_.header("authorization");
  if (token === undefined) {
    next(new ApplicationError(401, "UNAUTHORIZED", "Authentication required"));
    return;
  }
  response.locals.staffPrincipal = {
    subject: token === "Bearer viewer" ? "user_viewer" : "user_catalog",
    displayName: "Staff",
    roles: token === "Bearer viewer" ? [] : ["catalog_manager"],
  };
  next();
};

function createFixture(overrides: Partial<CategoryServiceContract> = {}) {
  const service: CategoryServiceContract = {
    list: vi.fn(async () => [category]),
    create: vi.fn(async () => category),
    update: vi.fn(async () => ({ ...category, name: "Updated", version: 2 })),
    archive: vi.fn(async () => ({
      ...category,
      status: "archived" as const,
      version: 2,
    })),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(
    "/v1/admin/catalog",
    createCategoryRouter(new CategoryController(service), authenticate),
  );
  app.use(createErrorHandler());
  return { app, service };
}

describe("Category API", () => {
  it("lists categories in a stable success envelope", async () => {
    const response = await request(createFixture().app)
      .get("/v1/admin/catalog/categories")
      .set("authorization", "Bearer manager")
      .expect(200);
    expect(response.body).toEqual({
      success: true,
      message: "Categories retrieved",
      data: [category],
    });
  });

  it("creates and propagates the authenticated actor and correlation ID", async () => {
    const { app, service } = createFixture();
    const response = await request(app)
      .post("/v1/admin/catalog/categories")
      .set("authorization", "Bearer manager")
      .set("x-correlation-id", "corr_category_create")
      .send({ name: "Drinkware" })
      .expect(201);
    expect(response.body.success).toBe(true);
    expect(service.create).toHaveBeenCalledWith(
      { name: "Drinkware" },
      { actorId: "user_catalog", correlationId: "corr_category_create" },
    );
  });

  it.each([
    [undefined, 401, "UNAUTHORIZED"],
    ["Bearer viewer", 403, "FORBIDDEN"],
  ])("enforces staff category roles", async (authorization, status, code) => {
    const pending = request(createFixture().app).get(
      "/v1/admin/catalog/categories",
    );
    if (authorization !== undefined) pending.set("authorization", authorization);
    const response = await pending.expect(status);
    expect(response.body.errorCode).toBe(code);
  });

  it("rejects invalid input", async () => {
    const response = await request(createFixture().app)
      .post("/v1/admin/catalog/categories")
      .set("authorization", "Bearer manager")
      .send({ name: "", sortOrder: -1 })
      .expect(400);
    expect(response.body.errorCode).toBe("VALIDATION_ERROR");
  });

  it.each([
    ["NOT_FOUND" as const, 404],
    ["CONFLICT" as const, 409],
  ])("maps %s application failures", async (code, status) => {
    const { app } = createFixture({
      update: vi.fn(async () => {
        throw new CatalogApplicationError(code, "Category write failed");
      }),
    });
    const response = await request(app)
      .patch(`/v1/admin/catalog/categories/${category.id}`)
      .set("authorization", "Bearer manager")
      .send({ name: "Updated", version: 1 })
      .expect(status);
    expect(response.body.errorCode).toBe(code);
  });

  it("archives with optimistic version input", async () => {
    const { app, service } = createFixture();
    await request(app)
      .post(`/v1/admin/catalog/categories/${category.id}/archive`)
      .set("authorization", "Bearer manager")
      .send({ version: 1 })
      .expect(200);
    expect(service.archive).toHaveBeenCalledWith(
      category.id,
      1,
      expect.objectContaining({ actorId: "user_catalog" }),
    );
  });
});
