// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("Storefront App", () => {
  it("renders NovaCommerce as a semantic customer storefront", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toHaveTextContent("NovaCommerce");
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải cửa hàng");
  });
});
