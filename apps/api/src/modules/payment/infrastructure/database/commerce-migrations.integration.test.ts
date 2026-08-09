// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../shared/database/run-migrations";
import { runInventoryMigrations } from "../../../inventory/infrastructure/database/run-inventory-migrations";
import { runCustomerMigrations } from "../../../customer/infrastructure/database/run-customer-migrations";
import { runCartMigrations } from "../../../cart/infrastructure/database/run-cart-migrations";
import { runPromotionMigrations } from "../../../promotion/infrastructure/database/run-promotion-migrations";
import { runCheckoutMigrations } from "../../../checkout/infrastructure/database/run-checkout-migrations";
import { runOrderMigrations } from "../../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "./run-payment-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("Phase 6 commerce migrations", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
  });

  afterAll(async () => {
    await runPaymentMigrations(databaseUrl!, "down").catch(() => undefined);
    await runOrderMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCheckoutMigrations(databaseUrl!, "down", 999999).catch(() => undefined);
    await runPromotionMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runInventoryMigrations(databaseUrl!, "down");
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("creates constrained single-company checkout, order, and payment storage then rolls back", async () => {
    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
    await runPaymentMigrations(databaseUrl!, "up");

    const expectedTables = [
      "promotions",
      "promotion_redemptions",
      "checkout_sessions",
      "checkout_session_lines",
      "orders",
      "order_lines",
      "order_status_history",
      "payments",
      "payment_attempts",
      "payment_events",
      "payment_reconciliations",
    ];
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [expectedTables],
    );
    expect(tables.rows.map(({ table_name }) => table_name).sort()).toEqual([...expectedTables].sort());

    const companyColumns = await pool.query(
      "SELECT table_name FROM information_schema.columns WHERE table_name = ANY($1::text[]) AND column_name = 'company_id'",
      [expectedTables],
    );
    expect(companyColumns.rowCount).toBe(0);

    const constraints = await pool.query<{ constraint_name: string }>(
      "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = ANY($1::text[])",
      [expectedTables],
    );
    expect(constraints.rows.map(({ constraint_name }) => constraint_name)).toEqual(expect.arrayContaining([
      "promotions_code_unique",
      "promotion_redemptions_checkout_unique",
      "checkout_sessions_customer_key_unique",
      "checkout_sessions_source_cart_version_unique",
      "orders_public_number_unique",
      "order_status_history_idempotency_unique",
      "payment_attempts_invoice_unique",
      "payment_events_provider_transaction_unique",
    ]));

    await expect(pool.query(
      "INSERT INTO promotions (id, code, name, promotion_type, percentage_bps, minimum_subtotal_vnd, status, version) VALUES (gen_random_uuid(), 'BAD', 'Bad', 'percentage', 10001, 0, 'active', 1)",
    )).rejects.toMatchObject({ code: "23514" });

    await runPaymentMigrations(databaseUrl!, "down");
    await runOrderMigrations(databaseUrl!, "down");
    await runCheckoutMigrations(databaseUrl!, "down", 999999);
    await runPromotionMigrations(databaseUrl!, "down");
    expect((await pool.query("SELECT to_regclass('public.payments') AS name")).rows[0]).toEqual({ name: null });
    expect((await pool.query("SELECT to_regclass('public.promotions') AS name")).rows[0]).toEqual({ name: null });

    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
    await runPaymentMigrations(databaseUrl!, "up");
    expect((await pool.query("SELECT to_regclass('public.payments') AS name")).rows[0]).toEqual({ name: "payments" });
  });
});
