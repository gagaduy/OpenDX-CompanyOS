// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { SupportInboundEmailController } from "./support-inbound-email.controller";

describe("SupportInboundEmailController", () => {
  it("rejects invalid or missing email with 400", async () => {
    const mockDb = { query: vi.fn() } as any;
    const mockAi = { generateSupportProposal: vi.fn() } as any;
    const controller = new SupportInboundEmailController(mockDb, mockAi);

    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await controller.handleInboundEmail(
      { body: { from: "not-an-email", subject: "Help", body: "Broken item" } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "INVALID_EMAIL" }),
    );
  });

  it("creates customer if not exists, creates ticket, triggers AI analysis, and returns 201", async () => {
    const mockDb = {
      query: vi
        .fn()
        // 1. check customer
        .mockResolvedValueOnce({ rows: [] })
        // 2. insert customer
        .mockResolvedValueOnce({ rows: [{ id: "cust-1", full_name: "John Doe", email: "john@example.com" }] })
        // 3. insert ticket
        .mockResolvedValueOnce({ rows: [{ id: "tick-new-1", status: "new" }] })
        // 4. insert ticket event
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const mockAi = {
      generateSupportProposal: vi.fn().mockResolvedValue({ id: "prop-1" }),
    } as any;

    const controller = new SupportInboundEmailController(mockDb, mockAi);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await controller.handleInboundEmail(
      {
        body: {
          from: "john@example.com",
          name: "John Doe",
          subject: "Máy PS5 giao trễ",
          body: "Tôi đặt máy chơi game PS5 3 ngày trước nhưng chưa nhận được.",
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: expect.any(String),
        customerId: expect.any(String),
        proposalId: "prop-1",
      }),
    );
  });
});
