// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { OrderHealthReaderService } from "../../../application/services/implementations/order-health-reader";
import { runOrderMigrations } from "../../database/run-order-migrations";
import { PostgresqlOrderHealthRepository } from "./postgresql-order-health.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: NOW,
  timezone: "Asia/Ho_Chi_Minh" as const,
};

suite("PostgresqlOrderHealthRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const service = new OrderHealthReaderService(
    new PostgresqlOrderHealthRepository(),
    new PostgresTransactionRunner(pool),
    () => NOW,
  );

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE order_status_history,order_lines,orders,
      checkout_sessions,carts,customers,product_variants,products,categories CASCADE`);
    await seedFixture(pool);
  });
  afterAll(async () => {
    await runOrderMigrations(databaseUrl!, "down");
    await runCheckoutMigrations(databaseUrl!, "down");
    await runPromotionMigrations(databaseUrl!, "down");
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("installs the bounded Order health access paths", async () => {
    const result = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexname=ANY($1::text[])
      ORDER BY indexname`, [[
      "order_status_history_detected_health_idx",
      "orders_paid_at_health_idx",
      "orders_pending_expiry_health_idx",
      "orders_stalled_health_idx",
    ]]);
    expect(result.rows.map(({ indexname }) => indexname)).toEqual([
      "order_status_history_detected_health_idx",
      "orders_paid_at_health_idx",
      "orders_pending_expiry_health_idx",
      "orders_stalled_health_idx",
    ]);
  });

  it("reads stalled states with a stable keyset and no private snapshots", async () => {
    const first = await service.stalledSummary({ ...window, minimumAgeMinutes: 120, limit: 2 });
    expect(first.summary).toEqual({
      stalledCount: 3,
      stalledTotalVnd: 6_000,
      countsByStatus: [
        { status: "paid", count: 1 },
        { status: "processing", count: 1 },
        { status: "ready_for_fulfillment", count: 1 },
      ],
    });
    expect(first.evidence.map(({ reasonCode }) => reasonCode)).toEqual([
      "READY_NOT_COMPLETED",
      "PROCESSING_NOT_READY",
    ]);
    expect(first.nextCursor).toBeDefined();
    const second = await service.stalledSummary({
      ...window,
      minimumAgeMinutes: 120,
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.evidence.map(({ reasonCode }) => reasonCode))
      .toEqual(["PAID_NOT_PROCESSING"]);
    expect(JSON.stringify({ first, second })).not.toMatch(
      /CANARY|customer|publicNumber|contact|address|line|historyActor/i,
    );
  });

  it("detects current invariants and illegal transitions using closed reasons", async () => {
    const result = await service.invalidStateEvidence(window);
    expect(result.summary).toEqual({
      invalidCount: 2,
      reasonCounts: [
        { reasonCode: "PAID_TIMESTAMP_MISSING", count: 1 },
        { reasonCode: "COMPLETED_TIMESTAMP_MISSING", count: 1 },
        { reasonCode: "TERMINAL_TIMESTAMP_CONFLICT", count: 1 },
        { reasonCode: "ILLEGAL_STATUS_TRANSITION", count: 1 },
      ],
    });
    expect(result.evidence).toEqual([
      expect.objectContaining({
        orderId: "10000000-0000-4000-8000-000000000004",
        reasonCodes: [
          "PAID_TIMESTAMP_MISSING",
          "COMPLETED_TIMESTAMP_MISSING",
          "ILLEGAL_STATUS_TRANSITION",
        ],
      }),
      expect.objectContaining({
        orderId: "10000000-0000-4000-8000-000000000005",
        reasonCodes: ["TERMINAL_TIMESTAMP_CONFLICT"],
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/CANARY_ACTOR|reason_code|correlation/i);
  });

  it("keeps the expiry horizon exclusive and returns a safe support context", async () => {
    const expiry = await service.expiryRisk({ ...window, horizonMinutes: 15 });
    expect(expiry.summary).toEqual({
      atRiskCount: 1,
      atRiskTotalVnd: 6_000,
      earliestExpiryAt: "2026-08-16T05:14:59.000Z",
    });
    expect(expiry.evidence).toEqual([{
      orderId: "10000000-0000-4000-8000-000000000006",
      status: "pending_payment",
      totalVnd: 6_000,
      reservationExpiresAt: "2026-08-16T05:14:59.000Z",
      minutesRemaining: 14,
    }]);
    const context = await service.getAuthorizedContext(
      "10000000-0000-4000-8000-000000000001",
    );
    expect(context).toEqual({
      orderId: "10000000-0000-4000-8000-000000000001",
      status: "paid",
      createdAt: "2026-08-15T00:00:00.000Z",
      reservationExpiresAt: "2026-08-16T06:00:00.000Z",
      totalVnd: 1_000,
      backendConfirmedPaid: true,
    });
    expect(JSON.stringify(context)).not.toMatch(/CANARY|customer|public|contact|address|line/i);
  });

  it.skipIf(process.env.RUN_ORDER_SCALE !== "1")(
    "uses bounded health indexes at 10k orders",
    async () => {
      await pool.query("BEGIN");
      try {
        await seedScaleFixture(pool);
        await pool.query("ANALYZE orders");
        await pool.query("ANALYZE order_status_history");
        const plans = await Promise.all([
          explain(pool, `SELECT id FROM orders
            WHERE status IN ('paid','processing','ready_for_fulfillment')
              AND updated_at<'2026-08-16T04:00:00Z' ORDER BY updated_at,id`),
          explain(pool, `SELECT id FROM orders WHERE status='pending_payment'
            AND reservation_expires_at>='2026-08-16T05:00:00Z'
            AND reservation_expires_at<'2026-08-16T06:00:00Z'
            ORDER BY reservation_expires_at,id`),
          explain(pool, `SELECT id FROM orders
            WHERE paid_at>='2026-08-10T00:00:00Z' AND paid_at<'2026-08-11T00:00:00Z'`),
          explain(pool, `SELECT order_id FROM order_status_history
            WHERE occurred_at>='2026-08-10T00:00:00Z'
              AND occurred_at<'2026-08-11T00:00:00Z'`),
        ]);
        expect(plans[0]).toContain("orders_stalled_health_idx");
        expect(plans[1]).toContain("orders_pending_expiry_health_idx");
        expect(plans[2]).toContain("orders_paid_at_health_idx");
        expect(plans[3]).toContain("order_status_history_detected_health_idx");
      } finally {
        await pool.query("ROLLBACK");
      }
    },
    30_000,
  );
});

async function seedFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO categories(id,name,slug,status) VALUES
      ('40000000-0000-4000-8000-000000000001','CANARY_CATEGORY','orders','active');
    INSERT INTO products(id,category_id,name,slug,description,status) VALUES
      ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','CANARY_PRODUCT','orders','CANARY_DESCRIPTION','published');
    INSERT INTO product_variants(id,product_id,sku,title,option_values,status) VALUES
      ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','CANARY-SKU','CANARY_VARIANT','{}','active');
    INSERT INTO customers(id,email,email_verified_at,full_name,phone_number,status,version) VALUES
      ('50000000-0000-4000-8000-000000000001','canary@example.invalid',NOW(),'CANARY_CUSTOMER','CANARY_PHONE','active',1);
    INSERT INTO carts(id,customer_id,status,version,expires_at) VALUES
      ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','checkout_ready',1,'2026-08-20T00:00:00Z');
    INSERT INTO checkout_sessions
      (id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,idempotency_key,request_fingerprint,
       expires_at,created_at,updated_at)
    SELECT ('70000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',value,
      '{"address":"CANARY_ADDRESS"}','{"contact":"CANARY_CONTACT"}',value*1000,0,value*1000,
      'order_created','health-'||value,md5(value::text)||md5(('x'||value)::text),
      '2026-08-20T00:00:00Z','2026-08-15T00:00:00Z','2026-08-15T00:00:00Z'
    FROM generate_series(1,8) value;
    INSERT INTO orders
      (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,paid_at,
       completed_at,version,created_at,updated_at) VALUES
      ('10000000-0000-4000-8000-000000000001','NVC-20260815-00000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','{"address":"CANARY_ADDRESS"}','{"contact":"CANARY_CONTACT"}',1000,0,1000,'paid','2026-08-16T06:00:00Z','2026-08-15T01:00:00Z',NULL,2,'2026-08-15T00:00:00Z','2026-08-16T03:00:00Z'),
      ('10000000-0000-4000-8000-000000000002','NVC-20260815-00000002','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','{}','{}',2000,0,2000,'processing','2026-08-16T06:00:00Z','2026-08-15T01:00:00Z',NULL,3,'2026-08-15T00:00:00Z','2026-08-16T02:00:00Z'),
      ('10000000-0000-4000-8000-000000000003','NVC-20260815-00000003','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','{}','{}',3000,0,3000,'ready_for_fulfillment','2026-08-16T06:00:00Z','2026-08-15T01:00:00Z',NULL,4,'2026-08-15T00:00:00Z','2026-08-16T01:00:00Z'),
      ('10000000-0000-4000-8000-000000000004','NVC-20260815-00000004','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000004','{}','{}',4000,0,4000,'completed','2026-08-16T06:00:00Z',NULL,NULL,5,'2026-08-15T00:00:00Z','2026-08-15T05:00:00Z'),
      ('10000000-0000-4000-8000-000000000005','NVC-20260815-00000005','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000005','{}','{}',5000,0,5000,'canceled','2026-08-16T06:00:00Z','2026-08-15T01:00:00Z',NULL,3,'2026-08-15T00:00:00Z','2026-08-15T06:00:00Z'),
      ('10000000-0000-4000-8000-000000000006','NVC-20260815-00000006','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000006','{}','{}',6000,0,6000,'pending_payment','2026-08-16T05:14:59Z',NULL,NULL,1,'2026-08-15T00:00:00Z','2026-08-15T00:00:00Z'),
      ('10000000-0000-4000-8000-000000000007','NVC-20260815-00000007','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007','{}','{}',7000,0,7000,'pending_payment','2026-08-16T05:15:00Z',NULL,NULL,1,'2026-08-15T00:00:00Z','2026-08-15T00:00:00Z'),
      ('10000000-0000-4000-8000-000000000008','NVC-20260815-00000008','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000008','{}','{}',8000,0,8000,'paid','2026-08-16T06:00:00Z','2026-08-15T01:00:00Z',NULL,2,'2026-08-15T00:00:00Z','2026-08-16T04:00:01Z');
    INSERT INTO order_status_history
      (id,order_id,previous_status,new_status,actor_type,actor_id,reason_code,
       idempotency_key,correlation_id,occurred_at) VALUES
      ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','processing','completed','staff','CANARY_ACTOR','CANARY_REASON','health-illegal','CANARY_CORRELATION','2026-08-15T04:00:00Z');
  `);
}

async function seedScaleFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO checkout_sessions
      (id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,idempotency_key,request_fingerprint,
       expires_at,created_at,updated_at)
    SELECT ('71000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',value+100,
      '{}','{}',1000,0,1000,'order_created','scale-'||value,
      md5(value::text)||md5(('scale'||value)::text),'2026-08-20T00:00:00Z',NOW(),NOW()
    FROM generate_series(1,10000) value;
    INSERT INTO orders
      (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,paid_at,
       completed_at,version,created_at,updated_at)
    SELECT ('11000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'NVC-20260816-'||upper(lpad(to_hex(value),8,'0')),
      '50000000-0000-4000-8000-000000000001',
      ('71000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '{}','{}',1000,0,1000,
      CASE WHEN value<=10 THEN 'paid' WHEN value<=20 THEN 'pending_payment' ELSE 'completed' END,
      CASE WHEN value BETWEEN 11 AND 20 THEN '2026-08-16T05:30:00Z' ELSE '2026-08-20T00:00:00Z' END::timestamptz,
      CASE WHEN value<=10 THEN '2026-08-10T01:00:00Z' ELSE '2026-08-16T01:00:00Z' END::timestamptz,
      CASE WHEN value>20 THEN '2026-08-16T02:00:00Z' ELSE NULL END::timestamptz,
      2,'2026-08-10T00:00:00Z',
      CASE WHEN value<=10 THEN '2026-08-10T02:00:00Z' ELSE '2026-08-16T05:00:00Z' END::timestamptz
    FROM generate_series(1,10000) value;
    INSERT INTO order_status_history
      (id,order_id,previous_status,new_status,actor_type,actor_id,reason_code,
       idempotency_key,correlation_id,occurred_at)
    SELECT ('81000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      ('11000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'paid','processing','staff','scale','SCALE','scale-'||value,'scale',
      CASE WHEN value<=10 THEN '2026-08-10T03:00:00Z' ELSE '2026-08-16T03:00:00Z' END::timestamptz
    FROM generate_series(1,10000) value;
  `);
}

async function explain(pool: Pool, statement: string): Promise<string> {
  return JSON.stringify((await pool.query(`EXPLAIN (FORMAT JSON) ${statement}`)).rows);
}
