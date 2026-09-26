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
        c.id,
        c.name,
        c.discount_percent,
        c.start_time,
        c.end_time,
        c.badge_text,
        c.prompt,
        COALESCE(
          ARRAY_AGG(DISTINCT mci.product_id::text) FILTER (WHERE mci.product_id IS NOT NULL),
          ARRAY[]::text[]
        ) AS product_ids
      FROM merchandising_campaigns c
      LEFT JOIN merchandising_campaign_items mci ON mci.campaign_id = c.id
      WHERE c.status = 'active'
        AND c.start_time <= NOW()
        AND c.end_time > NOW()
      GROUP BY c.id, c.name, c.discount_percent, c.start_time, c.end_time, c.badge_text, c.prompt
      ORDER BY c.start_time DESC
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
        product_ids: string[];
      }>(query);

      return result.rows.map((row) => ({
        campaignId: row.id,
        campaignName: row.name,
        discountPercent: row.discount_percent,
        startTime: row.start_time ? new Date(row.start_time).toISOString() : undefined,
        endTime: row.end_time ? new Date(row.end_time).toISOString() : undefined,
        description: row.badge_text || row.prompt || "Chương trình ưu đãi giảm giá đặc biệt",
        productIds: row.product_ids,
      }));
    } catch {
      return [];
    }
  }

  async getCampaignById(campaignId: string): Promise<CampaignPromotionDetails | null> {
    const query = `
      SELECT 
        c.id,
        c.name,
        c.discount_percent,
        c.start_time,
        c.end_time,
        c.badge_text,
        c.prompt,
        COALESCE(
          ARRAY_AGG(DISTINCT mci.product_id::text) FILTER (WHERE mci.product_id IS NOT NULL),
          ARRAY[]::text[]
        ) AS product_ids
      FROM merchandising_campaigns c
      LEFT JOIN merchandising_campaign_items mci ON mci.campaign_id = c.id
      WHERE c.id = $1
        AND c.status = 'active'
        AND c.start_time <= NOW()
        AND c.end_time > NOW()
      GROUP BY c.id, c.name, c.discount_percent, c.start_time, c.end_time, c.badge_text, c.prompt
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
        product_ids: string[];
      }>(query, [campaignId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        campaignId: row.id,
        campaignName: row.name,
        discountPercent: row.discount_percent,
        startTime: row.start_time ? new Date(row.start_time).toISOString() : undefined,
        endTime: row.end_time ? new Date(row.end_time).toISOString() : undefined,
        description: row.badge_text || row.prompt || "Chương trình ưu đãi giảm giá đặc biệt",
        productIds: row.product_ids,
      };
    } catch {
      return null;
    }
  }
}
