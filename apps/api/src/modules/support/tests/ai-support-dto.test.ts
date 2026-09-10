// apps/api/src/modules/support/tests/ai-support-dto.test.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { AiSupportProposalDto } from "../application/dtos/ai-support-response.dto";

describe("AiSupportDto", () => {
  it("validates structured support proposal contracts", () => {
    const proposal: AiSupportProposalDto = {
      id: "supp-123",
      prompt: "Rà soát toàn bộ khiếu nại khách hàng",
      overallSentimentSummary: "85% khách hàng tích cực, có 2 trường hợp giao chậm cần hỗ trợ.",
      churnRiskAssessment: "Rủi ro mất khách hàng thấp, cần tặng voucher cho 1 đơn trễ.",
      recommendedAction: "Gửi thư xin lỗi kèm mã giảm giá 10%.",
      tickets: [
        {
          ticketId: "tick-001",
          customerName: "Duy Duong",
          customerEmail: "duy@example.com",
          subject: "Đơn hàng giao trễ 2 ngày",
          sentiment: "frustrated",
          churnRisk: "medium",
          issueCategory: "shipping_delay",
          proposedResponse: "Dạ em chào anh Duy, em rất tiếc vì sự chậm trễ...",
          suggestedCompensation: "Voucher giảm 10% (SAVE10)",
          priority: "high",
        },
      ],
      vipCustomers: [
        {
          customerId: "cust-001",
          customerName: "Duy Duong",
          totalSpentVnd: 45000000,
          orderCount: 5,
          segment: "VIP Diamond",
          engagementRecommendation: "Tặng quà tri ân sinh nhật và ưu tiên xử lý ticket",
        },
      ],
      totalTickets: 1,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
      docxFilename: "bao_cao_cham_soc_khach_hang_supp-123.docx",
    };

    expect(proposal.id).toBe("supp-123");
    expect(proposal.tickets.length).toBe(1);
    expect(proposal.tickets[0].sentiment).toBe("frustrated");
    expect(proposal.vipCustomers[0].segment).toBe("VIP Diamond");
  });
});
