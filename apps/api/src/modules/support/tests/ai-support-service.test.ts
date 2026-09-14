// apps/api/src/modules/support/tests/ai-support-service.test.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { AiSupportService } from "../application/services/implementations/ai-support.service";

describe("AiSupportService", () => {
  it("returns the most recently created cached support proposal", async () => {
    const service = new AiSupportService({} as any, {});
    const proposal = (id: string, createdAt: string) => ({
      id,
      prompt: "Soạn email chăm sóc khách hàng",
      overallSentimentSummary: "Đã xử lý email CSKH.",
      churnRiskAssessment: "Rủi ro thấp.",
      recommendedAction: "Theo dõi phản hồi.",
      tickets: [],
      vipCustomers: [],
      totalTickets: 0,
      status: "applied" as const,
      createdAt,
      docxFilename: `${id}.docx`,
    });
    (service as any).proposalsCache.set("older", proposal("older", "2026-09-13T10:00:00.000Z"));
    (service as any).proposalsCache.set("latest", proposal("latest", "2026-09-13T11:00:00.000Z"));

    await expect(service.getLatestSupportProposal()).resolves.toMatchObject({ id: "latest", status: "applied" });
  });

  it("recovers the latest applied support proposal from persisted ticket events", async () => {
    const service = new AiSupportService({
      query: vi.fn(async () => ({
        rows: [{
          proposal_id: "persisted-proposal",
          applied_at: new Date("2026-09-13T16:00:00.000Z"),
          ticket_id: "ticket-1",
          customer_name: "Khách hàng A",
          customer_email: "customer-a@example.com",
          subject: "Hỗ trợ đơn hàng",
          priority: "high",
          response_message: "Nội dung email đã gửi.",
        }],
      })),
    } as any, {});

    await expect(service.getLatestSupportProposal()).resolves.toMatchObject({
      id: "persisted-proposal",
      status: "applied",
      tickets: [{
        ticketId: "ticket-1",
        customerEmail: "customer-a@example.com",
        proposedResponse: "Nội dung email đã gửi.",
      }],
    });
  });

  it("creates and retrieves cached support proposals and generates docx", async () => {
    const mockPool: any = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("COUNT(*) FROM support_tickets")) {
          return { rows: [{ count: "1" }] };
        }
        if (sql.includes("FROM support_tickets")) {
          return {
            rows: [
              {
                id: "33333333-0000-4000-8000-000000000001",
                customer_id: "489afb1a-f799-4213-8ac1-751d72b58fe0",
                full_name: "Duy Duong",
                email: "duy@example.com",
                subject: "Giao trễ đơn hàng Laptop",
                description: "Tôi đặt hàng 3 ngày rồi chưa nhận được",
                priority: "high",
                status: "open",
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        if (sql.includes("FROM customers")) {
          return {
            rows: [
              {
                id: "489afb1a-f799-4213-8ac1-751d72b58fe0",
                full_name: "Duy Duong",
                email: "duy@example.com",
                total_spent: 35000000,
                order_count: 3,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      connect: vi.fn(async () => ({
        query: vi.fn(),
        release: vi.fn(),
      })),
    };

    const service = new AiSupportService(mockPool, {
      openRouterApiKey: "test-key",
      openRouterModel: "google/gemini-2.5-flash",
    });

    const proposal = await service.generateSupportProposal({
      prompt: "Rà soát toàn bộ ticket sự cố giao hàng và chăm sóc khách hàng",
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.tickets.length).toBeGreaterThanOrEqual(1);

    const docx = service.getProposalDocx(proposal.id);
    expect(docx.buffer.length).toBeGreaterThan(0);
  });

  it("dispatches resolution email via emailDispatcher on applySupportProposal", async () => {
    const mockClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("SELECT status FROM support_tickets")) {
          return { rows: [{ status: "in_progress" }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const mockPool: any = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(mockClient),
    };

    const mockEmailDispatcher = {
      sendSupportResolutionEmail: vi.fn().mockResolvedValue({
        messageId: "msg-123",
        delivered: true,
        provider: "smtp",
        timestamp: new Date().toISOString(),
      }),
    };

    const mockRealtimeBroadcaster = {
      broadcast: vi.fn(),
      subscribe: vi.fn(),
    };

    const service = new AiSupportService(
      mockPool,
      {},
      () => "id-123",
      () => new Date().toISOString(),
      mockEmailDispatcher,
      mockRealtimeBroadcaster,
    );

    // Seed cached proposal
    (service as any).proposalsCache.set("prop-test-1", {
      id: "prop-test-1",
      prompt: "Xử lý đền bù voucher 15%",
      tickets: [
        {
          ticketId: "tick-123",
          customerName: "Nguyễn Văn A",
          customerEmail: "nguyenphuongdmx2450@gmail.com",
          subject: "Máy PS5 giao trễ",
          proposedResponse: "Rất xin lỗi bạn.",
          suggestedCompensation: "Voucher 15%",
          sentiment: "frustrated",
          churnRisk: "high",
          priority: "high",
          issueCategory: "shipping_delay",
        },
      ],
      vipCustomers: [],
      totalTickets: 1,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
    });

    const result = await service.applySupportProposal("prop-test-1", {
      items: [
        {
          ticketId: "tick-123",
          responseMessage: "Chúng tôi đã xử lý đơn và đền bù cho bạn.",
          resolutionStatus: "resolved",
        },
      ],
    });

    expect(result.appliedCount).toBe(1);
    expect(mockEmailDispatcher.sendSupportResolutionEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailDispatcher.sendSupportResolutionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "nguyenphuongdmx2450@gmail.com",
        subject: "[NovaCommerce] Phản hồi yêu cầu hỗ trợ: Máy PS5 giao trễ",
        voucherCode: expect.stringMatching(/^CSKH15-/),
      }),
    );
    expect(mockRealtimeBroadcaster.broadcast).toHaveBeenCalledTimes(1);
    expect(mockRealtimeBroadcaster.broadcast).toHaveBeenCalledWith(
      "tick-123",
      expect.objectContaining({
        type: "message_created",
        ticketId: "tick-123",
        message: expect.objectContaining({
          authorId: "support-ai-steward",
          body: expect.stringContaining("CSKH15-"),
        }),
      }),
    );
  }, 15000);

  it("clears an active SLA pause before resolving a waiting_customer ticket", async () => {
    const mockClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("SELECT status FROM support_tickets")) {
          return { rows: [{ status: "waiting_customer" }] };
        }
        if (
          sql.includes("SET status = 'resolved'")
          && !sql.includes("sla_pause_started_at = NULL")
        ) {
          throw new Error("Support ticket SLA state is invalid");
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const service = new AiSupportService({
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(mockClient),
    } as any, {});

    await expect(service.applySupportProposal("proposal-1", {
      items: [{
        ticketId: "ticket-1",
        responseMessage: "Đã xử lý yêu cầu.",
        resolutionStatus: "resolved",
      }],
    })).resolves.toMatchObject({ appliedCount: 1 });

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("sla_pause_started_at = NULL"),
      ["ticket-1"],
    );
  });
});
