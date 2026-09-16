/**
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthClient } from "../../authentication/api/oidc-manager";
import { AuthProvider } from "../../authentication/hooks/auth-context";
import type { AgenticOperationsApi } from "../api/agentic-api";
import type { AgenticTaskPage } from "../types/agentic.types";
import { AgenticCommandCenter } from "../components/agentic-command-center";
import type { MarketingApi } from "../../marketing/api/marketing-api";
import type { CatalogApi } from "../../catalog/api/catalog-api";
import type { InventoryApi } from "../../inventory/api/inventory-api";
import type { SupportOperationsApi } from "../../support/api/support-api";
import type { AiSupportTicketItemView } from "../../support/types/support.types";

describe("AgenticCommandCenter Department Task Queue & Direct Input Unblocking", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates approved and canceled decisions from persistent command activity", async () => {
    const api = fakeAgenticApi();
    const supportEvent = {
        id: "00000000-0000-4000-8000-000000000030", actorId: "admin", department: "support",
        decision: "approved", resourceType: "support_proposal", resourceId: "support-proposal-1",
        summary: "Đã gửi phản hồi sản phẩm lỗi cho khách hàng.", idempotencyKey: "support:approved",
        occurredAt: "2026-09-15T01:10:00.000Z",
      } as const;
    vi.mocked(api.listCommandActivity).mockResolvedValue([
      supportEvent,
      supportEvent,
      {
        id: "00000000-0000-4000-8000-000000000031", actorId: "admin", department: "operations",
        decision: "canceled", resourceType: "operations_proposal", resourceId: "operations-proposal-1",
        summary: "Đề xuất nhập kho không còn phù hợp.", idempotencyKey: "operations:canceled",
        occurredAt: "2026-09-15T01:09:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000032", actorId: "admin", department: "marketing",
        decision: "approved", resourceType: "marketing_campaign", resourceId: "marketing-campaign-1",
        summary: "Đã xuất bản chiến dịch.", idempotencyKey: "marketing:approved",
        occurredAt: "2026-09-15T01:08:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000033", actorId: "admin", department: "merchandising",
        decision: "canceled", resourceType: "merchandising_proposal", resourceId: "merchandising-proposal-1",
        summary: "Đã hủy đề xuất giá.", idempotencyKey: "merchandising:canceled",
        occurredAt: "2026-09-15T01:07:00.000Z",
      },
      {
        id: "source:support_ai_proposal_decisions:00000000-0000-4000-8000-000000000034",
        actorId: "staff-support", department: "support", decision: "canceled",
        resourceType: "support_proposal", resourceId: "support-proposal-2",
        summary: "Đã hủy kịch bản phản hồi CSKH.",
        occurredAt: "2026-09-15T01:06:00.000Z", source: "business_history",
        sourceTable: "support_ai_proposal_decisions", sourceId: "00000000-0000-4000-8000-000000000034",
      },
    ]);

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter><AgenticCommandCenter api={api} /></MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("CSKH đã được phê duyệt")).toBeInTheDocument();
    expect(screen.getAllByText("CSKH đã được phê duyệt")).toHaveLength(1);
    expect(await screen.findByText("Vận hành đã hủy duyệt")).toBeInTheDocument();
    expect(await screen.findByText("Marketing đã được phê duyệt")).toBeInTheDocument();
    expect(await screen.findByText("Danh mục & Định giá đã hủy duyệt")).toBeInTheDocument();
    expect(await screen.findByText("CSKH đã hủy duyệt")).toBeInTheDocument();
    expect(api.listCommandActivity).toHaveBeenCalled();
  });

  it("retains an older CSKH approval when newer Marketing events fill the feed", async () => {
    const api = fakeAgenticApi();
    vi.mocked(api.listCommandActivity).mockResolvedValue([
      ...Array.from({ length: 31 }, (_, index) => ({
        id: `marketing-${index}`, actorId: "staff-marketing", department: "marketing" as const,
        decision: "approved" as const, resourceType: "marketing_campaign" as const,
        resourceId: `campaign-${index}`, summary: `Campaign ${index}`,
        occurredAt: `2026-09-15T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
        source: "business_history" as const,
      })),
      { id: "support-historical", department: "support" as const,
        decision: "approved" as const, resourceType: "support_proposal" as const,
        resourceId: "support-proposal-older", summary: "Đã gửi phản hồi cho khách hàng.",
        occurredAt: "2026-09-13T22:50:00.000Z", source: "business_history" as const },
    ]);
    render(<AuthProvider client={fakeAuthClient()}><MemoryRouter><AgenticCommandCenter api={api} /></MemoryRouter></AuthProvider>);
    fireEvent.change(screen.getByDisplayValue("Tất cả phòng ban"), { target: { value: "support" } });
    expect(await screen.findByText("CSKH đã được phê duyệt")).toBeInTheDocument();
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

  it("routes an explicit natural-language Operations instruction ahead of discount keywords", async () => {
    vi.useFakeTimers();
    const inventoryApi = fakeInventoryApi();
    const catalogApi = fakeCatalogApi();
    const prompt =
      "Hiện cửa hàng đang chuẩn bị chạy chương trình giảm giá sản phẩm, bạn hãy giao cho phòng Vận hành kiểm tra lượng tồn kho, tình trạng đơn hàng và khả năng đáp ứng của các sản phẩm tham gia chương trình.";

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter
            api={fakeAgenticApi()}
            inventoryApi={inventoryApi}
            catalogApi={catalogApi}
          />
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.change(
      screen.getByPlaceholderText(/Hãy giao việc chiến lược cho AI CEO/),
      { target: { value: prompt } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_250);
    });

    expect(screen.getByText("Phòng Vận hành & Kho vận")).toBeInTheDocument();
    expect(screen.queryByText("Phòng Danh mục & Định giá (Phối hợp Tiếp thị)")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });

    expect(inventoryApi.generateOperationsProposal).toHaveBeenCalledWith(prompt);
    expect(catalogApi.generateCampaignProposal).not.toHaveBeenCalled();
  });

  it("routes natural-language customer email campaign instructions to Support ahead of catalog keywords", async () => {
    vi.useFakeTimers();
    const supportApi = fakeSupportApi();
    const catalogApi = fakeCatalogApi();
    const prompt =
      "Đợt này bên danh mục vừa cập nhật các sản phẩm mới ra mắt, hãy soạn mail và gửi cho tất cả  khách hàng nha";

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter
            api={fakeAgenticApi()}
            supportApi={supportApi}
            catalogApi={catalogApi}
          />
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.change(
      screen.getByPlaceholderText(/Hãy giao việc chiến lược cho AI CEO/),
      { target: { value: prompt } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_250);
    });

    expect(screen.getByText("Phòng CSKH & Trải nghiệm Khách hàng")).toBeInTheDocument();
    expect(screen.queryByText("Phòng Danh mục & Định giá (Phối hợp Tiếp thị)")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });

    expect(supportApi.createEmailCampaignProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "new_product_announcement",
        targetSegment: "all_active_customers",
        prompt,
      }),
    );
    expect(catalogApi.generateCampaignProposal).not.toHaveBeenCalled();
  });

  it("routes 'lên ý tưởng gửi mail cho toàn bộ khách hàng' to Support and selects all_active_customers segment", async () => {
    vi.useFakeTimers();
    const supportApi = fakeSupportApi();
    const prompt = "lên ý tưởng gửi mail cho toàn bộ khách hàng";

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter
            api={fakeAgenticApi()}
            supportApi={supportApi}
          />
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.change(
      screen.getByPlaceholderText(/Hãy giao việc chiến lược cho AI CEO/),
      { target: { value: prompt } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_250);
    });

    expect(screen.getByText("Phòng CSKH & Trải nghiệm Khách hàng")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });

    expect(supportApi.createEmailCampaignProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSegment: "all_active_customers",
        prompt,
      }),
    );
  });

  it("opens the completed Support report and keeps its action in the approval inbox", async () => {
    vi.useFakeTimers();
    const authClient = fakeAuthClient();
    const supportApi = fakeSupportApi();

    render(
      <AuthProvider client={authClient}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeAgenticApi()} supportApi={supportApi} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");
    fireEvent.change(supportInput, { target: { value: "Rà soát ticket cần phản hồi" } });
    fireEvent.submit(supportInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByRole("dialog", { name: "Duyệt nội dung email CSKH" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Đóng" })[0]!);

    expect(screen.queryByRole("dialog", { name: "Duyệt nội dung email CSKH" })).not.toBeInTheDocument();
    expect(screen.getByText("Kịch bản phản hồi CSKH (0 Ticket) & Voucher VIP")).toBeInTheDocument();
  });

  it("hydrates the latest completed Support email event when the command center loads", async () => {
    const generatedApi = fakeSupportApi(supportEmailDrafts);
    const supportApi = {
      ...generatedApi,
      getLatestSupportProposal: vi.fn(async () => ({
        id: "supp-prop-restored",
        prompt: "Soạn email chăm sóc khách hàng",
        overallSentimentSummary: "Hai khách hàng đã được phản hồi.",
        churnRiskAssessment: "Rủi ro rời bỏ đã được xử lý.",
        recommendedAction: "Theo dõi mức độ hài lòng.",
        docxFilename: "bao_cao_cskh.docx",
        status: "applied" as const,
        tickets: supportEmailDrafts,
        vipCustomers: [],
        totalTickets: supportEmailDrafts.length,
        createdAt: "2026-09-13T23:00:00.000Z",
      })),
    };

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeAgenticApi()} supportApi={supportApi} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("CSKH đã gửi email phản hồi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem kết quả" })).toBeInTheDocument();
  });

  it("does not restore a canceled Support proposal to the approval inbox after refresh", async () => {
    const generatedApi = fakeSupportApi(supportEmailDrafts);
    const supportApi: SupportOperationsApi = {
      ...generatedApi,
      getLatestSupportProposal: vi.fn(async () => ({
        id: "supp-prop-canceled",
        prompt: "Soạn email chăm sóc khách hàng",
        overallSentimentSummary: "Hai phản hồi đã bị hủy duyệt.",
        churnRiskAssessment: "Rủi ro trung bình.",
        recommendedAction: "Chờ chỉ đạo mới.",
        docxFilename: "bao_cao_cskh.docx",
        status: "canceled" as const,
        tickets: supportEmailDrafts,
        vipCustomers: [],
        totalTickets: supportEmailDrafts.length,
        createdAt: "2026-09-15T03:00:00.000Z",
      })),
    };

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter><AgenticCommandCenter api={fakeAgenticApi()} supportApi={supportApi} /></MemoryRouter>
      </AuthProvider>,
    );

    await act(async () => Promise.resolve());
    expect(screen.queryByText("Kịch bản phản hồi CSKH (2 Ticket) & Voucher VIP")).not.toBeInTheDocument();
  });

  it("shows a durable CSKH cancellation immediately when the secondary activity POST fails", async () => {
    vi.useFakeTimers();
    const api = fakeAgenticApi();
    const supportApi = fakeSupportApi();
    vi.mocked(api.recordCommandActivity).mockRejectedValue(new Error("activity POST unavailable"));
    vi.mocked(api.listCommandActivity)
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: "source:support_ai_proposal_decisions:decision-1",
        actorId: "staff-support", department: "support", decision: "canceled",
        resourceType: "support_proposal", resourceId: "supp-prop-1",
        summary: "Đã hủy kịch bản phản hồi CSKH.",
        occurredAt: "2026-09-15T03:01:00.000Z", source: "business_history",
        sourceTable: "support_ai_proposal_decisions", sourceId: "decision-1" }]);
    render(<AuthProvider client={fakeAuthClient()}><MemoryRouter><AgenticCommandCenter api={api} supportApi={supportApi} /></MemoryRouter></AuthProvider>);
    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");
    fireEvent.change(supportInput, { target: { value: "Soạn email chăm sóc khách hàng" } });
    fireEvent.submit(supportInput.closest("form")!);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    fireEvent.click(screen.getAllByRole("button", { name: "Đóng" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Hủy duyệt" }));
    await act(async () => Promise.resolve());
    expect(screen.queryByText("CSKH đã hủy duyệt")).toBeInTheDocument();
    expect(api.listCommandActivity).toHaveBeenCalledTimes(2);
  });

  it("renders generated customer emails in the completed Support approval modal", async () => {
    vi.useFakeTimers();
    const supportApi = fakeSupportApi(supportEmailDrafts);

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeAgenticApi()} supportApi={supportApi} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");
    fireEvent.change(supportInput, { target: { value: "Soạn email chăm sóc khách hàng" } });
    fireEvent.submit(supportInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByRole("dialog", { name: "Duyệt nội dung email CSKH" })).toBeInTheDocument();
    expect(screen.getByText("an.nguyen@example.com")).toBeInTheDocument();
    expect(screen.getByText("binh.tran@example.com")).toBeInTheDocument();
    expect(screen.getByText(/NovaCommerce thành thật xin lỗi vì đơn hàng giao trễ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phê duyệt & gửi đã chọn (2)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Phê duyệt & gửi tất cả còn lại" })).toBeEnabled();
    expect(screen.getByText("Kịch bản phản hồi CSKH (2 Ticket) & Voucher VIP")).toBeInTheDocument();
  });

  it("keeps unselected Support emails pending after approving a selected subset", async () => {
    vi.useFakeTimers();
    const supportApi = fakeSupportApi(supportEmailDrafts);

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeAgenticApi()} supportApi={supportApi} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");
    fireEvent.change(supportInput, { target: { value: "Soạn email chăm sóc khách hàng" } });
    fireEvent.submit(supportInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn email gửi tới Trần Bình" }));
    fireEvent.click(screen.getByRole("button", { name: "Phê duyệt & gửi đã chọn (1)" }));
    await act(async () => undefined);

    expect(screen.queryByText("an.nguyen@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("binh.tran@example.com")).toBeInTheDocument();
    expect(screen.getByText("Kịch bản phản hồi CSKH (1 Ticket) & Voucher VIP")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Duyệt nội dung email CSKH" })).toBeInTheDocument();
  });

  it("approves every remaining Support email from the full-batch action", async () => {
    vi.useFakeTimers();
    const supportApi = fakeSupportApi(supportEmailDrafts);

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeAgenticApi()} supportApi={supportApi} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");
    fireEvent.change(supportInput, { target: { value: "Soạn email chăm sóc khách hàng" } });
    fireEvent.submit(supportInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Phê duyệt & gửi tất cả còn lại" }));
    await act(async () => undefined);

    expect(screen.queryByRole("dialog", { name: "Duyệt nội dung email CSKH" })).not.toBeInTheDocument();
    expect(screen.queryByText("Kịch bản phản hồi CSKH (2 Ticket) & Voucher VIP")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("CSKH đã gửi email phản hồi").closest(".ccTimelineItem")!);

    expect(screen.getByRole("dialog", { name: "Duyệt nội dung email CSKH" })).toBeInTheDocument();
    expect(screen.getByText("Đã gửi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Phê duyệt & gửi đã chọn/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Phê duyệt & gửi tất cả còn lại" })).not.toBeInTheDocument();
  });

  it("removes the Support approval immediately while approved emails are still dispatching", async () => {
    vi.useFakeTimers();
    const supportApi = fakeSupportApi(supportEmailDrafts);
    let resolveApply!: (value: unknown) => void;
    vi.mocked(supportApi.applySupportProposal).mockImplementation(
      () => new Promise((resolve) => {
        resolveApply = resolve;
      }),
    );

    render(
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeAgenticApi()} supportApi={supportApi} />
        </MemoryRouter>
      </AuthProvider>,
    );

    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");
    fireEvent.change(supportInput, { target: { value: "Soạn email chăm sóc khách hàng" } });
    fireEvent.submit(supportInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Đóng" })[0]!);
    const approvalTitle = "Kịch bản phản hồi CSKH (2 Ticket) & Voucher VIP";
    const approvalCard = screen.getByText(approvalTitle).closest(".ccApprovalBox");
    expect(approvalCard).not.toBeNull();
    fireEvent.click(within(approvalCard as HTMLElement).getByRole("button", { name: "Phê duyệt" }));

    expect(screen.queryByText(approvalTitle)).not.toBeInTheDocument();

    await act(async () => {
      resolveApply({
        proposalId: "supp-prop-1",
        appliedCount: 2,
        updatedTicketIds: ["ticket-1", "ticket-2"],
        appliedAt: "2026-09-13T18:24:00.000Z",
      });
    });
  });

  it("keeps the completed Support email event visible after the task feed refreshes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T23:00:00+07:00"));
    const supportApi = fakeSupportApi(supportEmailDrafts, "2026-09-13T10:00:00+07:00");
    const api = fakeAgenticApi();
    const renderCommandCenter = (tasks?: AgenticTaskPage) => (
      <AuthProvider client={fakeAuthClient()}>
        <MemoryRouter>
          <AgenticCommandCenter api={api} supportApi={supportApi} tasks={tasks} />
        </MemoryRouter>
      </AuthProvider>
    );
    const view = render(renderCommandCenter());

    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");
    fireEvent.change(supportInput, { target: { value: "Soạn email chăm sóc khách hàng" } });
    fireEvent.submit(supportInput.closest("form")!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Phê duyệt & gửi tất cả còn lại" }));
    await act(async () => undefined);

    const refreshedTasks: AgenticTaskPage = {
      items: Array.from({ length: 30 }, (_, index) => ({
        id: `task-${index}`,
        state: "completed" as const,
        createdBy: "operator-a",
        goal: `Chiến dịch marketing số ${index + 1}`,
        version: 1,
        createdAt: `2026-09-13T${String(19 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10).padStart(2, "0")}:00+07:00`,
        updatedAt: `2026-09-13T${String(19 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10).padStart(2, "0")}:00+07:00`,
      })),
      totalItems: 30,
      refreshedAt: "2026-09-13T23:00:03+07:00",
    };

    view.rerender(renderCommandCenter(refreshedTasks));
    await act(async () => undefined);

    expect(screen.getByText("CSKH đã gửi email phản hồi")).toBeInTheDocument();
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
    listCommandActivity: vi.fn(async () => []),
    recordCommandActivity: vi.fn(),
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

const supportEmailDrafts: readonly AiSupportTicketItemView[] = [
  {
    ticketId: "ticket-email-1",
    customerName: "Nguyễn An",
    customerEmail: "an.nguyen@example.com",
    subject: "Đơn hàng giao trễ",
    sentiment: "frustrated",
    churnRisk: "high",
    issueCategory: "shipping_delay",
    proposedResponse: "NovaCommerce thành thật xin lỗi vì đơn hàng giao trễ và sẽ ưu tiên xử lý ngay.",
    suggestedCompensation: "Voucher giảm 15%",
    priority: "high",
  },
  {
    ticketId: "ticket-email-2",
    customerName: "Trần Bình",
    customerEmail: "binh.tran@example.com",
    subject: "Hỗ trợ kích hoạt bảo hành",
    sentiment: "neutral",
    churnRisk: "low",
    issueCategory: "warranty_inquiry",
    proposedResponse: "NovaCommerce đã tiếp nhận và gửi hướng dẫn kích hoạt bảo hành cho Quý khách.",
    suggestedCompensation: "Không áp dụng voucher",
    priority: "normal",
  },
];

function fakeSupportApi(
  tickets: readonly AiSupportTicketItemView[] = [],
  createdAt = "2026-09-13T18:23:00.000Z",
): SupportOperationsApi {
  return {
    generateSupportProposal: vi.fn(async () => ({
      id: "supp-prop-1",
      prompt: "Soạn email chăm sóc khách hàng",
      overallSentimentSummary: "Hai khách hàng đang chờ phản hồi.",
      churnRiskAssessment: "Một khách hàng có nguy cơ rời bỏ cao.",
      recommendedAction: "Phản hồi trong ngày và cấp voucher phù hợp.",
      docxFilename: "bao_cao_cskh.docx",
      status: "pending_approval" as const,
      tickets,
      vipCustomers: [],
      totalTickets: tickets.length,
      createdAt,
    })),
    applySupportProposal: vi.fn(),
    cancelSupportProposal: vi.fn(async () => ({
      id: "supp-prop-1",
      prompt: "Soạn email chăm sóc khách hàng",
      overallSentimentSummary: "Hai khách hàng đang chờ phản hồi.",
      churnRiskAssessment: "Một khách hàng có nguy cơ rời bỏ cao.",
      recommendedAction: "Phản hồi trong ngày và cấp voucher phù hợp.",
      docxFilename: "bao_cao_cskh.docx",
      status: "canceled" as const,
      tickets,
      vipCustomers: [],
      totalTickets: tickets.length,
      createdAt,
    })),
    downloadSupportDocx: vi.fn(),
    createEmailCampaignProposal: vi.fn(async (input: { type: string; prompt: string; targetSegment?: string }) => ({
      id: "camp-prop-1",
      name: "Chiến dịch sản phẩm mới",
      type: input.type,
      prompt: input.prompt,
      targetSegment: (input.targetSegment || "all_active_customers") as any,
      recipientCount: 10,
      subject: "Khám phá sản phẩm mới",
      emailBodyHtml: "<p>Kính chào quý khách</p>",
      status: "pending_approval",
      createdAt,
      recipients: [],
      featuredProducts: [],
    })),
  } as unknown as SupportOperationsApi;
}
