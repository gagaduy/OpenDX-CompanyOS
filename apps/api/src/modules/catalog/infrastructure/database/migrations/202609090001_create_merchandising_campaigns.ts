// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PoolClient } from "pg";

export const upSql = `
CREATE TABLE IF NOT EXISTS merchandising_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  prompt TEXT NOT NULL,
  theme_key VARCHAR(50) NOT NULL DEFAULT 'general',
  badge_text VARCHAR(100) NOT NULL,
  discount_percent INT NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 90),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  hero_banner_storage_key VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'reverted')),
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchandising_campaigns_status_dates 
  ON merchandising_campaigns (status, start_time, end_time);

CREATE TABLE IF NOT EXISTS merchandising_campaign_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES merchandising_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  original_price_minor BIGINT NOT NULL,
  campaign_price_minor BIGINT NOT NULL,
  original_media_storage_key VARCHAR(255),
  campaign_media_storage_key VARCHAR(255),
  optimized_title VARCHAR(255) NOT NULL,
  optimized_description TEXT NOT NULL,
  badge VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign_id 
  ON merchandising_campaign_items (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_items_variant_id 
  ON merchandising_campaign_items (variant_id);
`;

export const downSql = `
DROP TABLE IF EXISTS merchandising_campaign_items CASCADE;
DROP TABLE IF EXISTS merchandising_campaigns CASCADE;
`;

export async function up(client: PoolClient): Promise<void> {
  await client.query(upSql);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query(downSql);
}
