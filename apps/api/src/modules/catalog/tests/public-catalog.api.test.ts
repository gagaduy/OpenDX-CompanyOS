// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { PublicCatalogServiceContract } from "../application/services/interfaces/public-catalog.service";
import type { ProductMediaStorage } from "../application/storage/product-media.storage";
import type { StorefrontHeroMediaStorage } from "../application/storage/storefront-hero-media.storage";
import { PublicCatalogController } from "../presentation/controllers/public-catalog.controller";
import { createPublicCatalogRouter } from "../presentation/routes/public-catalog.routes";
import type { ProductPublicationServiceContract } from "../application/services/interfaces/product-publication.service";
import { CatalogApplicationError } from "../application/services/catalog-application.error";
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
const content = {
  assurances: [{
    code: "free-delivery",
    iconKey: "truck" as const,
    title: "Miễn phí vận chuyển",
    description: "Cho đơn hàng đủ điều kiện",
  }],
  metrics: [{
    code: "authentic-products",
    displayValue: "100%",
    label: "Sản phẩm chính hãng",
  }],
};

function fixture() {
  const service: PublicCatalogServiceContract = {
    getStorefrontContent: vi.fn(async () => content),
    listCategories: vi.fn(async () => []),
    listHeroSlides: vi.fn(async () => []),
    listProducts: vi.fn(async (query) => ({ items: [product], ...query, totalItems: 1, totalPages: 1 })),
    getProductBySlug: vi.fn(async () => product),
    getMediaContentAuthorization: vi.fn(async () => ({ productId, mediaId, objectKey: "private/phone-x.png", contentType: "image/png" })),
    getHeroPresentation: vi.fn(async () => ({ slides: [] })),
    getHeroMediaContentAuthorization: vi.fn(async () => ({
      mediaId,
      objectKey: "storefront/hero/private.mp4",
      contentType: "video/mp4" as const,
      byteSize: 6,
    })),
  };
  const storage: ProductMediaStorage = {
    upload: vi.fn(), delete: vi.fn(), get: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  const heroStorage: StorefrontHeroMediaStorage = {
    upload: vi.fn(),
    open: vi.fn(async (_objectKey, range) => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
      const selected = range === undefined
        ? bytes
        : bytes.slice(range.offset, range.offset + range.length);
      return (async function* () { yield selected; })();
    }),
    exists: vi.fn(),
    delete: vi.fn(),
  };
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(
    "/v1/storefront",
    createPublicCatalogRouter(
      new PublicCatalogController(service, storage, heroStorage),
    ),
  );
  app.use(createErrorHandler());
  return { app, service, storage, heroStorage };
}

describe("Public Catalog API", () => {
  it("serves purpose-safe Storefront content anonymously", async () => {
    const { app, service } = fixture();

    const response = await request(app).get("/v1/storefront/content").expect(200);

    expect(response.body).toEqual({
      success: true,
      message: "Storefront content retrieved",
      data: content,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /sortOrder|enabled|createdAt|updatedAt/,
    );
    expect(service.getStorefrontContent).toHaveBeenCalledOnce();
  });

  it("serves purpose-safe ordered hero slides anonymously", async () => {
    const { app, service } = fixture();
    vi.mocked(service.listHeroSlides).mockResolvedValue([
      {
        category: {
          id: product.categoryId,
          name: "Phones",
          slug: "phones",
        },
        product,
      },
    ]);

    const response = await request(app)
      .get("/v1/storefront/hero-slides")
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      message: "Hero slides retrieved",
      data: [
        {
          category: { name: "Phones", slug: "phones" },
          product: { slug: "phone-x" },
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain("objectKey");
  });

  it("serves the purpose-safe synchronized hero presentation anonymously", async () => {
    const { app, service } = fixture();
    vi.mocked(service.getHeroPresentation).mockResolvedValue({
      media: {
        id: mediaId,
        contentUrl: `/v1/storefront/hero-media/${mediaId}/content`,
        contentType: "video/mp4",
        byteSize: 6,
        durationMs: 4_000,
      },
      slides: [{
        category: { id: product.categoryId, name: "Phones", slug: "phones" },
        product,
        chapter: { startMs: 0, endMs: 4_000, label: "Phones" },
      }],
    });

    const response = await request(app)
      .get("/v1/storefront/hero-presentation")
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      message: "Hero presentation retrieved",
      data: {
        media: { id: mediaId, contentType: "video/mp4" },
        slides: [{ chapter: { startMs: 0, endMs: 4_000 } }],
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /objectKey|contentDigest|createdAt|updatedAt/,
    );
  });

  it("streams full and single-range hero media without concatenating it", async () => {
    const { app, service, heroStorage } = fixture();

    const full = await request(app)
      .get(`/v1/storefront/hero-media/${mediaId}/content`)
      .expect("accept-ranges", "bytes")
      .expect("cache-control", "no-store")
      .expect("content-type", /video\/mp4/)
      .expect("content-length", "6")
      .expect(200);
    expect(full.body).toEqual(Buffer.from([1, 2, 3, 4, 5, 6]));

    const partial = await request(app)
      .get(`/v1/storefront/hero-media/${mediaId}/content`)
      .set("Range", "bytes=2-4")
      .expect("content-range", "bytes 2-4/6")
      .expect("content-length", "3")
      .expect(206);
    expect(partial.body).toEqual(Buffer.from([3, 4, 5]));
    expect(service.getHeroMediaContentAuthorization).toHaveBeenCalledWith(mediaId);
    expect(heroStorage.open).toHaveBeenLastCalledWith(
      "storefront/hero/private.mp4",
      { offset: 2, length: 3 },
    );
  });

  it("prevents stale bytes when a stable hero media id authorizes replacement metadata", async () => {
    const { app, service, heroStorage } = fixture();
    vi.mocked(heroStorage.open).mockImplementation(async (objectKey) =>
      (async function* () {
        yield objectKey.endsWith("replacement.mp4")
          ? new Uint8Array([7, 8, 9])
          : new Uint8Array([1, 2, 3, 4, 5, 6]);
      })(),
    );

    await request(app)
      .get(`/v1/storefront/hero-media/${mediaId}/content`)
      .expect("cache-control", "no-store")
      .expect("content-length", "6")
      .expect(200);
    vi.mocked(service.getHeroMediaContentAuthorization).mockResolvedValue({
      mediaId,
      objectKey: "storefront/hero/replacement.mp4",
      contentType: "video/mp4",
      byteSize: 3,
    });

    const replacement = await request(app)
      .get(`/v1/storefront/hero-media/${mediaId}/content`)
      .expect("cache-control", "no-store")
      .expect("content-length", "3")
      .expect(200);
    expect(replacement.body).toEqual(Buffer.from([7, 8, 9]));
  });

  it("answers hero media HEAD with active metadata without opening storage", async () => {
    const { app, service, heroStorage } = fixture();

    const response = await request(app)
      .head(`/v1/storefront/hero-media/${mediaId}/content`)
      .expect("accept-ranges", "bytes")
      .expect("cache-control", "no-store")
      .expect("content-type", /video\/mp4/)
      .expect("content-length", "6")
      .expect(200);

    expect(response.body).toEqual({});
    expect(service.getHeroMediaContentAuthorization).toHaveBeenCalledWith(mediaId);
    expect(heroStorage.open).not.toHaveBeenCalled();
  });

  it("rejects inactive hero media HEAD without opening storage", async () => {
    const { app, service, heroStorage } = fixture();
    vi.mocked(service.getHeroMediaContentAuthorization).mockRejectedValue(
      new CatalogApplicationError("NOT_FOUND", "Active hero media not found"),
    );

    await request(app)
      .head(`/v1/storefront/hero-media/${mediaId}/content`)
      .expect(404);
    expect(heroStorage.open).not.toHaveBeenCalled();
  });

  it.each(["bytes=0-1,4-5", "bytes=6-7", "invalid"])(
    "rejects unsupported hero media range %s with a size response",
    async (range) => {
      const { app, heroStorage } = fixture();

      await request(app)
        .get(`/v1/storefront/hero-media/${mediaId}/content`)
        .set("Range", range)
        .expect("content-range", "bytes */6")
        .expect(416);
      expect(heroStorage.open).not.toHaveBeenCalled();
    },
  );

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
