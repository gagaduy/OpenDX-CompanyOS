// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorefrontShell } from "./storefront-shell";
import { ThemeProvider } from "./theme-provider";

describe("StorefrontShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("links the Storefront navigation to home and product discovery routes", async () => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const scrollIntoView = vi
      .spyOn(window.HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ThemeProvider>
          <StorefrontShell cartCount={0}>
            <main id="main-content">
              <section id="categories" aria-label="Danh mục khách hàng" />
              <section id="catalog" aria-label="Khám phá sản phẩm" />
            </main>
          </StorefrontShell>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const mainNavigation = screen.getByRole("navigation", {
      name: "Điều hướng chính",
    });

    expect(
      within(mainNavigation).getByRole("link", { name: "Trang chủ" }),
    ).toHaveAttribute("href", "/");
    expect(
      within(mainNavigation).getByRole("link", { name: "Sản phẩm" }),
    ).toHaveAttribute("href", "/products");

    await userEvent.click(
      within(mainNavigation).getByRole("link", { name: "Danh mục" }),
    );

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "start",
        behavior: "smooth",
      }),
    );
    expect(scrollIntoView.mock.instances[0]).toBe(
      document.getElementById("categories"),
    );
    expect(
      within(mainNavigation).getByRole("link", { name: "Danh mục" }),
    ).toHaveAttribute("href", "/products#categories");

    await userEvent.click(
      within(mainNavigation).getByRole("link", { name: "Khám phá" }),
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
    expect(scrollIntoView.mock.instances[1]).toBe(
      document.getElementById("catalog"),
    );
    expect(
      within(mainNavigation).getByRole("link", { name: "Khám phá" }),
    ).toHaveAttribute("href", "/products#catalog");
  });

  it("renders the two-row commerce header with customer actions", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ThemeProvider>
          <StorefrontShell cartCount={2} wishlistCount={3} authenticated={false}>
            <main id="main-content">
              <section id="catalog" aria-label="Catalog" />
            </main>
          </StorefrontShell>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const taskbar = screen.getByRole("navigation", { name: "Điều hướng chính" });

    expect(document.querySelector(".topbar-inner")).not.toBeNull();
    expect(taskbar.closest(".header-nav-row")).not.toBeNull();
    expect(
      within(taskbar).getByRole("link", { name: "Trang chủ" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.getByRole("link", { name: "Yêu thích, 3 sản phẩm" })).toHaveAttribute(
      "href",
      "/account/wishlist",
    );
    expect(screen.getByRole("link", { name: "Giỏ hàng, 2 sản phẩm" })).toBeVisible();
    expect(document.getElementById("support")).toBeInstanceOf(HTMLElement);
  });

  it("links an authenticated customer to their account", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ThemeProvider>
          <StorefrontShell authenticated />
        </ThemeProvider>
      </MemoryRouter>,
    );

    const accountLinks = screen.getAllByRole("link", { name: "Tài khoản" });
    expect(accountLinks.some((link) => link.getAttribute("href") === "/account")).toBe(
      true,
    );
  });

  it("submits customer search from the Storefront header", async () => {
    function LocationProbe() {
      const currentLocation = useLocation();
      return (
        <output aria-label="current location">
          {currentLocation.pathname}
          {currentLocation.search}
          {currentLocation.hash}
        </output>
      );
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ThemeProvider>
          <StorefrontShell cartCount={0}>
            <main id="main-content">
              <LocationProbe />
            </main>
          </StorefrontShell>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const search = screen.getByRole("searchbox", {
      name: "Tìm kiếm sản phẩm",
    });

    await userEvent.type(search, "laptop gaming");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByLabelText("current location")).toHaveTextContent(
        "/products?query=laptop+gaming&page=1#catalog",
      ),
    );
  });

  it("drops unsupported query state when submitting a product search", async () => {
    function LocationProbe() {
      const currentLocation = useLocation();
      return (
        <output aria-label="current location">
          {currentLocation.pathname}
          {currentLocation.search}
          {currentLocation.hash}
        </output>
      );
    }

    render(
      <MemoryRouter
        initialEntries={[
          "/products?category=laptops&pageSize=12&redirect=https%3A%2F%2Fevil.example",
        ]}
      >
        <ThemeProvider>
          <StorefrontShell>
            <main id="main-content">
              <LocationProbe />
            </main>
          </StorefrontShell>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const search = screen.getByRole("searchbox", {
      name: "Tìm kiếm sản phẩm",
    });
    await userEvent.type(search, "gaming");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByLabelText("current location")).toHaveTextContent(
        "/products?category=laptops&pageSize=12&query=gaming&page=1#catalog",
      ),
    );
    expect(screen.getByLabelText("current location")).not.toHaveTextContent(
      "redirect",
    );
  });
});
