// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../app/theme-provider";
import { StorefrontContentProvider } from "../context/storefront-content-provider";
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
      content: vi.fn(async () => storefrontContent),
      categories: vi.fn(async () => [category]),
      heroPresentation: vi.fn(async () => ({
        slides: [{ category, product: featured }],
      })),
      products: vi.fn(async () => ({
        items: [featured], page: 1, pageSize: 1, totalItems: 1, totalPages: 1,
      })),
    };

    const { container } = render(
      <MemoryRouter>
        <ThemeProvider>
          <StorefrontContentProvider api={api}>
            <IntroHomePage api={api} apiBaseUrl="http://localhost:4000" />
          </StorefrontContentProvider>
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
    expect(api.heroPresentation).toHaveBeenCalledOnce();
  });

  it("passes the featured rail product as the empty-presentation fallback", async () => {
    const featured = product();
    const api = {
      content: vi.fn(async () => storefrontContent),
      categories: vi.fn(async () => []),
      heroPresentation: vi.fn(async () => ({ slides: [] })),
      products: vi.fn(async () => ({
        items: [featured], page: 1, pageSize: 1, totalItems: 1, totalPages: 1,
      })),
    };

    render(
      <MemoryRouter>
        <ThemeProvider>
          <StorefrontContentProvider api={api}>
            <IntroHomePage api={api} apiBaseUrl="http://localhost:4000" />
          </StorefrontContentProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Nova Phone", level: 1 })).toBeVisible();
    expect(screen.getByRole("link", { name: "Khám phá ngay" })).toHaveAttribute(
      "href",
      "/products/nova-phone",
    );
  });

  it("keeps the hero error region isolated when presentation loading fails", async () => {
    const api = {
      content: vi.fn(async () => storefrontContent),
      categories: vi.fn(async () => []),
      heroPresentation: vi.fn(async () => {
        throw new Error("hero offline");
      }),
      products: vi.fn(async () => ({
        items: [], page: 1, pageSize: 0, totalItems: 0, totalPages: 0,
      })),
    };

    render(
      <MemoryRouter>
        <ThemeProvider>
          <StorefrontContentProvider api={api}>
            <IntroHomePage api={api} apiBaseUrl="http://localhost:4000" />
          </StorefrontContentProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tải khu vực nổi bật.",
    );
  });
});

const storefrontContent = {
  assurances: [
    { code: "delivery", iconKey: "truck" as const, title: "Miễn phí vận chuyển", description: "Cho đơn hàng đủ điều kiện" },
    { code: "warranty", iconKey: "shield-check" as const, title: "Bảo hành chính hãng", description: "Cam kết sản phẩm xác thực" },
    { code: "installment", iconKey: "badge-percent" as const, title: "Trả góp 0%", description: "Theo điều kiện thanh toán" },
    { code: "support", iconKey: "headphones" as const, title: "Hỗ trợ 24/7", description: "Đồng hành khi bạn cần" },
  ],
  metrics: [
    { code: "products", displayValue: "100%", label: "Sản phẩm chính hãng" },
  ],
};

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
