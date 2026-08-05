// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { StorefrontCatalogApi } from "../api/storefront-catalog-api";
import { HomePage } from "../pages/home-page";

describe("catalog discovery", () => {
  it("restores URL filters and renders authoritative sold-out products", async () => {
    const products = vi.fn(async (parameters: URLSearchParams) => ({
      items: [product], page: Number(parameters.get("page")), pageSize: 12, totalItems: 1, totalPages: 1,
    }));
    const api = { products, categories: vi.fn(async () => [{ id: "category-1", name: "Phones", slug: "phones", sortOrder: 0 }]) } as unknown as StorefrontCatalogApi;
    render(<MemoryRouter initialEntries={["/?category=phones&page=2&pageSize=12"]}><HomePage api={api} apiBaseUrl="http://localhost:3000" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Nova Phone" })).toBeVisible();
    expect(screen.getByText("Tạm hết hàng")).toBeVisible();
    expect(products).toHaveBeenCalledWith(expect.objectContaining({}));
    expect((products.mock.calls[0]?.[0] as URLSearchParams).get("category")).toBe("phones");
    await userEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() => expect(products).toHaveBeenCalledTimes(2));
  });
});

const product = {
  id: "product-1", categoryId: "category-1", categoryName: "Phones", name: "Nova Phone", slug: "nova-phone",
  description: "Phone", attributes: {}, primaryMedia: { id: "media-1", altText: "Nova Phone front", contentUrl: "/media" },
  variants: [{ id: "variant-1", sku: "PHONE-1", title: "Black", optionValues: { color: "Black" }, price: { amountMinor: 9_990_000, currency: "VND" as const }, availableQuantity: 0, purchasable: false }],
};
