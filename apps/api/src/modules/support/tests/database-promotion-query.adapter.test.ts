// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { DatabasePromotionQueryAdapter } from "../infrastructure/adapters/database-promotion-query.adapter";

describe("DatabasePromotionQueryAdapter", () => {
  it("returns only currently active campaigns with their authoritative product ids", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: "campaign-1",
          name: "Flash Sale Nova Watch",
          discount_percent: 20,
          start_time: new Date("2026-09-16T00:00:00.000Z"),
          end_time: new Date("2026-09-20T00:00:00.000Z"),
          badge_text: "FLASH SALE",
          prompt: "Giảm giá Nova Watch",
          product_ids: ["product-watch", "product-band"],
        }],
      }),
    } as any;

    const campaigns = await new DatabasePromotionQueryAdapter(database).getActiveAndUpcomingCampaigns();

    const sql = vi.mocked(database.query).mock.calls[0]?.[0] as string;
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("start_time <= NOW()");
    expect(sql).toContain("end_time > NOW()");
    expect(sql).toContain("merchandising_campaign_items");
    expect(campaigns[0]).toMatchObject({
      campaignId: "campaign-1",
      campaignName: "Flash Sale Nova Watch",
      productIds: ["product-watch", "product-band"],
    });
  });
});
