// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CustomerSessionApi } from "../api/customer-session-api";
import { CustomerSessionProvider } from "../hooks/customer-session-context";
import { SignInPage } from "../pages/sign-in-page";

describe("customer authentication", () => {
  it("fails closed when Google is unconfigured while explaining catalog remains usable", async () => {
    const api = { get: vi.fn(async () => ({ kind: "anonymous" as const })) } as unknown as CustomerSessionApi;
    render(<MemoryRouter initialEntries={["/sign-in?returnTo=https://evil.example"]}><CustomerSessionProvider api={api}><SignInPage /></CustomerSessionProvider></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Google Sign-In chưa được cấu hình");
    expect(screen.getByText(/xem sản phẩm và dùng giỏ hàng/)).toBeVisible();
  });
});
