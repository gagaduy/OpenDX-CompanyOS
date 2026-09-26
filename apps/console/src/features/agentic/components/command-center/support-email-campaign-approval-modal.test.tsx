// apps/console/src/features/agentic/components/command-center/support-email-campaign-approval-modal.test.tsx
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SupportEmailCampaignApprovalModal } from "./support-email-campaign-approval-modal";
import type { SupportEmailCampaignProposalView } from "../../../support/types/support.types";

describe("SupportEmailCampaignApprovalModal", () => {
  const sampleProposal: SupportEmailCampaignProposalView = {
    id: "proposal-camp-001",
    type: "new_product_announcement",
    title: "Thông báo Sản phẩm Mới Đến Khách Hàng",
    emailSubject: "Khám phá các sản phẩm công nghệ mới nhất",
    targetSegment: "recent_buyers",
    recipients: [
      {
        customerId: "cust-1",
        email: "nguyenvana@gmail.com",
        fullName: "Nguyễn Văn A",
        totalSpentVnd: 12000000,
        orderCount: 5,
        isSelected: true,
      },
      {
        customerId: "cust-2",
        email: "tranthib@gmail.com",
        fullName: "Trần Thị B",
        totalSpentVnd: 4500000,
        orderCount: 2,
        isSelected: true,
      },
    ],
    totalRecipients: 2,
    selectedCount: 2,
    featuredProducts: [
      {
        productId: "prod-1",
        name: "Bàn phím cơ Không dây Nova Mech Pro",
        sku: "PROD-KB-001",
        regularPriceVnd: 1500000,
        imageUrl: "https://minio.novacommerce.vn/products/mech-kb.jpg",
        categoryName: "Phụ kiện",
        storefrontUrl: "https://novacommerce.vn/products/prod-1",
      },
    ],
    htmlContent: '<div data-testid="email-html-content">Kính chào Quý khách, NovaCommerce trân trọng giới thiệu sản phẩm mới.</div>',
    docxFilename: "ke_hoach_email_proposal.docx",
    status: "pending_approval",
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <SupportEmailCampaignApprovalModal
        isOpen={false}
        proposal={sampleProposal}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDownloadDocx={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders proposal header, badges, and HTML email preview by default", () => {
    render(
      <SupportEmailCampaignApprovalModal
        isOpen={true}
        proposal={sampleProposal}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDownloadDocx={vi.fn()}
      />,
    );

    expect(screen.getByText("Thông báo Sản phẩm Mới Đến Khách Hàng")).toBeDefined();
    expect(screen.getByText(/Chờ phê duyệt/)).toBeDefined();
    expect(screen.getByText("Khám phá các sản phẩm công nghệ mới nhất")).toBeDefined();
    expect(screen.getByText("Xem trước Email")).toBeDefined();
    expect(screen.getByText(/Danh sách người nhận/)).toBeDefined();
  });

  it("switches to recipient list tab and allows toggling recipient checkboxes", () => {
    render(
      <SupportEmailCampaignApprovalModal
        isOpen={true}
        proposal={sampleProposal}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDownloadDocx={vi.fn()}
      />,
    );

    // Switch to recipients tab
    fireEvent.click(screen.getByText(/Danh sách người nhận/));

    expect(screen.getByText("Nguyễn Văn A")).toBeDefined();
    expect(screen.getByText("nguyenvana@gmail.com")).toBeDefined();
    expect(screen.getByText("Trần Thị B")).toBeDefined();

    // Checkboxes are rendered
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it("triggers onApprove with selected recipient IDs when approval button is clicked", () => {
    const onApprove = vi.fn();
    render(
      <SupportEmailCampaignApprovalModal
        isOpen={true}
        proposal={sampleProposal}
        onClose={vi.fn()}
        onApprove={onApprove}
        onReject={vi.fn()}
        onDownloadDocx={vi.fn()}
      />,
    );

    const approveButton = screen.getByText(/Phê duyệt & Gửi Email/);
    fireEvent.click(approveButton);

    expect(onApprove).toHaveBeenCalledWith(["cust-1", "cust-2"]);
  });

  it("triggers onDownloadDocx when Word download button is clicked", () => {
    const onDownloadDocx = vi.fn();
    render(
      <SupportEmailCampaignApprovalModal
        isOpen={true}
        proposal={sampleProposal}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDownloadDocx={onDownloadDocx}
      />,
    );

    const docxButton = screen.getByText(/Tải Kế Hoạch/);
    fireEvent.click(docxButton);

    expect(onDownloadDocx).toHaveBeenCalled();
  });

  it("triggers onReject when reject button is clicked", () => {
    const onReject = vi.fn();
    render(
      <SupportEmailCampaignApprovalModal
        isOpen={true}
        proposal={sampleProposal}
        onClose={vi.fn()}
        onApprove={vi.fn()}
        onReject={onReject}
        onDownloadDocx={vi.fn()}
      />,
    );

    const rejectButton = screen.getByText("Từ chối");
    fireEvent.click(rejectButton);

    expect(onReject).toHaveBeenCalled();
  });
});
