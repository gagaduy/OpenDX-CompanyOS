// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { PublicCatalogServiceContract } from "../application/services/interfaces/public-catalog.service";
import type { ProductMediaStorage } from "../application/storage/product-media.storage";
import { PublicCatalogController } from "../presentation/controllers/public-catalog.controller";
import { createPublicCatalogRouter } from "../presentation/routes/public-catalog.routes";
import type { ProductPublicationServiceContract } from "../application/services/interfaces/product-publication.service";
import { ProductPublicationController } from "../presentation/controllers/product-publication.controller";
import { createProductPublicationRouter } from "../presentation/routes/product-publication.routes";

const productId = "e2000000-0000-4000-8000-000000000001";
const mediaId = "e5000000-0000-4000-8000-000000000001";
const product = {
  id: productId,
  categoryId: "e1000000-0000-4000-8000-000000000001",
  categoryName: "Phones",
  name: "Phone X",
  slug: "phone-x",
  description: "Technology phone",
  attributes: {},
  primaryMedia: { id: mediaId, altText: "Phone X", contentUrl: `/v1/storefront/products/${productId}/media/${mediaId}/content` },
  variants: [{
    id: "e3000000-0000-4000-8000-000000000001",
    sku: "PHONE-X",
    title: "Black",
    optionValues: { color: "Black" },
    price: { amountMinor: 19_990_000, currency: "VND" as const },
    availableQuantity: 0,
    purchasable: false,
  }],
};

function fixture() {
  const service: PublicCatalogServiceContract = {
    listCategories: vi.fn(async () => []),
    listProducts: vi.fn(async (query) => ({ items: [product], ...query, totalItems: 1, totalPages: 1 })),
    getProductBySlug: vi.fn(async () => product),
    getMediaContentAuthorization: vi.fn(async () => ({ productId, mediaId, objectKey: "private/phone-x.png", contentType: "image/png" })),
  };
  const storage: ProductMediaStorage = {
    upload: vi.fn(), delete: vi.fn(), get: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  const app = express();
  app.use(correlationIdMiddleware);
  app.use("/v1/storefront", createPublicCatalogRouter(new PublicCatalogController(service, storage)));
  app.use(createErrorHandler());
  return { app, service, storage };
}

describe("Public Catalog API", () => {
  it("validates and forwards storefront discovery filters", async () => {
    const { app, service } = fixture();
    await request(app).get("/v1/storefront/products?query=phone&category=phones&minPriceVnd=1000000&maxPriceVnd=20000000&stockStatus=in_stock&sort=best_selling&discountStatus=on_sale&page=2&pageSize=12").expect(200);
    expect(service.listProducts).toHaveBeenCalledWith({
      query: "phone", category: "phones", minPriceVnd: 1_000_000,
      maxPriceVnd: 20_000_000, stockStatus: "in_stock",
      sort: "best_selling", discountStatus: "on_sale",
      page: 2, pageSize: 12,
    });
    await request(app).get("/v1/storefront/products?minPriceVnd=20&maxPriceVnd=10").expect(400);
    await request(app).get("/v1/storefront/products?sort=random").expect(400);
    await request(app).get("/v1/storefront/products?discountStatus=clearance").expect(400);
  });

  it("serves a sold-out product anonymously without protected fields", async () => {
    const response = await request(fixture().app).get("/v1/storefront/products/phone-x").expect(200);
    expect(response.body.data.variants[0]).toMatchObject({ availableQuantity: 0, purchasable: false });
    expect(response.body.data).not.toHaveProperty("version");
    expect(JSON.stringify(response.body)).not.toContain("objectKey");
  });

  it("passes verified publication roles and version to the service", async () => {
    const published = {
      id: productId,
      categoryId: product.categoryId,
      name: product.name,
      slug: product.slug,
      description: product.description,
      attributes: {},
      status: "published" as const,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
      version: 3,
    };
    const publication: ProductPublicationServiceContract = {
      checkReadiness: vi.fn(async () => ({ ready: true, missing: [] })),
      publish: vi.fn(async () => published),
      unpublish: vi.fn(async () => ({ ...published, status: "draft" as const, version: 4 })),
    };
    const authenticate: RequestHandler = (_request, response, next) => {
      response.locals.staffPrincipal = {
        subject: "catalog-user",
        displayName: "Catalog User",
        roles: ["catalog_manager"],
      };
      next();
    };
    const app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    app.use(
      "/v1/admin/catalog",
      createProductPublicationRouter(
        new ProductPublicationController(publication),
        authenticate,
        vi.fn(async () => undefined),
      ),
    );
    app.use(createErrorHandler());

    await request(app)
      .post(`/v1/admin/catalog/products/${productId}/publish`)
      .set("x-correlation-id", "corr-publish")
      .send({ version: 2 })
      .expect(200);
    expect(publication.publish).toHaveBeenCalledWith(
      productId,
      { version: 2 },
      { actorId: "catalog-user", roles: ["catalog_manager"], correlationId: "corr-publish" },
    );
  });

  it("authorizes media before reading private object storage", async () => {
    const { app, service, storage } = fixture();
    await request(app).get(`/v1/storefront/products/${productId}/media/${mediaId}/content`).expect(200);
    expect(service.getMediaContentAuthorization).toHaveBeenCalledWith(productId, mediaId);
    expect(storage.get).toHaveBeenCalledWith("private/phone-x.png");
  });
});
