// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
} from "../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../../shared/testing/assert-integration-environment";
import { runCartMigrations } from "../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "../../../payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "../../../promotion/infrastructure/database/run-promotion-migrations";
import { seedDashboardDemo } from "./dashboard-demo.seed";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const anchor = new Date("2026-08-13T05:00:00.000Z");

suite("dashboard demo seed", () => {
  if (new URL(databaseUrl!).pathname !== "/opendx_test") {
    throw new Error("Dashboard demo seed tests must run only against opendx_test");
  }
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
    await runPaymentMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE payment_reconciliations,payment_events,payment_attempts,payments,
        order_status_history,order_lines,orders,checkout_session_lines,
        checkout_sessions,promotion_redemptions,promotions,cart_resolution_requests,
        cart_items,carts,customer_addresses,guest_sessions,customer_sessions,
        customer_external_identities,customers,stock_movements,inventory_reservations,
        inventory_items,product_media,product_prices,product_variants,products,
        categories,audit_events CASCADE
    `);
    await seedCatalogFixture(pool);
  });

  afterAll(async () => {
    await runPaymentMigrations(databaseUrl!, "down");
    await runOrderMigrations(databaseUrl!, "down");
    await runCheckoutMigrations(databaseUrl!, "down");
    await runPromotionMigrations(databaseUrl!, "down");
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runInventoryMigrations(databaseUrl!, "down");
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("is idempotent and creates coherent current and previous reporting windows", async () => {
    await seedDashboardDemo(transactions, () => anchor);
    await seedDashboardDemo(transactions, () => anchor);

    await expect(demoCounts(pool)).resolves.toEqual({
      customers: 40,
      carts: 200,
      checkouts: 200,
      checkoutLines: 200,
      orders: 200,
      orderLines: 200,
      payments: 200,
    });

    const windows = await pool.query<{
      current_orders: string;
      previous_orders: string;
      current_paid: string;
      previous_paid: string;
    }>(`
      SELECT
        count(*) FILTER (WHERE created_at >= '2026-07-14T17:00:00.000Z' AND created_at < '2026-08-13T17:00:00.000Z')::text AS current_orders,
        count(*) FILTER (WHERE created_at >= '2026-06-14T17:00:00.000Z' AND created_at < '2026-07-14T17:00:00.000Z')::text AS previous_orders,
        count(*) FILTER (WHERE paid_at >= '2026-07-14T17:00:00.000Z' AND paid_at < '2026-08-13T17:00:00.000Z')::text AS current_paid,
        count(*) FILTER (WHERE paid_at >= '2026-06-14T17:00:00.000Z' AND paid_at < '2026-07-14T17:00:00.000Z')::text AS previous_paid
      FROM orders WHERE id::text LIKE 'da400000-0000-4000-8000-%'
    `);
    expect(windows.rows[0]).toEqual({
      current_orders: "120",
      previous_orders: "80",
      current_paid: "84",
      previous_paid: "56",
    });

    const inconsistent = await pool.query(`
      SELECT o.id
      FROM orders o
      JOIN checkout_sessions c ON c.id = o.checkout_id AND c.order_id = o.id
      JOIN payments p ON p.order_id = o.id
      LEFT JOIN order_lines ol ON ol.order_id = o.id
      LEFT JOIN checkout_session_lines cl ON cl.checkout_id = c.id
      WHERE o.id::text LIKE 'da400000-0000-4000-8000-%'
      GROUP BY o.id, p.status
      HAVING count(DISTINCT ol.id) <> 1
        OR count(DISTINCT cl.id) <> 1
        OR (o.paid_at IS NOT NULL) <> (p.status = 'paid')
    `);
    expect(inconsistent.rowCount).toBe(0);
  });

  it("refreshes only namespaced demo rows and preserves contributor data", async () => {
    await insertSentinelCustomer(pool);
    await seedDashboardDemo(transactions, () => anchor);
    await seedDashboardDemo(transactions, () => new Date("2026-08-14T05:00:00.000Z"));

    const sentinel = await pool.query<{ full_name: string; created_at: string }>(
      "SELECT full_name, created_at::text FROM customers WHERE id = 'bb000000-0000-4000-8000-000000000001'",
    );
    expect(sentinel.rows[0]).toEqual({
      full_name: "Contributor Customer",
      created_at: "2025-01-01 00:00:00+00",
    });
    await expect(demoCounts(pool)).resolves.toMatchObject({ customers: 40, orders: 200 });
  });

  it("rolls back every demo row when a later payment write fails", async () => {
    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_dashboard_demo_payment() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.id = 'da600000-0000-4000-8000-000000000100'::uuid THEN
          RAISE EXCEPTION 'forced dashboard seed failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_dashboard_demo_payment_trigger
      BEFORE INSERT OR UPDATE ON payments
      FOR EACH ROW EXECUTE FUNCTION reject_dashboard_demo_payment();
    `);
    try {
      await expect(seedDashboardDemo(transactions, () => anchor)).rejects.toThrow(
        "forced dashboard seed failure",
      );
      await expect(demoCounts(pool)).resolves.toEqual({
        customers: 0,
        carts: 0,
        checkouts: 0,
        checkoutLines: 0,
        orders: 0,
        orderLines: 0,
        payments: 0,
      });
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS reject_dashboard_demo_payment_trigger ON payments");
      await pool.query("DROP FUNCTION IF EXISTS reject_dashboard_demo_payment()");
    }
  });
});

async function demoCounts(pool: Pool) {
  const result = await pool.query<Record<string, string>>(`
    SELECT
      (SELECT count(*) FROM customers WHERE id::text LIKE 'da100000-0000-4000-8000-%')::text AS customers,
      (SELECT count(*) FROM carts WHERE id::text LIKE 'da200000-0000-4000-8000-%')::text AS carts,
      (SELECT count(*) FROM checkout_sessions WHERE id::text LIKE 'da300000-0000-4000-8000-%')::text AS checkouts,
      (SELECT count(*) FROM checkout_session_lines WHERE id::text LIKE 'da310000-0000-4000-8000-%')::text AS checkout_lines,
      (SELECT count(*) FROM orders WHERE id::text LIKE 'da400000-0000-4000-8000-%')::text AS orders,
      (SELECT count(*) FROM order_lines WHERE id::text LIKE 'da500000-0000-4000-8000-%')::text AS order_lines,
      (SELECT count(*) FROM payments WHERE id::text LIKE 'da600000-0000-4000-8000-%')::text AS payments
  `);
  const row = result.rows[0]!;
  return {
    customers: Number(row.customers),
    carts: Number(row.carts),
    checkouts: Number(row.checkouts),
    checkoutLines: Number(row.checkout_lines),
    orders: Number(row.orders),
    orderLines: Number(row.order_lines),
    payments: Number(row.payments),
  };
}

async function seedCatalogFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO categories(id,name,slug,status) VALUES
      ('aa000000-0000-4000-8000-000000000001','Demo Tech','demo-tech','active');
    INSERT INTO products(id,category_id,name,slug,description,status) VALUES
      ('aa100000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Demo Laptop','demo-laptop','Demo product','published');
    INSERT INTO product_variants(id,product_id,sku,title,option_values,status) VALUES
      ('aa200000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','DEMO-TECH-001','16 GB','{}','active');
    INSERT INTO product_prices(id,variant_id,amount_minor,currency,tax_inclusive,valid_from,created_by) VALUES
      ('aa300000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001',10000000,'VND',true,'2026-01-01T00:00:00.000Z','test');
  `);
}

async function insertSentinelCustomer(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO customers(id,email,email_verified_at,full_name,status,version,created_at,updated_at)
    VALUES ('bb000000-0000-4000-8000-000000000001','contributor@example.invalid',
      '2025-01-01T00:00:00.000Z','Contributor Customer','active',1,
      '2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z')
  `);
}
