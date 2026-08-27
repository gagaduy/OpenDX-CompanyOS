// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../app/theme-provider";
import { IntroHomePage } from "../pages/intro-home-page";
import type { StorefrontCategory, StorefrontProduct } from "../types/catalog.types";

vi.mock("../../cart", () => ({
  useCart: () => ({ add: vi.fn(async () => undefined), loading: false }),
}));

vi.mock("../../wishlist", () => ({
  WishlistButton: ({ productName }: { readonly productName: string }) => (
    <button type="button" aria-label={`Thêm ${productName} vào yêu thích`} />
  ),
}));

describe("IntroHomePage", () => {
  it("renders the approved desktop commerce hierarchy from Catalog data", async () => {
    const category: StorefrontCategory = {
      id: "phones-category", name: "Điện thoại", slug: "phones", sortOrder: 0,
    };
    const featured = product();
    const api = {
      categories: vi.fn(async () => [category]),
      heroSlides: vi.fn(async () => [{ category, product: featured }]),
      products: vi.fn(async () => ({
        items: [featured], page: 1, pageSize: 1, totalItems: 1, totalPages: 1,
      })),
    };

    const { container } = render(
      <MemoryRouter>
        <ThemeProvider>
          <IntroHomePage api={api} apiBaseUrl="http://localhost:4000" />
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findAllByRole("heading", { name: "Nova Phone" })).not.toHaveLength(0);
    expect(screen.getByRole("complementary", { name: "Danh mục sản phẩm" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Điện thoại" })).toHaveAttribute(
      "href", "/products?category=phones#catalog",
    );
    for (const heading of [
      "Miễn phí vận chuyển", "Bảo hành chính hãng", "Trả góp 0%", "Hỗ trợ 24/7",
    ]) {
      expect(screen.getByText(heading)).toBeVisible();
    }
    expect(screen.getByRole("tab", { name: "Nổi bật" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Bán chạy" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Mới nhất" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sản phẩm nổi bật" })).toBeVisible();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-experience-mode]")).toBeNull();
    expect(container.querySelector(".experience-scene-navigation")).toBeNull();
  });
});

function product(): StorefrontProduct {
  return {
    id: "phone-id", categoryId: "phones-category", categoryName: "Điện thoại",
    name: "Nova Phone", slug: "nova-phone", description: "Điện thoại công nghệ mới.",
    attributes: {},
    primaryMedia: { id: "phone-media", altText: "Nova Phone", contentUrl: "/media/phone" },
    variants: [{
      id: "phone-variant", sku: "PHONE-SKU", title: "Default", optionValues: {},
      price: { amountMinor: 29_990_000, currency: "VND" }, availableQuantity: 2,
      purchasable: true,
    }],
  };
}
