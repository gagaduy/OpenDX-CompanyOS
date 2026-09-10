// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CampaignProposalDto, CampaignItemDto, ActiveCampaignDto } from "../../../application/dtos/campaign-merchandising.dto";

export interface CreateCampaignRecordInput {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly prompt: string;
  readonly themeKey: string;
  readonly badgeText: string;
  readonly discountPercent: number;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly heroBannerStorageKey?: string;
  readonly status: "draft" | "active" | "completed" | "reverted";
  readonly createdBy: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly productId: string;
    readonly variantId: string;
    readonly originalPriceMinor: bigint;
    readonly campaignPriceMinor: bigint;
    readonly originalMediaStorageKey?: string;
    readonly campaignMediaStorageKey?: string;
    readonly optimizedTitle: string;
    readonly optimizedDescription: string;
    readonly badge: string;
  }>;
}

export class PostgresqlCampaignRepository {
  async createCampaign(session: DatabaseSession, input: CreateCampaignRecordInput): Promise<void> {
    await session.query(
      `INSERT INTO merchandising_campaigns (
        id, name, slug, prompt, theme_key, badge_text, discount_percent,
        start_time, end_time, hero_banner_storage_key, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.id,
        input.name,
        input.slug,
        input.prompt,
        input.themeKey,
        input.badgeText,
        input.discountPercent,
        input.startTime,
        input.endTime,
        input.heroBannerStorageKey ?? null,
        input.status,
        input.createdBy,
      ],
    );

    for (const item of input.items) {
      await session.query(
        `INSERT INTO merchandising_campaign_items (
          id, campaign_id, product_id, variant_id, original_price_minor,
          campaign_price_minor, original_media_storage_key, campaign_media_storage_key,
          optimized_title, optimized_description, badge
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          item.id,
          input.id,
          item.productId,
          item.variantId,
          item.originalPriceMinor.toString(),
          item.campaignPriceMinor.toString(),
          item.originalMediaStorageKey ?? null,
          item.campaignMediaStorageKey ?? null,
          item.optimizedTitle,
          item.optimizedDescription,
          item.badge,
        ],
      );
    }
  }

  async getById(session: DatabaseSession, id: string): Promise<CampaignProposalDto | null> {
    const { rows } = await session.query<any>(
      `SELECT * FROM merchandising_campaigns WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];

    const itemsRes = await session.query<any>(
      `SELECT mci.*, p.name as product_name, p.slug as product_slug
       FROM merchandising_campaign_items mci
       JOIN products p ON p.id = mci.product_id
       WHERE mci.campaign_id = $1
       ORDER BY mci.created_at ASC`,
      [id],
    );

    const items: CampaignItemDto[] = itemsRes.rows.map((it) => ({
      id: it.id,
      productId: it.product_id,
      variantId: it.variant_id,
      productName: it.product_name,
      productSlug: it.product_slug,
      originalPriceVnd: Number(it.original_price_minor),
      campaignPriceVnd: Number(it.campaign_price_minor),
      discountPercent: r.discount_percent,
      savingAmountVnd: Math.max(0, Number(it.original_price_minor) - Number(it.campaign_price_minor)),
      originalMediaUrl: it.original_media_storage_key ? `/v1/admin/catalog/media-content?key=${encodeURIComponent(it.original_media_storage_key)}` : undefined,
      campaignMediaUrl: it.campaign_media_storage_key ? `/v1/admin/catalog/media-content?key=${encodeURIComponent(it.campaign_media_storage_key)}` : undefined,
      optimizedTitle: it.optimized_title,
      optimizedDescription: it.optimized_description,
      badge: it.badge,
    }));

    const startTime = new Date(r.start_time);
    const endTime = new Date(r.end_time);

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      prompt: r.prompt,
      themeKey: r.theme_key,
      badgeText: r.badge_text,
      discountPercent: r.discount_percent,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationDays: Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / (24 * 3600 * 1000))),
      status: r.status,
      items,
      totalProducts: items.length,
      pricingRationale: "Tối ưu biên lợi nhuận và kích cầu tiêu dùng chiến dịch.",
      salesProjection: "Dự kiến lượng bán tăng trưởng từ 30% đến 50%.",
    };
  }

  async findActive(session: DatabaseSession): Promise<ActiveCampaignDto | null> {
    const { rows } = await session.query<any>(
      `SELECT c.*, count(mci.id)::int as item_count
       FROM merchandising_campaigns c
       LEFT JOIN merchandising_campaign_items mci ON mci.campaign_id = c.id
       WHERE c.status = 'active' AND c.end_time > NOW()
       GROUP BY c.id
       ORDER BY c.start_time DESC
       LIMIT 1`,
    );
    if (!rows[0]) return null;
    const r = rows[0];
    const endTime = new Date(r.end_time);
    const startTime = new Date(r.start_time);
    const remainingMs = Math.max(0, endTime.getTime() - Date.now());

    return {
      id: r.id,
      name: r.name,
      badgeText: r.badge_text,
      discountPercent: r.discount_percent,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalProducts: r.item_count,
      remainingMs,
    };
  }

  async updateStatus(session: DatabaseSession, id: string, status: "draft" | "active" | "completed" | "reverted"): Promise<void> {
    await session.query(
      `UPDATE merchandising_campaigns SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id],
    );
  }
}
