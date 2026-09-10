/**
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthClient } from "../../authentication/api/oidc-manager";
import { AuthProvider } from "../../authentication/hooks/auth-context";
import type { AgenticOperationsApi } from "../api/agentic-api";
import { AgenticCommandCenter } from "../components/agentic-command-center";
import type { MarketingApi } from "../../marketing/api/marketing-api";
import type { CatalogApi } from "../../catalog/api/catalog-api";
import type { InventoryApi } from "../../inventory/api/inventory-api";
import type { SupportOperationsApi } from "../../support/api/support-api";

describe("AgenticCommandCenter Department Task Queue & Direct Input Unblocking", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps all 4 department inputs enabled at all times", () => {
    const authClient = fakeAuthClient();
    const api = fakeAgenticApi();

    render(
      <AuthProvider client={authClient}>
        <MemoryRouter>
          <AgenticCommandCenter api={api} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const mktInput = screen.getByPlaceholderText("Giao việc cho Tiếp thị & Sáng tạo...");
    const merchInput = screen.getByPlaceholderText("Giao việc cho Danh mục & Định giá...");
    const opsInput = screen.getByPlaceholderText("Giao việc cho Vận hành & Kho...");
    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");

    expect(mktInput).not.toBeDisabled();
    expect(merchInput).not.toBeDisabled();
    expect(opsInput).not.toBeDisabled();
    expect(supportInput).not.toBeDisabled();

    fireEvent.change(opsInput, { target: { value: "Kiểm toán kho hàng tồn" } });
    expect((opsInput as HTMLInputElement).value).toBe("Kiểm toán kho hàng tồn");
  });

  it("enqueues task with queue badge and waiting card when required resource is locked", async () => {
    vi.useFakeTimers();
    const authClient = fakeAuthClient();
    const api = fakeAgenticApi();
    const marketingApi = fakeMarketingApi();
    const catalogApi = fakeCatalogApi();

    render(
      <AuthProvider client={authClient}>
        <MemoryRouter>
          <AgenticCommandCenter
            api={api}
            marketingApi={marketingApi}
            catalogApi={catalogApi}
          />
        </MemoryRouter>
      </AuthProvider>,
    );

    // 1. Marketing initiates a task which locks marketing_visual
    const mktInput = screen.getByPlaceholderText("Giao việc cho Tiếp thị & Sáng tạo...");
    fireEvent.change(mktInput, { target: { value: "Soạn bài viết và vẽ poster mới" } });
    fireEvent.submit(mktInput.closest("form")!);

    // Advance timer slightly to enter running state
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // 2. While Marketing is busy, submit a Merchandising task that requires marketing_visual
    const merchInput = screen.getByPlaceholderText("Giao việc cho Danh mục & Định giá...");
    fireEvent.change(merchInput, { target: { value: "Chiến dịch Tết Trung Thu giảm giá 20%" } });
    fireEvent.submit(merchInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // 3. Merchandising should now show a queue badge in the header and a waiting card
    expect(screen.getByText(/Hàng chờ: 1/)).toBeInTheDocument();
    expect(screen.getByText("Nhiệm vụ đang xếp hàng")).toBeInTheDocument();
    expect(screen.getByText(/"Chiến dịch Tết Trung Thu giảm giá 20%"/)).toBeInTheDocument();

    // 4. Locked/required agents indicate 1 waiting task
    expect(screen.getAllByText("1 nhiệm vụ đang chờ nhân sự này")).toHaveLength(3);

    // 5. Operator clicks "Hủy" on the waiting card
    const cancelBtn = screen.getByTitle("Hủy nhiệm vụ khỏi hàng chờ");
    fireEvent.click(cancelBtn);

    // Queue badge and waiting card should disappear
    expect(screen.queryByText(/Hàng chờ: 1/)).not.toBeInTheDocument();
    expect(screen.queryByText("Nhiệm vụ đang xếp hàng")).not.toBeInTheDocument();
  });

  it("executes independent tasks across different departments concurrently", async () => {
    vi.useFakeTimers();
    const authClient = fakeAuthClient();
    const api = fakeAgenticApi();
    const inventoryApi = fakeInventoryApi();
    const supportApi = fakeSupportApi();

    render(
      <AuthProvider client={authClient}>
        <MemoryRouter>
          <AgenticCommandCenter
            api={api}
            inventoryApi={inventoryApi}
            supportApi={supportApi}
          />
        </MemoryRouter>
      </AuthProvider>,
    );

    // 1. Submit task to Operations (requires inventory_specialist, order_coordinator)
    const opsInput = screen.getByPlaceholderText("Giao việc cho Vận hành & Kho...");
    fireEvent.change(opsInput, { target: { value: "Kiểm toán tồn kho định mức an toàn" } });
    fireEvent.submit(opsInput.closest("form")!);

    // 2. Concurrently submit task to Support (requires support_steward, crm_specialist)
    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");
    fireEvent.change(supportInput, { target: { value: "Xử lý khiếu nại khách hàng VIP" } });
    fireEvent.submit(supportInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Neither task should be queued because resources do not conflict
    expect(screen.queryByText(/Hàng chờ:/)).not.toBeInTheDocument();

    // Fast-forward through both workflows
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(inventoryApi.generateOperationsProposal).toHaveBeenCalled();
    expect(supportApi.generateSupportProposal).toHaveBeenCalled();
  });

  it("automatically dequeues and executes queued task when the conflicting resource is freed", async () => {
    vi.useFakeTimers();
    const authClient = fakeAuthClient();
    const api = fakeAgenticApi();
    const marketingApi = fakeMarketingApi();
    const catalogApi = fakeCatalogApi();

    render(
      <AuthProvider client={authClient}>
        <MemoryRouter>
          <AgenticCommandCenter
            api={api}
            marketingApi={marketingApi}
            catalogApi={catalogApi}
          />
        </MemoryRouter>
      </AuthProvider>,
    );

    // 1. Marketing starts a task locking marketing_visual
    const mktInput = screen.getByPlaceholderText("Giao việc cho Tiếp thị & Sáng tạo...");
    fireEvent.change(mktInput, { target: { value: "Soạn bài viết và vẽ poster mới" } });
    fireEvent.submit(mktInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // 2. Queue Merchandising task that needs marketing_visual
    const merchInput = screen.getByPlaceholderText("Giao việc cho Danh mục & Định giá...");
    fireEvent.change(merchInput, { target: { value: "Chiến dịch Tết Trung Thu giảm giá 20%" } });
    fireEvent.submit(merchInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByText(/Hàng chờ: 1/)).toBeInTheDocument();

    // 3. Fast-forward until Marketing completes and releases its locks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // 4. Queued task auto-dequeues and starts executing!
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // Merchandising campaign proposal should have been generated!
    expect(catalogApi.generateCampaignProposal).toHaveBeenCalledWith({
      prompt: "Chiến dịch Tết Trung Thu giảm giá 20%",
    });

    // Queue badge should be gone
    expect(screen.queryByText(/Hàng chờ: 1/)).not.toBeInTheDocument();
  });
});

function fakeAuthClient(): AuthClient {
  return {
    getSession: vi.fn(async () => null),
    signIn: vi.fn(async () => undefined),
    completeSignIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function fakeAgenticApi(): AgenticOperationsApi {
  return {
    overview: vi.fn(),
    listTasks: vi.fn(),
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
    listApprovals: vi.fn(),
    loadApproval: vi.fn(),
    decideApproval: vi.fn(),
    listEmployees: vi.fn(),
    loadEmployee: vi.fn(),
    listAudit: vi.fn(),
  };
}

function fakeMarketingApi(): MarketingApi {
  return {
    listCampaigns: vi.fn(async () => ({ items: [], total: 0 })),
    getCampaign: vi.fn(async (id: string) => ({
      campaign: {
        id,
        name: "Test Campaign",
        state: "content_drafting" as const,
        objective: "Objective",
        subjectKind: "free_topic" as const,
        subjectReference: "san-pham",
        language: "vi" as const,
        mandatoryMessage: "Message",
        prohibitedClaims: [],
        callToAction: "CTA",
        facebookPageConfigurationId: "page-1",
        scheduledFor: "2026-09-10T00:00:00Z",
        deadline: "2026-09-11T00:00:00Z",
        approverId: "approver-1",
        maximumCostMicros: 500000,
        createdAt: "2026-09-10T00:00:00Z",
        updatedAt: "2026-09-10T00:00:00Z",
      },
      artifacts: [],
      visualAssets: [],
    })),
    createCampaign: vi.fn(async (body: any) => ({
      id: "camp-1",
      name: body.campaignName,
      state: "draft" as const,
      objective: body.objective,
      subjectKind: body.subjectKind,
      subjectReference: body.subjectReference,
      language: body.language,
      mandatoryMessage: body.mandatoryMessage,
      prohibitedClaims: body.prohibitedClaims,
      callToAction: body.callToAction,
      facebookPageConfigurationId: body.facebookPageConfigurationId,
      scheduledFor: body.scheduledFor,
      deadline: body.deadline,
      approverId: body.approverId,
      maximumCostMicros: body.maximumCostMicros,
      createdAt: "2026-09-10T00:00:00Z",
      updatedAt: "2026-09-10T00:00:00Z",
    })),
    markReady: vi.fn(async () => undefined),
    requestRevision: vi.fn(async () => undefined),
    generateDeliverables: vi.fn(async () => ({ items: [] })),
    approveCampaign: vi.fn(),
    retryPublication: vi.fn(),
    cancelCampaign: vi.fn(),
  };
}

function fakeCatalogApi(): CatalogApi {
  return {
    getActiveCampaign: vi.fn(async () => null),
    generateCampaignProposal: vi.fn(async (params: any) => ({
      id: "prop-1",
      name: params.prompt,
      slug: "test-slug",
      prompt: params.prompt,
      themeKey: "general",
      badgeText: "Ưu đãi",
      discountPercent: 20,
      startTime: "2026-09-10T00:00:00Z",
      endTime: "2026-09-17T00:00:00Z",
      pricingRationale: "Rationale",
      salesProjection: "Projection",
      items: [],
    })),
    generateMerchandisingProposal: vi.fn(),
    activateCampaign: vi.fn(),
    applyMerchandisingProposal: vi.fn(),
    revertCampaign: vi.fn(),
  };
}

function fakeInventoryApi(): InventoryApi {
  return {
    getInventorySummary: vi.fn(async () => ({
      totalItems: 10,
      lowStockCount: 2,
      outOfStockCount: 0,
      totalEstimatedProcurementCostVnd: 5000000,
    })),
    generateOperationsProposal: vi.fn(async (prompt: string) => ({
      id: "ops-prop-1",
      totalRestockUnits: 15,
      totalEstimatedCostVnd: 4500000,
      docxFilename: "bao_cao_kho.docx",
      createdAt: "2026-09-10T00:00:00Z",
      status: "pending_approval" as const,
      items: [],
    })),
    applyOperationsProposal: vi.fn(),
    downloadAuditDocx: vi.fn(),
  };
}

function fakeSupportApi(): SupportOperationsApi {
  return {
    generateSupportProposal: vi.fn(async () => ({
      id: "supp-prop-1",
      docxFilename: "bao_cao_cskh.docx",
      status: "pending_approval" as const,
      tickets: [],
      vipCustomers: [],
    })),
    applySupportProposal: vi.fn(),
    downloadSupportDocx: vi.fn(),
  };
}
