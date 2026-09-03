// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("reveals the sign-in panel from a compact Google trigger", async () => {
    const user = userEvent.setup();
    const api = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;

    render(
      <MemoryRouter>
        <CustomerSessionProvider api={api}>
          <SignInPage />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    const trigger = await screen.findByRole("button", {
      name: "Mở đăng nhập Google",
    });
    expect(trigger).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Đăng nhập NovaCommerce" }),
    ).not.toBeInTheDocument();

    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Đăng nhập NovaCommerce" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Đăng nhập NovaCommerce" }),
    ).toBeVisible();
  });

  it("returns focus to the Google trigger after the close button dismisses the panel", async () => {
    const user = userEvent.setup();
    const api = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;

    render(
      <MemoryRouter>
        <CustomerSessionProvider api={api}>
          <SignInPage />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    const trigger = await screen.findByRole("button", {
      name: "Mở đăng nhập Google",
    });
    await user.click(trigger);
    const close = screen.getByRole("button", { name: "Thu gọn đăng nhập" });

    expect(close).toHaveFocus();
    await user.click(close);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mở đăng nhập Google" }),
    ).toHaveFocus();
  });

  it("closes the sign-in panel with Escape", async () => {
    const user = userEvent.setup();
    const api = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;

    render(
      <MemoryRouter>
        <CustomerSessionProvider api={api}>
          <SignInPage />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Mở đăng nhập Google" }),
    );
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mở đăng nhập Google" }),
    ).toHaveFocus();
  });

  it("dismisses from the modal backdrop without closing on panel interaction", async () => {
    const user = userEvent.setup();
    const api = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;

    render(
      <MemoryRouter>
        <CustomerSessionProvider api={api}>
          <SignInPage />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Mở đăng nhập Google" }),
    );
    await user.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeVisible();

    await user.click(screen.getByTestId("auth-modal-layer"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mở đăng nhập Google" }),
    ).toHaveFocus();
  });

  it("fails closed when Google is unconfigured while explaining catalog remains usable", async () => {
    const user = userEvent.setup();
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
    await user.click(
      await screen.findByRole("button", { name: "Mở đăng nhập Google" }),
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
    const catalog = {
      products,
      heroPresentation: vi.fn(async () => ({ slides: [] })),
    } as unknown as StorefrontCatalogApi;

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

  it("plays the active Catalog presentation behind the sign-in panel", async () => {
    const sessions = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;
    const catalog = {
      products: vi.fn(async () => ({ items: [] })),
      heroPresentation: vi.fn(async () => ({
        media: {
          id: "presentation-1",
          contentUrl: "/v1/storefront/hero-media/presentation-1/content",
          contentType: "video/mp4" as const,
          byteSize: 25_481_434,
          durationMs: 24_750,
        },
        slides: [],
      })),
    };

    render(
      <MemoryRouter>
        <CustomerSessionProvider api={sessions}>
          <SignInPage catalogApi={catalog} apiBaseUrl="http://localhost:4000" />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    const video = await screen.findByTestId("sign-in-video");
    expect(video).toHaveAttribute(
      "src",
      "http://localhost:4000/v1/storefront/hero-media/presentation-1/content",
    );
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the product image when the sign-in video cannot play", async () => {
    const sessions = {
      get: vi.fn(async () => ({ kind: "anonymous" as const })),
    } as unknown as CustomerSessionApi;
    const catalog = {
      products: vi.fn(async () => ({
        items: [{
          primaryMedia: {
            altText: "Nova Phone",
            contentUrl: "/media/phone",
          },
        }],
      })),
      heroPresentation: vi.fn(async () => ({
        media: {
          contentUrl: "/media/sign-in.mp4",
          contentType: "video/mp4" as const,
        },
      })),
    };

    render(
      <MemoryRouter>
        <CustomerSessionProvider api={sessions}>
          <SignInPage catalogApi={catalog} apiBaseUrl="http://localhost:4000" />
        </CustomerSessionProvider>
      </MemoryRouter>,
    );

    fireEvent.error(await screen.findByTestId("sign-in-video"));

    expect(screen.queryByTestId("sign-in-video")).not.toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Nova Phone" })).toHaveAttribute(
      "src",
      "http://localhost:4000/media/phone",
    );
  });
});
