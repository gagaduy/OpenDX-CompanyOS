// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SupportEmailApprovalModal,
  isTicketRequiringApproval,
} from "../components/command-center/support-email-approval-modal";
import type { AiSupportProposalView } from "../../support/types/support.types";

describe("SupportEmailApprovalModal", () => {
  const mockProposal: AiSupportProposalView = {
    id: "prop-test-123",
    prompt: "Xử lý ticket CSKH",
    overallSentimentSummary: "Tất cả ticket đã được phân tích",
    churnRiskAssessment: "1 ca có nguy cơ cao",
    recommendedAction: "Duyệt kịch bản phản hồi",
    totalTickets: 2,
    status: "pending_approval",
    createdAt: new Date().toISOString(),
    docxFilename: "bao_cao_test.docx",
    vipCustomers: [],
    tickets: [
      {
        ticketId: "ticket-1-auto",
        customerName: "Nguyễn Văn An",
        customerEmail: "an@example.com",
        subject: "Khiếu nại giao hàng trễ",
        sentiment: "neutral",
        churnRisk: "low",
        issueCategory: "shipping_delay",
        proposedResponse: "Xin chào bạn An, chúng tôi tặng voucher freeship...",
        suggestedCompensation: "Miễn phí vận chuyển đơn hàng tiếp theo",
        priority: "normal",
        estimatedCompensationAmount: 30000,
        requiresApproval: false,
      },
      {
        ticketId: "ticket-2-manual",
        customerName: "Duy Duong",
        customerEmail: "duy@example.com",
        subject: "Khiếu nại máy sọc màn hình 34 triệu",
        sentiment: "frustrated",
        churnRisk: "high",
        issueCategory: "product_defect",
        proposedResponse: "Kính chào anh Duy, chúng tôi đền bù voucher 10%...",
        suggestedCompensation: "Tặng Voucher giảm 10% cho đơn hàng kế tiếp",
        priority: "urgent",
        estimatedCompensationAmount: 3428000,
        requiresApproval: true,
      },
    ],
  };

  it("classifies tickets correctly with isTicketRequiringApproval", () => {
    expect(isTicketRequiringApproval(mockProposal.tickets[0])).toBe(false);
    expect(isTicketRequiringApproval(mockProposal.tickets[1])).toBe(true);
  });

  it("renders badges for both Branch 4A (Auto <= 2M) and Branch 4B (Manual > 2M)", () => {
    render(
      <SupportEmailApprovalModal
        isOpen={true}
        proposal={mockProposal}
        onClose={vi.fn()}
        onApproveSelected={vi.fn()}
        onApproveAll={vi.fn()}
      />,
    );

    // Header & summary
    expect(screen.getByText(/Chính sách WF-CSKH-RECOVERY/i)).toBeInTheDocument();
    expect(screen.getByText(/ca tự động duyệt \(Nhánh 4A ≤ 2M\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ca cần Sếp duyệt \(Nhánh 4B > 2M\)/i)).toBeInTheDocument();

    // Badges on rows
    expect(screen.getAllByText(/Tự động duyệt \(Nhánh 4A ≤ 2M\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cần Sếp duyệt \(Nhánh 4B > 2M\)/i).length).toBeGreaterThan(0);

    // Compensation amounts
    expect(screen.getByText(/~30\.000/i)).toBeInTheDocument();
    expect(screen.getByText(/~3\.428\.000/i)).toBeInTheDocument();
  });

  it("pre-selects tickets and allows approver to submit selected batch", () => {
    const handleApproveSelected = vi.fn();
    render(
      <SupportEmailApprovalModal
        isOpen={true}
        proposal={mockProposal}
        onClose={vi.fn()}
        onApproveSelected={handleApproveSelected}
        onApproveAll={vi.fn()}
      />,
    );

    // Toolbar shows counts for both manual and auto
    expect(screen.getByText(/1 ca cần duyệt, 1 ca tự động duyệt/i)).toBeInTheDocument();

    // Primary button submits the selected batch
    const approveBtn = screen.getByRole("button", {
      name: /Phê duyệt & gửi đã chọn \(2\)/i,
    });
    expect(approveBtn).toBeInTheDocument();

    fireEvent.click(approveBtn);

    expect(handleApproveSelected).toHaveBeenCalledWith(
      expect.arrayContaining(["ticket-2-manual", "ticket-1-auto"]),
    );
  });
});
