// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { PromotionService } from "../../../application/services/implementations/promotion.service";
import { runPromotionMigrations } from "../../database/run-promotion-migrations";
import { PostgresqlPromotionRepository } from "./postgresql-promotion.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const customerId = "a2000000-0000-4000-8000-000000000001";
const checkoutId = "a3000000-0000-4000-8000-000000000001";
const orderId = "a4000000-0000-4000-8000-000000000001";

describeWithDatabase("PostgresqlPromotionRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  let sequence = 0;
  const service = new PromotionService(
    new PostgresqlPromotionRepository(),
    transactions,
    () => `a5000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    () => "2026-08-06T00:00:00.000Z",
  );

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    sequence = 0;
    await pool.query("TRUNCATE promotion_redemptions, promotions, customers, audit_events CASCADE");
    await pool.query(
      `INSERT INTO customers (id,email,email_verified_at,status,version,created_at,updated_at)
       VALUES ($1,'buyer@example.com',NOW(),'active',1,NOW(),NOW())`,
      [customerId],
    );
  });

  afterAll(async () => {
    await pool.query("TRUNCATE promotion_redemptions, promotions, customers, audit_events CASCADE");
    await runPromotionMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("persists versioned promotions and an idempotent redemption lifecycle", async () => {
    const created = await service.create({
      code: "nova10",
      name: "Nova launch",
      type: "percentage",
      percentageBps: 1_000,
      maximumDiscountVnd: 200_000,
      minimumSubtotalVnd: 500_000,
      totalUsageLimit: 10,
      perCustomerLimit: 1,
      status: "active",
    }, { actorId: "admin-1", roles: ["administrator"], correlationId: "corr-create" });

    const held = await transactions.run((session) => service.hold(session, {
      code: "NOVA10",
      customerId,
      checkoutId,
      subtotalVnd: 1_500_000,
      idempotencyKey: "checkout-key",
      correlationId: "corr-hold",
      now: "2026-08-06T00:01:00.000Z",
      expiresAt: "2026-08-06T00:16:00.000Z",
    }));
    const replay = await transactions.run((session) => service.hold(session, {
      code: "NOVA10",
      customerId,
      checkoutId,
      subtotalVnd: 1_500_000,
      idempotencyKey: "checkout-key",
      correlationId: "corr-replay",
      now: "2026-08-06T00:02:00.000Z",
      expiresAt: "2026-08-06T00:17:00.000Z",
    }));
    await transactions.run((session) => service.commit(session, checkoutId, orderId, "corr-paid", "2026-08-06T00:03:00.000Z"));
    await transactions.run((session) => service.commit(session, checkoutId, orderId, "corr-paid-replay", "2026-08-06T00:04:00.000Z"));

    expect(created.code).toBe("NOVA10");
    expect(held).toMatchObject({ discountVnd: 150_000, totalVnd: 1_350_000 });
    expect(replay).toEqual(held);
    const redemption = await pool.query<{ state: string; order_id: string }>("SELECT state,order_id FROM promotion_redemptions");
    expect(redemption.rows).toEqual([{ state: "committed", order_id: orderId }]);
    const audits = await pool.query<{ actor_type: string; action: string }>("SELECT actor_type,action FROM audit_events ORDER BY occurred_at, id");
    expect(audits.rows).toEqual([
      { actor_type: "user", action: "promotion.created" },
      { actor_type: "customer", action: "promotion.redemption.held" },
      { actor_type: "service_account", action: "promotion.redemption.committed" },
    ]);
  });

  it("serializes concurrent holds at the total usage limit", async () => {
    const secondCustomerId = "a2000000-0000-4000-8000-000000000002";
    await pool.query(
      `INSERT INTO customers (id,email,email_verified_at,status,version,created_at,updated_at)
       VALUES ($1,'second@example.com',NOW(),'active',1,NOW(),NOW())`,
      [secondCustomerId],
    );
    await service.create({
      code: "LASTONE",
      name: "Last promotion",
      type: "fixed_amount",
      fixedAmountVnd: 10_000,
      minimumSubtotalVnd: 20_000,
      totalUsageLimit: 1,
      status: "active",
    }, { actorId: "admin-1", roles: ["administrator"], correlationId: "corr-limit" });

    const results = await Promise.allSettled([
      transactions.run((session) => service.hold(session, {
        code: "LASTONE", customerId, checkoutId, subtotalVnd: 50_000,
        idempotencyKey: "limit-one", correlationId: "corr-one",
        now: "2026-08-06T00:01:00.000Z", expiresAt: "2026-08-06T00:16:00.000Z",
      })),
      transactions.run((session) => service.hold(session, {
        code: "LASTONE", customerId: secondCustomerId,
        checkoutId: "a3000000-0000-4000-8000-000000000002",
        subtotalVnd: 50_000, idempotencyKey: "limit-two",
        correlationId: "corr-two", now: "2026-08-06T00:01:00.000Z",
        expiresAt: "2026-08-06T00:16:00.000Z",
      })),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const count = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM promotion_redemptions");
    expect(count.rows[0]?.count).toBe("1");
  });
});
