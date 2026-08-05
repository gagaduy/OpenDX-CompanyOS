// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCatalogVariantReader } from "../../../../catalog";
import { InventoryService } from "../../../application/services/implementations/inventory.service";
import { runInventoryMigrations } from "../../database/run-inventory-migrations";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { PostgresqlInventoryAuditRepository } from "./postgresql-inventory-audit.repository";
import { PostgresqlInventoryRepository } from "./postgresql-inventory.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  category: "91000000-0000-4000-8000-000000000001",
  product: "92000000-0000-4000-8000-000000000001",
  variant: "93000000-0000-4000-8000-000000000001",
} as const;

describeWithDatabase("PostgresqlInventoryRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  let sequence = 0;
  const service = new InventoryService(
    new PostgresqlInventoryRepository(),
    createCatalogVariantReader(),
    new PostgresqlInventoryAuditRepository(),
    transactions,
    () => `94000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    () => "2026-08-05T00:00:00.000Z",
  );
  const context = {
    actorId: "staff_inventory",
    roles: ["inventory_manager"] as const,
    correlationId: "corr-inventory",
  };

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    sequence = 0;
    await pool.query("TRUNCATE audit_events, categories CASCADE");
    await pool.query(
      `INSERT INTO categories
        (id, name, slug, sort_order, status, created_at, updated_at, version)
       VALUES ($1, 'Phones', 'phones', 0, 'active', NOW(), NOW(), 1)`,
      [ids.category],
    );
    await pool.query(
      `INSERT INTO products
        (id, category_id, name, slug, description, status, created_at, updated_at, version)
       VALUES ($1, $2, 'Phone X', 'phone-x', 'Technology phone', 'draft', NOW(), NOW(), 1)`,
      [ids.product, ids.category],
    );
    await pool.query(
      `INSERT INTO product_variants
        (id, product_id, sku, title, option_values, status, created_at, updated_at, version)
       VALUES ($1, $2, 'TECH-PHONE-BLACK', 'Black', '{"color":"Black"}',
               'active', NOW(), NOW(), 1)`,
      [ids.variant, ids.product],
    );
  });

  afterAll(async () => {
    await runInventoryMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("persists each balance change with one movement and audit event", async () => {
    const received = await service.receive(
      { variantId: ids.variant, quantity: 7, idempotencyKey: "receive-7" },
      context,
    );
    const repeated = await service.receive(
      { variantId: ids.variant, quantity: 7, idempotencyKey: "receive-7" },
      context,
    );
    const adjusted = await service.adjust(
      received.id,
      { delta: -2, reasonCode: "STOCK_COUNT", reasonNote: "Cycle count", version: received.version },
      context,
    );

    expect(repeated).toMatchObject({ onHand: 7, reserved: 0 });
    expect(adjusted).toMatchObject({ onHand: 5, reserved: 0, available: 5, stockStatus: "low" });
    await expect(service.list({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ productId: ids.product, productName: "Phone X" })],
    });
    const movements = await pool.query<{
      movement_type: string;
      on_hand_delta: number;
      reserved_delta: number;
    }>(
      `SELECT movement_type, on_hand_delta, reserved_delta
       FROM stock_movements ORDER BY occurred_at, id`,
    );
    expect(movements.rows).toEqual([
      { movement_type: "receive", on_hand_delta: 7, reserved_delta: 0 },
      { movement_type: "adjustment", on_hand_delta: -2, reserved_delta: 0 },
    ]);
    const audits = await pool.query<{ action: string; actor_type: string }>(
      `SELECT action, actor_type FROM audit_events
       WHERE resource_type = 'inventory_item' ORDER BY action`,
    );
    expect(audits.rows).toEqual([
      { action: "inventory.stock.adjusted", actor_type: "user" },
      { action: "inventory.stock.received", actor_type: "user" },
    ]);
  });
});
