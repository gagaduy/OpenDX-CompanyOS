// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../authentication/api/oidc-manager";
import { OrderApiError, type OrderOperationsApi } from "../api/order-operations-api";
import { OrderDetailPage } from "../pages/order-detail-page";
import { OrderOperationsPage } from "../pages/order-operations-page";
import type { OrderDetailView, OrderSummaryView } from "../types/order.types";

const summary: OrderSummaryView = {
  id: "order-1", publicNumber: "NVC-20260809-00000001", customerId: "customer-1",
  customerEmail: "buyer@example.com", status: "paid", statusLabel: "Paid",
  totalVnd: 32_990_000, currency: "VND", createdAt: "2026-08-09T08:00:00.000Z",
  updatedAt: "2026-08-09T08:05:00.000Z",
};

const detail: OrderDetailView = {
  ...summary, checkoutId: "checkout-1", subtotalVnd: 34_990_000,
  discountVnd: 2_000_000, taxMode: "included_not_separated",
  reservationExpiresAt: "2026-08-09T08:15:00.000Z", paidAt: "2026-08-09T08:05:00.000Z",
  version: 2,
  contactSnapshot: { email: "buyer@example.com", fullName: "Duy Duong", phoneNumber: "0901000001" },
  addressSnapshot: { addressId: "address-1", recipientName: "Duy Duong", phoneNumber: "0901000001", addressLine: "1 Nguyen Hue", ward: "Ben Nghe", provinceOrCity: "Ho Chi Minh", version: 1 },
  lines: [{ id: "line-1", variantId: "variant-1", sku: "NOVA-001", productTitle: "Nova Laptop Pro", variantLabel: "16 GB / 512 GB", quantity: 1, unitPriceVnd: 34_990_000, discountAllocationVnd: 2_000_000, lineTotalVnd: 32_990_000, linePosition: 0 }],
  history: [{ previousStatus: "pending_payment", newStatus: "paid", actorType: "provider", reasonCode: "PAYMENT_CONFIRMED", occurredAt: "2026-08-09T08:05:00.000Z" }],
};

function api(overrides: Partial<OrderOperationsApi> = {}): OrderOperationsApi {
  return {
    list: vi.fn(async () => ({ items: [summary], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })),
    get: vi.fn(async () => detail),
    transition: vi.fn(async () => ({ ...detail, status: "processing" as const, statusLabel: "Processing", version: 3 })),
    ...overrides,
  };
}

function renderDetail(client: OrderOperationsApi, roles: readonly StaffRole[] = ["operations_manager"]) {
  return render(<MemoryRouter initialEntries={["/orders/order-1"]}><Routes><Route path="/orders/:orderId" element={<OrderDetailPage api={client} roles={roles} />} /></Routes></MemoryRouter>);
}

describe("order operations", () => {
  it("renders a dense order list and explicit empty/retry states", async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    render(<MemoryRouter><OrderOperationsPage api={api({ list })} /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No orders match this view.")).toBeVisible();
  });

  it("labels the order table for operational navigation", async () => {
    render(<MemoryRouter><OrderOperationsPage api={api()} /></MemoryRouter>);
    expect(await screen.findByRole("table", { name: "Orders" })).toBeVisible();
  });

  it("shows immutable evidence and only the next legal transition", async () => {
    renderDetail(api());
    expect(await screen.findByText("Nova Laptop Pro")).toBeVisible();
    expect(screen.getByRole("heading", { name: "NVC-20260809-00000001" })).toHaveClass("technicalText");
    expect(screen.getByRole("region", { name: "Order status history" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Order snapshot" })).toBeVisible();
    expect(screen.getByText("buyer@example.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start processing" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /complete/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/shipping|tracking|refund|return/i)).not.toBeInTheDocument();
  });

  it("confirms cancellation before transitioning an unpaid order", async () => {
    const pending = { ...detail, status: "pending_payment" as const, statusLabel: "Pending payment" };
    const client = api({
      get: vi.fn(async () => pending),
      transition: vi.fn(async () => ({ ...pending, status: "canceled" as const, statusLabel: "Canceled", version: 3 })),
    });
    renderDetail(client);

    await userEvent.click(await screen.findByRole("button", { name: "Cancel unpaid order" }));
    expect(screen.getByRole("dialog", { name: "Cancel unpaid order?" })).toBeVisible();
    expect(client.transition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(client.transition).toHaveBeenCalledOnce();
  });

  it("transitions with optimistic versioning and announces success", async () => {
    const client = api();
    renderDetail(client);
    await screen.findByText("Nova Laptop Pro");
    await userEvent.click(screen.getByRole("button", { name: "Start processing" }));
    expect(client.transition).toHaveBeenCalledWith("order-1", expect.objectContaining({ targetStatus: "processing", reasonCode: "STAFF_PROCESSING_STARTED", version: 2 }));
    expect(await screen.findByRole("status")).toHaveTextContent("Order moved to Processing");
  });

  it("preserves the order and offers refresh after a stale version", async () => {
    const client = api({ transition: vi.fn(async () => { throw new OrderApiError("STALE_VERSION", "Refresh required before changing this order."); }) });
    renderDetail(client);
    await userEvent.click(await screen.findByRole("button", { name: "Start processing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh required");
    expect(screen.getByRole("button", { name: "Refresh order" })).toBeVisible();
    expect(screen.getByText("Nova Laptop Pro")).toBeVisible();
  });
});
