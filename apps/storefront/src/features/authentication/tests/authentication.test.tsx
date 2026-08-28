// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CustomerSessionApi } from "../api/customer-session-api";
import { CustomerSessionProvider } from "../hooks/customer-session-context";
import { SignInPage } from "../pages/sign-in-page";
import { safeReturnUrl } from "../lib/safe-return-url";
import type { StorefrontCatalogApi } from "../../catalog";
import { CheckoutGate } from "../components/checkout-gate";

describe("customer authentication", () => {
  it("restores a customer session once when StrictMode returns from a canceled payment", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "customer" as const,
        customerId: "customer-1",
        email: "buyer@example.com",
        expiresAt: "2026-09-28T00:00:00.000Z",
      })
      .mockResolvedValueOnce({ kind: "anonymous" as const });
    const api = { get } as unknown as CustomerSessionApi;

    render(
      <StrictMode>
        <MemoryRouter
          initialEntries={["/payment/return?outcome=cancel"]}
        >
          <CustomerSessionProvider api={api}>
            <Routes>
              <Route
                path="/payment/return"
                element={
                  <CheckoutGate>
                    <h1>Trạng thái thanh toán</h1>
                  </CheckoutGate>
                }
              />
              <Route path="/sign-in" element={<h1>Đăng nhập</h1>} />
            </Routes>
          </CustomerSessionProvider>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(
      await screen.findByRole("heading", { name: "Trạng thái thanh toán" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Đăng nhập" }),
    ).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("accepts only local Storefront return URLs", () => {
    expect(safeReturnUrl("/account/wishlist?from=heart#items")).toBe(
      "/account/wishlist?from=heart#items",
    );
    expect(safeReturnUrl("//evil.example")).toBe("/account");
    expect(safeReturnUrl("https://evil.example")).toBe("/account");
    expect(safeReturnUrl("/account\\evil")).toBe("/account");
    expect(safeReturnUrl("/account\nattack")).toBe("/account");
  });
  it("fails closed when Google is unconfigured while explaining catalog remains usable", async () => {
    const api = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;
    render(
      <MemoryRouter initialEntries={["/sign-in?returnTo=https://evil.example"]}>
        <CustomerSessionProvider api={api}>
          <SignInPage />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google Sign-In chưa được cấu hình",
    );
    expect(screen.getByText(/xem sản phẩm và dùng giỏ hàng/)).toBeVisible();
  });

  it("uses real best-selling Catalog media for the sign-in backdrop", async () => {
    const sessions = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;
    const products = vi.fn(async () => ({
      items: [
        {
          id: "product-1",
          categoryId: "category-1",
          categoryName: "Laptop",
          name: "Nova Laptop",
          slug: "nova-laptop",
          description: "Laptop",
          attributes: {},
          primaryMedia: {
            id: "media-1", altText: "Nova Laptop", contentUrl: "/media/laptop",
          },
          variants: [],
        },
      ],
      page: 1, pageSize: 1, totalItems: 1, totalPages: 1,
    }));
    const catalog = { products } as unknown as StorefrontCatalogApi;

    render(
      <MemoryRouter>
        <CustomerSessionProvider api={sessions}>
          <SignInPage catalogApi={catalog} apiBaseUrl="http://localhost:4000" />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("img", { name: "Nova Laptop" })).toHaveAttribute(
      "src", "http://localhost:4000/media/laptop",
    );
    expect(products).toHaveBeenCalledWith(
      new URLSearchParams("sort=best_selling&page=1&pageSize=1"),
    );
  });
});
