// apps/api/src/modules/support/tests/ai-support-service.test.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { AiSupportService } from "../application/services/implementations/ai-support.service";

describe("AiSupportService", () => {
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
});
