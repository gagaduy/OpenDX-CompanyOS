// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SupportEmailIngestionService } from "./support-email-ingestion.service";

describe("SupportEmailIngestionService", () => {
  it("appends customer reply and reopens resolved ticket when ticketId matches", async () => {
    const mockDb = {
      query: vi.fn(),
    } as any;

    const mockAiService = {
      generateSupportProposal: vi.fn().mockResolvedValue({ id: "prop-new" }),
    } as any;

    // 0. SELECT support_ticket_events (UID not seen yet)
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 1. SELECT support_tickets
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "62ffbc9e-0d2e-4eac-a71d-19e388463515",
          customer_id: "cust-1",
          status: "resolved",
          version: 2,
          subject: "Khiếu nại máy chơi game PlayStation 5 bị delay giao hàng",
        },
      ],
    });
    // 2. SELECT support_ticket_messages (message not duplicated)
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 3. INSERT support_ticket_messages
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 4. UPDATE support_tickets
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 5. INSERT support_ticket_events
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const service = new SupportEmailIngestionService(mockDb, mockAiService, () => "test-id");
    const result = await service.ingestEmail({
      fromEmail: "customer@example.com",
      subject: "Re: [NovaCommerce] Phản hồi yêu cầu hỗ trợ: #62ffbc9e",
      bodyText: "Tôi không cần tôi cần đền bù cái mới",
      ticketId: "62ffbc9e",
      messageUid: "uid-123",
    });

    expect(result.action).toBe("ticket_reply_appended");
    expect(result.ticketId).toBe("62ffbc9e-0d2e-4eac-a71d-19e388463515");
    expect(result.newStatus).toBe("in_progress");
    expect(result.proposalId).toBe("prop-new");

    // Verify customer message was inserted
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO support_ticket_messages"),
      ["test-id", "62ffbc9e-0d2e-4eac-a71d-19e388463515", "Tôi không cần tôi cần đền bù cái mới"],
    );

    // Verify ticket was reopened
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE support_tickets"),
      ["62ffbc9e-0d2e-4eac-a71d-19e388463515"],
    );
  });

  it("creates a new ticket when no matching ticket is found", async () => {
    const mockDb = {
      query: vi.fn(),
    } as any;

    const mockAiService = {
      generateSupportProposal: vi.fn().mockResolvedValue({ id: "prop-created" }),
    } as any;

    // 1. SELECT customers (not found)
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 2. INSERT customers
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 3. INSERT support_tickets
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // 4. INSERT support_ticket_events
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const service = new SupportEmailIngestionService(mockDb, mockAiService, () => "test-new-id");
    const result = await service.ingestEmail({
      fromEmail: "newcustomer@example.com",
      fromName: "New Customer",
      subject: "Cần hỗ trợ đổi trả sản phẩm gấp",
      bodyText: "Sản phẩm bị vỡ màn hình",
    });

    expect(result.action).toBe("ticket_created");
    expect(result.ticketId).toBe("test-new-id");
    expect(result.proposalId).toBe("prop-created");
  });
});
