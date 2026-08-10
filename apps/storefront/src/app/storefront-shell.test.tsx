// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorefrontShell } from "./storefront-shell";
import { ThemeProvider } from "./theme-provider";

describe("StorefrontShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls to customer discovery sections when header hash links are selected", async () => {
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

    await userEvent.click(
      within(mainNavigation).getByRole("link", { name: "Khám phá" }),
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
    expect(scrollIntoView.mock.instances[1]).toBe(
      document.getElementById("catalog"),
    );
  });
});
