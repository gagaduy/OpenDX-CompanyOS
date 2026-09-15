// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import type { PromotionQueryPort } from "../../application/ports/promotion-query.port";
import type { CampaignPromotionDetails } from "../../domain/entities/email-campaign.entity";

export class DatabasePromotionQueryAdapter implements PromotionQueryPort {
  constructor(private readonly database: Pool) {}

  async getActiveAndUpcomingCampaigns(): Promise<CampaignPromotionDetails[]> {
    const query = `
      SELECT 
        id,
        name,
        discount_percent,
        start_time,
        end_time,
        badge_text,
        prompt
      FROM merchandising_campaigns
      WHERE status IN ('active', 'draft')
        AND end_time >= NOW() - INTERVAL '1 day'
      ORDER BY start_time ASC
      LIMIT 10
    `;

    try {
      const result = await this.database.query<{
        id: string;
        name: string;
        discount_percent: number;
        start_time: Date;
        end_time: Date;
        badge_text: string;
        prompt: string;
      }>(query);

      return result.rows.map((row) => ({
        campaignId: row.id,
        campaignName: row.name,
        discountPercent: row.discount_percent,
        voucherCode: `SALE${row.discount_percent}`,
        startTime: row.start_time ? new Date(row.start_time).toISOString() : undefined,
        endTime: row.end_time ? new Date(row.end_time).toISOString() : undefined,
        description: row.badge_text || row.prompt || "Chương trình ưu đãi giảm giá đặc biệt",
      }));
    } catch {
      return [];
    }
  }

  async getCampaignById(campaignId: string): Promise<CampaignPromotionDetails | null> {
    const query = `
      SELECT 
        id,
        name,
        discount_percent,
        start_time,
        end_time,
        badge_text,
        prompt
      FROM merchandising_campaigns
      WHERE id = $1
      LIMIT 1
    `;

    try {
      const result = await this.database.query<{
        id: string;
        name: string;
        discount_percent: number;
        start_time: Date;
        end_time: Date;
        badge_text: string;
        prompt: string;
      }>(query, [campaignId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        campaignId: row.id,
        campaignName: row.name,
        discountPercent: row.discount_percent,
        voucherCode: `SALE${row.discount_percent}`,
        startTime: row.start_time ? new Date(row.start_time).toISOString() : undefined,
        endTime: row.end_time ? new Date(row.end_time).toISOString() : undefined,
        description: row.badge_text || row.prompt || "Chương trình ưu đãi giảm giá đặc biệt",
      };
    } catch {
      return null;
    }
  }
}
