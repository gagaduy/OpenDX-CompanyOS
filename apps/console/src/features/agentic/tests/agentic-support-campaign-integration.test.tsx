// apps/console/src/features/agentic/tests/agentic-support-campaign-integration.test.tsx
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../authentication/hooks/auth-context";
import { AgenticCommandCenter } from "../components/agentic-command-center";
import type { SupportEmailCampaignProposalView } from "../../support/types/support.types";

describe("AgenticCommandCenter Support Email Campaign Integration", () => {
  const sampleCampaignProposal: SupportEmailCampaignProposalView = {
    id: "campaign-prop-001",
    type: "new_product_announcement",
    title: "Thông báo Sản phẩm Mới Đến Khách Hàng",
    emailSubject: "Bộ sưu tập công nghệ mới nhất 2026",
    targetSegment: "recent_buyers",
    recipients: [
      {
        customerId: "cust-1",
        email: "vip.customer@novacommerce.vn",
        fullName: "Nguyễn Hoàng Nam",
        totalSpentVnd: 25000000,
        orderCount: 8,
        isSelected: true,
      },
    ],
    totalRecipients: 1,
    selectedCount: 1,
    featuredProducts: [],
    htmlContent: "<div>Email HTML Content</div>",
    docxFilename: "ke_hoach_email_campaign.docx",
    status: "pending_approval",
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
  };

  function setup(customSupportApi?: any) {
    const mockSupportApi = {
      listEmailCampaignProposals: vi.fn().mockResolvedValue([sampleCampaignProposal]),
      applyEmailCampaignProposal: vi.fn().mockResolvedValue({
        proposalId: sampleCampaignProposal.id,
        status: "sent",
        successfulDispatches: 1,
        failedDispatches: 0,
        dispatchedAt: "2026-09-15T11:00:00.000Z",
      }),
      cancelEmailCampaignProposal: vi.fn().mockResolvedValue({
        ...sampleCampaignProposal,
        status: "rejected",
      }),
      downloadEmailCampaignDocx: vi.fn().mockResolvedValue(undefined),
      ...customSupportApi,
    };

    const authClient = {
      getSession: vi.fn(async () => ({ user: { id: "test-staff-01" } })),
      signIn: vi.fn(async () => undefined),
      completeSignIn: vi.fn(),
      signOut: vi.fn(),
    };

    const fakeApi = {
      overview: vi.fn().mockResolvedValue({
        pendingApprovals: 1,
        activeWorkflows: 0,
        completedToday: 0,
        slaBreaches: 0,
      }),
      listTasks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      createTask: vi.fn(),
      readyTask: vi.fn(),
      startTask: vi.fn(),
      uploadFile: vi.fn(),
      loadFile: vi.fn(),
      previewFile: vi.fn(),
      approveFile: vi.fn(),
      rejectFile: vi.fn(),
      loadOperations: vi.fn(),
      cancelWorkflow: vi.fn(),
      listApprovals: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      loadApproval: vi.fn(),
      decideApproval: vi.fn(),
      listEmployees: vi.fn().mockResolvedValue({ items: [] }),
      loadEmployee: vi.fn(),
      listAudit: vi.fn().mockResolvedValue({ items: [] }),
    };

    return {
      mockSupportApi,
      render: () =>
        render(
          <AuthProvider client={authClient as any}>
            <MemoryRouter>
              <AgenticCommandCenter api={fakeApi as any} supportApi={mockSupportApi as any} />
            </MemoryRouter>
          </AuthProvider>,
        ),
    };
  }

  it("renders email campaign proposal in Pending Approvals panel and Recent Deliverables", async () => {
    const { render } = setup();
    render();

    await waitFor(() => {
      expect(
        screen.getByText(/Chuyên viên CRM & Quản gia CSKH \(SUP-02 & SUP-01\)/),
      ).toBeDefined();
    });

    expect(screen.getByText(/Thông báo Sản phẩm Mới Đến Khách Hàng/)).toBeDefined();
  });

  it("opens SupportEmailCampaignApprovalModal when clicking on preview", async () => {
    const user = userEvent.setup();
    const { render } = setup();
    render();

    await waitFor(() => {
      expect(
        screen.getByText(/Chuyên viên CRM & Quản gia CSKH \(SUP-02 & SUP-01\)/),
      ).toBeDefined();
    });

    // Find the approval card or preview button
    const previewBtn = screen.getByText("Xem trước");
    await user.click(previewBtn);

    // Modal is opened
    await waitFor(() => {
      expect(screen.getByText("Xem trước Email")).toBeDefined();
      expect(screen.getByText(/Danh sách người nhận/)).toBeDefined();
    });
  });
});
