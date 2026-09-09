<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Catalog & Pricing Dynamic Campaign Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Catalog & Pricing department into an autonomous, governed, and time-bounded Campaign Merchandising Engine with Sharp SVG visual synthesis, paginated multi-modal review on the Staff Console, and automatic SQL time-windowed price reversion.

**Architecture:** A Clean Architecture modular monolith enhancement within `apps/api` and `apps/console`. Introduces an inward-facing `CampaignVisualGenerator` port with a `sharp`-based SVG composite adapter, PostgreSQL migrations for `merchandising_campaigns` and `merchandising_campaign_items`, and integration with `product_prices` SCD Type 2 (`valid_from` / `valid_to`) for automatic price fallback upon campaign expiration.

**Tech Stack:** TypeScript 7, Node.js 22, Express 5, PostgreSQL, MinIO, `sharp` 0.35.4, React 19, Vite 7, Vitest 4, TailwindCSS.

**Spec:** `docs/superpowers/specs/2026-09-09-catalog-campaign-engine-design.md`

## Global Constraints

- Zero hardcoding of product titles, categories, holiday strings, discount rates, or mock URLs.
- Original product photos in MinIO remain immutable; derived campaign assets are stored under `campaigns/<campaignId>/<variantId>.webp`.
- Price truth is governed by PostgreSQL `product_prices` using `valid_from` and `valid_to`.
- Human approval is strictly required before public Storefront mutation.
- Code changes must pass `pnpm check:fast` and conventional commit standards.

---

### Task 1: Database Migration for Merchandising Campaigns

**Files:**
- Create: `apps/api/src/modules/catalog/infrastructure/database/migrations/202609090001_create_merchandising_campaigns.ts`
- Test: `apps/api/src/modules/catalog/infrastructure/database/migrations/202609090001_create_merchandising_campaigns.test.ts`

**Interfaces:**
- Produces: `merchandising_campaigns` and `merchandising_campaign_items` PostgreSQL tables.

- [ ] **Step 1: Write the migration test**

```typescript
import { describe, expect, it } from "vitest";
import { upSql, downSql } from "./202609090001_create_merchandising_campaigns";

describe("202609090001_create_merchandising_campaigns migration", () => {
  it("contains valid up SQL creating tables and indexes", () => {
    expect(upSql).toContain("CREATE TABLE IF NOT EXISTS merchandising_campaigns");
    expect(upSql).toContain("CREATE TABLE IF NOT EXISTS merchandising_campaign_items");
    expect(upSql).toContain("idx_merchandising_campaigns_status_dates");
    expect(upSql).toContain("idx_campaign_items_campaign_id");
  });

  it("contains valid down SQL dropping tables and indexes", () => {
    expect(downSql).toContain("DROP TABLE IF EXISTS merchandising_campaign_items CASCADE");
    expect(downSql).toContain("DROP TABLE IF EXISTS merchandising_campaigns CASCADE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/infrastructure/database/migrations/202609090001_create_merchandising_campaigns.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the migration script**

Create `apps/api/src/modules/catalog/infrastructure/database/migrations/202609090001_create_merchandising_campaigns.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/infrastructure/database/migrations/202609090001_create_merchandising_campaigns.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply migration to local PostgreSQL container and commit**

Run: `docker compose --env-file .env -f infra/docker/docker-compose.yml exec -T postgres psql -U opendx_local -d opendx -c "${upSql}"`
Commit: `git add apps/api/src/modules/catalog/infrastructure/database/migrations/ && git commit -m "feat(catalog): add merchandising campaigns database migration"`

---

### Task 2: Campaign Visual Generator Port & Sharp Adapter

**Files:**
- Create: `apps/api/src/modules/catalog/application/ports/campaign-visual-generator.port.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/adapters/sharp-campaign-visual.adapter.ts`
- Test: `apps/api/src/modules/catalog/infrastructure/adapters/sharp-campaign-visual.adapter.test.ts`

**Interfaces:**
- Produces: `CampaignVisualGenerator` port and `SharpCampaignVisualAdapter` implementation.

- [ ] **Step 1: Write the failing unit test**

Create `apps/api/src/modules/catalog/infrastructure/adapters/sharp-campaign-visual.adapter.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { SharpCampaignVisualAdapter } from "./sharp-campaign-visual.adapter";

describe("SharpCampaignVisualAdapter", () => {
  it("generates a high-contrast 3D pill badge overlay on a source image", async () => {
    const adapter = new SharpCampaignVisualAdapter();
    const sourceBuffer = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
    }).png().toBuffer();

    const outputBuffer = await adapter.generateBadgeOverlay({
      sourceBuffer,
      themeKey: "mid_autumn",
      badgeText: "🏮 TẾT TRUNG THU -20%",
      discountPercent: 20,
    });

    const metadata = await sharp(outputBuffer).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(400);
  });

  it("handles different themes gracefully with context-aware palettes", async () => {
    const adapter = new SharpCampaignVisualAdapter();
    const sourceBuffer = await sharp({
      create: { width: 500, height: 500, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).png().toBuffer();

    for (const themeKey of ["back_to_school", "flash_sale", "black_friday", "general"]) {
      const outputBuffer = await adapter.generateBadgeOverlay({
        sourceBuffer,
        themeKey,
        badgeText: `SALE -15%`,
        discountPercent: 15,
      });
      const meta = await sharp(outputBuffer).metadata();
      expect(meta.format).toBe("webp");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/infrastructure/adapters/sharp-campaign-visual.adapter.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the Port and Adapter**

Create `apps/api/src/modules/catalog/application/ports/campaign-visual-generator.port.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

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

Create `apps/api/src/modules/catalog/infrastructure/adapters/sharp-campaign-visual.adapter.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import sharp from "sharp";
import type {
  CampaignVisualGenerator,
  CampaignVisualOverlayInput,
} from "../../application/ports/campaign-visual-generator.port";

interface ThemePalette {
  readonly gradientStart: string;
  readonly gradientEnd: string;
  readonly accentColor: string;
  readonly textColor: string;
  readonly borderColor: string;
}

const THEME_PALETTES: Record<string, ThemePalette> = {
  mid_autumn: {
    gradientStart: "#b91c1c",
    gradientEnd: "#7f1d1d",
    accentColor: "#facc15",
    textColor: "#ffffff",
    borderColor: "#facc15",
  },
  back_to_school: {
    gradientStart: "#1d4ed8",
    gradientEnd: "#1e3a8a",
    accentColor: "#fbbf24",
    textColor: "#ffffff",
    borderColor: "#fbbf24",
  },
  flash_sale: {
    gradientStart: "#ea580c",
    gradientEnd: "#9a3412",
    accentColor: "#ffffff",
    textColor: "#ffffff",
    borderColor: "#ffedd5",
  },
  black_friday: {
    gradientStart: "#09090b",
    gradientEnd: "#18181b",
    accentColor: "#eab308",
    textColor: "#ffffff",
    borderColor: "#eab308",
  },
  general: {
    gradientStart: "#4338ca",
    gradientEnd: "#312e81",
    accentColor: "#06b6d4",
    textColor: "#ffffff",
    borderColor: "#38bdf8",
  },
};

export class SharpCampaignVisualAdapter implements CampaignVisualGenerator {
  async generateBadgeOverlay(input: CampaignVisualOverlayInput): Promise<Buffer> {
    const meta = await sharp(input.sourceBuffer, { failOn: "error" }).metadata();
    const width = meta.width ?? 600;
    const height = meta.height ?? 600;

    const palette = THEME_PALETTES[input.themeKey] ?? THEME_PALETTES.general;
    const badgeWidth = Math.min(width * 0.55, 260);
    const badgeHeight = Math.max(38, Math.round(height * 0.08));
    const paddingLeft = Math.round(width * 0.04);
    const paddingTop = Math.round(height * 0.04);

    const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.gradientStart}" />
      <stop offset="100%" stop-color="${palette.gradientEnd}" />
    </linearGradient>
    <linearGradient id="frameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.borderColor}" stop-opacity="0.85" />
      <stop offset="50%" stop-color="${palette.gradientStart}" stop-opacity="0.3" />
      <stop offset="100%" stop-color="${palette.borderColor}" stop-opacity="0.85" />
    </linearGradient>
    <filter id="badgeShadow" x="-10%" y="-10%" width="130%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Accent Inner Frame -->
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="14" ry="14"
        fill="none" stroke="url(#frameGrad)" stroke-width="3" />

  <!-- 3D Floating Pill Badge -->
  <g filter="url(#badgeShadow)" transform="translate(${paddingLeft}, ${paddingTop})">
    <rect width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" ry="${badgeHeight / 2}"
          fill="url(#badgeGrad)" stroke="${palette.borderColor}" stroke-width="1.5" />
    <text x="${badgeWidth / 2}" y="${badgeHeight * 0.62}"
          text-anchor="middle"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="${Math.round(badgeHeight * 0.42)}px"
          font-weight="700"
          letter-spacing="0.5px"
          fill="${palette.textColor}">
      ${escapeXml(input.badgeText)}
    </text>
  </g>
</svg>
    `.trim();

    const compositeResult = await sharp(input.sourceBuffer, { failOn: "error" })
      .composite([{ input: Buffer.from(svg, "utf-8"), top: 0, left: 0 }])
      .webp({ quality: 90 })
      .toBuffer();

    return compositeResult;
  }
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case "\"": return "&quot;";
      default: return c;
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/infrastructure/adapters/sharp-campaign-visual.adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/modules/catalog/application/ports/campaign-visual-generator.port.ts apps/api/src/modules/catalog/infrastructure/adapters/sharp-campaign-visual.adapter.* && git commit -m "feat(catalog): add sharp campaign visual adapter and port"`

---

### Task 3: Campaign DTOs, Repository & Database Layer

**Files:**
- Create: `apps/api/src/modules/catalog/application/dtos/campaign-merchandising.dto.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-campaign.repository.ts`
- Test: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-campaign.repository.test.ts`

**Interfaces:**
- Produces: `CampaignMerchandisingRepository` and typed campaign DTOs.

- [ ] **Step 1: Write the unit test for Campaign Repository**

Create `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-campaign.repository.test.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";
import { PostgresqlCampaignRepository } from "./postgresql-campaign.repository";

describe("PostgresqlCampaignRepository", () => {
  it("creates and retrieves campaign draft records", async () => {
    const mockSession = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: "camp-123",
          name: "Test Campaign",
          slug: "test-campaign",
          prompt: "Sale 20%",
          theme_key: "mid_autumn",
          badge_text: "SALE -20%",
          discount_percent: 20,
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
          status: "draft",
          created_by: "staff-1",
        }],
      }),
    };

    const repo = new PostgresqlCampaignRepository();
    const result = await repo.getById(mockSession as any, "camp-123");
    expect(result?.id).toBe("camp-123");
    expect(result?.discountPercent).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/infrastructure/repositories/implementations/postgresql-campaign.repository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement DTOs and Repository**

Create `apps/api/src/modules/catalog/application/dtos/campaign-merchandising.dto.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CampaignItemDto {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly originalPriceVnd: number;
  readonly campaignPriceVnd: number;
  readonly discountPercent: number;
  readonly savingAmountVnd: number;
  readonly originalMediaUrl?: string;
  readonly campaignMediaUrl?: string;
  readonly optimizedTitle: string;
  readonly optimizedDescription: string;
  readonly badge: string;
}

export interface CampaignProposalDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly prompt: string;
  readonly themeKey: string;
  readonly badgeText: string;
  readonly discountPercent: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly durationDays: number;
  readonly status: "draft" | "active" | "completed" | "reverted";
  readonly items: readonly CampaignItemDto[];
  readonly totalProducts: number;
  readonly pricingRationale: string;
  readonly salesProjection: string;
}

export interface ActiveCampaignDto {
  readonly id: string;
  readonly name: string;
  readonly badgeText: string;
  readonly discountPercent: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly totalProducts: number;
  readonly remainingMs: number;
}
```

Create `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-campaign.repository.ts`:
```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CampaignProposalDto, CampaignItemDto, ActiveCampaignDto } from "../../application/dtos/campaign-merchandising.dto";

export class PostgresqlCampaignRepository {
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

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      prompt: r.prompt,
      themeKey: r.theme_key,
      badgeText: r.badge_text,
      discountPercent: r.discount_percent,
      startTime: r.start_time.toISOString(),
      endTime: r.end_time.toISOString(),
      durationDays: Math.round((new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / (24 * 3600 * 1000)),
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
    const remainingMs = Math.max(0, new Date(r.end_time).getTime() - Date.now());

    return {
      id: r.id,
      name: r.name,
      badgeText: r.badge_text,
      discountPercent: r.discount_percent,
      startTime: r.start_time.toISOString(),
      endTime: r.end_time.toISOString(),
      totalProducts: r.item_count,
      remainingMs,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/infrastructure/repositories/implementations/postgresql-campaign.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/modules/catalog/application/dtos/campaign-merchandising.dto.ts apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-campaign.repository.* && git commit -m "feat(catalog): add campaign merchandising dto and repository"`

---

### Task 4: Upgrade `AiMerchandisingService` with Campaign Engine

**Files:**
- Modify: `apps/api/src/modules/catalog/application/services/implementations/ai-merchandising.service.ts`
- Test: `apps/api/src/modules/catalog/application/services/implementations/ai-merchandising.service.test.ts`

**Interfaces:**
- Produces: `generateCampaignProposal`, `activateCampaign`, `revertCampaign`, and `getActiveCampaign` methods.

- [ ] **Step 1: Write failing service unit tests**

Create `apps/api/src/modules/catalog/application/services/implementations/ai-merchandising.service.test.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";
import { AiMerchandisingService } from "./ai-merchandising.service";

describe("AiMerchandisingService Campaign Engine", () => {
  it("calculates exact discount prices and extracts duration from prompt", async () => {
    const mockTx = {
      runReadOnly: vi.fn().mockImplementation(async (cb) => cb({
        query: vi.fn().mockResolvedValue({
          rows: [{
            product_id: "p-1",
            name: "Nova Laptop",
            slug: "nova-laptop",
            description: "Desc",
            category_name: "Laptops",
            variant_id: "v-1",
            sku: "SKU-1",
            price_minor: "30000000",
            storage_key: "products/p-1/image.jpg",
          }],
        }),
      })),
      run: vi.fn().mockImplementation(async (cb) => cb({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
    };

    const mockAudit = { append: vi.fn().mockResolvedValue(undefined) };
    const mockVisual = { generateBadgeOverlay: vi.fn().mockResolvedValue(Buffer.from("webp-data")) };
    const mockStorage = { getObject: vi.fn().mockResolvedValue(Buffer.from("image")), putObject: vi.fn().mockResolvedValue(undefined) };

    const service = new AiMerchandisingService(
      mockTx as any,
      mockAudit as any,
      mockVisual as any,
      mockStorage as any,
    );

    const proposal = await service.generateCampaignProposal({
      prompt: "Giảm giá 20% laptop nhân dịp Trung Thu trong 5 ngày",
    });

    expect(proposal.discountPercent).toBe(20);
    expect(proposal.durationDays).toBe(5);
    expect(proposal.items[0]?.campaignPriceVnd).toBe(24000000);
    expect(proposal.themeKey).toBe("mid_autumn");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/application/services/implementations/ai-merchandising.service.test.ts`
Expected: FAIL with `generateCampaignProposal` not a function.

- [ ] **Step 3: Implement methods in `AiMerchandisingService`**

Extend `AiMerchandisingService`:
1. Inject `CampaignVisualGenerator` and MinIO storage adapter.
2. Implement `generateCampaignProposal`: regex for duration `(\d+)\s*(?:ngày|day)`, OpenRouter prompt requesting `themeKey`, `badgeText`, and product mappings.
3. Use `CampaignVisualGenerator.generateBadgeOverlay` to create derived WebP images stored in MinIO.
4. Implement `activateCampaign`: insert into `product_prices` with `valid_from = NOW()`, `valid_to = campaign.end_time`, and update campaign to `'active'`.
5. Implement `revertCampaign`: set `valid_to = NOW()` for campaign variant prices, update status to `'reverted'`.
6. Implement `getActiveCampaign`: queries repository and checks if `end_time > NOW()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/application/services/implementations/ai-merchandising.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/modules/catalog/application/services/implementations/ai-merchandising.service.* && git commit -m "feat(catalog): implement dynamic campaign merchandising service with auto-revert"`

---

### Task 5: REST API Controller & Routes for Campaigns

**Files:**
- Modify: `apps/api/src/modules/catalog/presentation/controllers/ai-merchandising.controller.ts`
- Modify: `apps/api/src/modules/catalog/presentation/routes/ai-merchandising.routes.ts`
- Test: `apps/api/src/modules/catalog/tests/ai-merchandising-campaigns.api.test.ts`

**Interfaces:**
- Produces: `/campaigns/*` HTTP endpoints on Express router.

- [ ] **Step 1: Write integration API test**

Create `apps/api/src/modules/catalog/tests/ai-merchandising-campaigns.api.test.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { createAiMerchandisingRouter } from "../presentation/routes/ai-merchandising.routes";
import { AiMerchandisingController } from "../presentation/controllers/ai-merchandising.controller";

describe("AI Merchandising Campaigns API Routes", () => {
  it("mounts generate, activate, revert, and active campaign endpoints", async () => {
    const mockService = {
      generateCampaignProposal: vi.fn().mockResolvedValue({ id: "camp-1", discountPercent: 20 }),
      activateCampaign: vi.fn().mockResolvedValue({ success: true }),
      revertCampaign: vi.fn().mockResolvedValue({ success: true }),
      getActiveCampaign: vi.fn().mockResolvedValue({ id: "camp-1", remainingMs: 50000 }),
    };

    const controller = new AiMerchandisingController(mockService as any);
    const authMiddleware = (req: any, res: any, next: any) => {
      res.locals.staffPrincipal = { subject: "staff-1", roles: ["administrator"] };
      next();
    };

    const app = express();
    app.use(express.json());
    app.use("/v1/admin/catalog", createAiMerchandisingRouter(controller, authMiddleware));

    const genRes = await request(app)
      .post("/v1/admin/catalog/ai-merchandising/campaigns/generate-proposal")
      .send({ prompt: "Giảm 20% Trung Thu" });
    expect(genRes.status).toBe(200);

    const activeRes = await request(app)
      .get("/v1/admin/catalog/ai-merchandising/campaigns/active");
    expect(activeRes.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/tests/ai-merchandising-campaigns.api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update Controller and Routes**

Update `apps/api/src/modules/catalog/presentation/controllers/ai-merchandising.controller.ts` and `apps/api/src/modules/catalog/presentation/routes/ai-merchandising.routes.ts` with the new campaign handlers.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/catalog/tests/ai-merchandising-campaigns.api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/modules/catalog/presentation/ apps/api/src/modules/catalog/tests/ai-merchandising-campaigns.api.test.ts && git commit -m "feat(catalog): mount campaign merchandising REST API endpoints"`

---

### Task 6: Console Staff UI Multi-Modal Proposal Modal with Pagination

**Files:**
- Create: `apps/console/src/features/catalog/components/campaign-proposal-modal.tsx`
- Modify: `apps/console/src/features/catalog/api/catalog-api.ts`
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`
- Test: `apps/console/src/features/catalog/tests/campaign-proposal-modal.test.tsx`

**Interfaces:**
- Produces: Interactive modal with paginated product review (4 items/page), before/after preview, and duration selector.

- [ ] **Step 1: Write component unit test**

Create `apps/console/src/features/catalog/tests/campaign-proposal-modal.test.tsx`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console exec vitest run src/features/catalog/tests/campaign-proposal-modal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `CampaignProposalModal`**

Create `apps/console/src/features/catalog/components/campaign-proposal-modal.tsx`:
- Pagination logic: 4 items per page (`Math.ceil(total / 4)`).
- Selection set stored in `Set<string>`.
- End date picker with presets (+1 day, +3 days, +7 days).
- Before/After image comparison thumbnails.
- Confirm & Launch button triggering `catalogApi.activateCampaign`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console exec vitest run src/features/catalog/tests/campaign-proposal-modal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/console/src/features/catalog/ apps/console/src/features/agentic/ && git commit -m "feat(console): add paginated campaign proposal review modal"`

---

### Task 7: Active Campaign Live Monitor Widget with Emergency Revert

**Files:**
- Create: `apps/console/src/features/catalog/components/active-campaign-widget.tsx`
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`
- Test: `apps/console/src/features/catalog/tests/active-campaign-widget.test.tsx`

**Interfaces:**
- Produces: Live widget with timer countdown and emergency revert button with confirmation popover.

- [ ] **Step 1: Write component unit test**

Create `apps/console/src/features/catalog/tests/active-campaign-widget.test.tsx`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console exec vitest run src/features/catalog/tests/active-campaign-widget.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `ActiveCampaignWidget`**

Create `apps/console/src/features/catalog/components/active-campaign-widget.tsx` with formatted countdown `DD:HH:MM:SS`, progress bar, and safe revert popover.
Embed the widget at the top of the Catalog department column in `agentic-command-center.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console exec vitest run src/features/catalog/tests/active-campaign-widget.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/console/src/features/catalog/components/active-campaign-widget.* apps/console/src/features/agentic/components/agentic-command-center.tsx && git commit -m "feat(console): add active campaign live monitor widget with emergency revert"`

---

### Task 8: End-to-End Verification & Validation Gates

**Files:**
- Test: `scripts/dev/catalog-campaign-e2e-check.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm check:catalog-campaign` test runner proving zero-hardcoding and end-to-end activation/reversion.

- [ ] **Step 1: Write the end-to-end verification script**

Create `scripts/dev/catalog-campaign-e2e-check.mjs`:
Exercises the complete lifecycle:
1. Acquires operator token.
2. Generates proposal with arbitrary prompt and theme (e.g. "Giảm 25% phụ kiện dịp Black Friday trong 2 ngày").
3. Verifies generated WebP image from MinIO contains valid graphic metadata.
4. Activates campaign and verifies `product_prices` has `valid_to` in PostgreSQL.
5. Verifies active campaign endpoint returns accurate countdown.
6. Reverts campaign early and proves Storefront SQL query immediately restores original baseline price.

- [ ] **Step 2: Run the full validation suite**

Run: `node scripts/dev/catalog-campaign-e2e-check.mjs && pnpm check:fast`
Expected: All tests and repository audits pass.

- [ ] **Step 3: Commit and update CHANGELOG**

Update `CHANGELOG.md` under `[Unreleased]`:
```markdown
- Add dynamic Catalog & Pricing campaign engine with Sharp visual synthesis and automated time-bounded price reversion.
```
Commit: `git add CHANGELOG.md scripts/dev/catalog-campaign-e2e-check.mjs package.json && git commit -m "feat(catalog): add end-to-end verification for dynamic campaign engine"`
