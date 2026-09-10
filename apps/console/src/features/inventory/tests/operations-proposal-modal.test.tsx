// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OperationsProposalModal } from "../components/operations-proposal-modal";
import type { OperationsProposal } from "../types/inventory.types";

const mockProposal: OperationsProposal = {
  id: "prop-1234-5678",
  prompt: "Kiểm tra và đề xuất nhập kho linh kiện",
  items: [
    {
      variantId: "v-critical",
      productId: "p-critical",
      productName: "Bàn phím cơ Pro",
      productSlug: "ban-phim-co-pro",
      sku: "KB-PRO-01",
      currentOnHand: 4,
      currentReserved: 1,
      availableQuantity: 3,
      safetyStockThreshold: 10,
      stockStatus: "critical_low",
      recommendedRestockQuantity: 17,
      estimatedUnitCostVnd: 650000,
      estimatedTotalCostVnd: 11050000,
      actionRationale: "Tồn khả dụng chỉ còn 3 cái, nguy cơ đứt gãy cao.",
    },
    {
      variantId: "v-slow",
      productId: "p-slow",
      productName: "Chuột không dây Silent",
      productSlug: "chuot-silent",
      sku: "MOUSE-SILENT-02",
      currentOnHand: 35,
      currentReserved: 0,
      availableQuantity: 35,
      safetyStockThreshold: 10,
      stockStatus: "slow_moving",
      recommendedRestockQuantity: 0,
      estimatedUnitCostVnd: 200000,
      estimatedTotalCostVnd: 0,
      actionRationale: "Tồn đọng 35 cái, tốc độ bán chậm.",
    },
    {
      variantId: "v-balanced",
      productId: "p-balanced",
      productName: "Cáp sạc Type-C 100W",
      productSlug: "cap-type-c",
      sku: "CABLE-C-03",
      currentOnHand: 15,
      currentReserved: 2,
      availableQuantity: 13,
      safetyStockThreshold: 10,
      stockStatus: "balanced",
      recommendedRestockQuantity: 0,
      estimatedUnitCostVnd: 80000,
      estimatedTotalCostVnd: 0,
      actionRationale: "Mức tồn ổn định an toàn.",
    },
  ],
  totalItems: 3,
  totalRestockUnits: 17,
  totalEstimatedBudgetVnd: 11050000,
  inventoryHealthSummary: "Đã quét 3 SKU. Phát hiện 1 SKU thiếu hàng khẩn cấp.",
  riskAssessment: "Nguy cơ cháy hàng bàn phím khi có đơn hàng lớn.",
  recommendedAction: "Nhập bổ sung 17 chiếc bàn phím.",
  status: "pending_approval",
  createdAt: "2026-09-09T00:00:00.000Z",
  docxFilename: "bao_cao_kiem_toan_kho.docx",
};

describe("OperationsProposalModal", () => {
  it("renders proposal header, health summary, and items", () => {
    render(
      <OperationsProposalModal
        isOpen={true}
        proposal={mockProposal}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onDownloadDocx={vi.fn()}
      />,
    );

    expect(screen.getByText(/Đề xuất Kiểm toán Tồn kho & Nhập hàng/i)).toBeInTheDocument();
    expect(screen.getByText("KB-PRO-01")).toBeInTheDocument();
    expect(screen.getByText("MOUSE-SILENT-02")).toBeInTheDocument();
    expect(screen.getByText("CABLE-C-03")).toBeInTheDocument();
  });

  it("renders 7-day sales velocity badge when recentUnitsSold7d is provided", () => {
    const proposalWithVelocity: OperationsProposal = {
      ...mockProposal,
      items: [
        {
          ...mockProposal.items[0],
          recentUnitsSold7d: 14,
        },
      ],
    };

    render(
      <OperationsProposalModal
        isOpen={true}
        proposal={proposalWithVelocity}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onDownloadDocx={vi.fn()}
      />,
    );

    expect(screen.getByText(/Đã bán 7 ngày: 14/i)).toBeInTheDocument();
  });

  it("filters items by risk classification tabs", async () => {
    const user = userEvent.setup();
    render(
      <OperationsProposalModal
        isOpen={true}
        proposal={mockProposal}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onDownloadDocx={vi.fn()}
      />,
    );

    // Click Critical Low Tab
    const criticalTab = screen.getByRole("button", { name: /Cạn kiệt/i });
    await user.click(criticalTab);

    expect(screen.getByText("KB-PRO-01")).toBeInTheDocument();
    expect(screen.queryByText("MOUSE-SILENT-02")).not.toBeInTheDocument();
    expect(screen.queryByText("CABLE-C-03")).not.toBeInTheDocument();

    // Click Slow Moving Tab
    const slowTab = screen.getByRole("button", { name: /Tồn đọng/i });
    await user.click(slowTab);

    expect(screen.queryByText("KB-PRO-01")).not.toBeInTheDocument();
    expect(screen.getByText("MOUSE-SILENT-02")).toBeInTheDocument();
    expect(screen.queryByText("CABLE-C-03")).not.toBeInTheDocument();
  });

  it("supports inline quantity editing and dynamic budget recalculation", async () => {
    const user = userEvent.setup();
    const handleApply = vi.fn();

    render(
      <OperationsProposalModal
        isOpen={true}
        proposal={mockProposal}
        onClose={vi.fn()}
        onApply={handleApply}
        onDownloadDocx={vi.fn()}
      />,
    );

    // Initial total units: 17
    expect(screen.getByTestId("total-restock-units")).toHaveTextContent("17");

    // Edit quantity for KB-PRO-01
    const input = screen.getByTestId("qty-input-v-critical") as HTMLInputElement;
    expect(input.value).toBe("17");

    await user.clear(input);
    await user.type(input, "20");

    // Updated total units: 20
    expect(screen.getByTestId("total-restock-units")).toHaveTextContent("20");

    // Click Approve
    const approveBtn = screen.getByRole("button", { name: /Phê duyệt & Nhập kho/i });
    await user.click(approveBtn);

    expect(handleApply).toHaveBeenCalledWith([
      { variantId: "v-critical", restockQuantity: 20 },
      { variantId: "v-slow", restockQuantity: 0 },
      { variantId: "v-balanced", restockQuantity: 0 },
    ]);
  });

  it("calls onTriggerClearanceCampaign when clicking clearance proposal button", async () => {
    const user = userEvent.setup();
    const handleClearance = vi.fn();

    render(
      <OperationsProposalModal
        isOpen={true}
        proposal={mockProposal}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onDownloadDocx={vi.fn()}
        onTriggerClearanceCampaign={handleClearance}
      />,
    );

    const clearanceBtn = screen.getByRole("button", { name: /Đề xuất Chiến dịch Xả hàng Tồn kho/i });
    expect(clearanceBtn).toBeInTheDocument();

    await user.click(clearanceBtn);
    expect(handleClearance).toHaveBeenCalledWith([
      expect.objectContaining({ variantId: "v-slow" }),
    ]);
  });

  it("renders clearance campaign button for stocked items even when no items are slow_moving", async () => {
    const user = userEvent.setup();
    const handleClearance = vi.fn();
    const noSlowProposal: OperationsProposal = {
      ...mockProposal,
      items: mockProposal.items.filter((it) => it.stockStatus !== "slow_moving"),
    };

    render(
      <OperationsProposalModal
        isOpen={true}
        proposal={noSlowProposal}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onDownloadDocx={vi.fn()}
        onTriggerClearanceCampaign={handleClearance}
      />,
    );

    const clearanceBtn = screen.getByRole("button", { name: /Đề xuất Chiến dịch Xả hàng Tồn kho/i });
    expect(clearanceBtn).toBeInTheDocument();

    await user.click(clearanceBtn);
    expect(handleClearance).toHaveBeenCalled();
  });
});
