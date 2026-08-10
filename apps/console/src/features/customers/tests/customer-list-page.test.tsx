// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CustomerApiError, type CustomerOperationsApi } from "../api/customer-api";
import { CustomerListPage } from "../pages/customer-list-page";
import type { CustomerPageView } from "../types/customer.types";

const page: CustomerPageView = {
  items: [{
    id: "b1000000-0000-4000-8000-000000000001",
    email: "buyer@example.com",
    fullName: "Nguyễn Phương với tên rất dài cần xuống dòng",
    phoneNumber: "0901000001",
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
  }],
  page: 2,
  pageSize: 20,
  totalItems: 21,
  totalPages: 2,
};

describe("CustomerListPage", () => {
  it("loads CRM customers from URL-backed search, segment, and page without edit actions", async () => {
    const api = fixture();
    render(
      <MemoryRouter initialEntries={["/customers?search= buyer@example.com &segment=repeat_customer&page=2"]}>
        <Routes><Route path="/customers" element={<CustomerListPage api={api} />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Customers" })).toBeVisible();
    expect(api.search).toHaveBeenCalledWith({
      search: "buyer@example.com",
      segment: "repeat_customer",
      page: 2,
      pageSize: 20,
    }, expect.any(AbortSignal));
    expect(screen.getByText("buyer@example.com")).toBeVisible();
    expect(screen.getByText("Nguyễn Phương với tên rất dài cần xuống dòng")).toBeVisible();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open customer 360/i })).toHaveAttribute(
      "href",
      "/customers/b1000000-0000-4000-8000-000000000001",
    );
  });

  it("shows loading, empty, error, and retry states", async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(new CustomerApiError("UNAVAILABLE", "offline"))
      .mockResolvedValueOnce({ ...page, items: [], totalItems: 0, totalPages: 0 });
    render(<MemoryRouter><CustomerListPage api={fixture({ search })} /></MemoryRouter>);

    expect(screen.getByRole("status")).toHaveTextContent("Loading customers");
    expect(await screen.findByRole("alert")).toHaveTextContent("Customers could not be loaded");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No customers match this view.")).toBeVisible();
  });
});

function fixture(overrides: Partial<CustomerOperationsApi> = {}) {
  const api: CustomerOperationsApi = {
    search: vi.fn(async () => page),
    segments: vi.fn(async () => ({ items: [], calculatedAt: "2026-08-10T00:00:00.000Z" })),
    ...overrides,
  };
  return api;
}
