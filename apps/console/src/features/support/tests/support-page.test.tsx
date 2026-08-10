// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { type SupportOperationsApi, SupportApiError } from "../api/support-api";
import { SupportPage } from "../pages/support-page";
import type { SupportTicketPageView, SupportTicketView } from "../types/support.types";

const ticket: SupportTicketView = {
  id: "c1000000-0000-4000-8000-000000000001",
  customerId: "b1000000-0000-4000-8000-000000000001",
  orderId: "a1000000-0000-4000-8000-000000000001",
  subject: "Máy tính lỗi màn hình",
  description: "Khách cần hỗ trợ kỹ thuật",
  priority: "urgent",
  status: "new",
  version: 1,
  createdById: "staff-crm",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

describe("SupportPage", () => {
  it("renders support queue from URL-backed filters and recovers a stale self-claim", async () => {
    const claim = vi.fn()
      .mockRejectedValueOnce(new SupportApiError("STALE_VERSION", "Refresh required."))
      .mockResolvedValueOnce({ ...ticket, status: "assigned" as const, assigneeId: "staff-support", version: 2 });
    const api = fixture({ claim });
    renderPage(api, "/support?status=new&priority=urgent&assignment=unassigned&page=2");

    expect(await screen.findByRole("heading", { name: "Support tickets" })).toBeVisible();
    expect(api.list).toHaveBeenCalledWith({ status: "new", priority: "urgent", assignment: "unassigned", page: 2, pageSize: 20 }, expect.any(AbortSignal));
    expect(screen.getByText("Máy tính lỗi màn hình")).toBeVisible();
    expect(screen.getByLabelText("Ticket status")).toHaveValue("new");
    expect(screen.getByLabelText("Ticket priority")).toHaveValue("urgent");

    await userEvent.click(screen.getByRole("button", { name: "Claim ticket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh required");
    await userEvent.click(screen.getByRole("button", { name: "Retry claim" }));
    expect(claim).toHaveBeenLastCalledWith(ticket.id, 1);
    expect(await screen.findByRole("status")).toHaveTextContent("Ticket claimed");
  });

  it("shows create boundary, loading, empty, and retry states", async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new SupportApiError("UNAVAILABLE", "offline"))
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    const create = vi.fn(async () => ticket);
    renderPage(fixture({ list, create }), "/support");

    expect(screen.getByRole("status")).toHaveTextContent("Loading support tickets");
    expect(await screen.findByRole("alert")).toHaveTextContent("Support tickets could not be loaded");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No support tickets match this view.")).toBeVisible();

    await userEvent.type(screen.getByLabelText("Customer ID"), ticket.customerId);
    await userEvent.type(screen.getByLabelText("Subject"), "Máy in không nhận lệnh");
    await userEvent.type(screen.getByLabelText("Description"), "Khách báo lỗi sau khi thanh toán");
    await userEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ customerId: ticket.customerId, priority: "normal" }));
  });
});

function renderPage(api: SupportOperationsApi, path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/support" element={<SupportPage api={api} roles={["support_operator"]} />} /></Routes></MemoryRouter>);
}

function fixture(overrides: Partial<SupportOperationsApi> = {}): SupportOperationsApi {
  const page: SupportTicketPageView = { items: [ticket], page: 2, pageSize: 20, totalItems: 21, totalPages: 2 };
  return {
    list: vi.fn(async () => page),
    create: vi.fn(async () => ticket),
    detail: vi.fn(),
    claim: vi.fn(async () => ({ ...ticket, status: "assigned" as const, assigneeId: "staff-support", version: 2 })),
    update: vi.fn(),
    message: vi.fn(),
    uploadAttachment: vi.fn(),
    downloadAttachment: vi.fn(),
    ...overrides,
  };
}
