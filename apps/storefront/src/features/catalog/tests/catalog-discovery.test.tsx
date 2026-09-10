// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import { HomePage } from "../pages/home-page";

vi.mock("../../cart", () => ({
  useCart: () => ({ add: vi.fn(async () => undefined), loading: false }),
}));

vi.mock("../../wishlist", () => ({
  WishlistButton: ({ productName }: { readonly productName: string }) => (
    <button type="button" aria-label={`Thêm ${productName} vào yêu thích`} />
  ),
}));

describe("catalog discovery", () => {
  it("restores URL filters and renders authoritative sold-out products", async () => {
    const products = vi.fn(async (parameters: URLSearchParams) => ({
      items: [product],
      page: Number(parameters.get("page")),
      pageSize: 12,
      totalItems: 1,
      totalPages: 1,
    }));
    const heroSlides = vi.fn(async () => []);
    const api = {
      products,
      heroSlides,
      categories: vi.fn(async () => [
        { id: "category-1", name: "Phones", slug: "phones", sortOrder: 0 },
      ]),
    } as unknown as StorefrontCatalogApi;
    render(
      <MemoryRouter
        initialEntries={["/products?category=phones&page=2&pageSize=12"]}
      >
        <HomePage api={api} apiBaseUrl="http://localhost:3000" />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Nova Phone" }),
    ).toBeVisible();
    expect(screen.getByText("Tạm hết hàng")).toBeVisible();
    expect(products).toHaveBeenCalledWith(expect.objectContaining({}));
    expect(
      (products.mock.calls[0]?.[0] as URLSearchParams).get("category"),
    ).toBe("phones");
    expect(heroSlides).not.toHaveBeenCalled();
    const catalog = screen.getByRole("region", {
      name: "Sản phẩm công nghệ",
    });
    await userEvent.selectOptions(
      within(catalog).getByLabelText("Tồn kho"),
      "in_stock",
    );
    await userEvent.click(
      within(catalog).getByRole("button", { name: "Áp dụng" }),
    );
    await waitFor(() => expect(products).toHaveBeenCalledTimes(2));
    expect(
      (products.mock.calls[1]?.[0] as URLSearchParams).get("stockStatus"),
    ).toBe("in_stock");
  });

  it("exposes a collapsed filter sidebar that applies existing catalog query parameters", async () => {
    const products = vi.fn(async (parameters: URLSearchParams) => ({
      items: [product],
      page: Number(parameters.get("page") ?? "1"),
      pageSize: 12,
      totalItems: 1,
      totalPages: 1,
    }));
    const heroSlides = vi.fn(async () => []);
    const api = {
      products,
      heroSlides,
      categories: vi.fn(async () => [
        { id: "category-1", name: "Phones", slug: "phones", sortOrder: 0 },
        { id: "category-2", name: "Laptops", slug: "laptops", sortOrder: 1 },
      ]),
    } as unknown as StorefrontCatalogApi;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <HomePage api={api} apiBaseUrl="http://localhost:4000" />
      </MemoryRouter>,
    );

    const sidebar = await screen.findByRole("complementary", {
      name: "Danh mục và bộ lọc sản phẩm",
    });
    expect(await screen.findByRole("list", { name: "Danh sách sản phẩm" })).toBeVisible();
    expect(document.querySelector(".catalog-toolbar")).not.toBeNull();
    expect(heroSlides).not.toHaveBeenCalled();
    expect(
      within(sidebar).getByRole("button", { name: "Mở bộ lọc sản phẩm" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      within(sidebar).getByRole("link", { name: "Xem danh mục sản phẩm" }),
    ).toHaveAttribute("href", "/products#categories");
    expect(
      within(sidebar).getByRole("link", { name: "Xem danh sách sản phẩm" }),
    ).toHaveAttribute("href", "/products#catalog");

    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Mở bộ lọc sản phẩm" }),
    );

    expect(
      within(sidebar).getByRole("button", { name: "Đóng bộ lọc sản phẩm" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      within(sidebar).getByTestId("discovery-sidebar-panel"),
    ).toBeVisible();
    expect(sidebar).toHaveAttribute("data-state", "open");
    expect(
      within(sidebar).getByRole("button", { name: "Đóng bộ lọc sản phẩm" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      within(sidebar).getByRole("link", { name: "Phones" }),
    ).toHaveAttribute("href", "/products?category=phones&pageSize=12#catalog");

    await userEvent.selectOptions(
      within(sidebar).getByLabelText("Sắp xếp"),
      "best_selling",
    );
    await userEvent.selectOptions(
      within(sidebar).getByLabelText("Ưu đãi"),
      "on_sale",
    );
    await userEvent.click(
      within(sidebar).getByRole("button", { name: "Áp dụng" }),
    );

    await waitFor(() => expect(products).toHaveBeenCalledTimes(2));
    const submitted = products.mock.calls[1]?.[0] as URLSearchParams;
    expect(submitted.get("sort")).toBe("best_selling");
    expect(submitted.get("discountStatus")).toBe("on_sale");
  });
});

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
    contentUrl: "/media",
  },
  variants: [
    {
      id: "variant-1",
      sku: "PHONE-1",
      title: "Black",
      optionValues: { color: "Black" },
      price: { amountMinor: 9_990_000, currency: "VND" as const },
      availableQuantity: 0,
      purchasable: false,
    },
  ],
};
