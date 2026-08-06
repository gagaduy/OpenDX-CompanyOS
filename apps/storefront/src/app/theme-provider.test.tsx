// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

function ThemeControl() {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      Chuyển từ {resolvedTheme === "dark" ? "tối" : "sáng"}
    </button>
  );
}

describe("Storefront theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("starts dark and persists the selected light theme", async () => {
    render(
      <ThemeProvider>
        <ThemeControl />
      </ThemeProvider>,
    );

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await userEvent.click(screen.getByRole("button", { name: "Chuyển từ tối" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("novacommerce-theme")).toBe("light");
  });

  it("restores a persisted light theme", () => {
    localStorage.setItem("novacommerce-theme", "light");

    render(
      <ThemeProvider>
        <ThemeControl />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Chuyển từ sáng" })).toBeVisible();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
