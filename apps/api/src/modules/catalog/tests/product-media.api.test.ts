// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../../../shared/http/application-error";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { ProductMediaServiceContract } from "../application/services/interfaces/product-media.service";
import { ProductMediaController } from "../presentation/controllers/product-media.controller";
import { createProductMediaRouter } from "../presentation/routes/product-media.routes";

const productId = "92000000-0000-4000-8000-000000000001";
const mediaId = "93000000-0000-4000-8000-000000000001";
const media = {
  id: mediaId,
  productId,
  objectKey: `products/${productId}/${mediaId}.png`,
  contentType: "image/png" as const,
  byteSize: 4,
  altText: "Bottle front",
  sortOrder: 0,
  isPrimary: true,
  createdAt: "2026-08-05T00:00:00.000Z",
};
const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

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

function fixture(overrides: Partial<ProductMediaServiceContract> = {}) {
  const service: ProductMediaServiceContract = {
    list: vi.fn(async () => [media]),
    upload: vi.fn(async () => media),
    update: vi.fn(async () => ({ ...media, altText: "Updated" })),
    delete: vi.fn(async () => undefined),
    getContent: vi.fn(async () => ({
      bytes,
      contentType: "image/png" as const,
    })),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(
    "/v1/admin/catalog",
    createProductMediaRouter(
      new ProductMediaController(service),
      authenticate,
      10 * 1024 * 1024,
    ),
  );
  app.use(createErrorHandler());
  return { app, service };
}

describe("Product media API", () => {
  it("uploads in memory and returns a backend-controlled preview URL", async () => {
    const { app, service } = fixture();
    const response = await request(app)
      .post(`/v1/admin/catalog/products/${productId}/media`)
      .set("authorization", "Bearer manager")
      .set("x-correlation-id", "corr_media")
      .field("altText", "Bottle front")
      .field("sortOrder", "0")
      .field("isPrimary", "true")
      .attach("file", bytes, { filename: "bottle.png", contentType: "image/png" })
      .expect(201);
    expect(service.upload).toHaveBeenCalledWith(
      productId,
      expect.objectContaining({
        bytes: expect.any(Buffer),
        suppliedContentType: "image/png",
        altText: "Bottle front",
        sortOrder: 0,
        isPrimary: true,
      }),
      { actorId: "user_catalog", correlationId: "corr_media" },
    );
    expect(response.body.data.previewUrl).toBe(
      `/v1/admin/catalog/products/${productId}/media/${mediaId}/content`,
    );
    expect(response.body.data).not.toHaveProperty("objectKey");
  });

  it("updates metadata, deletes, and streams content", async () => {
    const { app, service } = fixture();
    const path = `/v1/admin/catalog/products/${productId}/media/${mediaId}`;
    await request(app).patch(path).set("authorization", "Bearer manager").send({ altText: "Updated", sortOrder: 1, isPrimary: true }).expect(200);
    await request(app).delete(path).set("authorization", "Bearer manager").expect(204);
    const content = await request(app).get(`${path}/content`).set("authorization", "Bearer manager").expect(200);
    expect(content.headers["content-type"]).toContain("image/png");
    expect(service.delete).toHaveBeenCalled();
  });

  it.each([
    [undefined, 401, "UNAUTHORIZED"],
    ["Bearer viewer", 403, "FORBIDDEN"],
  ])("enforces media roles", async (authorization, status, code) => {
    const pending = request(fixture().app).post(`/v1/admin/catalog/products/${productId}/media`);
    if (authorization !== undefined) pending.set("authorization", authorization);
    const response = await pending.expect(status);
    expect(response.body.errorCode).toBe(code);
  });

  it("requires a file and valid metadata", async () => {
    const response = await request(fixture().app)
      .post(`/v1/admin/catalog/products/${productId}/media`)
      .set("authorization", "Bearer manager")
      .field("altText", "")
      .expect(400);
    expect(response.body.errorCode).toBe("VALIDATION_ERROR");
  });
});
