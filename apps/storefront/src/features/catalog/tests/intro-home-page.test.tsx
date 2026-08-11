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
        <IntroHomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: "NovaCommerce - website bán đồ công nghệ tổng hợp",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Xem sản phẩm" }),
    ).toHaveAttribute("href", "/products");
    expect(
      screen.getByRole("link", { name: "Khám phá danh mục" }),
    ).toHaveAttribute("href", "/products#categories");
  });
});
