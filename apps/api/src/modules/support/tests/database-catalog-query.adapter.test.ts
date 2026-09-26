// apps/api/src/modules/support/tests/database-catalog-query.adapter.test.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { DatabaseCatalogQueryAdapter } from "../infrastructure/adapters/database-catalog-query.adapter";

describe("DatabaseCatalogQueryAdapter", () => {
  it("formats relative product object keys as public storefront media-content URLs", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            product_id: "prod-1",
            name: "Tai Nghe Chống Ồn Nova Studio Sound",
            slug: "tai-nghe-chong-on-nova-studio-sound",
            category_name: "Accessories",
            sku: "EAR-STUDIO-01",
            regular_price_vnd: 3590000,
            object_key: "products/prod-1/headphone.png",
          },
        ],
      }),
    } as any;

    const adapter = new DatabaseCatalogQueryAdapter(mockPool, "http://localhost:4000");
    const products = await adapter.getLatestProducts(1);

    expect(products).toHaveLength(1);
    expect(products[0].imageUrl).toBe(
      "http://localhost:4000/v1/storefront/media-content?key=products%2Fprod-1%2Fheadphone.png",
    );
    expect(products[0].imageUrl).not.toContain("localhost:9000/catalog-media");
  });

  it("preserves absolute HTTP/HTTPS product image URLs", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            product_id: "prod-2",
            name: "Bàn Phím Cơ Custom",
            slug: "ban-phim-co-custom",
            category_name: "Keyboards",
            sku: "KB-CUSTOM-01",
            regular_price_vnd: 2190000,
            object_key: "https://images.unsplash.com/photo-custom?w=600",
          },
        ],
      }),
    } as any;

    const adapter = new DatabaseCatalogQueryAdapter(mockPool, "http://localhost:4000");
    const products = await adapter.getProductsByIds(["prod-2"]);

    expect(products).toHaveLength(1);
    expect(products[0].imageUrl).toBe("https://images.unsplash.com/photo-custom?w=600");
  });

  it("falls back to default placeholder image if object_key is missing", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            product_id: "prod-3",
            name: "Sản phẩm Chưa Có Ảnh",
            slug: "san-pham-chua-co-anh",
            category_name: "General",
            sku: "GEN-01",
            regular_price_vnd: 100000,
            object_key: null,
          },
        ],
      }),
    } as any;

    const adapter = new DatabaseCatalogQueryAdapter(mockPool, "http://localhost:4000");
    const products = await adapter.getLatestProducts(1);

    expect(products).toHaveLength(1);
    expect(products[0].imageUrl).toContain("images.unsplash.com");
    expect(products[0].imageUrl).not.toContain("localhost:9000");
  });
});
