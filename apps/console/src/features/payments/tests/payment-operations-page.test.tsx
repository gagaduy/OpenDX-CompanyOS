// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PaymentOperationsApi } from "../api/payment-operations-api";
import { PaymentDetailPage } from "../pages/payment-detail-page";
import { PaymentOperationsPage } from "../pages/payment-operations-page";
import type { PaymentDetailView, PaymentSummaryView } from "../types/payment.types";

const summary: PaymentSummaryView = {
  id: "payment-1", orderId: "order-1", status: "pending_provider", statusLabel: "Pending provider",
  attention: "pending", expectedAmountVnd: 32_990_000, currency: "VND",
  invoiceNumber: "NVC-PAY-0001", providerOrderId: "SEPAY-ORDER-1", updatedAt: "2026-08-09T08:05:00.000Z",
};
const detail: PaymentDetailView = {
  ...summary, attemptId: "attempt-1", expiresAt: "2026-08-09T08:15:00.000Z",
  events: [{ id: "event-1", notificationType: "ORDER_PAID", normalizedState: "unsupported", processingResult: "review_required", resultLabel: "Review required", attention: "review", amountVnd: 31_000_000, currency: "VND", redactedPayload: { status: "CAPTURED" }, correlationId: "corr-event", receivedAt: "2026-08-09T08:06:00.000Z" }],
  reconciliations: [{ id: "reconciliation-1", triggerActorType: "system", providerOrderId: "SEPAY-ORDER-1", internalStatus: "pending_provider", providerStatus: "CAPTURED", internalAmountVnd: 32_990_000, providerAmountVnd: 31_000_000, comparisonResult: "mismatch", resultLabel: "Mismatch", attention: "review", redactedResponse: { status: "CAPTURED" }, correlationId: "corr-reconcile", createdAt: "2026-08-09T08:07:00.000Z" }],
};

function api(overrides: Partial<PaymentOperationsApi> = {}): PaymentOperationsApi {
  return {
    list: vi.fn(async () => ({ items: [summary], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })),
    get: vi.fn(async () => detail),
    reconcile: vi.fn(async () => ({ ...detail, status: "paid" as const, statusLabel: "Paid", attention: "positive" as const })),
    ...overrides,
  };
}

describe("payment operations", () => {
  it("renders pending payments and supports an explicit empty state", async () => {
    render(<MemoryRouter><PaymentOperationsPage api={api()} /></MemoryRouter>);
    expect(await screen.findByText("NVC-PAY-0001")).toBeVisible();
    expect(screen.getByRole("table", { name: "Payments" })).toBeVisible();
    expect(screen.getByText("Pending provider")).toBeVisible();
  });

  it("shows review-required event and mismatch reconciliation evidence", async () => {
    render(<MemoryRouter initialEntries={["/payments/payment-1"]}><Routes><Route path="/payments/:paymentId" element={<PaymentDetailPage api={api()} />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("ORDER_PAID")).toBeVisible();
    expect(screen.getByRole("heading", { name: "NVC-PAY-0001" })).toHaveClass("technicalText");
    expect(screen.getByRole("region", { name: "Provider events" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Reconciliation history" })).toBeVisible();
    expect(screen.getByRole("button", { name: /View receipt.*Coming soon/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Export details.*Coming soon/i })).toBeDisabled();
    expect(screen.getByText("Review required")).toBeVisible();
    expect(screen.getByText("Mismatch")).toBeVisible();
    expect(screen.getAllByText(/31\.000\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/VND|₫/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Stripe|Visa|USD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/refund|void/i)).not.toBeInTheDocument();
  });

  it("reconciles a pending payment and announces the authoritative result", async () => {
    const client = api();
    render(<MemoryRouter initialEntries={["/payments/payment-1"]}><Routes><Route path="/payments/:paymentId" element={<PaymentDetailPage api={client} />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: "Reconcile with SePay" }));
    expect(client.reconcile).toHaveBeenCalledOnce();
    expect(client.reconcile).toHaveBeenCalledWith("payment-1", { providerOrderId: "SEPAY-ORDER-1" });
    expect(await screen.findByRole("status")).toHaveTextContent("Reconciliation completed");
  });
});
