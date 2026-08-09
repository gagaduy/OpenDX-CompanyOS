// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { OrderApi } from "../api/order-api";
import { OrderDetailPage } from "../pages/order-detail-page";
import { OrderListPage } from "../pages/order-list-page";

const summary = {
  id: "order-1",
  publicNumber: "NVC-2026-0001",
  status: "paid" as const,
  totalVnd: 18_000_000,
  currency: "VND" as const,
  createdAt: "2026-08-06T08:00:00.000Z",
  updatedAt: "2026-08-06T08:05:00.000Z",
};

describe("customer orders", () => {
  it("renders an empty order history", async () => {
    const api = {
      list: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      })),
    } as unknown as OrderApi;
    render(<MemoryRouter><OrderListPage api={api} /></MemoryRouter>);
    expect(await screen.findByText("Bạn chưa có đơn hàng nào.")).toBeVisible();
  });

  it("lists customer orders with status and authoritative total", async () => {
    const api = {
      list: vi.fn(async () => ({
        items: [summary],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      })),
    } as unknown as OrderApi;
    render(<MemoryRouter><OrderListPage api={api} /></MemoryRouter>);
    expect(await screen.findByText(summary.publicNumber)).toBeVisible();
    expect(screen.getByText("Đã thanh toán")).toBeVisible();
    expect(screen.getByText(/18\.000\.000/)).toBeVisible();
  });

  it("renders immutable lines, totals, and the processing timeline", async () => {
    const api = {
      get: vi.fn(async () => ({
        ...summary,
        checkoutId: "checkout-1",
        addressSnapshot: {},
        contactSnapshot: {},
        subtotalVnd: 20_000_000,
        discountVnd: 2_000_000,
        taxMode: "included_not_separated" as const,
        reservationExpiresAt: "2026-08-06T09:00:00.000Z",
        paidAt: "2026-08-06T08:05:00.000Z",
        version: 2,
        lines: [{
          id: "line-1",
          variantId: "variant-1",
          sku: "NOVA-001",
          productTitle: "Nova Laptop Pro",
          variantLabel: "16 GB / 512 GB",
          quantity: 1,
          unitPriceVnd: 20_000_000,
          discountAllocationVnd: 2_000_000,
          lineTotalVnd: 18_000_000,
          linePosition: 0,
        }],
        history: [{
          previousStatus: "pending_payment" as const,
          newStatus: "paid" as const,
          actorType: "provider" as const,
          reasonCode: "PAYMENT_CONFIRMED",
          occurredAt: "2026-08-06T08:05:00.000Z",
        }],
      })),
    } as unknown as OrderApi;
    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes><Route path="/orders/:orderId" element={<OrderDetailPage api={api} />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Nova Laptop Pro")).toBeVisible();
    expect(screen.getByText(/16 GB \/ 512 GB · NOVA-001 · 1 ×/)).toBeVisible();
    expect(screen.getAllByText(/18\.000\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Đã giảm 2\.000\.000/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tiến trình đơn hàng" })).toBeVisible();
    expect(screen.getAllByText("Đã thanh toán").length).toBeGreaterThan(0);
    expect(screen.queryByText("PAYMENT_CONFIRMED")).not.toBeInTheDocument();
  });
});
