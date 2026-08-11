// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ApiClient } from "../../../shared/http/api-client";
import { StorefrontCatalogApi } from "../api/storefront-catalog-api";

const product = {
  id: "product-1",
  categoryId: "category-1",
  categoryName: "Phones",
  name: "Nova Phone",
  slug: "nova-phone",
  description: "Phone",
  attributes: {},
  primaryMedia: {
    id: "media-1",
    altText: "Nova Phone front",
    contentUrl: "/media/phone",
  },
  variants: [
    {
      id: "variant-1",
      sku: "PHONE-1",
      title: "Black",
      optionValues: { color: "Black" },
      price: { amountMinor: 9_990_000, currency: "VND" },
      availableQuantity: 2,
      purchasable: true,
    },
  ],
};

describe("StorefrontCatalogApi hero slides", () => {
  it("validates the public hero-slide envelope", async () => {
    let payload: unknown = {
      success: true,
      message: "Hero slides retrieved",
      data: [
        {
          category: { id: "category-1", name: "Phones", slug: "phones" },
          product,
        },
      ],
    };
    const client = {
      request: vi.fn(async (_path: string, schema: z.ZodType) =>
        schema.parse(payload),
      ),
    } as unknown as ApiClient;
    const api = new StorefrontCatalogApi(client);

    await expect(api.heroSlides()).resolves.toEqual([
      {
        category: { id: "category-1", name: "Phones", slug: "phones" },
        product,
      },
    ]);

    payload = {
      success: true,
      message: "Invalid hero slide",
      data: [{ category: { id: "category-1", name: "Phones", slug: 7 } }],
    };
    await expect(api.heroSlides()).rejects.toBeInstanceOf(z.ZodError);
  });
});
