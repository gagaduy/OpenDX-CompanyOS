// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HomepageProductOverlay } from "../components/homepage-experience/homepage-product-overlay";
import { StaticHomepageExperience } from "../components/homepage-experience/static-homepage-experience";
import { useHomepageCatalog } from "../hooks/use-homepage-catalog";
import type {
  ProductPage,
  StorefrontProduct,
} from "../types/catalog.types";

describe("homepage Catalog journey", () => {
  it("loads authoritative products with the exact scene queries", async () => {
    const phone = product("phone", "Nova Phone", "Phones");
    const laptop = product("laptop", "Nova Laptop Pro", "Laptops");
    const headphones = product("headphones", "Nova Headphones", "Accessories");
    const controller = product("controller", "Nova Controller", "Accessories");
    const products = vi.fn(async (parameters: URLSearchParams) => {
      const query = parameters.toString();
      const item = query.startsWith("category=phones")
        ? phone
        : query.startsWith("category=laptops")
          ? laptop
          : query.startsWith("query=headphones")
            ? headphones
            : query.startsWith("query=controller")
              ? controller
              : phone;
      return page(query === "sort=best_selling&page=1&pageSize=4" ? [phone, laptop, headphones, controller] : [item]);
    });

    render(<CatalogProbe api={{ products }} />);

    await waitFor(() => expect(screen.getByTestId("catalog-state")).toHaveTextContent("Nova Phone|Nova Laptop Pro|Nova Headphones|Nova Controller|4"));
    expect(products.mock.calls.map(([parameters]) => parameters.toString())).toEqual([
      "category=phones&sort=best_selling&page=1&pageSize=1",
      "category=laptops&sort=best_selling&page=1&pageSize=1",
      "query=headphones&sort=best_selling&page=1&pageSize=1",
      "query=controller&sort=best_selling&page=1&pageSize=1",
      "sort=best_selling&page=1&pageSize=4",
    ]);
  });

  it("keeps the six-section journey and retries without invented products", async () => {
    const products = vi.fn(async () => {
      throw new Error("offline");
    });

    render(
      <MemoryRouter>
        <StaticExperienceProbe api={{ products }} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tải sản phẩm nổi bật.",
    );
    expect(screen.getAllByTestId("homepage-scene")).toHaveLength(6);
    expect(screen.queryByText("0 ₫")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Thử tải lại" }));
    await waitFor(() => expect(products).toHaveBeenCalledTimes(10));
  });

  it("renders product price, availability, and safe missing-price copy", () => {
    render(
      <MemoryRouter>
        <HomepageProductOverlay
          product={product("laptop", "Nova Laptop Pro", "Laptops")}
          apiBaseUrl="http://localhost:4000"
          fallbackHref="/products?category=laptops#catalog"
        />
        <HomepageProductOverlay
          product={product("empty", "Nova Prototype", "Computing", [])}
          apiBaseUrl="http://localhost:4000"
          fallbackHref="/products?category=computing#catalog"
        />
        <HomepageProductOverlay
          product={product("sold", "Nova Sold Out", "Gaming", [variant(false)])}
          apiBaseUrl="http://localhost:4000"
          fallbackHref="/products?category=gaming#catalog"
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("32.990.000 ₫")).toHaveLength(2);
    expect(screen.getByText("Giá đang cập nhật")).toBeVisible();
    expect(screen.getAllByText("Tạm hết hàng")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Xem Nova Laptop Pro" })).toHaveAttribute(
      "href",
      "/products/laptop",
    );
  });
});

function CatalogProbe({
  api,
}: {
  readonly api: Parameters<typeof useHomepageCatalog>[0];
}) {
  const state = useHomepageCatalog(api);
  return (
    <output data-testid="catalog-state">
      {state.sceneProducts.smartphones?.name}|{state.sceneProducts.computing?.name}|
      {state.sceneProducts.audio?.name}|{state.sceneProducts.gaming?.name}|
      {state.featuredProducts.length}
    </output>
  );
}

function StaticExperienceProbe({
  api,
}: {
  readonly api: Parameters<typeof useHomepageCatalog>[0];
}) {
  const catalog = useHomepageCatalog(api);
  return <StaticHomepageExperience catalog={catalog} apiBaseUrl="http://localhost:4000" />;
}

function product(
  slug: string,
  name: string,
  categoryName: string,
  variants: StorefrontProduct["variants"] = [variant(true)],
): StorefrontProduct {
  return {
    id: `${slug}-id`,
    categoryId: `${categoryName}-id`,
    categoryName,
    name,
    slug,
    description: `${name} description`,
    attributes: {},
    primaryMedia: {
      id: `${slug}-media`,
      altText: name,
      contentUrl: `/media/${slug}`,
    },
    variants,
  };
}

function variant(purchasable: boolean): StorefrontProduct["variants"][number] {
  return {
    id: `variant-${String(purchasable)}`,
    sku: `SKU-${String(purchasable)}`,
    title: "Default",
    optionValues: {},
    price: { amountMinor: 32_990_000, currency: "VND" },
    availableQuantity: purchasable ? 2 : 0,
    purchasable,
  };
}

function page(items: readonly StorefrontProduct[]): ProductPage {
  return {
    items,
    page: 1,
    pageSize: items.length,
    totalItems: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  };
}
