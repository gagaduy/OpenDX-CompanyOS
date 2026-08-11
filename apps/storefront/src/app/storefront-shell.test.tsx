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

  it("renders customer discovery taskbar shortcuts below the Storefront header", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ThemeProvider>
          <StorefrontShell cartCount={0}>
            <main id="main-content">
              <section id="catalog" aria-label="Catalog" />
            </main>
          </StorefrontShell>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const taskbar = screen.getByRole("navigation", {
      name: "Lối tắt khám phá",
    });

    expect(document.querySelector(".topbar-inner")).not.toBeNull();
    expect(taskbar.querySelector(".discovery-taskbar-inner")).not.toBeNull();
    expect(
      within(taskbar).getByRole("link", { name: "Sản phẩm mới" }),
    ).toHaveAttribute("href", "/products?sort=newest#catalog");
    expect(
      within(taskbar).getByRole("link", { name: "Bán chạy" }),
    ).toHaveAttribute("href", "/products?sort=best_selling#catalog");
    expect(
      within(taskbar).getByRole("link", { name: "Đang giảm" }),
    ).toHaveAttribute("href", "/products?discountStatus=on_sale#catalog");
    expect(
      within(taskbar).getByRole("link", { name: "Còn hàng" }),
    ).toHaveAttribute("href", "/products?stockStatus=in_stock#catalog");
    expect(
      within(taskbar).getByRole("link", { name: "Hỗ trợ" }),
    ).toHaveAttribute("href", "/products#support");
    expect(
      within(taskbar).queryByRole("button", { name: "Tìm nhanh sản phẩm" }),
    ).toBeNull();
    expect(document.getElementById("support")).toBeInstanceOf(HTMLElement);
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
});
