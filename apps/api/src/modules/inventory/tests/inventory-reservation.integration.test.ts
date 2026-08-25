// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCatalogVariantReader } from "../../catalog";
import { runCatalogMigrations } from "../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import { InventoryReservationService } from "../application/services/implementations/inventory-reservation.service";
import { InventoryService } from "../application/services/implementations/inventory.service";
import { runInventoryMigrations } from "../infrastructure/database/run-inventory-migrations";
import { PostgresqlInventoryAuditRepository } from "../infrastructure/repositories/implementations/postgresql-inventory-audit.repository";
import { PostgresqlInventoryRepository } from "../infrastructure/repositories/implementations/postgresql-inventory.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  category: "b1000000-0000-4000-8000-000000000001",
  product: "b2000000-0000-4000-8000-000000000001",
  variant: "b3000000-0000-4000-8000-000000000001",
  variant2: "b3000000-0000-4000-8000-000000000002",
} as const;
const staffContext = {
  actorId: "staff_inventory",
  roles: ["inventory_manager"] as const,
  correlationId: "corr-receive",
};
const systemContext = {
  actorType: "system" as const,
  actorId: "checkout-service",
  correlationId: "corr-reserve",
};

describeWithDatabase("inventory reservation concurrency", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 25 });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlInventoryRepository();
  const audit = new PostgresqlInventoryAuditRepository();
  const variants = createCatalogVariantReader();
  const inventory = new InventoryService(
    repository,
    variants,
    audit,
    transactions,
    randomUUID,
    () => "2026-08-05T00:00:00.000Z",
  );

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
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
       VALUES ($1, $3, 'TECH-PHONE-BLACK', 'Black', '{"color":"Black"}',
               'active', NOW(), NOW(), 1),
              ($2, $3, 'TECH-PHONE-WHITE', 'White', '{"color":"White"}',
               'active', NOW(), NOW(), 1)`,
      [ids.variant, ids.variant2, ids.product],
    );
  });

  afterAll(async () => {
    await runInventoryMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("never commits more concurrent reservations than available units", async () => {
    await inventory.receive(
      { variantId: ids.variant, quantity: 10, idempotencyKey: "receive-ten" },
      staffContext,
    );
    const reservations = new InventoryReservationService(
      repository,
      variants,
      audit,
      transactions,
      randomUUID,
      () => "2026-08-05T00:00:00.000Z",
      900_000,
    );

    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        reservations.reserve(
          {
            referenceType: "checkout",
            referenceId: `checkout-${index}`,
            lines: [{ variantId: ids.variant, quantity: 1 }],
          },
          { ...systemContext, correlationId: `corr-${index}` },
        ),
      ),
    );

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(10);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(10);
    const balance = await pool.query<{ on_hand: number; reserved: number }>(
      "SELECT on_hand, reserved FROM inventory_items WHERE variant_id = $1",
      [ids.variant],
    );
    expect(balance.rows[0]).toEqual({ on_hand: 10, reserved: 10 });
    const movement = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM stock_movements WHERE movement_type = 'reservation'",
    );
    expect(movement.rows[0]).toEqual({ count: "10" });
  });

  it("allows racing expiry workers to release one due reservation once", async () => {
    const received = await inventory.receive(
      { variantId: ids.variant, quantity: 2, idempotencyKey: "receive-two" },
      staffContext,
    );
    const beforeExpiry = new InventoryReservationService(
      repository,
      variants,
      audit,
      transactions,
      randomUUID,
      () => "2026-08-05T00:00:00.000Z",
      900_000,
    );
    await beforeExpiry.reserve(
      {
        referenceType: "checkout",
        referenceId: "checkout-expiry",
        lines: [{ variantId: ids.variant, quantity: 2 }],
      },
      systemContext,
    );
    const afterExpiry = new InventoryReservationService(
      repository,
      variants,
      audit,
      transactions,
      randomUUID,
      () => "2026-08-05T00:16:00.000Z",
      900_000,
    );

    const expired = await Promise.all([
      afterExpiry.expireDue(100, systemContext),
      afterExpiry.expireDue(100, systemContext),
    ]);

    expect(expired.reduce((total, count) => total + count, 0)).toBe(1);
    const balance = await pool.query<{ on_hand: number; reserved: number }>(
      "SELECT on_hand, reserved FROM inventory_items WHERE id = $1",
      [received.id],
    );
    expect(balance.rows[0]).toEqual({ on_hand: 2, reserved: 0 });
    const movement = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM stock_movements WHERE movement_type = 'expiry'",
    );
    expect(movement.rows[0]).toEqual({ count: "1" });
  });

  it("expires every line in a due reservation group across a batch boundary", async () => {
    await inventory.receive(
      { variantId: ids.variant, quantity: 1, idempotencyKey: "receive-group-first" },
      staffContext,
    );
    await inventory.receive(
      { variantId: ids.variant2, quantity: 1, idempotencyKey: "receive-group-second" },
      staffContext,
    );
    const beforeExpiry = new InventoryReservationService(
      repository,
      variants,
      audit,
      transactions,
      randomUUID,
      () => "2026-08-05T00:00:00.000Z",
      900_000,
    );
    await beforeExpiry.reserve(
      {
        referenceType: "checkout",
        referenceId: "checkout-multi-expiry",
        lines: [
          { variantId: ids.variant, quantity: 1 },
          { variantId: ids.variant2, quantity: 1 },
        ],
      },
      systemContext,
    );
    const afterExpiry = new InventoryReservationService(
      repository,
      variants,
      audit,
      transactions,
      randomUUID,
      () => "2026-08-05T00:16:00.000Z",
      900_000,
    );

    await expect(afterExpiry.expireDue(1, systemContext)).resolves.toBe(2);
    const states = await pool.query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count
       FROM inventory_reservations
       WHERE reference_id = 'checkout-multi-expiry'
       GROUP BY status`,
    );
    expect(states.rows).toEqual([{ status: "expired", count: "2" }]);
    const balances = await pool.query<{ reserved: number }>(
      "SELECT reserved FROM inventory_items ORDER BY variant_id",
    );
    expect(balances.rows).toEqual([{ reserved: 0 }, { reserved: 0 }]);
  });

  it("converges concurrent retries for one reservation reference", async () => {
    await inventory.receive(
      { variantId: ids.variant, quantity: 2, idempotencyKey: "receive-retry" },
      staffContext,
    );
    const reservations = new InventoryReservationService(
      repository,
      variants,
      audit,
      transactions,
      randomUUID,
      () => "2026-08-05T00:00:00.000Z",
      900_000,
    );
    const request = {
      referenceType: "checkout" as const,
      referenceId: "checkout-retry",
      lines: [{ variantId: ids.variant, quantity: 1 }],
    };

    const attempts = await Promise.allSettled([
      reservations.reserve(request, systemContext),
      reservations.reserve(request, systemContext),
    ]);

    expect(attempts.every(({ status }) => status === "fulfilled")).toBe(true);
    const balance = await pool.query<{ reserved: number }>(
      "SELECT reserved FROM inventory_items WHERE variant_id = $1",
      [ids.variant],
    );
    expect(balance.rows[0]).toEqual({ reserved: 1 });
    const movement = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM stock_movements WHERE movement_type = 'reservation'",
    );
    expect(movement.rows[0]).toEqual({ count: "1" });
  });

  it("rejects concurrent reservation requests that reuse one reference with different lines", async () => {
    await inventory.receive(
      { variantId: ids.variant, quantity: 1, idempotencyKey: "receive-first" },
      staffContext,
    );
    await inventory.receive(
      { variantId: ids.variant2, quantity: 1, idempotencyKey: "receive-second" },
      staffContext,
    );
    const reservations = new InventoryReservationService(
      repository,
      variants,
      audit,
      transactions,
      randomUUID,
      () => "2026-08-05T00:00:00.000Z",
      900_000,
    );

    const attempts = await Promise.allSettled([
      reservations.reserve(
        { referenceType: "checkout", referenceId: "checkout-conflict", lines: [{ variantId: ids.variant, quantity: 1 }] },
        systemContext,
      ),
      reservations.reserve(
        { referenceType: "checkout", referenceId: "checkout-conflict", lines: [{ variantId: ids.variant2, quantity: 1 }] },
        systemContext,
      ),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const rows = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM inventory_reservations WHERE reference_id = 'checkout-conflict'",
    );
    expect(rows.rows[0]).toEqual({ count: "1" });
  });

  it("rolls back every reservation effect when later checkout work fails", async () => {
    await inventory.receive(
      { variantId: ids.variant, quantity: 2, idempotencyKey: "receive-rollback" },
      staffContext,
    );
    const reservations = new InventoryReservationService(
      repository, variants, audit, transactions, randomUUID,
      () => "2026-08-05T00:00:00.000Z", 900_000,
    );

    await expect(transactions.run(async (session) => {
      await reservations.reserveInSession(session, {
        referenceType: "checkout",
        referenceId: "checkout-rollback",
        lines: [{ variantId: ids.variant, quantity: 2 }],
      }, systemContext);
      throw new Error("later checkout write failed");
    })).rejects.toThrow("later checkout write failed");

    const balance = await pool.query<{ on_hand: number; reserved: number }>(
      "SELECT on_hand,reserved FROM inventory_items WHERE variant_id=$1", [ids.variant],
    );
    expect(balance.rows[0]).toEqual({ on_hand: 2, reserved: 0 });
    await expect(pool.query("SELECT 1 FROM inventory_reservations WHERE reference_id='checkout-rollback'")).resolves.toMatchObject({ rowCount: 0 });
    await expect(pool.query("SELECT 1 FROM stock_movements WHERE movement_type='reservation'")).resolves.toMatchObject({ rowCount: 0 });
    await expect(pool.query("SELECT 1 FROM audit_events WHERE action='inventory.stock.reserved'")).resolves.toMatchObject({ rowCount: 0 });
  });

  it("rolls back every consume effect when later paid work fails", async () => {
    await inventory.receive(
      { variantId: ids.variant, quantity: 2, idempotencyKey: "receive-consume-rollback" },
      staffContext,
    );
    const reservations = new InventoryReservationService(
      repository, variants, audit, transactions, randomUUID,
      () => "2026-08-05T00:00:00.000Z", 900_000,
    );
    const reference = { referenceType: "checkout" as const, referenceId: "checkout-consume-rollback" };
    await reservations.reserve({ ...reference, lines: [{ variantId: ids.variant, quantity: 2 }] }, systemContext);

    await expect(transactions.run(async (session) => {
      await reservations.consumeInSession(session, reference, systemContext);
      throw new Error("later paid write failed");
    })).rejects.toThrow("later paid write failed");

    const balance = await pool.query<{ on_hand: number; reserved: number }>(
      "SELECT on_hand,reserved FROM inventory_items WHERE variant_id=$1", [ids.variant],
    );
    expect(balance.rows[0]).toEqual({ on_hand: 2, reserved: 2 });
    const state = await pool.query<{ status: string }>(
      "SELECT status FROM inventory_reservations WHERE reference_id=$1", [reference.referenceId],
    );
    expect(state.rows).toEqual([{ status: "active" }]);
    await expect(pool.query("SELECT 1 FROM stock_movements WHERE movement_type='consume'")).resolves.toMatchObject({ rowCount: 0 });
    await expect(pool.query("SELECT 1 FROM audit_events WHERE action='inventory.stock.consumed'")).resolves.toMatchObject({ rowCount: 0 });
  });
});
