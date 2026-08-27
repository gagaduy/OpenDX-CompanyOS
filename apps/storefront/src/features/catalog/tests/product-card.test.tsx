// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductCard } from "../components/product-card";
import type { StorefrontProduct } from "../types/catalog.types";

const cartAdd = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../../cart", () => ({
  useCart: () => ({ add: cartAdd, loading: false }),
}));

vi.mock("../../wishlist", () => ({
  WishlistButton: ({ productName }: { readonly productName: string }) => (
    <button type="button" aria-label={`Thêm ${productName} vào yêu thích`} />
  ),
}));

describe("ProductCard", () => {
  beforeEach(() => cartAdd.mockClear());

  it("renders backend sale evidence and adds the cheapest purchasable variant", async () => {
    renderCard(product);

    expect(screen.getByText("8.000.000 ₫")).toBeVisible();
    expect(screen.getByText("10.000.000 ₫")).toBeVisible();
    expect(screen.getByText("-20%")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thêm Nova Laptop vào yêu thích" })).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Thêm Nova Laptop vào giỏ hàng" }),
    );
    expect(cartAdd).toHaveBeenCalledWith("available-variant", 1);
  });

  it("does not invent previous price evidence and disables sold-out cart actions", () => {
    renderCard({
      ...product,
      id: "sold-out-product",
      name: "Nova Prototype",
      variants: product.variants.map((variant) => ({
        ...variant,
        purchasable: false,
        availableQuantity: 0,
        price: { amountMinor: variant.price.amountMinor, currency: "VND" },
      })),
    });

    expect(screen.queryByText("10.000.000 ₫")).not.toBeInTheDocument();
    expect(screen.queryByText("-20%")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạm hết hàng" })).toBeDisabled();
  });
});

function renderCard(value: StorefrontProduct) {
  return render(
    <MemoryRouter>
      <ProductCard product={value} apiBaseUrl="http://localhost:4000" />
    </MemoryRouter>,
  );
}

const product: StorefrontProduct = {
  id: "laptop-product",
  categoryId: "laptop-category",
  categoryName: "Laptop",
  brand: "Nova",
  name: "Nova Laptop",
  slug: "nova-laptop",
  description: "Laptop công nghệ cao.",
  attributes: {},
  primaryMedia: {
    id: "laptop-media",
    altText: "Nova Laptop",
    contentUrl: "/media/laptop",
  },
  variants: [
    {
      id: "sold-out-cheapest",
      sku: "LAPTOP-BASE",
      title: "Base",
      optionValues: {},
      price: {
        amountMinor: 8_000_000,
        previousAmountMinor: 10_000_000,
        discountPercentage: 20,
        currency: "VND",
      },
      availableQuantity: 0,
      purchasable: false,
    },
    {
      id: "available-variant",
      sku: "LAPTOP-PRO",
      title: "Pro",
      optionValues: {},
      price: { amountMinor: 9_000_000, currency: "VND" },
      availableQuantity: 4,
      purchasable: true,
    },
  ],
};
