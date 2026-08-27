// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { InventoryAvailabilityReader } from "../../../../inventory";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { PublicCatalogRepository } from "../../repositories/interfaces/public-catalog.repository";
import { PublicCatalogService } from "./public-catalog.service";

const VARIANT_ID = "d1000000-0000-4000-8000-000000000001";
const product = {
  id: "d2000000-0000-4000-8000-000000000001",
  categoryId: "d3000000-0000-4000-8000-000000000001",
  categoryName: "Phones",
  name: "Phone X",
  slug: "phone-x",
  brand: "Nova",
  description: "Technology phone",
  attributes: { color: "Black" },
  primaryMedia: {
    id: "d4000000-0000-4000-8000-000000000001",
    altText: "Phone X front",
  },
  variants: [
    {
      id: VARIANT_ID,
      sku: "TECH-PHONE-BLACK",
      title: "Black",
      optionValues: { color: "Black" },
      price: { amountMinor: 19_990_000, currency: "VND" as const },
    },
  ],
};

describe("PublicCatalogService", () => {
  it("returns Storefront content through the read-only Catalog boundary", async () => {
    const content = {
      assurances: [
        {
          code: "free-delivery",
          iconKey: "truck" as const,
          title: "Miễn phí vận chuyển",
          description: "Cho đơn hàng đủ điều kiện",
        },
      ],
      metrics: [
        {
          code: "authentic-products",
          displayValue: "100%",
          label: "Sản phẩm chính hãng",
        },
      ],
    };
    const repository = {
      listStorefrontContent: vi.fn(async () => content),
    } as unknown as PublicCatalogRepository;
    const availability = { getByVariantIds: vi.fn() } as unknown as InventoryAvailabilityReader;
    const transactions: TransactionRunner = {
      run: (work) => work({ query: vi.fn() }),
      runReadOnly: (work) => work({ query: vi.fn() }),
    };

    const service = new PublicCatalogService(repository, availability, transactions);

    await expect(service.getStorefrontContent()).resolves.toEqual(content);
  });

  it("preserves empty Storefront content without inventing defaults", async () => {
    const repository = {
      listStorefrontContent: vi.fn(async () => ({ assurances: [], metrics: [] })),
    } as unknown as PublicCatalogRepository;
    const availability = { getByVariantIds: vi.fn() } as unknown as InventoryAvailabilityReader;
    const transactions: TransactionRunner = {
      run: (work) => work({ query: vi.fn() }),
      runReadOnly: (work) => work({ query: vi.fn() }),
    };

    const service = new PublicCatalogService(repository, availability, transactions);

    await expect(service.getStorefrontContent()).resolves.toEqual({
      assurances: [],
      metrics: [],
    });
  });

  it("enriches ordered newest-per-category hero slides without dropping sold-out products", async () => {
    const phoneVariantId = "d1000000-0000-4000-8000-000000000002";
    const laptop = {
      ...product,
      categoryName: "Laptops",
      name: "Laptop X",
      slug: "laptop-x",
    };
    const phone = {
      ...product,
      id: "d2000000-0000-4000-8000-000000000002",
      categoryId: "d3000000-0000-4000-8000-000000000002",
      categoryName: "Phones",
      name: "Phone X",
      slug: "phone-x",
      primaryMedia: {
        id: "d4000000-0000-4000-8000-000000000002",
        altText: "Phone X front",
      },
      variants: [{ ...product.variants[0]!, id: phoneVariantId }],
    };
    const repository = {
      listHeroSlides: vi.fn(async () => [
        {
          category: {
            id: laptop.categoryId,
            name: "Laptops",
            slug: "laptops",
          },
          product: laptop,
        },
        {
          category: {
            id: phone.categoryId,
            name: "Phones",
            slug: "phones",
          },
          product: phone,
        },
      ]),
    } as unknown as PublicCatalogRepository;
    const availability: InventoryAvailabilityReader = {
      getByVariantIds: vi.fn(async () =>
        new Map([
          [
            VARIANT_ID,
            { initialized: true, onHand: 3, reserved: 1, available: 2 },
          ],
          [
            phoneVariantId,
            { initialized: true, onHand: 2, reserved: 2, available: 0 },
          ],
        ]),
      ),
    };
    const transactions: TransactionRunner = {
      run: (work) => work({ query: vi.fn() }),
      runReadOnly: (work) => work({ query: vi.fn() }),
    };
    const service = new PublicCatalogService(
      repository,
      availability,
      transactions,
    );

    const slides = await service.listHeroSlides();

    expect(slides.map(({ category }) => category.slug)).toEqual([
      "laptops",
      "phones",
    ]);
    expect(slides[0]?.product.primaryMedia.contentUrl).toBe(
      `/v1/storefront/products/${laptop.id}/media/${laptop.primaryMedia.id}/content`,
    );
    expect(slides[1]?.product.variants[0]).toMatchObject({
      availableQuantity: 0,
      purchasable: false,
    });
  });

  it("keeps a sold-out published product discoverable and not purchasable", async () => {
    const repository = {
      listProducts: vi.fn(async () => ({ items: [product], totalItems: 1 })),
    } as unknown as PublicCatalogRepository;
    const availability: InventoryAvailabilityReader = {
      getByVariantIds: vi.fn(async () =>
        new Map([
          [
            VARIANT_ID,
            { initialized: true, onHand: 4, reserved: 4, available: 0 },
          ],
        ]),
      ),
    };
    const transactions: TransactionRunner = {
      run: (work) => work({ query: vi.fn() }),
      runReadOnly: (work) => work({ query: vi.fn() }),
    };
    const service = new PublicCatalogService(
      repository,
      availability,
      transactions,
    );

    const result = await service.listProducts({
      stockStatus: "out_of_stock",
      page: 1,
      pageSize: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.variants[0]).toMatchObject({
      availableQuantity: 0,
      purchasable: false,
    });
  });

  it("filters stock before applying public pagination and calculates complete metadata", async () => {
    const products = [
      product,
      { ...product, id: "d2000000-0000-4000-8000-000000000002", slug: "phone-y", variants: [{ ...product.variants[0]!, id: "d1000000-0000-4000-8000-000000000002" }] },
      { ...product, id: "d2000000-0000-4000-8000-000000000003", slug: "phone-z", variants: [{ ...product.variants[0]!, id: "d1000000-0000-4000-8000-000000000003" }] },
    ];
    const repository = {
      listProducts: vi.fn(async (_session, query: { page: number; pageSize: number }) => {
        const start = (query.page - 1) * query.pageSize;
        return { items: products.slice(start, start + query.pageSize), totalItems: products.length };
      }),
    } as unknown as PublicCatalogRepository;
    const availability: InventoryAvailabilityReader = {
      getByVariantIds: vi.fn(async (variantIds: readonly string[]) => new Map<string, { initialized: boolean; onHand: number; reserved: number; available: number }>(variantIds.map((id) => [
        id,
        id === VARIANT_ID
          ? { initialized: true, onHand: 1, reserved: 0, available: 1 }
          : { initialized: true, onHand: 0, reserved: 0, available: 0 },
      ]))),
    };
    const transactions: TransactionRunner = {
      run: (work) => work({ query: vi.fn() }),
      runReadOnly: (work) => work({ query: vi.fn() }),
    };
    const service = new PublicCatalogService(repository, availability, transactions);

    const result = await service.listProducts({ stockStatus: "out_of_stock", page: 2, pageSize: 1 });

    expect(result.items.map(({ slug }) => slug)).toEqual(["phone-z"]);
    expect(result).toMatchObject({ totalItems: 2, totalPages: 2 });
  });
});
