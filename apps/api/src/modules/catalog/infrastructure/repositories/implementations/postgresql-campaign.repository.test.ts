// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { PostgresqlCampaignRepository } from "./postgresql-campaign.repository";

describe("PostgresqlCampaignRepository", () => {
  it("creates and retrieves campaign draft records", async () => {
    const mockSession = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: "camp-123",
            name: "Test Campaign",
            slug: "test-campaign",
            prompt: "Sale 20%",
            theme_key: "mid_autumn",
            badge_text: "SALE -20%",
            discount_percent: 20,
            start_time: new Date(),
            end_time: new Date(),
            status: "draft",
            created_by: "staff-1",
          }],
        })
        .mockResolvedValueOnce({
          rows: [],
        }),
    };

    const repo = new PostgresqlCampaignRepository();
    const result = await repo.getById(mockSession as any, "camp-123");
    expect(result?.id).toBe("camp-123");
    expect(result?.discountPercent).toBe(20);
  });
});
