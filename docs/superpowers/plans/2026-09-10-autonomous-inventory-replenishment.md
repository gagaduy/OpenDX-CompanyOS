# Autonomous Proactive Inventory Replenishment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous, proactive background replenishment loop for the Operations & Inventory department in OpenDX CompanyOS, automatically detecting low-stock/high-velocity SKUs via a dual-trigger system (6-hour cron + `order.paid` event hook), generating grounded AI replenishment proposals with deterministic heuristic fallback, and presenting proactive amber alerts in the Staff Command Center for 1-click human review and transactional stock update.

**Architecture:** Implement a dedicated PostgreSQL persistence table `inventory_replenishment_proposals` and repository. Connect an `AutonomousReplenishmentMonitorService` to a dual-trigger pipeline (a 6-hour cron timer and an asynchronous `order.paid` post-order event hook) with 15-minute debounce cooldown. Query PostgreSQL inventory balances joined with 7-day sales velocity (`order_lines`, `orders`) and feed them into the AI Logistics Reasoner (OpenRouter / Gemini 2.5 Flash with deterministic mathematical fallback). Present pending replenishment proposals on the Staff Console Command Center via an active amber alert banner and header badge, opening an enhanced `OperationsProposalModal` for human review, quantity adjustment, and transactional stock updates.

**Tech Stack:** Node.js, TypeScript 5.6, Express, PostgreSQL 16 (node-pg-migrate, pg), Vitest, React 18, Vite, Lucide React, MinIO (S3-compatible private storage).

**Spec:** [`docs/superpowers/specs/2026-09-10-autonomous-inventory-replenishment-design.md`](file:///home/phan-duong-quoc-nhat/workspace/OpenDX-CompanyOS/docs/superpowers/specs/2026-09-10-autonomous-inventory-replenishment-design.md)

## Global Constraints

- **Human-in-the-Loop Financial Guardrail**: Digital employees only formulate proposals (`pending_review`). Autonomous stock mutations without explicit human approval are strictly prohibited.
- **Single Warehouse Invariant**: Only one physical store inventory location is tracked in `inventory_items`. No multi-warehouse or 3PL partitioning.
- **Transactional Consistency**: All inventory stock mutations and audit events must execute within atomic PostgreSQL transactions (`BEGIN ... COMMIT`).
- **Clean Architecture**: Domain rules stay inside `apps/api/src/modules/inventory/domain`, application services in `apps/api/src/modules/inventory/application`, and UI presentation in `apps/console/src/features/inventory` and `apps/console/src/features/agentic`.
- **Linear Operational Canvas**: Command Center styling strictly adheres to `#010102` background, amber accents (`#f59e0b` / `#fbbf24`), subtle borders, and dense typography.
- **Zero Model Leakage**: No internal AI model names (e.g. "gemini-2.5-flash") exposed in user-facing UI elements.
- **Conventional Commits**: Atomic commits matching the project format.

---

### Task 1: Database Migration for Replenishment Proposals (`inventory_replenishment_proposals`)

**Files:**
- Create: `apps/api/src/modules/inventory/infrastructure/database/migrations/202609100001_create_inventory_replenishment_proposals.ts`
- Modify: `apps/api/src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts`

**Interfaces:**
- Consumes: `node-pg-migrate` `MigrationBuilder`.
- Produces: PostgreSQL table `inventory_replenishment_proposals` and index `idx_replenishment_pending_status`.

- [ ] **Step 1: Write the failing test for migration**

In `apps/api/src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts`, add a test case verifying table creation and rollback:

```typescript
it("migrates up and down inventory_replenishment_proposals table successfully", async () => {
  await runInventoryMigrations(databaseUrl, "up");

  const checkTable = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'inventory_replenishment_proposals'
    ORDER BY ordinal_position;
  `);

  expect(checkTable.rows.length).toBeGreaterThanOrEqual(10);
  const columnNames = checkTable.rows.map((r) => r.column_name);
  expect(columnNames).toContain("id");
  expect(columnNames).toContain("trigger_source");
  expect(columnNames).toContain("status");
  expect(columnNames).toContain("summary");
  expect(columnNames).toContain("items");
  expect(columnNames).toContain("total_budget_vnd");
  expect(columnNames).toContain("created_at");

  await runInventoryMigrations(databaseUrl, "down", 1);
  const checkDropped = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'inventory_replenishment_proposals'
    );
  `);
  expect(checkDropped.rows[0].exists).toBe(false);

  // Restore migration up
  await runInventoryMigrations(databaseUrl, "up");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts`
Expected: FAIL (table `inventory_replenishment_proposals` does not exist).

- [ ] **Step 3: Write migration implementation**

Create `apps/api/src/modules/inventory/infrastructure/database/migrations/202609100001_create_inventory_replenishment_proposals.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("inventory_replenishment_proposals", {
    id: { type: "uuid", primaryKey: true },
    trigger_source: { type: "varchar(32)", notNull: true },
    status: { type: "varchar(32)", notNull: true, default: "pending_review" },
    summary: { type: "text", notNull: true },
    risk_assessment: { type: "text" },
    items: { type: "jsonb", notNull: true },
    total_budget_vnd: { type: "bigint", notNull: true, default: 0 },
    docx_report_key: { type: "varchar(255)" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    reviewed_at: { type: "timestamptz" },
    reviewed_by: { type: "varchar(128)" },
  });

  pgm.createIndex("inventory_replenishment_proposals", ["status", "created_at"], {
    name: "idx_replenishment_pending_status",
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex("inventory_replenishment_proposals", ["status", "created_at"], {
    name: "idx_replenishment_pending_status",
  });
  pgm.dropTable("inventory_replenishment_proposals");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/inventory/infrastructure/database/migrations/202609100001_create_inventory_replenishment_proposals.ts apps/api/src/modules/inventory/infrastructure/database/inventory-migration.integration.test.ts
git commit -m "feat(inventory): add inventory_replenishment_proposals migration"
```

---

### Task 2: Inventory Replenishment DTOs & PostgreSQL Repository

**Files:**
- Create: `apps/api/src/modules/inventory/application/dtos/inventory-replenishment.dto.ts`
- Create: `apps/api/src/modules/inventory/application/repositories/interfaces/inventory-replenishment.repository.ts`
- Create: `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory-replenishment.repository.ts`
- Create: `apps/api/src/modules/inventory/tests/inventory-replenishment.repository.test.ts`

**Interfaces:**
- Consumes: `Pool` from `pg`, `ReplenishmentProposalItemDto`.
- Produces: `InventoryReplenishmentRepositoryContract`, `PostgresqlInventoryReplenishmentRepository`.

- [ ] **Step 1: Write the failing test for repository**

Create `apps/api/src/modules/inventory/tests/inventory-replenishment.repository.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { PostgresqlInventoryReplenishmentRepository } from "../infrastructure/repositories/implementations/postgresql-inventory-replenishment.repository";

describe("PostgresqlInventoryReplenishmentRepository", () => {
  it("creates and retrieves pending replenishment proposals", async () => {
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string, params: any[]) => {
        if (sql.includes("INSERT INTO inventory_replenishment_proposals")) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("WHERE status = 'pending_review'")) {
          return Promise.resolve({
            rows: [
              {
                id: "prop-1",
                trigger_source: "scheduled_cron",
                status: "pending_review",
                summary: "Phát hiện 2 SKU cạn kiệt",
                risk_assessment: "Nguy cơ đứt gãy",
                items: JSON.stringify([
                  { sku: "SKU-1", variantId: "v-1", recommendedRestockQuantity: 20 },
                ]),
                total_budget_vnd: "13000000",
                docx_report_key: "report.docx",
                created_at: new Date("2026-09-10T10:00:00Z"),
                updated_at: new Date("2026-09-10T10:00:00Z"),
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const repo = new PostgresqlInventoryReplenishmentRepository(mockClient as any);
    await repo.create({
      id: "prop-1",
      triggerSource: "scheduled_cron",
      status: "pending_review",
      summary: "Phát hiện 2 SKU cạn kiệt",
      riskAssessment: "Nguy cơ đứt gãy",
      items: [
        {
          sku: "SKU-1",
          variantId: "v-1",
          productId: "p-1",
          productName: "Sản phẩm 1",
          categoryName: "Linh kiện",
          onHand: 2,
          reserved: 0,
          availableQuantity: 2,
          recentUnitsSold7d: 14,
          recommendedRestockQuantity: 20,
          estimatedUnitCostVnd: 650000,
          estimatedLineCostVnd: 13000000,
          actionRationale: "Bán 14 cái trong 7 ngày",
        },
      ],
      totalBudgetVnd: 13000000,
      docxReportKey: "report.docx",
    });

    const pending = await repo.findLatestPending();
    expect(pending).toBeDefined();
    expect(pending?.id).toBe("prop-1");
    expect(pending?.items[0].sku).toBe("SKU-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test src/modules/inventory/tests/inventory-replenishment.repository.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement DTOs and Repository**

Create `apps/api/src/modules/inventory/application/dtos/inventory-replenishment.dto.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface ReplenishmentProposalItemDto {
  readonly sku: string;
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly categoryName: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly availableQuantity: number;
  readonly recentUnitsSold7d: number;
  readonly recommendedRestockQuantity: number;
  readonly estimatedUnitCostVnd: number;
  readonly estimatedLineCostVnd: number;
  readonly actionRationale: string;
}

export type ReplenishmentTriggerSource = "scheduled_cron" | "post_order_event" | "manual";
export type ReplenishmentProposalStatus = "pending_review" | "approved" | "dismissed";

export interface ReplenishmentProposalDto {
  readonly id: string;
  readonly triggerSource: ReplenishmentTriggerSource;
  readonly status: ReplenishmentProposalStatus;
  readonly summary: string;
  readonly riskAssessment: string;
  readonly items: readonly ReplenishmentProposalItemDto[];
  readonly totalBudgetVnd: number;
  readonly docxReportKey?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
}

export interface CreateReplenishmentProposalInput {
  readonly id: string;
  readonly triggerSource: ReplenishmentTriggerSource;
  readonly status: ReplenishmentProposalStatus;
  readonly summary: string;
  readonly riskAssessment?: string;
  readonly items: readonly ReplenishmentProposalItemDto[];
  readonly totalBudgetVnd: number;
  readonly docxReportKey?: string;
}
```

Create `apps/api/src/modules/inventory/application/repositories/interfaces/inventory-replenishment.repository.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CreateReplenishmentProposalInput,
  ReplenishmentProposalDto,
  ReplenishmentProposalStatus,
} from "../../dtos/inventory-replenishment.dto";

export interface InventoryReplenishmentRepositoryContract {
  create(proposal: CreateReplenishmentProposalInput): Promise<void>;
  findLatestPending(): Promise<ReplenishmentProposalDto | null>;
  findById(id: string): Promise<ReplenishmentProposalDto | null>;
  updateStatus(id: string, status: ReplenishmentProposalStatus, reviewedBy?: string): Promise<void>;
}
```

Create `apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory-replenishment.repository.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Pool } from "pg";
import type {
  CreateReplenishmentProposalInput,
  ReplenishmentProposalDto,
  ReplenishmentProposalItemDto,
  ReplenishmentProposalStatus,
} from "../../../application/dtos/inventory-replenishment.dto";
import type { InventoryReplenishmentRepositoryContract } from "../../../application/repositories/interfaces/inventory-replenishment.repository";

export class PostgresqlInventoryReplenishmentRepository implements InventoryReplenishmentRepositoryContract {
  constructor(private readonly db: Pool) {}

  async create(proposal: CreateReplenishmentProposalInput): Promise<void> {
    await this.db.query(
      `INSERT INTO inventory_replenishment_proposals (
        id, trigger_source, status, summary, risk_assessment, items, total_budget_vnd, docx_report_key, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        proposal.id,
        proposal.triggerSource,
        proposal.status,
        proposal.summary,
        proposal.riskAssessment ?? null,
        JSON.stringify(proposal.items),
        proposal.totalBudgetVnd,
        proposal.docxReportKey ?? null,
      ],
    );
  }

  async findLatestPending(): Promise<ReplenishmentProposalDto | null> {
    const { rows } = await this.db.query(
      `SELECT id, trigger_source, status, summary, risk_assessment, items, total_budget_vnd, docx_report_key, created_at, updated_at, reviewed_at, reviewed_by
       FROM inventory_replenishment_proposals
       WHERE status = 'pending_review'
       ORDER BY created_at DESC
       LIMIT 1`,
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async findById(id: string): Promise<ReplenishmentProposalDto | null> {
    const { rows } = await this.db.query(
      `SELECT id, trigger_source, status, summary, risk_assessment, items, total_budget_vnd, docx_report_key, created_at, updated_at, reviewed_at, reviewed_by
       FROM inventory_replenishment_proposals
       WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async updateStatus(id: string, status: ReplenishmentProposalStatus, reviewedBy?: string): Promise<void> {
    await this.db.query(
      `UPDATE inventory_replenishment_proposals
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [status, reviewedBy ?? null, id],
    );
  }

  private mapRow(row: any): ReplenishmentProposalDto {
    const rawItems = typeof row.items === "string" ? JSON.parse(row.items) : row.items;
    return {
      id: row.id,
      triggerSource: row.trigger_source,
      status: row.status,
      summary: row.summary,
      riskAssessment: row.risk_assessment ?? "",
      items: (rawItems as ReplenishmentProposalItemDto[]) ?? [],
      totalBudgetVnd: Number(row.total_budget_vnd),
      docxReportKey: row.docx_report_key ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
      reviewedBy: row.reviewed_by ?? undefined,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test src/modules/inventory/tests/inventory-replenishment.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/inventory/application/dtos/inventory-replenishment.dto.ts apps/api/src/modules/inventory/application/repositories/interfaces/inventory-replenishment.repository.ts apps/api/src/modules/inventory/infrastructure/repositories/implementations/postgresql-inventory-replenishment.repository.ts apps/api/src/modules/inventory/tests/inventory-replenishment.repository.test.ts
git commit -m "feat(inventory): add replenishment repository and DTOs"
```

---

### Task 3: Grounded Context Query & AI Logistics Reasoner with Heuristic Fallback

**Files:**
- Modify: `apps/api/src/modules/inventory/application/services/implementations/ai-operations.service.ts`
- Modify: `apps/api/src/modules/inventory/tests/ai-operations.service.test.ts`

**Interfaces:**
- Consumes: PostgreSQL `product_variants`, `products`, `inventory_items`, `order_lines`, `orders`, `InventoryReplenishmentRepositoryContract`.
- Produces: `generateReplenishmentAnalysis(triggerSource, targetVariantIds?)` returning `ReplenishmentProposalDto | null`.

- [ ] **Step 1: Write the failing test for replenishment analysis**

In `apps/api/src/modules/inventory/tests/ai-operations.service.test.ts`, add test cases for `generateReplenishmentAnalysis`:

```typescript
it("generates replenishment analysis with 7-day sales velocity and heuristic fallback", async () => {
  const mockDb = {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("units_sold_7d")) {
        return Promise.resolve({
          rows: [
            {
              variantId: "v1",
              productId: "p1",
              productName: "Chuột Gaming RGB",
              productSlug: "chuot-gaming",
              sku: "MS-RGB-01",
              categoryName: "Linh kiện",
              onHand: 3,
              reserved: 1,
              priceMinor: 500000,
              recentUnitsSold7d: 14,
            },
            {
              variantId: "v2",
              productId: "p2",
              productName: "Bàn phím cơ Silent",
              productSlug: "ban-phim-silent",
              sku: "KB-SILENT-02",
              categoryName: "Linh kiện",
              onHand: 20,
              reserved: 0,
              priceMinor: 1200000,
              recentUnitsSold7d: 2,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    }),
    connect: vi.fn(),
  } as any;

  const mockRepo = {
    create: vi.fn().mockResolvedValue(undefined),
    findLatestPending: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  };

  const service = new AiOperationsService(
    mockDb,
    () => "2026-09-10T12:00:00.000Z",
    () => "prop-uuid-1",
    mockRepo,
  );

  const proposal = await service.generateReplenishmentAnalysis({
    triggerSource: "scheduled_cron",
  });

  expect(proposal).not.toBeNull();
  expect(proposal?.items).toHaveLength(1); // Only v1 is critical/low
  expect(proposal?.items[0].sku).toBe("MS-RGB-01");
  expect(proposal?.items[0].availableQuantity).toBe(2);
  expect(proposal?.items[0].recentUnitsSold7d).toBe(14);
  expect(proposal?.items[0].recommendedRestockQuantity).toBeGreaterThan(0);
  expect(mockRepo.create).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test src/modules/inventory/tests/ai-operations.service.test.ts`
Expected: FAIL (`generateReplenishmentAnalysis` is not a function).

- [ ] **Step 3: Implement `generateReplenishmentAnalysis` in `AiOperationsService`**

In `apps/api/src/modules/inventory/application/services/implementations/ai-operations.service.ts`:
1. Inject optional `replenishmentRepo?: InventoryReplenishmentRepositoryContract`.
2. Add `generateReplenishmentAnalysis(options: { triggerSource: ReplenishmentTriggerSource; targetVariantIds?: string[] }): Promise<ReplenishmentProposalDto | null>`:
   - Query grounded context joining `product_variants`, `products`, `inventory_items`, `product_prices`, and 7-day `order_lines` sales velocity.
   - Filter rows needing replenishment: `available <= 5` OR `available <= Math.ceil((recentUnitsSold7d / 7) * 3)`.
   - If no rows match, return `null`.
   - If `OPENROUTER_API_KEY` present, send prompt to OpenRouter; otherwise invoke heuristic restock calculation:
     `dailyVelocity = Math.max(1, Math.round(recentUnitsSold7d / 7))`
     `restockQty = Math.max(10, Math.ceil(dailyVelocity * 14 - available))`
     `unitCost = Math.round(priceMinor * 0.65)`
   - Create proposal via `replenishmentRepo.create(...)`.
   - Return proposal DTO.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test src/modules/inventory/tests/ai-operations.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/inventory/application/services/implementations/ai-operations.service.ts apps/api/src/modules/inventory/tests/ai-operations.service.test.ts
git commit -m "feat(inventory): add generateReplenishmentAnalysis with velocity grounding"
```

---

### Task 4: Autonomous Replenishment Monitor Service with Debounce & Scheduler

**Files:**
- Create: `apps/api/src/modules/inventory/application/services/interfaces/autonomous-replenishment-monitor.service.ts`
- Create: `apps/api/src/modules/inventory/application/services/implementations/autonomous-replenishment-monitor.service.ts`
- Create: `apps/api/src/modules/inventory/tests/autonomous-replenishment-monitor.service.test.ts`

**Interfaces:**
- Consumes: `AiOperationsService`, `InventoryReplenishmentRepositoryContract`.
- Produces: `AutonomousReplenishmentMonitorServiceContract`, `AutonomousReplenishmentMonitorService`.

- [ ] **Step 1: Write the failing test for monitor service**

Create `apps/api/src/modules/inventory/tests/autonomous-replenishment-monitor.service.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { AutonomousReplenishmentMonitorService } from "../application/services/implementations/autonomous-replenishment-monitor.service";

describe("AutonomousReplenishmentMonitorService", () => {
  it("suppresses replenishment scans during 15-minute cooldown window", async () => {
    const mockAi = {
      generateReplenishmentAnalysis: vi.fn().mockResolvedValue({ id: "prop-1" }),
    };
    const mockRepo = {
      findLatestPending: vi.fn().mockResolvedValue(null),
    };

    let currentTime = 1000000;
    const monitor = new AutonomousReplenishmentMonitorService(
      mockAi as any,
      mockRepo as any,
      () => currentTime,
    );

    const first = await monitor.triggerScan("post_order_event", ["v-1"]);
    expect(first).toBeDefined();
    expect(mockAi.generateReplenishmentAnalysis).toHaveBeenCalledTimes(1);

    // Fast successive trigger within 15 minutes (900,000 ms)
    currentTime += 60000; // 1 minute later
    const second = await monitor.triggerScan("post_order_event", ["v-1"]);
    expect(second).toBeNull(); // Debounced
    expect(mockAi.generateReplenishmentAnalysis).toHaveBeenCalledTimes(1);
  });

  it("suppresses scan if a pending proposal was created within past 6 hours", async () => {
    const mockAi = {
      generateReplenishmentAnalysis: vi.fn(),
    };
    const mockRepo = {
      findLatestPending: vi.fn().mockResolvedValue({
        id: "existing-pending",
        createdAt: "2026-09-10T11:00:00.000Z",
      }),
    };

    const monitor = new AutonomousReplenishmentMonitorService(
      mockAi as any,
      mockRepo as any,
      () => new Date("2026-09-10T12:00:00.000Z").getTime(),
    );

    const result = await monitor.triggerScan("scheduled_cron");
    expect(result).toBeNull();
    expect(mockAi.generateReplenishmentAnalysis).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test src/modules/inventory/tests/autonomous-replenishment-monitor.service.test.ts`
Expected: FAIL (service does not exist).

- [ ] **Step 3: Implement `AutonomousReplenishmentMonitorService`**

Create `apps/api/src/modules/inventory/application/services/interfaces/autonomous-replenishment-monitor.service.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ReplenishmentProposalDto,
  ReplenishmentTriggerSource,
} from "../../dtos/inventory-replenishment.dto";

export interface AutonomousReplenishmentMonitorServiceContract {
  triggerScan(
    source: ReplenishmentTriggerSource,
    targetVariantIds?: string[],
  ): Promise<ReplenishmentProposalDto | null>;
  startHeartbeat(intervalMs?: number): void;
  stopHeartbeat(): void;
}
```

Create `apps/api/src/modules/inventory/application/services/implementations/autonomous-replenishment-monitor.service.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ReplenishmentProposalDto,
  ReplenishmentTriggerSource,
} from "../../dtos/inventory-replenishment.dto";
import type { InventoryReplenishmentRepositoryContract } from "../../repositories/interfaces/inventory-replenishment.repository";
import type { AutonomousReplenishmentMonitorServiceContract } from "../interfaces/autonomous-replenishment-monitor.service";
import type { AiOperationsService } from "./ai-operations.service";

const DEBOUNCE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const PENDING_PROPOSAL_SUPPRESSION_MS = 6 * 60 * 60 * 1000; // 6 hours

export class AutonomousReplenishmentMonitorService
  implements AutonomousReplenishmentMonitorServiceContract
{
  private lastCheckTimestamp = 0;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly aiOperations: AiOperationsService,
    private readonly repository: InventoryReplenishmentRepositoryContract,
    private readonly getTime: () => number = () => Date.now(),
  ) {}

  async triggerScan(
    source: ReplenishmentTriggerSource,
    targetVariantIds?: string[],
  ): Promise<ReplenishmentProposalDto | null> {
    const now = this.getTime();

    // 1. Debounce rapid trigger calls within 15 minutes
    if (now - this.lastCheckTimestamp < DEBOUNCE_COOLDOWN_MS) {
      return null;
    }

    // 2. Check if a recent pending proposal already exists
    const latestPending = await this.repository.findLatestPending();
    if (latestPending) {
      const pendingAge = now - new Date(latestPending.createdAt).getTime();
      if (pendingAge < PENDING_PROPOSAL_SUPPRESSION_MS) {
        return null; // Suppress duplicate alert
      }
    }

    this.lastCheckTimestamp = now;
    return this.aiOperations.generateReplenishmentAnalysis({
      triggerSource: source,
      targetVariantIds,
    });
  }

  startHeartbeat(intervalMs = 6 * 60 * 60 * 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.triggerScan("scheduled_cron").catch((err) => {
        console.error("Autonomous replenishment cron failed:", err);
      });
    }, intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stopHeartbeat(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test src/modules/inventory/tests/autonomous-replenishment-monitor.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/inventory/application/services/interfaces/autonomous-replenishment-monitor.service.ts apps/api/src/modules/inventory/application/services/implementations/autonomous-replenishment-monitor.service.ts apps/api/src/modules/inventory/tests/autonomous-replenishment-monitor.service.test.ts
git commit -m "feat(inventory): add AutonomousReplenishmentMonitorService with cooldown and debounce"
```

---

### Task 5: Post-Order Event Hook in Order Service

**Files:**
- Modify: `apps/api/src/modules/order/application/services/implementations/order.service.ts`
- Modify: `apps/api/src/modules/order/application/services/implementations/order.service.test.ts`

**Interfaces:**
- Consumes: `onOrderPaid?: (lines: readonly { variantId: string; quantity: number }[]) => void | Promise<void>`.
- Produces: Dispatches post-order notification when an order transitions to `paid`.

- [ ] **Step 1: Write the failing test for order paid callback**

In `apps/api/src/modules/order/application/services/implementations/order.service.test.ts`, test that transitioning an order to `paid` triggers `onOrderPaid`:

```typescript
it("invokes onOrderPaid hook when order transitions to paid", async () => {
  const onOrderPaid = vi.fn();
  const service = new OrderService(
    mockRepository,
    mockTransactions,
    () => "id-1",
    () => "2026-09-10T12:00:00.000Z",
    mockCancellation,
    onOrderPaid,
  );

  await service.transition(
    "order-1",
    { targetStatus: "paid", version: 1, reasonCode: "PAYMENT_CONFIRMED", idempotencyKey: "paid-k" },
    { actorId: "staff-1", roles: ["administrator"], correlationId: "c-1" },
  );

  expect(onOrderPaid).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ variantId: expect.any(String) }),
    ]),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test src/modules/order/application/services/implementations/order.service.test.ts`
Expected: FAIL (parameter `onOrderPaid` not handled).

- [ ] **Step 3: Modify `OrderService` to invoke `onOrderPaid`**

In `apps/api/src/modules/order/application/services/implementations/order.service.ts`:
1. Add constructor parameter:
   ```typescript
   private readonly onOrderPaid?: (lines: readonly { variantId: string; quantity: number }[]) => void | Promise<void>,
   ```
2. In `applyTransition`:
   ```typescript
   if (targetStatus === "paid" && this.onOrderPaid) {
     Promise.resolve(
       this.onOrderPaid(
         aggregate.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
       ),
     ).catch((err) => {
       console.error("onOrderPaid listener failed:", err);
     });
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test src/modules/order/application/services/implementations/order.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/order/application/services/implementations/order.service.ts apps/api/src/modules/order/application/services/implementations/order.service.test.ts
git commit -m "feat(order): invoke onOrderPaid hook upon transition to paid"
```

---

### Task 6: Inventory Replenishment API Controller & Routes

**Files:**
- Modify: `apps/api/src/modules/inventory/presentation/controllers/inventory.controller.ts`
- Modify: `apps/api/src/modules/inventory/presentation/routes/inventory.routes.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`
- Create: `apps/api/src/modules/inventory/tests/inventory-replenishment.api.test.ts`

**Interfaces:**
- Consumes: `InventoryReplenishmentRepositoryContract`, `AutonomousReplenishmentMonitorServiceContract`.
- Produces:
  - `GET /v1/admin/inventory/replenishment/pending`
  - `POST /v1/admin/inventory/replenishment/trigger-scan`
  - `POST /v1/admin/inventory/replenishment/:proposalId/apply`
  - `POST /v1/admin/inventory/replenishment/:proposalId/dismiss`

- [ ] **Step 1: Write the failing test for replenishment endpoints**

Create `apps/api/src/modules/inventory/tests/inventory-replenishment.api.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { InventoryController } from "../presentation/controllers/inventory.controller";
import { createInventoryRouter } from "../presentation/routes/inventory.routes";

describe("Inventory Replenishment API", () => {
  it("GET /replenishment/pending returns latest pending proposal", async () => {
    const mockRepo = {
      findLatestPending: vi.fn().mockResolvedValue({
        id: "prop-123",
        triggerSource: "scheduled_cron",
        status: "pending_review",
        summary: "Phát hiện 2 SKU sắp hết",
        items: [],
        totalBudgetVnd: 5000000,
        createdAt: "2026-09-10T10:00:00Z",
      }),
      findById: vi.fn(),
      updateStatus: vi.fn(),
    };
    const mockMonitor = {
      triggerScan: vi.fn(),
    };
    const controller = new InventoryController(
      {} as any,
      undefined,
      mockRepo as any,
      mockMonitor as any,
    );

    const app = express();
    app.use(express.json());
    app.use("/v1/admin/inventory", createInventoryRouter(controller, (req, res, next) => next(), vi.fn() as any));

    const response = await request(app).get("/v1/admin/inventory/replenishment/pending");
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe("prop-123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/api test src/modules/inventory/tests/inventory-replenishment.api.test.ts`
Expected: FAIL (route returns 404).

- [ ] **Step 3: Implement Controller handlers and Router endpoints**

In `apps/api/src/modules/inventory/presentation/controllers/inventory.controller.ts`:
Add handlers:
- `getPendingReplenishment`: returns `repository.findLatestPending()`
- `triggerReplenishmentScan`: calls `monitor.triggerScan("manual")`
- `applyReplenishmentProposal`: calls `aiOperations.applyOperationsProposal(...)`, marks proposal `approved`
- `dismissReplenishmentProposal`: calls `repository.updateStatus(id, "dismissed", actorId)`

In `apps/api/src/modules/inventory/presentation/routes/inventory.routes.ts`:
Register routes:
- `router.get("/replenishment/pending", ...read, controller.getPendingReplenishment);`
- `router.post("/replenishment/trigger-scan", ...read, controller.triggerReplenishmentScan);`
- `router.post("/replenishment/:proposalId/apply", authenticate, controller.applyReplenishmentProposal);`
- `router.post("/replenishment/:proposalId/dismiss", authenticate, controller.dismissReplenishmentProposal);`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/api test src/modules/inventory/tests/inventory-replenishment.api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/inventory/presentation/controllers/inventory.controller.ts apps/api/src/modules/inventory/presentation/routes/inventory.routes.ts apps/api/src/modules/inventory/inventory.module.ts apps/api/src/modules/inventory/tests/inventory-replenishment.api.test.ts
git commit -m "feat(inventory): add replenishment API routes and controller handlers"
```

---

### Task 7: Console Inventory Client API & Type Definitions

**Files:**
- Modify: `apps/console/src/features/inventory/types/inventory.types.ts`
- Modify: `apps/console/src/features/inventory/api/inventory-api.ts`
- Modify: `apps/console/src/features/inventory/tests/operations-proposal-modal.test.tsx`

**Interfaces:**
- Consumes: Backend `/v1/admin/inventory/replenishment/*` endpoints.
- Produces: `InventoryApi.getPendingReplenishment()`, `InventoryApi.dismissReplenishmentProposal()`, updated `OperationsProposal` type with `recentUnitsSold7d`.

- [ ] **Step 1: Write failing test in Console**

In `apps/console/src/features/inventory/tests/inventory-api.test.ts`, add test for replenishment methods:

```typescript
it("loads pending replenishment proposal and dismisses correctly", async () => {
  const request = vi.fn().mockResolvedValue({
    data: {
      id: "prop-pending-1",
      triggerSource: "scheduled_cron",
      status: "pending_review",
      summary: "Cần bổ sung kho",
      items: [],
      totalRestockUnits: 20,
      totalEstimatedBudgetVnd: 5000000,
    },
  });
  const api = createInventoryApi({ request, baseUrl: "http://api" });
  const pending = await api.getPendingReplenishment();
  expect(pending?.id).toBe("prop-pending-1");

  await api.dismissReplenishmentProposal("prop-pending-1");
  expect(request).toHaveBeenCalledWith(
    "/v1/admin/inventory/replenishment/prop-pending-1/dismiss",
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/inventory/tests/inventory-api.test.ts`
Expected: FAIL (methods not defined).

- [ ] **Step 3: Update `inventory.types.ts` and `inventory-api.ts`**

In `apps/console/src/features/inventory/types/inventory.types.ts`:
- Add `recentUnitsSold7d?: number;` to `OperationsProposalItem`.
- Add `triggerSource?: "scheduled_cron" | "post_order_event" | "manual";` to `OperationsProposal`.

In `apps/console/src/features/inventory/api/inventory-api.ts`:
- Implement:
  - `getPendingReplenishment(signal?: AbortSignal): Promise<OperationsProposal | null>`
  - `triggerReplenishmentScan(): Promise<OperationsProposal | null>`
  - `dismissReplenishmentProposal(proposalId: string): Promise<void>`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/inventory/tests/inventory-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/inventory/types/inventory.types.ts apps/console/src/features/inventory/api/inventory-api.ts apps/console/src/features/inventory/tests/inventory-api.test.ts
git commit -m "feat(console): update inventory types and api for replenishment proposals"
```

---

### Task 8: Enhanced Operations Proposal Modal with 7-Day Velocity & Stepper

**Files:**
- Modify: `apps/console/src/features/inventory/components/operations-proposal-modal.tsx`
- Modify: `apps/console/src/features/inventory/tests/operations-proposal-modal.test.tsx`

**Interfaces:**
- Consumes: `OperationsProposal` with `recentUnitsSold7d`.
- Produces: Displays 7-day velocity badge, rationale, budget calculation, and handles dismissal.

- [ ] **Step 1: Write failing test for 7-day velocity badge**

In `apps/console/src/features/inventory/tests/operations-proposal-modal.test.tsx`:

```typescript
it("renders 7-day sales velocity badge when recentUnitsSold7d is provided", () => {
  const proposalWithVelocity: OperationsProposal = {
    ...mockProposal,
    items: [
      {
        ...mockProposal.items[0],
        recentUnitsSold7d: 14,
      },
    ],
  };

  render(
    <OperationsProposalModal
      isOpen={true}
      proposal={proposalWithVelocity}
      onClose={vi.fn()}
      onApply={vi.fn()}
      onDownloadDocx={vi.fn()}
    />,
  );

  expect(screen.getByText(/Đã bán 7 ngày: 14/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/inventory/tests/operations-proposal-modal.test.tsx`
Expected: FAIL (text not found).

- [ ] **Step 3: Update `OperationsProposalModal`**

In `apps/console/src/features/inventory/components/operations-proposal-modal.tsx`:
- In the table row product cell: if `item.recentUnitsSold7d !== undefined`, render:
  ```tsx
  <span className="ccOperationsVelocityBadge" title="Số lượng đã bán trong 7 ngày qua">
    🔥 Đã bán 7 ngày: {item.recentUnitsSold7d}
  </span>
  ```
- Style `.ccOperationsVelocityBadge` in `agentic-command-center.css` with subtle dark amber pill tag.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/inventory/tests/operations-proposal-modal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/inventory/components/operations-proposal-modal.tsx apps/console/src/features/inventory/tests/operations-proposal-modal.test.tsx
git commit -m "feat(console): display 7-day sales velocity badge in operations proposal modal"
```

---

### Task 9: Command Center UI: Proactive Amber Alert Card & Header Badge

**Files:**
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.css`
- Modify: `apps/console/src/features/agentic/tests/agentic-command-center.test.tsx`

**Interfaces:**
- Consumes: `inventoryApi.getPendingReplenishment()`, `inventoryApi.dismissReplenishmentProposal()`.
- Produces: Amber badge in Operations header (`⚡ Đề xuất nhập kho AI: [N] SKU`), active alert card with 1-click review and dismiss buttons.

- [ ] **Step 1: Write failing test in `agentic-command-center.test.tsx`**

In `apps/console/src/features/agentic/tests/agentic-command-center.test.tsx`:

```typescript
it("renders proactive replenishment amber alert card when pending proposal exists", async () => {
  const mockInventoryApi = {
    getPendingReplenishment: vi.fn().mockResolvedValue({
      id: "prop-auto-1",
      triggerSource: "scheduled_cron",
      status: "pending_review",
      summary: "Phát hiện 3 SKU có nguy cơ thiếu hàng do tốc độ bán tăng mạnh.",
      items: [
        { sku: "SKU-A", variantId: "v-a", productName: "Sản phẩm A", availableQuantity: 2, stockStatus: "critical_low", recommendedRestockQuantity: 20 },
      ],
      totalRestockUnits: 20,
      totalEstimatedBudgetVnd: 5000000,
    }),
    dismissReplenishmentProposal: vi.fn().mockResolvedValue(undefined),
  };

  render(<AgenticCommandCenter inventoryApi={mockInventoryApi as any} />);

  expect(await screen.findByText(/Đề xuất nhập kho AI: 1 SKU/i)).toBeInTheDocument();
  expect(screen.getByText(/Phát hiện 3 SKU có nguy cơ thiếu hàng/i)).toBeInTheDocument();
  expect(screen.getByText(/Xem & Duyệt Nhập hàng/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test src/features/agentic/tests/agentic-command-center.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement Amber Alert Card & Badge in `AgenticCommandCenter`**

In `apps/console/src/features/agentic/components/agentic-command-center.tsx`:
1. Add state `pendingReplenishment: OperationsProposal | null`.
2. On mount and periodic interval, query `inventoryApi.getPendingReplenishment()`.
3. In Column 3 (Operations & Inventory) header:
   ```tsx
   {pendingReplenishment && pendingReplenishment.items.length > 0 && (
     <span className="ccReplenishmentAlertBadge" title="Có đề xuất nhập kho tự động từ AI">
       ⚡ Đề xuất nhập kho AI: {pendingReplenishment.items.length} SKU
     </span>
   )}
   ```
4. Above DepartmentInput in Column 3, render the Active Alert Card:
   ```tsx
   {pendingReplenishment && (
     <div className="ccOperationsAlertCard">
       <div className="ccOperationsAlertHeader">
         <AlertTriangle size={15} color="#f59e0b" className="ccGlowIcon" />
         <span className="ccOperationsAlertTitle">
           🚨 Phát hiện {pendingReplenishment.items.length} mặt hàng sắp cạn kiệt
         </span>
       </div>
       <p className="ccOperationsAlertSummary">{pendingReplenishment.summary}</p>
       <div className="ccOperationsAlertActions">
         <button
           type="button"
           className="ccOperationsAlertBtn primary"
           onClick={() => {
             setOperationsProposal(pendingReplenishment);
             setIsOperationsModalOpen(true);
           }}
         >
           📋 Xem & Duyệt Nhập hàng
         </button>
         <button
           type="button"
           className="ccOperationsAlertBtn secondary"
           onClick={handleDismissReplenishment}
         >
           Bỏ qua
         </button>
       </div>
     </div>
   )}
   ```
5. Add Linear-styled CSS in `agentic-command-center.css`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test src/features/agentic/tests/agentic-command-center.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/agentic/components/agentic-command-center.tsx apps/console/src/features/agentic/components/agentic-command-center.css apps/console/src/features/agentic/tests/agentic-command-center.test.tsx
git commit -m "feat(console): add proactive replenishment alert card and header badge"
```

---

### Task 10: End-to-End System Verification, Repo Audit & Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run comprehensive tests across API and Console**

Run:
```bash
pnpm --filter @opendx/api test
pnpm --filter @opendx/console test
```
Expected: All tests pass with zero regressions.

- [ ] **Step 2: Run repository audit**

Run:
```bash
bash scripts/audit/repo.sh
```
Expected: Repository audit passed.

- [ ] **Step 3: Update `CHANGELOG.md`**

Add complete entry under `[Unreleased]` documenting:
- Autonomous background replenishment monitor service and dual-trigger (cron + post-order event).
- Velocity-grounded SQL query and AI reasoning engine with heuristic fallback.
- Command Center proactive amber alert banner and human-in-the-loop review modal.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: record autonomous inventory replenishment in changelog"
```
