// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActiveCampaignWidget } from "../components/active-campaign-widget";

describe("ActiveCampaignWidget", () => {
  it("renders countdown and triggers emergency revert after confirmation", () => {
    const onRevert = vi.fn();
    render(
      <ActiveCampaignWidget
        campaign={{
          id: "camp-1",
          name: "Lễ Hội Trung Thu Nova",
          badgeText: "🏮 TRUNG THU -20%",
          discountPercent: 20,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 86400000).toISOString(),
          totalProducts: 4,
          remainingMs: 86400000,
        }}
        onRevert={onRevert}
      />
    );

    expect(screen.getByText(/Lễ Hội Trung Thu Nova/i)).toBeDefined();
    const revertBtn = screen.getByRole("button", { name: /Hoàn nguyên ngay/i });
    fireEvent.click(revertBtn);

    // Confirmation popover appears
    const confirmBtn = screen.getByRole("button", { name: /Xác nhận hoàn nguyên/i });
    fireEvent.click(confirmBtn);
    expect(onRevert).toHaveBeenCalledWith("camp-1");
  });
});
