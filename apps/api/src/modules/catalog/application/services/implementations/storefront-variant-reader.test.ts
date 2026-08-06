// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { PublicCatalogRepository } from "../../repositories/interfaces/public-catalog.repository";
import { StorefrontVariantReaderService } from "./storefront-variant-reader";

describe("StorefrontVariantReaderService", () => {
  it("returns only the repository's published storefront projections in one batch", async () => {
    const findStorefrontVariants = vi.fn().mockResolvedValue([{
      variantId: "variant-1",
      productId: "product-1",
      productName: "Laptop Pro",
      productSlug: "laptop-pro",
      variantTitle: "16 GB",
      sku: "LAPTOP-PRO-16",
      optionValues: { memory: "16 GB" },
      unitPriceVnd: 25_000_000,
      primaryMediaId: "media-1",
      primaryMediaAltText: "Laptop Pro front view",
    }]);
    const repository = { findStorefrontVariants } as unknown as PublicCatalogRepository;
    const transactions = {
      runReadOnly: (work: (session: object) => Promise<unknown>) => work({}),
    } as TransactionRunner;
    const service = new StorefrontVariantReaderService(repository, transactions);

    const result = await service.getByIds(["variant-1", "variant-1", "missing"]);

    expect(findStorefrontVariants).toHaveBeenCalledWith({}, ["variant-1", "missing"]);
    expect(result.get("variant-1")?.unitPriceVnd).toBe(25_000_000);
    expect(result.has("missing")).toBe(false);
  });
});
