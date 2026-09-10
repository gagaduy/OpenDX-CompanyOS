// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useHomepageCatalog } from "../hooks/use-homepage-catalog";
import type {
  ProductPage,
  StorefrontCategory,
  StorefrontHeroPresentation,
  StorefrontProduct,
} from "../types/catalog.types";

describe("homepage Catalog orchestration", () => {
  it("loads categories, hero, promotions, and product rails from bounded queries", async () => {
    const categories = [category("phones", "Điện thoại"), category("laptops", "Laptop")];
    const phone = product("phone", "Nova Phone", "Điện thoại");
    const laptop = product("laptop", "Nova Laptop Pro", "Laptop");
    const heroPresentation: StorefrontHeroPresentation = {
      slides: [{ category: categories[0]!, product: phone }],
    };
    const products = vi.fn(async (parameters: URLSearchParams) => {
      const query = parameters.toString();
      if (query.startsWith("category=phones")) return page([phone]);
      if (query.startsWith("category=laptops")) return page([laptop]);
      return page([phone, laptop]);
    });
    const api = {
      categories: vi.fn(async () => categories),
      heroPresentation: vi.fn(async () => heroPresentation),
      products,
    };

    render(<CatalogProbe api={api} />);

    await waitFor(() =>
      expect(screen.getByTestId("catalog-state")).toHaveTextContent(
        "ready:2|ready:1|ready:2|ready:2|ready:2|ready:2",
      ),
    );
    expect(products.mock.calls.map(([parameters]) => parameters.toString())).toEqual(
      expect.arrayContaining([
        "discountStatus=on_sale&sort=newest&page=1&pageSize=8",
        "sort=best_selling&page=1&pageSize=8",
        "sort=newest&page=1&pageSize=8",
        "category=phones&sort=best_selling&page=1&pageSize=1",
        "category=laptops&sort=best_selling&page=1&pageSize=1",
      ]),
    );
  });

  it("keeps successful regions when another request fails", async () => {
    const phone = product("phone", "Nova Phone", "Điện thoại");
    const api = {
      categories: vi.fn(async () => [category("phones", "Điện thoại")]),
      heroPresentation: vi.fn(async () => {
        throw new Error("hero offline");
      }),
      products: vi.fn(async (parameters: URLSearchParams) => {
        if (parameters.get("sort") === "best_selling" && parameters.get("category") === null) {
          throw new Error("best selling offline");
        }
        return page([phone]);
      }),
    };

    render(<CatalogProbe api={api} />);

    await waitFor(() =>
      expect(screen.getByTestId("catalog-state")).toHaveTextContent(
        "ready:1|error:0|ready:1|ready:1|error:0|ready:1",
      ),
    );
  });

  it("models empty API responses without inventing commerce content", async () => {
    const api = {
      categories: vi.fn(async () => [] as readonly StorefrontCategory[]),
      heroPresentation: vi.fn(async () => ({ slides: [] })),
      products: vi.fn(async () => page([])),
    };

    render(<CatalogProbe api={api} />);

    await waitFor(() =>
      expect(screen.getByTestId("catalog-state")).toHaveTextContent(
        "empty:0|empty:0|empty:0|empty:0|empty:0|empty:0",
      ),
    );
  });
});

function CatalogProbe({ api }: { readonly api: Parameters<typeof useHomepageCatalog>[0] }) {
  const state = useHomepageCatalog(api);
  return (
    <output data-testid="catalog-state">
      {state.categories.status}:{state.categories.data.length}|
      {state.hero.status}:{state.hero.data.slides.length}|
      {state.promotions.status}:{state.promotions.data.length}|
      {state.rails.featured.status}:{state.rails.featured.data.length}|
      {state.rails.bestSelling.status}:{state.rails.bestSelling.data.length}|
      {state.rails.newest.status}:{state.rails.newest.data.length}
    </output>
  );
}

function category(slug: string, name: string): StorefrontCategory {
  return { id: `${slug}-category`, slug, name, sortOrder: 0 };
}

function product(slug: string, name: string, categoryName: string): StorefrontProduct {
  return {
    id: `${slug}-id`, categoryId: `${categoryName}-id`, categoryName, name, slug,
    description: `${name} description`, attributes: {},
    primaryMedia: { id: `${slug}-media`, altText: name, contentUrl: `/media/${slug}` },
    variants: [{
      id: `${slug}-variant`, sku: `${slug.toUpperCase()}-SKU`, title: "Default",
      optionValues: {}, price: { amountMinor: 32_990_000, currency: "VND" },
      availableQuantity: 2, purchasable: true,
    }],
  };
}

function page(items: readonly StorefrontProduct[]): ProductPage {
  return { items, page: 1, pageSize: items.length, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 };
}
