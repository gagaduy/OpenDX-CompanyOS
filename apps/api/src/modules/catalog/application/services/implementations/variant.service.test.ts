// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Product } from "../../../domain/entities/product";
import type { ProductVariant } from "../../../domain/entities/product-variant";
import type { CatalogAuditRepository } from "../../repositories/interfaces/catalog-audit.repository";
import type { ProductRepository } from "../../repositories/interfaces/product.repository";
import type { VariantRepository } from "../../repositories/interfaces/variant.repository";
import { VariantService } from "./variant.service";

const session = {} as DatabaseSession;
const context = { actorId: "user_catalog", correlationId: "corr_variant" };
const product: Product = {
  id: "product_bottle",
  categoryId: "category_drinkware",
  name: "Steel Bottle",
  slug: "steel-bottle",
  description: "Reusable bottle",
  attributes: {},
  status: "draft",
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  version: 1,
};
const variant: ProductVariant = {
  id: "variant_black",
  productId: product.id,
  sku: "BOTTLE-BLACK",
  title: "Black",
  optionValues: { color: "Black" },
  status: "active",
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
  version: 1,
};

function fixture(
  variantOverrides: Partial<VariantRepository> = {},
  productValue: Product | undefined = product,
) {
  const variants: VariantRepository = {
    findById: vi.fn(async () => variant),
    findBySku: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => true),
    replaceCurrentPrice: vi.fn(async () => undefined),
    ...variantOverrides,
  };
  const products: ProductRepository = {
    list: vi.fn(async () => ({ items: [], totalItems: 0 })),
    findById: vi.fn(async () => productValue),
    findBySlug: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => true),
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
    service: new VariantService(
      variants,
      products,
      audit,
      transactions,
      () => "generated_id",
      () => "2026-08-05T00:00:00.000Z",
    ),
    variants,
    audit,
  };
}

describe("VariantService", () => {
  it("creates an active variant with normalized global SKU and options", async () => {
    const { service, variants, audit } = fixture({ findById: vi.fn(async () => undefined) });
    const created = await service.create(
      product.id,
      { sku: " bottle-black ", title: "Black", optionValues: { color: "Black" } },
      context,
    );
    expect(created).toMatchObject({ sku: "BOTTLE-BLACK", status: "active", version: 1 });
    expect(variants.create).toHaveBeenCalledWith(session, created);
    expect(audit.append).toHaveBeenCalled();
  });

  it("rejects duplicate SKU, invalid options, and archived products", async () => {
    await expect(
      fixture({ findBySku: vi.fn(async () => variant) }).service.create(
        product.id,
        { sku: "bottle-black", title: "Black", optionValues: { color: "Black" } },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      fixture().service.create(
        product.id,
        { sku: "new", title: "New", optionValues: {} },
        context,
      ),
    ).rejects.toThrow("Variant options");
    await expect(
      fixture({}, { ...product, status: "archived" }).service.create(
        product.id,
        { sku: "new", title: "New", optionValues: { color: "Black" } },
        context,
      ),
    ).rejects.toThrow("Archived products");
  });

  it("rejects archived variants and stale versions", async () => {
    await expect(
      fixture({ findById: vi.fn(async () => ({ ...variant, status: "archived" as const })) })
        .service.update(product.id, variant.id, { title: "Changed", version: 1 }, context),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      fixture({ update: vi.fn(async () => false) }).service.update(
        product.id,
        variant.id,
        { title: "Changed", version: 1 },
        context,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("replaces current price with positive safe tax-inclusive VND and audit", async () => {
    const { service, variants, audit } = fixture();
    const price = await service.replacePrice(
      product.id,
      variant.id,
      { amountMinor: 299000, currency: "VND" },
      context,
    );
    expect(price).toMatchObject({
      amountMinor: 299000,
      currency: "VND",
      taxInclusive: true,
      createdBy: "user_catalog",
    });
    expect(variants.replaceCurrentPrice).toHaveBeenCalledWith(session, price);
    expect(audit.append).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ resourceType: "price", resourceId: price.id }),
    );
  });

  it.each([0, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe VND amount %s", async (amountMinor) => {
    await expect(
      fixture().service.replacePrice(
        product.id,
        variant.id,
        { amountMinor, currency: "VND" },
        context,
      ),
    ).rejects.toThrow("positive safe integer");
  });
});
