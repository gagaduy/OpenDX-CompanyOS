// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CrmApiError, type CrmOperationsApi } from "../api/crm-api";
import { CustomerDetailPage } from "../pages/customer-detail-page";
import type { Customer360View } from "../types/crm.types";

const customerId = "b1000000-0000-4000-8000-000000000001";
const customer360: Customer360View = {
  customer: {
    id: customerId,
    email: "buyer@example.com",
    fullName: "Nguyễn Phương",
    phoneNumber: "0901000001",
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    addresses: [{
      id: "a1000000-0000-4000-8000-000000000001",
      recipientName: "Nguyễn Phương",
      phoneNumber: "0901000001",
      addressLine: "1 Nguyễn Huệ",
      ward: "Bến Nghé",
      provinceOrCity: "TP Hồ Chí Minh",
      isDefault: true,
    }],
  },
  orders: [{ id: "order-1", publicNumber: "NVC-20260801-00000001", status: "paid", totalVnd: 32000000, createdAt: "2026-08-01T00:00:00.000Z", paidAt: "2026-08-01T00:05:00.000Z" }],
  paidFacts: { paidOrderCount: 2, lifetimePaidVnd: 64000000, latestPaidAt: "2026-08-01T00:05:00.000Z" },
  segments: ["repeat_customer", "high_value"],
  calculatedAt: "2026-08-10T00:00:00.000Z",
  notes: [
    { id: "note-1", customerId, authorId: "crm-1", body: "Original immutable note", createdAt: "2026-08-09T00:00:00.000Z" },
    { id: "note-2", customerId, authorId: "crm-2", body: "Correction note", correctsNoteId: "note-1", createdAt: "2026-08-10T00:00:00.000Z" },
  ],
  followups: [{ id: "follow-1", customerId, dueAt: "2026-08-11T00:00:00.000Z", description: "Call customer", status: "open", version: 1, createdById: "crm-1", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" }],
};

describe("CustomerDetailPage", () => {
  it("renders read-only Customer 360, segments, notes, follow-ups, and chronological timeline", async () => {
    const api = fixture();
    renderDetail(api);

    expect(await screen.findByRole("heading", { name: "Nguyễn Phương" })).toBeVisible();
    expect(screen.getByText("buyer@example.com")).toBeVisible();
    expect(screen.getByText("1 Nguyễn Huệ")).toBeVisible();
    expect(screen.getByText("Repeat customer")).toBeVisible();
    expect(screen.getByText("High value")).toBeVisible();
    expect(screen.getByText("Original immutable note")).toBeVisible();
    expect(screen.getByText("Correction note")).toBeVisible();
    expect(screen.getByText("Corrects note-1")).toBeVisible();
    expect(screen.getByText("NVC-20260801-00000001")).toBeVisible();
    expect(screen.queryByRole("button", { name: /edit profile|edit address/i })).not.toBeInTheDocument();
  });

  it("claims follow-ups with optimistic version recovery", async () => {
    const updateFollowup = vi.fn()
      .mockRejectedValueOnce(new CrmApiError("STALE_VERSION", "Refresh required"))
      .mockResolvedValueOnce({ ...customer360.followups[0], assigneeId: "staff-1", version: 2 });
    const api = fixture({ updateFollowup });
    renderDetail(api);

    await userEvent.click(await screen.findByRole("button", { name: "Claim follow-up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh required");
    await userEvent.click(screen.getByRole("button", { name: "Retry claim" }));
    expect(updateFollowup).toHaveBeenLastCalledWith(customerId, "follow-1", { action: "claim", version: 1 });
    expect(await screen.findByRole("status")).toHaveTextContent("Follow-up claimed");
  });

  it("shows forbidden and not-found states", async () => {
    renderDetail(fixture({ getCustomer: vi.fn(async () => { throw new CrmApiError("FORBIDDEN", "denied"); }) }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
  });
});

function renderDetail(api: CrmOperationsApi) {
  return render(
    <MemoryRouter initialEntries={[`/customers/${customerId}`]}>
      <Routes><Route path="/customers/:customerId" element={<CustomerDetailPage api={api} />} /></Routes>
    </MemoryRouter>,
  );
}

function fixture(overrides: Partial<CrmOperationsApi> = {}): CrmOperationsApi {
  return {
    getCustomer: vi.fn(async () => customer360),
    createNote: vi.fn(),
    createFollowup: vi.fn(),
    updateFollowup: vi.fn(async () => ({ ...customer360.followups[0], assigneeId: "staff-1", version: 2 })),
    ...overrides,
  };
}
