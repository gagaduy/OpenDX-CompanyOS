// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CartApi } from "../../cart/api/cart-api";
import { CartProvider } from "../../cart/hooks/cart-context";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import { ProductDetailPage } from "../pages/product-detail-page";

describe("product detail", () => {
  it("shows variant identity and creates a guest only on the first add", async () => {
    const catalog = { product: vi.fn(async () => product) } as unknown as StorefrontCatalogApi;
    const createGuest = vi.fn(async () => ({ kind: "guest", expiresAt: "2099-01-01" }));
    const add = vi.fn(async () => ({ ...emptyCart, ownerKind: "guest" as const, status: "active" as const, itemCount: 1 }));
    const cart = { get: vi.fn(async () => emptyCart), createGuest, add } as unknown as CartApi;
    render(<MemoryRouter initialEntries={["/products/nova-mouse"]}><CartProvider api={cart}><Routes><Route path="/products/:productSlug" element={<ProductDetailPage api={catalog} apiBaseUrl="http://localhost:3000" />} /></Routes></CartProvider></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Nova Mouse" })).toBeVisible();
    expect(screen.getByText("SKU MOUSE-BLACK")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    expect(createGuest).toHaveBeenCalledOnce(); expect(add).toHaveBeenCalledWith("variant-1", 1);
  });
});

const emptyCart = { ownerKind: "anonymous" as const, version: 0, status: "empty" as const, items: [], itemCount: 0, totalVnd: 0, requiresAction: false };
const product = { id: "product-1", categoryId: "category-1", categoryName: "Accessories", name: "Nova Mouse", slug: "nova-mouse", description: "Wireless mouse", attributes: {}, primaryMedia: { id: "media-1", altText: "Nova Mouse", contentUrl: "/media" }, variants: [{ id: "variant-1", sku: "MOUSE-BLACK", title: "Black", optionValues: { color: "Black" }, price: { amountMinor: 1_290_000, currency: "VND" as const }, availableQuantity: 8, purchasable: true }] };
