// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkflowStudioPage } from "../pages/workflow-studio-page";
import { WorkflowCanvas } from "../components/workflow-canvas";
import {
  CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
  MARKETING_LAUNCH_WORKFLOW_FIXTURE,
} from "../types";
import type { WorkflowApi } from "../api/workflow-api";

describe("Visual Business Workflow Studio - Customer Recovery Workflow", () => {
  it("renders the workflow studio header, code badge, and all 4 business cards", async () => {
    render(<WorkflowStudioPage />);

    expect(screen.getByText("Cứu Khách Hàng Khiếu Nại & Bồi Thường Nhanh")).toBeInTheDocument();
    expect(screen.getByText("WF-CSKH-RECOVERY")).toBeInTheDocument();

    // Verify business steps including Decision Router and 4A/4B branches
    expect(await screen.findByText(/BƯỚC 1 • Sự Kiện Bắt Đầu/i)).toBeInTheDocument();
    expect(screen.getAllByText("Tiếp Nhận Khiếu Nại Khách Hàng").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/BƯỚC 2 • AI Xử Lý Nghiệp Vụ/i)).toBeInTheDocument();
    expect(screen.getAllByText("AI Phân Tích & Đề Xuất Bồi Thường").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/BƯỚC 3 • Luật Nghiệp Vụ & Phân Luồng/i)).toBeInTheDocument();
    expect(screen.getAllByText("Phân Luồng Theo Hạn Mức Bồi Thường").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Tự động ≤ 200k").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Cần Sếp duyệt > 200k").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/BƯỚC 4A • Tự Động 100% Trong 30s/i)).toBeInTheDocument();
    expect(screen.getAllByText("Tự Động Kích Hoạt Voucher & Gửi Mail").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/BƯỚC 4B • Cổng Kiểm Soát Nghiệp Vụ/i)).toBeInTheDocument();
    expect(screen.getAllByText("Duyệt Phương Án Bồi Thường CSKH").length).toBeGreaterThanOrEqual(1);
  });

  it("opens the inspection drawer when clicking on a business card", async () => {
    render(<WorkflowCanvas workflow={CUSTOMER_RECOVERY_WORKFLOW_FIXTURE} />);

    const step2Cards = await screen.findAllByText("AI Phân Tích & Đề Xuất Bồi Thường");
    const canvasCard = step2Cards.find((el) => el.classList.contains("n8nNodeTitle")) ?? step2Cards[0];
    fireEvent.click(canvasCard);

    // Inspector drawer should be visible with business narrative
    expect(screen.getByRole("dialog", { name: "Chi tiết thẻ nghiệp vụ" })).toBeInTheDocument();
    expect(screen.getByText("Bản Tin Nghiệp Vụ")).toBeInTheDocument();
    expect(screen.getByText("VIPCARE-XUOC-15")).toBeInTheDocument();
    expect(screen.getByText("Bằng Chứng An Toàn & Kiểm Toán")).toBeInTheDocument();

    // Close button works
    const closeBtn = screen.getByRole("button", { name: "Đóng bảng chi tiết" });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("transitions the approval gate and execution action to completed when operator clicks approve", async () => {
    render(<WorkflowStudioPage />);

    // Step 3 initially says 'Chờ duyệt'
    expect(await screen.findByText("Chờ duyệt")).toBeInTheDocument();

    // Click the approve button on Step 3
    const approveBtn = screen.getByRole("button", { name: "Đồng ý duyệt phương án" });
    fireEvent.click(approveBtn);

    // After approval, both Step 3 and Step 4 should be marked completed ("Xong")
    const completedPills = screen.getAllByText("Xong");
    expect(completedPills.length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Chờ duyệt")).not.toBeInTheDocument();
  });

  it("resets the workflow simulation state when clicking reset button", async () => {
    render(<WorkflowStudioPage />);

    // Approve first
    const approveBtn = await screen.findByRole("button", { name: "Đồng ý duyệt phương án" });
    fireEvent.click(approveBtn);
    expect(screen.queryByText("Chờ duyệt")).not.toBeInTheDocument();

    // Click Reset
    const resetBtn = screen.getByRole("button", { name: "Đặt lại quy trình mẫu" });
    fireEvent.click(resetBtn);

    // Initial state restored
    expect(await screen.findByText("Chờ duyệt")).toBeInTheDocument();
  });

  it("hydrates live customer ticket and AI proposal when supportApi is provided, and executes live approval mutation", async () => {
    const mockProposal = {
      id: "prop-live-123",
      prompt: "Phân tích khiếu nại",
      overallSentimentSummary: "Khách rất bực mình về lỗi sọc màn hình",
      churnRiskAssessment: "Nguy cơ mất khách VIP",
      recommendedAction: "Bồi thường voucher 15% và đổi mới sản phẩm",
      status: "pending_approval" as const,
      createdAt: "2026-09-22T20:00:00Z",
      docxFilename: "proposal.docx",
      totalTickets: 1,
      vipCustomers: [],
      tickets: [
        {
          ticketId: "5ada0828-f30f-4e3b-a18e-ee1d1d205fb4",
          customerName: "Phan Dương Quốc Nhật",
          customerEmail: "pdqnshichi2005@gmail.com",
          subject: "Khiếu nại máy Nova Phone Pro bị lỗi sọc màn hình",
          sentiment: "angry" as const,
          churnRisk: "high" as const,
          issueCategory: "product_defect" as const,
          proposedResponse: "Dạ em chào anh Nhật, NovaCommerce vô cùng xin lỗi anh ạ...",
          suggestedCompensation: "Voucher giảm 15% (VIPCARE-15)",
          priority: "urgent" as const,
        },
      ],
    };

    const mockSupportApi: any = {
      getLatestSupportProposal: async () => mockProposal,
      applySupportProposal: async () => ({ success: true }),
      list: async () => ({ items: [], totalItems: 0 }),
    };

    render(<WorkflowStudioPage supportApi={mockSupportApi} />);

    // Shows live data badge
    expect(await screen.findByText("Dữ liệu thật từ Hệ Thống")).toBeInTheDocument();

    // Node 1 displays live customer name and ticket when inspecting
    const node1Card = await screen.findByRole("button", { name: /Tiếp Nhận Khiếu Nại Khách Hàng - BƯỚC 1/i });
    fireEvent.click(node1Card);
    expect(await screen.findByRole("dialog", { name: "Chi tiết thẻ nghiệp vụ" })).toBeInTheDocument();
    expect(screen.getAllByText(/Phan Dương Quốc Nhật/i).length).toBeGreaterThanOrEqual(1);

    // Close drawer to inspect node 2
    const closeBtn1 = screen.getByRole("button", { name: "Đóng bảng chi tiết" });
    fireEvent.click(closeBtn1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Node 2 displays live AI compensation proposal when inspecting
    const node2Card = await screen.findByRole("button", { name: /AI Phân Tích & Đề Xuất Bồi Thường - BƯỚC 2/i });
    fireEvent.click(node2Card);
    expect(screen.getAllByText(/Voucher giảm 15% \(VIPCARE-15\)/i).length).toBeGreaterThanOrEqual(1);

    // Close drawer to return to canvas actions
    const closeBtn2 = screen.getByRole("button", { name: "Đóng bảng chi tiết" });
    fireEvent.click(closeBtn2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Step 3 shows waiting approval
    expect(screen.getByText("Chờ duyệt")).toBeInTheDocument();

    // Approve the live proposal
    const approveBtn = screen.getByRole("button", { name: "Đồng ý duyệt phương án" });
    fireEvent.click(approveBtn);

    // Wait for live approval mutation to complete
    await waitFor(() => {
      expect(screen.queryByText("Chờ duyệt")).not.toBeInTheDocument();
    });

    const completedPills = await screen.findAllByText("Xong");
    expect(completedPills.length).toBeGreaterThanOrEqual(3);
  });

  it("switches smoothly between Marketing, Inventory, and CSKH workflows", async () => {
    render(<WorkflowStudioPage />);

    const select = screen.getByLabelText("Chọn quy trình nghiệp vụ");

    // Switch to Marketing
    fireEvent.change(select, { target: { value: "wf-marketing-launch-v1" } });
    expect((await screen.findAllByText("Duyệt Bài Viết Trước Khi Đăng")).length).toBeGreaterThanOrEqual(1);

    // Switch to Inventory
    fireEvent.change(select, { target: { value: "wf-inventory-replenish-v1" } });
    expect(screen.getByText("Cảnh Báo Tồn Kho & Tự Động Đề Xuất Nhập Hàng")).toBeInTheDocument();
    expect(screen.getByText("WF-INV-REPLENISH")).toBeInTheDocument();
    expect(await screen.findByText("Cảnh Báo Tồn Kho Dưới Ngưỡng An Toàn")).toBeInTheDocument();
    expect(screen.getAllByText("Đơn nhỏ ≤ 10Tr").length).toBeGreaterThanOrEqual(1);
  });

  it("adds a new node from the palette onto canvas and transitions state to draft", async () => {
    render(<WorkflowStudioPage />);

    // Initially active in v1.0
    expect(screen.getByText(/Đang hoạt động \(v1\.0 - Đã xuất bản\)/i)).toBeInTheDocument();

    // Palette should have the quick-add button for financial approval gate
    const addCfoBtn = screen.getByLabelText("Thêm Duyệt Lệnh Mua Hàng & Chi Phí vào bàn vẽ");
    fireEvent.click(addCfoBtn);

    // Node is added to canvas (appears in palette + canvas + auto-selected drawer)
    const matchingTitles = await screen.findAllByText("Duyệt Lệnh Mua Hàng & Chi Phí");
    expect(matchingTitles.length).toBeGreaterThanOrEqual(2);

    // Status transitions to draft
    expect(screen.getByText(/Bản nháp \(v1\.0 - Chưa xuất bản\)/i)).toBeInTheDocument();
  });

  it("edits parameters in the configuration tab and saves to draft", async () => {
    render(<WorkflowStudioPage />);

    // Open Step 3 (Decision Router)
    const step3Card = await screen.findByText("Phân Luồng Theo Hạn Mức Bồi Thường");
    fireEvent.click(step3Card);

    // Switch to Config Tab
    const configTab = screen.getByRole("tab", { name: /Cấu Hình Tham Số & Luật/i });
    fireEvent.click(configTab);

    // Edit threshold
    const thresholdInput = screen.getByLabelText(/Hạn mức bồi thường tự duyệt tối đa/i);
    expect(thresholdInput).toHaveValue("200.000 đ / ca khiếu nại");

    fireEvent.change(thresholdInput, { target: { value: "500.000 đ" } });
    expect(thresholdInput).toHaveValue("500.000 đ");

    // Click Save
    const saveBtn = screen.getByRole("button", { name: /Lưu Vào Bản Nháp/i });
    fireEvent.click(saveBtn);

    // Workflow is now draft and success is confirmed
    expect(await screen.findByText(/Bản nháp \(v1\.0 - Chưa xuất bản\)/i)).toBeInTheDocument();
    expect(await screen.findByText("Đã Lưu Thành Công!")).toBeInTheDocument();
  });

  it("publishes and activates a draft workflow, incrementing version to v1.1", async () => {
    render(<WorkflowStudioPage />);

    // Edit a node to create a draft
    const step3Card = await screen.findByText("Phân Luồng Theo Hạn Mức Bồi Thường");
    fireEvent.click(step3Card);

    const configTab = screen.getByRole("tab", { name: /Cấu Hình Tham Số & Luật/i });
    fireEvent.click(configTab);

    const saveBtn = screen.getByRole("button", { name: /Lưu Vào Bản Nháp/i });
    fireEvent.click(saveBtn);

    // Publish button is now active
    const publishBtn = screen.getByRole("button", { name: /Xuất Bản & Kích Hoạt/i });
    expect(publishBtn).not.toBeDisabled();

    fireEvent.click(publishBtn);

    // Success banner is displayed
    expect(await screen.findByText(/Xuất Bản & Kích Hoạt Thành Công!/i)).toBeInTheDocument();
    expect(screen.getByText(/phiên bản v1\.1/i)).toBeInTheDocument();

    // Header badge is updated to published v1.1
    expect(screen.getByText(/Đang hoạt động \(v1\.1 - Đã xuất bản\)/i)).toBeInTheDocument();
  });

  it("deletes a node from the workflow via inspector drawer", async () => {
    render(<WorkflowStudioPage />);

    // Add a node first
    const addCfoBtn = screen.getByLabelText("Thêm Duyệt Lệnh Mua Hàng & Chi Phí vào bàn vẽ");
    fireEvent.click(addCfoBtn);

    // Find the canvas node
    const matchingTitles = await screen.findAllByText("Duyệt Lệnh Mua Hàng & Chi Phí");
    const canvasNode = matchingTitles.find((el) => el.classList.contains("n8nNodeTitle")) ?? matchingTitles[1];
    expect(canvasNode).toBeInTheDocument();

    // Click to inspect
    fireEvent.click(canvasNode);

    // Go to config tab and delete
    const configTab = screen.getByRole("tab", { name: /Cấu Hình Tham Số & Luật/i });
    fireEvent.click(configTab);

    const deleteBtn = screen.getByRole("button", { name: /Xóa Khối/i });
    fireEvent.click(deleteBtn);

    // Dialog closes and node is removed from canvas (only palette card remains: count = 1)
    await waitFor(() => {
      const remaining = screen.queryAllByText("Duyệt Lệnh Mua Hàng & Chi Phí");
      expect(remaining.length).toBe(1);
    });
  });

  it("blocks publication and displays error banner when workflow graph has orphan/unconnected nodes", async () => {
    render(<WorkflowStudioPage />);

    // Add an unconnected node from palette
    const addCfoBtn = screen.getByLabelText("Thêm Duyệt Lệnh Mua Hàng & Chi Phí vào bàn vẽ");
    fireEvent.click(addCfoBtn);

    // Try to publish immediately while this new node has no incoming edges
    const publishBtn = screen.getByRole("button", { name: /Xuất Bản & Kích Hoạt/i });
    fireEvent.click(publishBtn);

    // Error banner should be visible explaining the structural issue
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Không thể xuất bản quy trình/i)).toBeInTheDocument();
    expect(screen.getByText(/chưa có dây nối đầu vào/i)).toBeInTheDocument();

    // Version remains v1.0 draft, NOT incremented to v1.1
    expect(screen.getByText(/Bản nháp \(v1\.0 - Chưa xuất bản\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Đang hoạt động \(v1\.1/i)).not.toBeInTheDocument();
  });

  it("guides operator when manually adding a node with unconnected status and helpful tips", async () => {
    render(<WorkflowStudioPage />);

    // Add financial approval node
    const addCfoBtn = screen.getByLabelText("Thêm Duyệt Lệnh Mua Hàng & Chi Phí vào bàn vẽ");
    fireEvent.click(addCfoBtn);

    // Tip banner appears with guidance
    expect(await screen.findByText(/Đã thêm khối "Duyệt Lệnh Mua Hàng & Chi Phí"/i)).toBeInTheDocument();
    expect(screen.getByText(/Hãy kéo dây từ cổng tròn bên phải của khối trước/i)).toBeInTheDocument();

    // Node is on canvas with 'Chưa nối dây' warning badge
    expect(screen.getByText("Chưa nối dây 🔌")).toBeInTheDocument();

    // Close the tip banner
    const closeTipBtn = screen.getByLabelText("Đóng gợi ý");
    fireEvent.click(closeTipBtn);
    expect(screen.queryByText(/Đã thêm khối "Duyệt Lệnh Mua Hàng & Chi Phí"/i)).not.toBeInTheDocument();
  });

  it("syncs with backend workflowApi on mount and executes saveDraft and publishWorkflow", async () => {
    const mockBlueprints = [
      {
        ...CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
        version: "v2.0",
        policyRules: { auto_approval_threshold: 200000 },
      },
    ];

    const mockWorkflowApi: WorkflowApi = {
      listWorkflows: vi.fn().mockResolvedValue(mockBlueprints),
      getWorkflow: vi.fn(),
      saveDraft: vi.fn().mockImplementation(async (id, input) => ({
        ...CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
        id,
        nodes: (input.nodes as any) ?? CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.nodes,
        version: "v2.0",
        status: "draft" as const,
        policyRules: input.policyRules ?? { auto_approval_threshold: 200000 },
      })),
      publishWorkflow: vi.fn().mockImplementation(async (id, input) => ({
        ...CUSTOMER_RECOVERY_WORKFLOW_FIXTURE,
        id,
        nodes: (input.nodes as any) ?? CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.nodes,
        version: input.version ?? "v2.1",
        status: "published" as const,
        policyRules: input.policyRules ?? { auto_approval_threshold: 300000 },
      })),
    };

    render(<WorkflowStudioPage workflowApi={mockWorkflowApi} />);

    // Verified backend blueprint list is called on mount and version is updated to v2.0
    await waitFor(() => {
      expect(mockWorkflowApi.listWorkflows).toHaveBeenCalled();
    });
    expect(await screen.findByText(/Đang hoạt động \(v2\.0 - Đã xuất bản\)/i)).toBeInTheDocument();

    // Trigger edit on Step 3
    const step3Card = await screen.findByText("Phân Luồng Theo Hạn Mức Bồi Thường");
    fireEvent.click(step3Card);

    const configTab = screen.getByRole("tab", { name: /Cấu Hình Tham Số & Luật/i });
    fireEvent.click(configTab);

    const thresholdInput = screen.getByLabelText(/Hạn mức bồi thường tự duyệt tối đa/i);
    fireEvent.change(thresholdInput, { target: { value: "300.000 đ" } });

    // Save in drawer
    const drawerSaveBtn = screen.getByRole("button", { name: /Lưu Vào Bản Nháp/i });
    fireEvent.click(drawerSaveBtn);

    // Click the top "Lưu Bản Nháp" button to persist to backend
    const topSaveDraftBtn = screen.getByRole("button", { name: "Lưu bản nháp quy trình" });
    expect(topSaveDraftBtn).not.toBeDisabled();
    fireEvent.click(topSaveDraftBtn);

    await waitFor(() => {
      expect(mockWorkflowApi.saveDraft).toHaveBeenCalledWith(
        CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id,
        expect.objectContaining({
          description: expect.any(String),
          nodes: expect.any(Array),
        })
      );
    });
    expect(await screen.findByText(/Lưu Bản Nháp Thành Công/i)).toBeInTheDocument();

    // Now publish the workflow
    const publishBtn = screen.getByRole("button", { name: /Xuất Bản & Kích Hoạt/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(mockWorkflowApi.publishWorkflow).toHaveBeenCalledWith(
        CUSTOMER_RECOVERY_WORKFLOW_FIXTURE.id,
        expect.objectContaining({
          version: "v2.1",
          policyRules: expect.objectContaining({
            auto_approval_threshold: 300000,
          }),
        })
      );
    });

    expect(await screen.findByText(/Xuất Bản & Kích Hoạt Thành Công!/i)).toBeInTheDocument();
    expect(screen.getByText(/phiên bản v2\.1/i)).toBeInTheDocument();
    expect(screen.getByText(/Đang hoạt động \(v2\.1 - Đã xuất bản\)/i)).toBeInTheDocument();
  });

  it("hydrates live marketing campaign when marketingApi is provided and user switches to WF-MKT-LAUNCH", async () => {
    const mockCampaignDetail = {
      campaign: {
        id: "camp-live-1234",
        state: "awaiting_human_approval" as const,
        assignmentMode: "direct_department" as const,
        createdBy: "marketing_lead",
        idempotencyKey: "idemp-camp-123",
        version: 1,
        createdAt: "2026-09-25T10:00:00Z",
        updatedAt: "2026-09-25T10:05:00Z",
      },
      brief: {
        id: "brief-123",
        campaignId: "camp-live-1234",
        campaignName: "Ra mắt Nova Laptop Pro 2026",
        objective: "Quảng bá tính năng AI của laptop mới",
        subjectKind: "catalog_product" as const,
        subjectReference: "Nova Laptop Pro",
        language: "vi" as const,
        mandatoryMessage: "Tặng kèm Chuột Gaming RGB",
        prohibitedClaims: [],
        callToAction: "Đặt trước ngay hôm nay",
        facebookPageConfigurationId: "fb-nova-official",
        scheduledFor: "2026-09-25T12:00:00Z",
        deadline: "2026-09-26T12:00:00Z",
        approverId: "cmo_user",
        maximumCostMicros: 2000000,
        provenance: [],
        version: 1,
        createdAt: "2026-09-25T10:00:00Z",
      },
      contentVersions: [
        {
          id: "cv-1",
          campaignId: "camp-live-1234",
          versionNumber: 1,
          hook: "🔥 ĐỘT PHÁ HIỆU NĂNG VỚI NOVA LAPTOP PRO 2026",
          body: "Chi tiết bài viết công nghệ...",
          callToAction: "Đặt trước ngay",
          hashtags: ["#NovaLaptop", "#Tech2026"],
          factualClaimSourceIds: [],
          contentDigest: "digest123",
          costMicros: 35000,
          createdAt: "2026-09-25T10:02:00Z",
        },
      ],
      visualAssets: [
        {
          id: "va-1",
          campaignId: "camp-live-1234",
          versionNumber: 1,
          mediaType: "image/png",
          aspectRatio: "1:1" as const,
          width: 1024,
          height: 1024,
          byteSize: 204800,
          imageDigest: "imgdigest123",
          altText: "Ảnh render studio Nova Laptop Pro",
          storageKey: "marketing/camp-live-1234/banner.png",
          costMicros: 50000,
          createdAt: "2026-09-25T10:04:00Z",
        },
      ],
      publicationPackages: [
        {
          id: "pkg-1",
          campaignId: "camp-live-1234",
          packageVersion: 1,
          contentVersionId: "cv-1",
          visualAssetId: "va-1",
          facebookPageConfigurationId: "fb-nova-official",
          scheduledFor: "2026-09-25T12:00:00Z",
          contentDigest: "cdig123",
          imageDigest: "idig123",
          packageDigest: "pdig123",
          status: "submitted_for_approval" as const,
          createdAt: "2026-09-25T10:05:00Z",
          updatedAt: "2026-09-25T10:05:00Z",
        },
      ],
      currentPackage: null,
      publicationAttempts: [],
      publicationRecord: null,
      artifacts: [],
    };

    const mockMarketingApi: any = {
      listCampaigns: vi.fn().mockResolvedValue({
        items: [mockCampaignDetail.campaign],
        total: 1,
      }),
      getCampaign: vi.fn().mockResolvedValue(mockCampaignDetail),
      approveCampaign: vi.fn().mockImplementation(async () => {
        (mockCampaignDetail.campaign as any).state = "completed";
        return mockCampaignDetail.campaign;
      }),
    };

    render(<WorkflowStudioPage marketingApi={mockMarketingApi} />);

    // Switch to Marketing workflow
    const selector = screen.getByRole("combobox", { name: "Chọn quy trình nghiệp vụ" });
    fireEvent.change(selector, { target: { value: "wf-marketing-launch-v1" } });

    await waitFor(() => {
      expect(screen.getByText("Dữ liệu thật từ Hệ Thống")).toBeInTheDocument();
    });

    // Node 1 displays live campaign subject
    expect((await screen.findAllByText(/Nova Laptop Pro/i)).length).toBeGreaterThanOrEqual(1);

    // Node 2 displays AI hook in drawer when inspecting
    const node2Card = await screen.findByRole("button", { name: /AI Sáng Tạo Bài Viết & Thiết Kế Banner - BƯỚC 2/i });
    fireEvent.click(node2Card);
    expect(await screen.findByRole("dialog", { name: "Chi tiết thẻ nghiệp vụ" })).toBeInTheDocument();
    expect(screen.getAllByText(/ĐỘT PHÁ HIỆU NĂNG VỚI NOVA LAPTOP PRO 2026/i).length).toBeGreaterThanOrEqual(1);

    // Close drawer to return to canvas actions
    const closeBtn = screen.getByRole("button", { name: "Đóng bảng chi tiết" });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Node 3 displays Approval Gate
    expect(screen.getAllByText(/Duyệt Bài Viết Trước Khi Đăng/i).length).toBeGreaterThanOrEqual(1);

    // Node 4 displays Action publish
    expect(screen.getAllByText(/Tự Động Đăng Bài Lên Facebook & Instagram/i).length).toBeGreaterThanOrEqual(1);

    // Approve the live campaign directly on canvas
    const approveBtn = screen.getByRole("button", { name: "Đồng ý duyệt phương án" });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockMarketingApi.approveCampaign).toHaveBeenCalledWith(
        "camp-live-1234",
        expect.objectContaining({ decision: "approve" })
      );
    });
  });

  it("preserves and hydrates custom wires and 5+ step nodes when loading blueprints with persisted edges", async () => {
    const step5CustomNode = {
      id: "node-custom-step-5",
      type: "action" as const,
      stepNumber: 5,
      stepLabel: "5",
      title: "Gửi Email Thông Báo Nội Bộ",
      badge: "Hành Động Tự Động",
      department: "marketing" as const,
      actor: "Hệ thống email nội bộ",
      status: "idle" as const,
      summary: "Gửi thông báo tới Trưởng phòng Marketing (duongvanduy799@gmail.com)",
      keyHighlights: ["Người nhận: duongvanduy799@gmail.com"],
      details: {
        description: "Thông báo hoàn thành chiến dịch",
        parameters: [{ label: "Email", value: "duongvanduy799@gmail.com" }],
      },
    };

    const mockBlueprints = [
      {
        ...MARKETING_LAUNCH_WORKFLOW_FIXTURE,
        version: "v1.1",
        nodes: [...MARKETING_LAUNCH_WORKFLOW_FIXTURE.nodes, step5CustomNode],
        edges: [
          { source: "mkt-1-event", target: "mkt-2-ai-analysis" },
          { source: "mkt-2-ai-analysis", target: "mkt-3-approval" },
          { source: "mkt-3-approval", target: "mkt-4-publish" },
          { source: "mkt-4-publish", target: "node-custom-step-5" },
        ],
      },
    ];

    const mockWorkflowApi: WorkflowApi = {
      listWorkflows: vi.fn().mockResolvedValue(mockBlueprints),
      getWorkflow: vi.fn().mockResolvedValue(mockBlueprints[0]),
      saveDraft: vi.fn(),
      publishWorkflow: vi.fn(),
    };

    render(<WorkflowStudioPage workflowApi={mockWorkflowApi} />);

    // Switch to Marketing Launch workflow
    const selector = screen.getByRole("combobox", { name: "Chọn quy trình nghiệp vụ" });
    fireEvent.change(selector, { target: { value: "wf-marketing-launch-v1" } });

    // Step 5 should be hydrated on the canvas
    expect(await screen.findByText("Gửi Email Thông Báo Nội Bộ")).toBeInTheDocument();
    expect(screen.getByText(/Bước nghiệp vụ/i)).toHaveTextContent("5 Bước nghiệp vụ");

    // Verify Step 5 is NOT marked as 'Chưa nối dây' because wire from Step 4 to Step 5 was hydrated
    expect(screen.queryByText("Chưa nối dây 🔌")).not.toBeInTheDocument();
  });
});


