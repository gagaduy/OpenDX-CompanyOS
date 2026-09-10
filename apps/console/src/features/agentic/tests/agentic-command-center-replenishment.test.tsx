// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../authentication/hooks/auth-context";
import { AgenticCommandCenter } from "../components/agentic-command-center";

describe("AgenticCommandCenter proactive replenishment alert", () => {
  it("renders proactive replenishment amber alert card and badge when pending proposal exists", async () => {
    const user = userEvent.setup();
    const mockInventoryApi = {
      getPendingReplenishment: vi.fn().mockResolvedValue({
        id: "prop-auto-1",
        triggerSource: "scheduled_cron",
        status: "pending_review",
        summary: "Phát hiện 2 SKU có nguy cơ thiếu hàng do tốc độ bán tăng mạnh.",
        items: [
          {
            sku: "SKU-A",
            variantId: "v-a",
            productId: "p-a",
            productName: "Chuột Gaming Apex",
            productSlug: "chuot-gaming-apex",
            categoryName: "Linh kiện",
            currentOnHand: 3,
            currentReserved: 1,
            availableQuantity: 2,
            recentUnitsSold7d: 14,
            safetyStockThreshold: 10,
            stockStatus: "critical_low",
            recommendedRestockQuantity: 20,
            estimatedUnitCostVnd: 450000,
            estimatedTotalCostVnd: 9000000,
            actionRationale: "Bán 14 cái trong tuần",
          },
          {
            sku: "SKU-B",
            variantId: "v-b",
            productId: "p-b",
            productName: "Bàn phím cơ Mini",
            productSlug: "ban-phim-mini",
            categoryName: "Linh kiện",
            currentOnHand: 4,
            currentReserved: 0,
            availableQuantity: 4,
            recentUnitsSold7d: 8,
            safetyStockThreshold: 10,
            stockStatus: "critical_low",
            recommendedRestockQuantity: 15,
            estimatedUnitCostVnd: 800000,
            estimatedTotalCostVnd: 12000000,
            actionRationale: "Tồn thấp",
          },
        ],
        totalRestockUnits: 35,
        totalEstimatedBudgetVnd: 21000000,
        createdAt: "2026-09-10T12:00:00.000Z",
      }),
      dismissReplenishmentProposal: vi.fn().mockResolvedValue(undefined),
      applyOperationsProposal: vi.fn().mockResolvedValue({ appliedCount: 2 }),
      downloadOperationsDocx: vi.fn().mockResolvedValue(undefined),
    };

    const authClient = {
      getSession: vi.fn(async () => ({ user: { id: "test-user" } })),
      signIn: vi.fn(async () => undefined),
      completeSignIn: vi.fn(),
      signOut: vi.fn(),
    };

    const fakeApi = {
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

    render(
      <AuthProvider client={authClient as any}>
        <MemoryRouter>
          <AgenticCommandCenter api={fakeApi as any} inventoryApi={mockInventoryApi as any} />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText(/Đề xuất nhập kho AI: 2 SKU/i)).toBeInTheDocument();
    expect(screen.getByText(/Phát hiện 2 mặt hàng sắp cạn kiệt/i)).toBeInTheDocument();
    expect(screen.getByText(/Phát hiện 2 SKU có nguy cơ thiếu hàng/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Xem & Duyệt Nhập hàng/i })).toBeInTheDocument();

    // Click dismiss button
    const dismissBtn = screen.getByRole("button", { name: /Bỏ qua/i });
    await user.click(dismissBtn);

    expect(mockInventoryApi.dismissReplenishmentProposal).toHaveBeenCalledWith("prop-auto-1");
  });
});
