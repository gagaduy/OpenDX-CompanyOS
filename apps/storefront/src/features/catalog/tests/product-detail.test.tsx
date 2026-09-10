// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CartProvider, type CartApi } from "../../cart";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import { StorefrontContentProvider } from "../context/storefront-content-provider";
import { ProductDetailPage } from "../pages/product-detail-page";

vi.mock("../../wishlist", () => ({
  WishlistButton: ({ productName }: { readonly productName: string }) => (
    <button type="button" aria-label={`Thêm ${productName} vào yêu thích`} />
  ),
}));

describe("product detail", () => {
  it("shows variant identity and creates a guest only on the first add", async () => {
    const catalog = {
      content: vi.fn(async () => storefrontContent),
      product: vi.fn(async () => product),
    } as unknown as StorefrontCatalogApi;
    const createGuest = vi.fn(async () => ({
      kind: "guest",
      expiresAt: "2099-01-01",
    }));
    const add = vi.fn(async () => ({
      ...emptyCart,
      ownerKind: "guest" as const,
      status: "active" as const,
      itemCount: 1,
    }));
    const cart = {
      get: vi.fn(async () => emptyCart),
      createGuest,
      add,
    } as unknown as CartApi;
    render(
      <MemoryRouter initialEntries={["/products/nova-mouse"]}>
        <StorefrontContentProvider api={catalog}>
          <CartProvider api={cart}>
            <Routes>
              <Route
                path="/products/:productSlug"
                element={
                  <ProductDetailPage
                    api={catalog}
                    apiBaseUrl="http://localhost:3000"
                  />
                }
              />
            </Routes>
          </CartProvider>
        </StorefrontContentProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Nova Mouse" }),
    ).toBeVisible();
    expect(screen.getByText("SKU MOUSE-BLACK")).toBeVisible();
    expect(screen.getByText("NovaTech")).toBeVisible();
    expect(screen.getByText("1.590.000 ₫")).toBeVisible();
    expect(screen.getByText("-19%")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Thêm Nova Mouse vào yêu thích" }),
    ).toBeVisible();
    for (const assurance of [
      "Miễn phí vận chuyển",
      "Bảo hành chính hãng",
      "Trả góp 0%",
      "Hỗ trợ 24/7",
    ]) {
      expect(screen.getByText(assurance)).toBeVisible();
    }
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    expect(createGuest).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith("variant-1", 1);
  });
});

const storefrontContent = {
  assurances: [
    { code: "delivery", iconKey: "truck" as const, title: "Miễn phí vận chuyển", description: "Cho đơn hàng đủ điều kiện" },
    { code: "warranty", iconKey: "shield-check" as const, title: "Bảo hành chính hãng", description: "Cam kết sản phẩm xác thực" },
    { code: "installment", iconKey: "badge-percent" as const, title: "Trả góp 0%", description: "Theo điều kiện thanh toán" },
    { code: "support", iconKey: "headphones" as const, title: "Hỗ trợ 24/7", description: "Đồng hành khi bạn cần" },
  ],
  metrics: [],
};

const emptyCart = {
  ownerKind: "anonymous" as const,
  version: 0,
  status: "empty" as const,
  items: [],
  itemCount: 0,
  totalVnd: 0,
  requiresAction: false,
};
const product = {
  id: "product-1",
  categoryId: "category-1",
  categoryName: "Accessories",
  brand: "NovaTech",
  name: "Nova Mouse",
  slug: "nova-mouse",
  description: "Wireless mouse",
  attributes: {},
  primaryMedia: { id: "media-1", altText: "Nova Mouse", contentUrl: "/media" },
  variants: [
    {
      id: "variant-1",
      sku: "MOUSE-BLACK",
      title: "Black",
      optionValues: { color: "Black" },
      price: {
        amountMinor: 1_290_000,
        previousAmountMinor: 1_590_000,
        discountPercentage: 19,
        currency: "VND" as const,
      },
      availableQuantity: 8,
      purchasable: true,
    },
  ],
};
