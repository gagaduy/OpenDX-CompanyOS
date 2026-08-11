// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { IntroHomePage } from "../pages/intro-home-page";

describe("IntroHomePage", () => {
  it("introduces NovaCommerce and sends customers to product discovery", () => {
    render(
      <MemoryRouter>
        <IntroHomePage
          api={{ products: async () => ({ items: [], page: 1, pageSize: 0, totalItems: 0, totalPages: 0 }) }}
          apiBaseUrl="http://localhost:4000"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Bước vào tương lai",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Xem sản phẩm" }),
    ).toHaveAttribute("href", "/products");
    expect(
      screen.getByRole("link", { name: "Khám phá danh mục" }),
    ).toHaveAttribute("href", "/products#categories");
    expect(screen.getAllByTestId("homepage-scene")).toHaveLength(6);
  });
});
