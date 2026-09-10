// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { PublicProductDto } from "../../dtos/responses/public-catalog-response.dto";
import { PublicWishlistProductReaderService } from "./public-wishlist-product-reader";

const first = product("d2000000-0000-4000-8000-000000000001", "Phone");
const second = product("d2000000-0000-4000-8000-000000000002", "Laptop");

describe("PublicWishlistProductReaderService", () => {
  it("returns no products without invoking Catalog for an empty input", async () => {
    const catalog = { getPublishedByIds: vi.fn() };
    const reader = new PublicWishlistProductReaderService(catalog);

    await expect(reader.getPublishedByIds([])).resolves.toEqual([]);
    expect(catalog.getPublishedByIds).not.toHaveBeenCalled();
  });

  it("deduplicates IDs while preserving caller order and public filtering", async () => {
    const catalog = {
      getPublishedByIds: vi.fn(async () => [second, first]),
    };
    const reader = new PublicWishlistProductReaderService(catalog);

    await expect(
      reader.getPublishedByIds([first.id, second.id, first.id]),
    ).resolves.toEqual([first, second]);
    expect(catalog.getPublishedByIds).toHaveBeenCalledWith([
      first.id,
      second.id,
    ]);
  });
});

function product(id: string, name: string): PublicProductDto {
  return {
    id,
    categoryId: "d3000000-0000-4000-8000-000000000001",
    categoryName: "Technology",
    name,
    slug: name.toLowerCase(),
    description: `${name} description`,
    attributes: {},
    primaryMedia: {
      id: "d4000000-0000-4000-8000-000000000001",
      altText: name,
      contentUrl: `/media/${id}`,
    },
    variants: [],
  };
}
