// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { PostgresqlCampaignRepository } from "./postgresql-campaign.repository";

describe("PostgresqlCampaignRepository", () => {
  it("retrieves a campaign draft with its persisted items", async () => {
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
        .mockResolvedValueOnce({ rows: [] }),
    };

    const result = await new PostgresqlCampaignRepository().getById(mockSession as any, "camp-123");

    expect(result?.id).toBe("camp-123");
    expect(result?.discountPercent).toBe(20);
  });

  it("loads the latest persisted draft campaign for approval recovery", async () => {
    const campaignId = "c9b8b6c9-9d2e-45d3-9312-29c7056c9c2a";
    const session = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM merchandising_campaigns") && sql.includes("status = 'draft'")) {
          return { rows: [{ id: campaignId }] };
        }
        if (sql.includes("SELECT * FROM merchandising_campaigns")) {
          return {
            rows: [{
              id: campaignId,
              name: "Flash Sale Đón Trăng Rằm",
              slug: "flash-sale",
              prompt: "Giảm laptop 15%",
              theme_key: "flash_sale",
              badge_text: "FLASH SALE",
              discount_percent: 15,
              start_time: new Date("2026-09-16T16:58:41.000Z"),
              end_time: new Date("2026-09-23T16:58:41.000Z"),
              status: "draft",
            }],
          };
        }
        return { rows: [] };
      }),
    } as any;

    const proposal = await new PostgresqlCampaignRepository().findLatestDraft(session);

    expect(proposal).toMatchObject({ id: campaignId, status: "draft" });
    expect(session.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY created_at DESC"));
  });
});
