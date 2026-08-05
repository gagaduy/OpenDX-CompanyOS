// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { InventoryAvailabilityReader } from "../../../../inventory/application/services/interfaces/inventory-availability";
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
});
