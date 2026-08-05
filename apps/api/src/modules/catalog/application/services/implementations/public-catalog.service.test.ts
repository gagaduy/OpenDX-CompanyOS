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
