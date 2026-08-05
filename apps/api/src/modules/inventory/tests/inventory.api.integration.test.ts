// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../../../app";
import type { CatalogVariantReader } from "../../catalog";
import type { StaffTokenVerifier } from "../../../shared/auth/staff-auth.middleware";
import { runCatalogMigrations } from "../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import { runInventoryMigrations } from "../infrastructure/database/run-inventory-migrations";
import { createInventoryModule } from "../inventory.module";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const variantId = "f3000000-0000-4000-8000-000000000001";

describeWithDatabase("Inventory API PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const variantReader: CatalogVariantReader = {
    findById: async () => ({ id: variantId, sku: "PHONE-X", status: "active" }),
  };
  const verifier: StaffTokenVerifier = {
    async verify(token) {
      return {
        sub: `staff-${token}`,
        name: "Staff",
        realm_access: { roles: [token] },
      };
    },
  };
  const inventory = createInventoryModule({
    transactions,
    variantReader,
    staffTokenVerifier: verifier,
    generateId: randomUUID,
    now: () => "2026-08-05T00:00:00.000Z",
    reservationTtlMs: 900_000,
    expiryIntervalMs: 30_000,
    onWorkerError: () => undefined,
  });
  const app = createApiApp({ inventoryRouter: inventory.router });

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE inventory_reservations, stock_movements, inventory_items, audit_events, categories CASCADE");
    await pool.query(
      `INSERT INTO categories (id, name, slug, sort_order, status, created_at, updated_at, version)
       VALUES ('f1000000-0000-4000-8000-000000000001', 'Phones', 'phones', 0, 'active', NOW(), NOW(), 1)` ,
    );
    await pool.query(
      `INSERT INTO products (id, category_id, name, slug, description, attributes, status, created_at, updated_at, version)
       VALUES ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Phone X', 'phone-x', 'Phone', '{}', 'draft', NOW(), NOW(), 1)`,
    );
    await pool.query(
      `INSERT INTO product_variants (id, product_id, sku, title, option_values, status, created_at, updated_at, version)
       VALUES ($1, 'f2000000-0000-4000-8000-000000000001', 'PHONE-X', 'Black', '{"color":"Black"}', 'active', NOW(), NOW(), 1)`,
      [variantId],
    );
  });
  afterAll(async () => {
    await runInventoryMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("audits a forbidden receipt without changing stock", async () => {
    await request(app)
      .post("/v1/admin/inventory/receipts")
      .set("authorization", "Bearer catalog_manager")
      .set("x-correlation-id", "corr-denied")
      .send({ variantId, quantity: 5, idempotencyKey: "receipt-denied" })
      .expect(403);

    expect(Number((await pool.query("SELECT count(*) FROM inventory_items")).rows[0].count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM stock_movements")).rows[0].count)).toBe(0);
    const audit = await pool.query("SELECT outcome, action FROM audit_events");
    expect(audit.rows).toEqual([{ outcome: "denied", action: "inventory.stock.received" }]);
  });

  it("persists an authorized receipt", async () => {
    await request(app)
      .post("/v1/admin/inventory/receipts")
      .set("authorization", "Bearer inventory_manager")
      .send({ variantId, quantity: 5, idempotencyKey: "receipt-allowed" })
      .expect(201);
    expect(Number((await pool.query("SELECT on_hand FROM inventory_items WHERE variant_id = $1", [variantId])).rows[0].on_hand)).toBe(5);
  });
});
