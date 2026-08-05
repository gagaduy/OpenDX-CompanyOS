// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Product } from "../../../domain/entities/product";
import type { ProductMedia } from "../../../domain/entities/product-media";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { ProductMediaRepository } from "../../repositories/interfaces/product-media.repository";
import type { ProductRepository } from "../../repositories/interfaces/product.repository";
import type { ProductMediaInspector, ProductMediaStorage } from "../../storage/product-media.storage";
import { ProductMediaService } from "./product-media.service";

const session = {} as DatabaseSession;
const product: Product = {
  id: "product_bottle",
  categoryId: "category_drinkware",
  name: "Bottle",
  slug: "bottle",
  description: "Description",
  attributes: {},
  status: "draft",
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 1,
};
const media: ProductMedia = {
  id: "media_bottle",
  productId: product.id,
  objectKey: "products/product_bottle/media_generated.webp",
  contentType: "image/webp",
  byteSize: 4,
  altText: "Black steel bottle",
  sortOrder: 0,
  isPrimary: true,
  createdAt: "2026-08-05T00:00:00.000Z",
};
const context = { actorId: "user_catalog", correlationId: "corr_media" };

function fixture(options: {
  product?: Product;
  repository?: Partial<ProductMediaRepository>;
  uploadFailure?: Error;
  transactionFailure?: Error;
  detectedType?: "image/jpeg" | "image/png" | "image/webp" | "image/avif" | null;
} = {}) {
  const repository: ProductMediaRepository = {
    listByProduct: vi.fn(async () => []),
    findById: vi.fn(async () => media),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => true),
    delete: vi.fn(async () => true),
    ...options.repository,
  };
  const products: ProductRepository = {
    list: vi.fn(async () => ({ items: [], totalItems: 0 })),
    findById: vi.fn(async () => options.product ?? product),
    findBySlug: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => true),
  };
  const storage: ProductMediaStorage = {
    upload: vi.fn(async () => {
      if (options.uploadFailure !== undefined) throw options.uploadFailure;
    }),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => Buffer.from("image")),
  };
  const inspector: ProductMediaInspector = {
    detectContentType: vi.fn(async () =>
      options.detectedType === null
        ? undefined
        : options.detectedType ?? "image/webp",
    ),
  };
  const audit: CatalogAuditRepository = {
    append: vi.fn(async () => undefined),
    listByResource: vi.fn(async () => []),
  };
  const transactions: TransactionRunner = {
    run: async (work) => {
      if (options.transactionFailure !== undefined) throw options.transactionFailure;
      return work(session);
    },
    runReadOnly: (work) => work(session),
  };
  return {
    service: new ProductMediaService(
      repository,
      products,
      storage,
      inspector,
      audit,
      transactions,
      () => "media_generated",
      () => "2026-08-05T00:00:00.000Z",
      10 * 1024 * 1024,
    ),
    repository,
    storage,
    audit,
  };
}

describe("ProductMediaService", () => {
  it("uploads byte-sniffed media with generated key, primary metadata, and audit", async () => {
    const { service, repository, storage, audit } = fixture();
    const uploaded = await service.upload(
      product.id,
      {
        bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]),
        suppliedContentType: "application/octet-stream",
        altText: "Black steel bottle",
        sortOrder: 0,
        isPrimary: true,
      },
      context,
    );
    expect(uploaded).toMatchObject({
      id: "media_generated",
      objectKey: `products/${product.id}/media_generated.webp`,
      contentType: "image/webp",
      isPrimary: true,
    });
    expect(storage.upload).toHaveBeenCalledWith(
      uploaded.objectKey,
      expect.any(Buffer),
      "image/webp",
    );
    expect(repository.create).toHaveBeenCalledWith(session, uploaded);
    expect(audit.append).toHaveBeenCalled();
  });

  it("rejects empty alt text, oversized files, unsupported signatures, and archived products", async () => {
    await expect(
      fixture().service.upload(product.id, {
        bytes: Buffer.from("image"), suppliedContentType: "image/webp", altText: " ", sortOrder: 0, isPrimary: false,
      }, context),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      fixture().service.upload(product.id, {
        bytes: Buffer.alloc(10 * 1024 * 1024 + 1), suppliedContentType: "image/png", altText: "Image", sortOrder: 0, isPrimary: false,
      }, context),
    ).rejects.toMatchObject({ code: "MEDIA_TOO_LARGE" });
    await expect(
      fixture({ detectedType: null }).service.upload(product.id, {
        bytes: Buffer.from("unknown"), suppliedContentType: "image/png", altText: "Image", sortOrder: 0, isPrimary: false,
      }, context),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    await expect(
      fixture({ product: { ...product, status: "archived" } }).service.upload(product.id, {
        bytes: Buffer.from("image"), suppliedContentType: "image/webp", altText: "Image", sortOrder: 0, isPrimary: false,
      }, context),
    ).rejects.toThrow("Archived products");
  });

  it("compensates object upload when the database transaction fails", async () => {
    const { service, storage } = fixture({ transactionFailure: new Error("database failed") });
    await expect(
      service.upload(product.id, {
        bytes: Buffer.from("image"), suppliedContentType: "image/webp", altText: "Image", sortOrder: 0, isPrimary: false,
      }, context),
    ).rejects.toThrow("database failed");
    expect(storage.delete).toHaveBeenCalledWith(`products/${product.id}/media_generated.webp`);
  });

  it("deletes metadata transactionally and removes storage idempotently", async () => {
    const { service, repository, storage } = fixture();
    await service.delete(product.id, media.id, context);
    expect(repository.delete).toHaveBeenCalledWith(session, media.id);
    expect(storage.delete).toHaveBeenCalledWith(media.objectKey);
  });
});
