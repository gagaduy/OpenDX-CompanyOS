// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SupportApiError, type SupportOperationsApi } from "../api/support-api";
import { TicketDetailPage } from "../pages/ticket-detail-page";
import type { SupportTicketDetailView, SupportTicketView } from "../types/support.types";

const ticket: SupportTicketView = {
  id: "c1000000-0000-4000-8000-000000000001",
  customerId: "b1000000-0000-4000-8000-000000000001",
  orderId: "a1000000-0000-4000-8000-000000000001",
  subject: "Laptop quá nóng khi render video dài cần xuống dòng",
  description: "Khách cần kiểm tra phần cứng",
  priority: "high",
  status: "assigned",
  version: 3,
  createdById: "staff-crm",
  assigneeId: "staff-support",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T01:00:00.000Z",
};

const detail: SupportTicketDetailView = {
  ticket,
  context: {
    customer: { id: ticket.customerId, email: "buyer@example.com", fullName: "Nguyễn Phương", phoneNumber: "0901000001" },
    order: { id: ticket.orderId ?? "", publicNumber: "NVC-20260801-00000001", status: "paid", totalVnd: 32000000, createdAt: "2026-08-01T00:00:00.000Z" },
  },
  messages: [{ id: "message-1", authorId: "staff-support", body: "Append-only support message", createdAt: "2026-08-10T01:00:00.000Z" }],
  events: [{ id: "event-1", actorId: "staff-support", fromStatus: "new", toStatus: "assigned", source: "manual", occurredAt: "2026-08-10T00:30:00.000Z" }],
  attachments: [{ id: "attachment-1", ticketId: ticket.id, originalFilename: "bien-ban-kiem-tra-phan-cung-rat-dai.pdf", format: "pdf", mediaType: "application/pdf", byteSize: 1024, status: "clean", version: 2, createdById: "staff-support", createdAt: "2026-08-10T01:10:00.000Z" }],
};

describe("TicketDetailPage", () => {
  it("renders minimal support context, exact workflow controls, timeline, and clean attachment download", async () => {
    const api = fixture();
    renderDetail(api);

    expect(await screen.findByRole("heading", { name: ticket.subject })).toBeVisible();
    expect(screen.getByText("buyer@example.com")).toBeVisible();
    expect(screen.getByText("NVC-20260801-00000001")).toBeVisible();
    expect(screen.queryByText(/High value|Repeat customer|Original immutable note/i)).not.toBeInTheDocument();
    expect(screen.getByText("Append-only support message")).toBeVisible();
    expect(screen.getByText("new → assigned")).toBeVisible();
    expect(screen.getByRole("region", { name: "Ticket timeline" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Attachments" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Internal note.*Coming soon/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Wait for customer" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start progress" }));
    expect(api.update).toHaveBeenCalledWith(ticket.id, { status: "in_progress", version: 3, idempotencyKey: expect.stringContaining("support-transition") });
    await userEvent.click(screen.getByRole("button", { name: "Download bien-ban-kiem-tra-phan-cung-rat-dai.pdf" }));
    expect(api.downloadAttachment).toHaveBeenCalledWith(ticket.id, "attachment-1");
  });

  it("sends a trimmed customer reply and appends the authoritative message", async () => {
    const sent = { id: "message-2", authorId: "staff-support", body: "Customer update", createdAt: "2026-08-10T02:00:00.000Z" };
    const api = fixture({ message: vi.fn(async () => sent) });
    renderDetail(api);

    await userEvent.type(await screen.findByRole("textbox", { name: "Reply" }), "  Customer update  ");
    await userEvent.click(screen.getByRole("button", { name: "Send reply" }));
    expect(api.message).toHaveBeenCalledWith(ticket.id, "Customer update");
    expect(await screen.findByText("Customer update")).toBeVisible();
  });

  it("retains a failed reply and exposes an explicit retry", async () => {
    const sent = { id: "message-2", authorId: "staff-support", body: "Retry update", createdAt: "2026-08-10T02:00:00.000Z" };
    const message = vi.fn().mockRejectedValueOnce(new SupportApiError("UNAVAILABLE", "offline")).mockResolvedValueOnce(sent);
    renderDetail(fixture({ message }));

    await userEvent.type(await screen.findByRole("textbox", { name: "Reply" }), "Retry update");
    await userEvent.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    await userEvent.click(screen.getByRole("button", { name: "Retry reply" }));
    expect(message).toHaveBeenCalledTimes(2);
    expect(await within(screen.getByRole("region", { name: "Ticket timeline" })).findByText("Retry update")).toBeVisible();
  });

  it("uploads one allowed file, shows quarantine/rejected states, and recovers stale mutation", async () => {
    const api = fixture({
      update: vi.fn().mockRejectedValueOnce(new SupportApiError("STALE_VERSION", "Refresh required.")).mockResolvedValueOnce({ ...ticket, status: "in_progress" as const, version: 4 }),
      uploadAttachment: vi.fn(async () => ({ id: "attachment-2", ticketId: ticket.id, originalFilename: "anh-loi.png", format: "png" as const, mediaType: "image/png", byteSize: 4, status: "quarantined" as const, version: 1, createdById: "staff-support", createdAt: "2026-08-10T02:00:00.000Z" })),
    });
    renderDetail(api);

    await userEvent.click(await screen.findByRole("button", { name: "Start progress" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh required");
    await userEvent.click(screen.getByRole("button", { name: "Retry update" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Ticket updated");

    const file = new File(["test"], "anh-loi.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Upload support attachment"), file);
    expect(api.uploadAttachment).toHaveBeenCalledWith(ticket.id, file);
    expect(await screen.findByText("quarantined")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Download anh-loi.png" })).not.toBeInTheDocument();
    expect(screen.getByText("Allowed: JPG, PNG, PDF, DOCX, TXT; one file per upload.")).toBeVisible();
  });
});

function renderDetail(api: SupportOperationsApi) {
  return render(<MemoryRouter initialEntries={[`/support/${ticket.id}`]}><Routes><Route path="/support/:ticketId" element={<TicketDetailPage api={api} roles={["support_operator"]} />} /></Routes></MemoryRouter>);
}

function fixture(overrides: Partial<SupportOperationsApi> = {}): SupportOperationsApi {
  return {
    list: vi.fn(),
    create: vi.fn(),
    detail: vi.fn(async () => detail),
    claim: vi.fn(),
    update: vi.fn(async () => ({ ...ticket, status: "in_progress" as const, version: 4 })),
    message: vi.fn(),
    uploadAttachment: vi.fn(),
    downloadAttachment: vi.fn(async () => new Blob(["pdf"], { type: "application/pdf" })),
    ...overrides,
  };
}
