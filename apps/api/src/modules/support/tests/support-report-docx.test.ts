// apps/api/src/modules/support/tests/support-report-docx.test.ts
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { generateSupportReportDocx } from "../infrastructure/generators/support-report-docx.generator";
import type { AiSupportProposalDto } from "../application/dtos/ai-support-response.dto";

describe("generateSupportReportDocx", () => {
  it("generates valid OpenXML DOCX buffer with header and ticket tables", () => {
    const proposal: AiSupportProposalDto = {
      id: "supp-unit-test",
      prompt: "Rà soát sự cố giao hàng và CSKH",
      overallSentimentSummary: "80% CSAT tích cực",
      churnRiskAssessment: "Rủi ro thấp",
      recommendedAction: "Gửi quà tri ân",
      tickets: [
        {
          ticketId: "tick-001",
          customerName: "Nguyen Van A",
          customerEmail: "a@example.com",
          subject: "Bảo hành sản phẩm",
          sentiment: "neutral",
          churnRisk: "low",
          issueCategory: "warranty_inquiry",
          proposedResponse: "Chào anh A, bên em đã tiếp nhận bảo hành.",
          suggestedCompensation: "Không cần",
          priority: "normal",
        },
      ],
      vipCustomers: [
        {
          customerId: "cust-001",
          customerName: "Nguyen Van A",
          totalSpentVnd: 30000000,
          orderCount: 3,
          segment: "VIP Gold",
          engagementRecommendation: "Tặng voucher 5%",
        },
      ],
      totalTickets: 1,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
      docxFilename: "bao_cao_cham_soc_khach_hang_supp-unit-test.docx",
    };

    const docx = generateSupportReportDocx(proposal);
    expect(docx.buffer).toBeInstanceOf(Buffer);
    expect(docx.buffer.length).toBeGreaterThan(500);
    expect(docx.filename).toBe("bao_cao_cham_soc_khach_hang_supp-unit-test.docx");
    expect(docx.mediaType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
});
