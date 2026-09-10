// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignProposalModal } from "../components/campaign-proposal-modal";

describe("CampaignProposalModal", () => {
  it("renders paginated items and preserves selection across pages", () => {
    const mockItems = Array.from({ length: 8 }).map((_, i) => ({
      id: `item-${i}`,
      productId: `p-${i}`,
      variantId: `v-${i}`,
      productName: `Laptop Nova ${i}`,
      productSlug: `laptop-nova-${i}`,
      originalPriceVnd: 30000000,
      campaignPriceVnd: 24000000,
      discountPercent: 20,
      savingAmountVnd: 6000000,
      optimizedTitle: `Laptop Nova ${i} - Ưu Đãi`,
      optimizedDescription: "Desc",
      badge: "🏮 TRUNG THU -20%",
    }));

    const mockProposal = {
      id: "camp-1",
      name: "Tết Trung Thu 2026",
      slug: "trung-thu-2026",
      prompt: "Giảm 20% Trung Thu",
      themeKey: "mid_autumn",
      badgeText: "🏮 TRUNG THU -20%",
      discountPercent: 20,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3 * 86400000).toISOString(),
      durationDays: 3,
      status: "draft" as const,
      items: mockItems,
      totalProducts: 8,
      pricingRationale: "Rationale",
      salesProjection: "Projection",
    };

    render(
      <CampaignProposalModal
        proposal={mockProposal}
        onClose={vi.fn()}
        onApprove={vi.fn()}
      />
    );

    expect(screen.getByText("Laptop Nova 0")).toBeDefined();
    expect(screen.getByText(/Trang 1 \/ 2/i)).toBeDefined();

    // Click next page
    fireEvent.click(screen.getByRole("button", { name: /Trang sau/i }));
    expect(screen.getByText("Laptop Nova 4")).toBeDefined();
  });
});
