// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Category } from "../../../domain/entities/category";
import type { Product } from "../../../domain/entities/product";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { CategoryRepository } from "../../repositories/interfaces/category.repository";
import type { ProductRepository } from "../../repositories/interfaces/product.repository";
import { ProductService } from "./product.service";

const session = {} as DatabaseSession;
const context = { actorId: "user_catalog", correlationId: "corr_product" };
const category: Category = {
  id: "category_active",
  name: "Drinkware",
  slug: "drinkware",
  sortOrder: 0,
  status: "active",
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 1,
};
const product: Product = {
  id: "product_bottle",
  categoryId: category.id,
  name: "Steel Bottle",
  slug: "steel-bottle",
  description: "Reusable steel bottle",
  attributes: { color: "Black" },
  status: "draft",
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 1,
};

function fixture(
  overrides: Partial<ProductRepository> = {},
  categoryOverride: Category | null = category,
) {
  const repository: ProductRepository = {
    list: vi.fn(async () => ({ items: [], totalItems: 0 })),
    findById: vi.fn(async () => product),
    findBySlug: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => true),
    ...overrides,
  };
  const categories: CategoryRepository = {
    list: vi.fn(async () => []),
    findById: vi.fn(async () => categoryOverride ?? undefined),
    findBySlug: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => true),
    wouldCreateCycle: vi.fn(async () => false),
    hasActiveProducts: vi.fn(async () => false),
  };
  const audit: CatalogAuditRepository = {
    append: vi.fn(async () => undefined),
    listByResource: vi.fn(async () => []),
  };
  const transactions: TransactionRunner = {
    run: (work) => work(session),
    runReadOnly: (work) => work(session),
  };
  return {
    service: new ProductService(
      repository,
      categories,
      audit,
      transactions,
      () => "product_generated",
      () => "2026-08-05T00:00:00.000Z",
    ),
    repository,
    audit,
  };
}

describe("ProductService", () => {
  it("creates a normalized draft with validated attributes and audit", async () => {
    const { service, repository, audit } = fixture({ findById: vi.fn(async () => undefined) });
    const created = await service.create(
      {
        categoryId: category.id,
        name: "Bình Giữ Nhiệt",
        description: "Reusable bottle",
        attributes: { capacity: "750ml", reusable: true },
      },
      context,
    );
    expect(created).toMatchObject({
      id: "product_generated",
      slug: "binh-giu-nhiet",
      status: "draft",
      version: 1,
    });
    expect(repository.create).toHaveBeenCalledWith(session, created);
    expect(audit.append).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ resourceType: "product", resourceId: created.id }),
    );
  });

  it("rejects missing/archived categories, duplicate slugs, and invalid attributes", async () => {
    await expect(
      fixture({}, null).service.create(
        { categoryId: "missing", name: "Product", description: "Description", attributes: {} },
        context,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      fixture({}, { ...category, status: "archived" }).service.create(
        { categoryId: category.id, name: "Product", description: "Description", attributes: {} },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      fixture({ findBySlug: vi.fn(async () => product) }).service.create(
        { categoryId: category.id, name: "Steel Bottle", description: "Description", attributes: {} },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      fixture().service.create(
        { categoryId: category.id, name: "Product", description: "Description", attributes: { nested: { unsafe: true } } as never },
        context,
      ),
    ).rejects.toThrow("Invalid product attribute");
  });

  it("rejects archived products and stale updates", async () => {
    await expect(
      fixture({
        findById: vi.fn(async () => ({
          ...product,
          status: "archived" as const,
        })),
      })
        .service.update(product.id, { name: "Changed", version: 1 }, context),
    ).rejects.toThrow("Archived products");
    await expect(
      fixture({ update: vi.fn(async () => false) }).service.update(
        product.id,
        { name: "Changed", version: 1 },
        context,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("archives drafts and keeps audit in the mutation transaction", async () => {
    const { service, repository, audit } = fixture();
    await service.archive(product.id, 1, context);
    expect(repository.update).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ status: "archived", version: 2 }),
      1,
    );
    expect(audit.append).toHaveBeenCalledAfter(repository.update as never);
  });

  it("does not audit a failed product write", async () => {
    const { service, audit } = fixture({
      create: vi.fn(async () => {
        throw new Error("write failed");
      }),
      findById: vi.fn(async () => undefined),
    });
    await expect(
      service.create(
        { categoryId: category.id, name: "Product", description: "Description", attributes: {} },
        context,
      ),
    ).rejects.toThrow("write failed");
    expect(audit.append).not.toHaveBeenCalled();
  });
});
