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

const heroPresentation = {
  media: {
    id: "8a041caf-b31a-4726-bf21-4549cae3e162",
    contentUrl: "/v1/storefront/hero-media/8a041caf-b31a-4726-bf21-4549cae3e162/content",
    contentType: "video/mp4" as const,
    byteSize: 25_481_434,
    durationMs: 8_000,
  },
  slides: [
    {
      category: { id: "category-1", name: "Phones", slug: "phones" },
      product,
      chapter: { startMs: 0, endMs: 4_000, label: "Phones" },
    },
    {
      category: { id: "category-2", name: "Laptops", slug: "laptops" },
      product: { ...product, id: "product-2", categoryId: "category-2" },
      chapter: { startMs: 4_000, endMs: 8_000, label: "Laptops" },
    },
  ],
};

describe("StorefrontCatalogApi hero slides", () => {
  it("validates Storefront content and rejects unknown assurance icons", async () => {
    let payload: unknown = {
      success: true,
      message: "Storefront content retrieved",
      data: {
        assurances: [{
          code: "free-delivery",
          iconKey: "truck",
          title: "Miễn phí vận chuyển",
          description: "Cho đơn hàng đủ điều kiện",
        }],
        metrics: [{
          code: "authentic-products",
          displayValue: "100%",
          label: "Sản phẩm chính hãng",
        }],
      },
    };
    const client = {
      request: vi.fn(async (_path: string, schema: z.ZodType) =>
        schema.parse(payload),
      ),
    } as unknown as ApiClient;
    const api = new StorefrontCatalogApi(client);

    await expect(api.content()).resolves.toEqual(
      (payload as { data: unknown }).data,
    );
    expect(client.request).toHaveBeenCalledWith(
      "/v1/storefront/content",
      expect.anything(),
    );

    payload = {
      success: true,
      message: "Invalid content",
      data: {
        assurances: [{
          code: "free-delivery",
          iconKey: "unknown",
          title: "Delivery",
          description: "Copy",
        }],
        metrics: [],
      },
    };
    await expect(api.content()).rejects.toBeInstanceOf(z.ZodError);
  });

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

  it("loads and validates the synchronized hero presentation", async () => {
    const client = parsingClient({
      success: true,
      message: "Hero presentation retrieved",
      data: heroPresentation,
    });
    const api = new StorefrontCatalogApi(client);

    await expect(api.heroPresentation()).resolves.toEqual(heroPresentation);
    expect(client.request).toHaveBeenCalledWith(
      "/v1/storefront/hero-presentation",
      expect.anything(),
    );
  });

  it("accepts image fallback presentations without media or chapters", async () => {
    const fallback = {
      slides: [{
        category: { id: "category-1", name: "Phones", slug: "phones" },
        product,
      }],
    };
    const api = new StorefrontCatalogApi(parsingClient({
      success: true,
      message: "Fallback hero presentation retrieved",
      data: fallback,
    }));

    await expect(api.heroPresentation()).resolves.toEqual(fallback);
  });

  it.each([
    ["non-MP4 media", (value: MutablePresentation) => { value.media!.contentType = "video/webm"; }],
    ["non-root media URL", (value: MutablePresentation) => { value.media!.contentUrl = "https://example.com/hero.mp4"; }],
    ["protocol-relative media URL", (value: MutablePresentation) => { value.media!.contentUrl = "//evil.example/hero.mp4"; }],
    ["multiple-leading-slash media URL", (value: MutablePresentation) => { value.media!.contentUrl = "///evil.example/hero.mp4"; }],
    ["slash-backslash media URL", (value: MutablePresentation) => { value.media!.contentUrl = "/\\evil.example/hero.mp4"; }],
    ["control characters in media URL", (value: MutablePresentation) => { value.media!.contentUrl = "/v1/storefront/hero\n.mp4"; }],
    ["unsafe byte size", (value: MutablePresentation) => { value.media!.byteSize = Number.MAX_SAFE_INTEGER + 1; }],
    ["unsafe media duration", (value: MutablePresentation) => { value.media!.durationMs = Number.MAX_SAFE_INTEGER + 1; }],
    ["unsafe chapter time", (value: MutablePresentation) => { value.slides[0]!.chapter!.startMs = Number.MAX_SAFE_INTEGER + 1; }],
    ["unsafe chapter end", (value: MutablePresentation) => { value.slides[0]!.chapter!.endMs = Number.MAX_SAFE_INTEGER + 1; }],
    ["negative chapter time", (value: MutablePresentation) => { value.slides[0]!.chapter!.startMs = -1; }],
    ["missing chapter", (value: MutablePresentation) => { delete value.slides[1]!.chapter; }],
    ["nonzero timeline start", (value: MutablePresentation) => { value.slides[0]!.chapter!.startMs = 1; }],
    ["overlapping chapters", (value: MutablePresentation) => { value.slides[1]!.chapter!.startMs = 3_999; }],
    ["gapped chapters", (value: MutablePresentation) => { value.slides[1]!.chapter!.startMs = 4_001; }],
    ["non-positive chapter span", (value: MutablePresentation) => { value.slides[0]!.chapter!.endMs = 0; }],
    ["duration mismatch", (value: MutablePresentation) => { value.media!.durationMs = 8_001; }],
    ["overlong chapter label", (value: MutablePresentation) => { value.slides[0]!.chapter!.label = "x".repeat(121); }],
  ])("rejects hero presentation with %s", async (_case, mutate) => {
    const invalid = structuredClone(heroPresentation) as MutablePresentation;
    mutate(invalid);
    const api = new StorefrontCatalogApi(parsingClient({
      success: true,
      message: "Invalid hero presentation",
      data: invalid,
    }));

    await expect(api.heroPresentation()).rejects.toBeInstanceOf(z.ZodError);
  });

  it("rejects chapter metadata when presentation media is absent", async () => {
    const invalid = structuredClone(heroPresentation) as MutablePresentation;
    delete invalid.media;
    const api = new StorefrontCatalogApi(parsingClient({
      success: true,
      message: "Invalid image fallback",
      data: invalid,
    }));

    await expect(api.heroPresentation()).rejects.toBeInstanceOf(z.ZodError);
  });
});

type MutablePresentation = {
  media?: {
    id: string;
    contentUrl: string;
    contentType: string;
    byteSize: number;
    durationMs: number;
  };
  slides: Array<{
    category: { id: string; name: string; slug: string };
    product: typeof product;
    chapter?: { startMs: number; endMs: number; label: string };
  }>;
};

function parsingClient(payload: unknown) {
  return {
    request: vi.fn(async (_path: string, schema: z.ZodType) => schema.parse(payload)),
  } as unknown as ApiClient & { request: ReturnType<typeof vi.fn> };
}
