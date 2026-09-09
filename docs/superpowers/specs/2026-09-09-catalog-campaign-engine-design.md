<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Catalog & Pricing Dynamic Campaign Engine Design

## 1. Executive Summary

This specification defines the architectural design for upgrading the **Catalog & Pricing (Danh mục & Định giá)** department in OpenDX CompanyOS. 

The upgrade transitions the department from an ad-hoc product text and price updater into an **autonomous, governed, and time-bounded Campaign Merchandising Engine**. When the AI CEO receives a strategic directive (e.g., *"Lập chiến dịch giảm giá 20% cho laptop Nova vào dịp Tết Trung Thu"*), the department automatically orchestrates:
1. Dynamic catalog querying and AI proposal generation (SEO copywriting, badge generation, discount calculation, and campaign naming via OpenRouter Gemini 2.5 Flash).
2. Server-side high-fidelity graphic synthesis via `sharp` without corrupting raw assets in MinIO (generating 3D floating ribbon badges and subtle accent frames tailored to the event theme).
3. Human-in-the-loop review on the Staff Console with interactive pagination, before/after visual comparison, and duration customization.
4. Time-bounded PostgreSQL pricing via `product_prices.valid_to` and automated reversion to original prices and photos when the campaign expires or when an emergency revert is triggered.

---

## 2. Non-Negotiable Boundaries & Zero-Hardcode Guarantee

1. **Zero Hardcoding**:
   - No hardcoded product titles, categories, holiday strings, discount rates, or mock image links.
   - All catalog data is retrieved live from PostgreSQL (`products`, `product_variants`, `product_prices`).
   - All visual assets are synthesized on-demand from real source photo buffers using `sharp`.
2. **Non-Destructive Storage**:
   - Original product photos in MinIO (`product-media` bucket) remain immutable.
   - Campaign visual assets are derived outputs stored in separate keys (`campaigns/<campaignId>/<variantId>.webp`).
3. **Time-Bounded Price Truth**:
   - Pricing changes use PostgreSQL SCD Type 2 time windowing (`valid_from` and `valid_to`).
   - When a campaign ends, Storefront SQL queries naturally evaluate `valid_to > NOW()` as false, automatically falling back to the baseline price without requiring manual batch updates.
4. **Governed Human Approval**:
   - No public price or image change takes effect until staff explicitly clicks **Phê duyệt & Kích hoạt (Approve & Launch)**.
   - Complete audit provenance is recorded in `catalog_audit_records`.

---

## 3. Data Architecture (PostgreSQL Schema)

### 3.1 Migration: `merchandising_campaigns`
```sql
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
```

### 3.2 Migration: `merchandising_campaign_items`
```sql
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
```

### 3.3 Integration with `product_prices`
When activated:
- An active campaign inserts rows into `product_prices`:
  - `variant_id`: `item.variant_id`
  - `amount_minor`: `item.campaign_price_minor`
  - `currency`: `'VND'`
  - `valid_from`: `campaign.start_time`
  - `valid_to`: `campaign.end_time`
  - `created_by`: `context.actorId`
- When reverted or expired:
  - If reverted early: `UPDATE product_prices SET valid_to = NOW() WHERE variant_id IN (...) AND valid_to > NOW()`
  - When naturally expired: SQL query `valid_from <= NOW() AND (valid_to IS NULL OR valid_to > NOW())` immediately returns the original indefinite baseline price.

---

## 4. Visual Architecture & Graphic Engine

### 4.1 Inward-Facing Port: `CampaignVisualGenerator`
Located at `apps/api/src/modules/catalog/application/ports/campaign-visual-generator.port.ts`:
```typescript
export interface CampaignVisualOverlayInput {
  readonly sourceBuffer: Buffer;
  readonly themeKey: string;
  readonly badgeText: string;
  readonly discountPercent: number;
}

export interface CampaignVisualGenerator {
  generateBadgeOverlay(input: CampaignVisualOverlayInput): Promise<Buffer>;
}
```

### 4.2 Adapter Implementation: `SharpCampaignVisualAdapter`
Located at `apps/api/src/modules/catalog/infrastructure/adapters/sharp-campaign-visual.adapter.ts`:
- Uses Node.js `sharp@0.35.4`.
- Inspects `sourceBuffer` metadata (`width`, `height`).
- Synthesizes a resolution-adaptive SVG overlay:
  1. **Subtle Accent Frame**: Inner border with `stroke-width: 3px`, rounded corners (`rx: 16px`), and theme-matching gradient stroke.
  2. **Floating Pill Ribbon Badge**: Positioned at top-left with `drop-shadow(0 6px 16px rgba(0,0,0,0.4))`, dual-tone gradient fill, crisp vector icon, and uppercase high-contrast typography.
- Composites the SVG onto the source image via `sharp(sourceBuffer).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).webp({ quality: 90 }).toBuffer()`.
- Uploads the composite buffer to MinIO bucket `product-media` under `campaigns/<campaignId>/<variantId>.webp`.

### 4.3 Adaptive Theme Palettes
The AI dynamically resolves themes based on directive context:
- `mid_autumn`: Crimson Red (`#b91c1c` ➔ `#7f1d1d`), Gold Accent (`#facc15`), Lantern/Moon Icon (`🏮`).
- `back_to_school`: Royal Blue (`#1d4ed8` ➔ `#1e3a8a`), Amber Accent (`#fbbf24`), Graduation Cap Icon (`🎓`).
- `flash_sale`: Electric Orange (`#ea580c` ➔ `#9a3412`), White Accent (`#ffffff`), Lightning Bolt Icon (`⚡`).
- `black_friday`: Carbon Black (`#09090b` ➔ `#18181b`), Metallic Gold Accent (`#eab308`), Ribbon Tag Icon (`🏷️`).
- `general`: Indigo Violet (`#4338ca` ➔ `#312e81`), Cyan Accent (`#06b6d4`), Sparkle Icon (`✨`).

---

## 5. Application Services & Workflow

### 5.1 `AiMerchandisingService` Operations
Located at `apps/api/src/modules/catalog/application/services/implementations/ai-merchandising.service.ts`:

1. **`generateCampaignProposal(input)`**:
   - Extracts explicit or default duration from prompt (e.g., regex `(\d+)\s*(?:ngày|day|h|giờ)` ➔ default 3 days).
   - Queries current catalog products, prices, and primary media storage keys.
   - Invokes OpenRouter Gemini 2.5 Flash to extract: `themeKey`, `badgeText`, `discountPercent`, `pricingRationale`, `salesProjection`, and per-product SEO titles/descriptions.
   - For each matching product:
     - Downloads primary media buffer from MinIO.
     - Generates WebP badge overlay via `CampaignVisualGenerator`.
     - Stores draft campaign image in MinIO: `campaigns/draft/<draftId>/<variantId>.webp`.
   - Persists a `draft` campaign in `merchandising_campaigns` and `merchandising_campaign_items`.
   - Returns paginated proposal DTO.

2. **`activateCampaign(campaignId, overrides, context)`**:
   - Verifies `status === 'draft'`.
   - Applies optional user overrides (custom `endDate`, excluded item IDs).
   - Starts PostgreSQL transaction:
     - Updates campaign status to `'active'`, `start_time = NOW()`, `end_time = targetEndDate`.
     - Inserts active prices into `product_prices` with `valid_to = targetEndDate`.
     - Updates `products` table with SEO title, description, and badge attributes.
     - Appends audit log to `catalog_audit_records`.

3. **`revertCampaign(campaignId, context)`**:
   - Updates campaign status to `'reverted'`.
   - Updates `product_prices` setting `valid_to = NOW()` for all campaign variant prices.
   - Restores original product names and descriptions from `merchandising_campaign_items`.
   - Appends audit log to `catalog_audit_records`.

4. **`getActiveCampaign()`**:
   - Queries `merchandising_campaigns WHERE status = 'active'`.
   - If `NOW() > end_time`, updates status to `'completed'` and returns null.
   - Otherwise returns campaign metadata, total products, remaining milliseconds, and end timestamp.

---

## 6. REST API Endpoints

Mounted under `/v1/admin/catalog/ai-merchandising`:
- `POST /campaigns/generate-proposal`: Authenticated, body `{ prompt: string, durationDays?: number }`.
- `POST /campaigns/:campaignId/activate`: Authenticated, body `{ endDate?: string, excludedItemIds?: string[] }`.
- `POST /campaigns/:campaignId/revert`: Authenticated, emergency revert trigger.
- `GET /campaigns/active`: Authenticated, returns current active campaign or null.
- `GET /campaigns/:campaignId/preview-image/:itemId`: Returns binary WebP preview with content-type `image/webp`.

---

## 7. Staff Console Command Center UI/UX

1. **Interactive Multi-Modal Approval Panel**:
   - **Header**: Campaign title, theme badge, discount summary.
   - **Duration Controls**: End date/time picker with quick presets (+1 day, +3 days, +7 days).
   - **Pagination**: 4-5 items per page with controls: `[← Trang trước] Trang X / Y [Trang sau →]`.
   - **Before/After Media Cards**: Side-by-side display of original raw photo vs. Sharp-generated 3D badge overlay photo.
   - **Checkboxes**: Select/deselect items with cross-page state retention.
   - **Actions**: `[ 🚀 Phê duyệt & Kích hoạt ]`, `[ ✍️ Yêu cầu sửa đổi ]`, `[ ✕ Hủy đề xuất ]`.
2. **Active Campaign Monitor Widget**:
   - Embedded at the top of the Catalog department column.
   - Shows live countdown timer: `Còn lại: DD:HH:MM:SS`.
   - Prominent danger button: **[ 🛑 Hoàn nguyên ngay (Revert Now) ]** with confirmation popover.

---

## 8. Testing Strategy

1. **Unit Tests**:
   - `sharp-campaign-visual.adapter.test.ts`: Validates SVG overlay synthesis across all 5 themes with arbitrary text/ratios, asserts valid WebP buffers.
   - `ai-merchandising.service.test.ts`: Validates discount math, SCD Type 2 price insertions, duration extraction, pagination slicing, and revert state transitions.
2. **Integration Tests**:
   - `ai-merchandising.api.integration.test.ts`: Exercises end-to-end generate ➔ activate ➔ verify Storefront price fallback after expiry ➔ emergency revert against isolated PostgreSQL and MinIO.
3. **Console UI Component Tests**:
   - `catalog-campaign-panel.test.tsx`: Tests pagination navigation, checkbox state preservation across pages, date picker adjustments, and button clicks.
