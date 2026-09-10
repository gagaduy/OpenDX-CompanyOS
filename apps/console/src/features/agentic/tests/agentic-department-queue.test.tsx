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

    // 1. Marketing initiates a task which locks marketing_copywriter
    const mktInput = screen.getByPlaceholderText("Giao việc cho Tiếp thị & Sáng tạo...");
    fireEvent.change(mktInput, { target: { value: "Soạn bài viết và vẽ poster mới" } });
    fireEvent.submit(mktInput.closest("form")!);

    // Advance timer slightly to enter running state
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // 2. While Marketing is busy with task 1, submit another Marketing task
    fireEvent.change(mktInput, { target: { value: "Viết thêm bài Flash Sale cuối tuần" } });
    fireEvent.submit(mktInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // 3. Marketing should now show a queue badge in the header and a waiting card
    expect(screen.getByText(/Hàng chờ: 1/)).toBeInTheDocument();
    expect(screen.getByText("Nhiệm vụ đang xếp hàng")).toBeInTheDocument();
    expect(screen.getByText(/"Viết thêm bài Flash Sale cuối tuần"/)).toBeInTheDocument();

    // 4. Only the locked initial agent indicates 1 waiting task (other agents in dept do not)
    expect(screen.getAllByText("1 nhiệm vụ đang chờ nhân sự này")).toHaveLength(1);

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

    // 1. Marketing starts task 1 locking marketing_copywriter
    const mktInput = screen.getByPlaceholderText("Giao việc cho Tiếp thị & Sáng tạo...");
    fireEvent.change(mktInput, { target: { value: "Soạn bài viết và vẽ poster mới" } });
    fireEvent.submit(mktInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // 2. Queue 2nd task to Marketing (conflicts on marketing_copywriter)
    fireEvent.change(mktInput, { target: { value: "Bài viết số 2 về Flash Sale" } });
    fireEvent.submit(mktInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.getByText(/Hàng chờ: 1/)).toBeInTheDocument();

    // 3. Fast-forward until Marketing task 1 completes and releases its locks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    // 4. Queued task auto-dequeues and finishes!
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    // Marketing createCampaign called for both tasks
    expect(marketingApi.createCampaign).toHaveBeenCalledTimes(2);

    // Queue badge should be gone
    expect(screen.queryByText(/Hàng chờ: 1/)).not.toBeInTheDocument();
  });

  it("executes local step 1 immediately and pauses at mid-step handoff when external resource is busy", async () => {
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

    // 1. Marketing initiates a task which will lock marketing_visual
    const mktInput = screen.getByPlaceholderText("Giao việc cho Tiếp thị & Sáng tạo...");
    fireEvent.change(mktInput, { target: { value: "Bài viết ra mắt điện thoại flagship" } });
    fireEvent.submit(mktInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // 2. While Marketing is running, submit a Merchandising campaign task that needs marketing_visual
    const merchInput = screen.getByPlaceholderText("Giao việc cho Danh mục & Định giá...");
    fireEvent.change(merchInput, { target: { value: "Chiến dịch Tết Trung Thu giảm giá 20%" } });
    fireEvent.submit(merchInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // Merchandising is NOT queued at the front door!
    // Cây bút Sản phẩm (Catalog Copywriter) is running immediately!
    expect(screen.getByText(/Cây bút Sản phẩm đang tối ưu tiêu đề SEO cho: "Chiến dịch Tết Trung Thu/)).toBeInTheDocument();

    // 3. Step 1 completes (800ms). Merchandising now reaches Step 2 (needs marketing_visual).
    // Because marketing_visual is locked by Marketing, Merchandising pauses in mid-step handoff waiting!
    await act(async () => {
      await vi.advanceTimersByTimeAsync(850);
    });

    // Catalog copywriter is completed
    expect(screen.getByText("Đã hoàn tất tối ưu tên & mô tả SEO")).toBeInTheDocument();
    // Mid-step handoff card is displayed with waiting badge
    expect(screen.getByText("Chờ bàn giao liên phòng")).toBeInTheDocument();
    expect(screen.getByText(/Đã xong bước 1. Đang đợi Thiết kế Đồ họa/)).toBeInTheDocument();
  });

  it("executes employees sequentially within a department instead of flashing simultaneously", async () => {
    vi.useFakeTimers();
    const authClient = fakeAuthClient();
    const api = fakeAgenticApi();
    const marketingApi = fakeMarketingApi();

    render(
      <AuthProvider client={authClient}>
        <MemoryRouter>
          <AgenticCommandCenter api={api} marketingApi={marketingApi} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const mktInput = screen.getByPlaceholderText("Giao việc cho Tiếp thị & Sáng tạo...");
    fireEvent.change(mktInput, { target: { value: "Viết bài truyền thông sản phẩm mới" } });
    fireEvent.submit(mktInput.closest("form")!);

    // Step 1: Copywriter is running, Visual and Publisher are idle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText(/Cây bút Sáng tạo đang soạn nội dung/)).toBeInTheDocument();
    expect(screen.queryByText(/Thiết kế Đồ họa đang dựng poster/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Điều phối Đăng bài đang chuẩn bị/)).not.toBeInTheDocument();

    // Step 2: Advance timer by 850ms -> Copywriter completes, Visual Designer runs
    await act(async () => {
      await vi.advanceTimersByTimeAsync(850);
    });

    expect(screen.getByText("Đã hoàn thành soạn thảo bài viết và bộ hashtag")).toBeInTheDocument();
    expect(screen.getByText("Thiết kế Đồ họa đang dựng poster và banner...")).toBeInTheDocument();
    expect(screen.queryByText(/Điều phối Đăng bài đang chuẩn bị/)).not.toBeInTheDocument();

    // Step 3: Advance timer by 850ms -> Visual completes, Publisher runs
    await act(async () => {
      await vi.advanceTimersByTimeAsync(850);
    });

    expect(screen.getByText("Đã hoàn thành thiết kế poster & banner chiến dịch")).toBeInTheDocument();
    expect(screen.getByText("Điều phối Đăng bài đang chuẩn bị gói xuất bản Fanpage...")).toBeInTheDocument();
  });

  it("renders animated connecting beam ('Sợi dây kết nối') across departments during collaborative handoff (both outgoing and return)", async () => {
    vi.useFakeTimers();
    const authClient = fakeAuthClient();
    const api = fakeAgenticApi();
    const catalogApi = fakeCatalogApi();

    render(
      <AuthProvider client={authClient}>
        <MemoryRouter>
          <AgenticCommandCenter api={api} catalogApi={catalogApi} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const merchInput = screen.getByPlaceholderText("Giao việc cho Danh mục & Định giá...");
    fireEvent.change(merchInput, { target: { value: "Chiến dịch Tết Sale 30% kèm poster" } });
    fireEvent.submit(merchInput.closest("form")!);

    // Step 1: Catalog copywriter is running
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByTestId("cross-dept-connector")).not.toBeInTheDocument();

    // Step 2: Visual cross-department handoff occurs -> Chiều đi Connecting Wire renders!
    await act(async () => {
      await vi.advanceTimersByTimeAsync(850);
    });

    const connector = screen.getByTestId("cross-dept-connector");
    expect(connector).toBeInTheDocument();
    expect(screen.getByText("⚡ Bàn giao: Yêu cầu Thiết kế Poster & Banner 3D")).toBeInTheDocument();

    // Step 2b: Visual completes and hands back -> Chiều về Connecting Wire renders!
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1050);
    });

    expect(screen.getByText("⚡ Bàn giao lại: Hoàn tất Poster & Banner ➔ Danh mục")).toBeInTheDocument();

    // Step 3: Fast forward through return handoff -> Connecting Wire unmounts
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1050);
    });
    expect(screen.queryByTestId("cross-dept-connector")).not.toBeInTheDocument();
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
    generateDeliverables: vi.fn(async () => ({ items: [], total: 0 })),
    approveCampaign: vi.fn(),
    retryPublication: vi.fn(),
    cancelCampaign: vi.fn(),
  } as unknown as MarketingApi;
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
  } as unknown as CatalogApi;
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
  } as unknown as InventoryApi;
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
  } as unknown as SupportOperationsApi;
}
