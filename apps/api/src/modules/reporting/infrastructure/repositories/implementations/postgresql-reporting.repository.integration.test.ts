// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
  runCrmMigrations,
} from "../../../../../shared/database/run-migrations";
import { assertIntegrationEnvironment } from "../../../../../shared/testing/assert-integration-environment";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "../../../../payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { runSupportMigrations } from "../../../../support/infrastructure/database/run-support-migrations";
import { PostgresqlReportingRepository } from "./postgresql-reporting.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const range = {
  start: "2026-07-31T17:00:00.000Z",
  end: "2026-08-01T17:00:00.000Z",
  timezone: "Asia/Ho_Chi_Minh" as const,
};

suite("PostgresqlReportingRepository", () => {
  if (new URL(databaseUrl!).pathname !== "/opendx_test") {
    throw new Error("Reporting repository tests must run only against opendx_test");
  }
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new PostgresqlReportingRepository(pool);

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
    await runCrmMigrations(databaseUrl!, "up");
    await runSupportMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE
        support_audit_events,support_attachments,support_ticket_events,
        support_ticket_messages,support_tickets,crm_audit_events,crm_followups,
        crm_notes,payment_reconciliations,payment_events,payment_attempts,
        payments,order_status_history,order_lines,orders,checkout_session_lines,
        checkout_sessions,promotion_redemptions,promotions,cart_resolution_requests,
        cart_items,carts,customer_addresses,guest_sessions,customer_sessions,
        customer_external_identities,customers,stock_movements,inventory_reservations,
        inventory_items,product_media,product_prices,product_variants,products,
        categories,audit_events
      CASCADE
    `);
    await seedFixture(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns authoritative commerce, product, customer, inventory, and operations aggregates without PII", async () => {
    await expect(repository.getCommerce(range)).resolves.toEqual({
      grossPaidRevenueVnd: 1000,
      paidOrderCount: 1,
      createdOrderCount: 2,
      paidCreatedOrderCount: 1,
      paymentStatuses: [
        { status: "paid", count: 1 },
        { status: "pending_provider", count: 1 },
      ],
    });

    await expect(repository.getProducts(range)).resolves.toEqual({
      items: [{
        sku: "TECH-001",
        productTitle: "Tech Laptop",
        quantitySold: 2,
        paidRevenueVnd: 1000,
      }],
      inventory: {
        onHand: 5,
        reserved: 1,
        available: 4,
        soldOutCount: 1,
      },
    });

    await expect(repository.getCustomers(range)).resolves.toEqual({
      totalRegisteredCustomers: 2,
      repeatCustomers: 1,
      lifetimeValueVnd: 3000,
      lifetimeValueBuckets: [
        { bucket: "low", count: 1 },
        { bucket: "zero", count: 1 },
      ],
    });

    const operations = await repository.getOperations(range);
    expect(operations).toEqual({
      openTickets: 1,
      overdueFollowups: 1,
      slaBreaches: 1,
    });
    expect(JSON.stringify({ operations })).not.toMatch(/customer@example|090|ticket message|support-attachment/);
  });

  it.skipIf(process.env.RUN_REPORTING_SCALE !== "1")(
    "keeps aggregate query plans bounded at 100k customers and 1m orders",
    async () => {
      await pool.query("BEGIN");
      try {
        await seedScaleFixture(pool);
        for (const [name, statement, values] of scaleQueries()) {
          const plan = await explain(pool, statement, values);
          expect(plan.executionMs, name).toBeLessThan(5000);
          expect(hasDirectSequentialNestedLoop(plan.root), name).toBe(false);
        }
      } finally {
        await pool.query("ROLLBACK");
      }
    },
    180_000,
  );
});

async function seedFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO categories(id,name,slug,status) VALUES
      ('a0000000-0000-4000-8000-000000000001','Tech','tech','active');
    INSERT INTO products(id,category_id,name,slug,description,status) VALUES
      ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Tech Laptop','tech-laptop','Laptop','draft'),
      ('a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Cable','cable','Cable','draft');
    INSERT INTO product_variants(id,product_id,sku,title,option_values,status) VALUES
      ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','TECH-001','Laptop 16','{}','active'),
      ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','TECH-002','Cable 1m','{}','active');
    INSERT INTO inventory_items(id,variant_id,on_hand,reserved,version,created_at,updated_at) VALUES
      ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',5,1,1,'2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z'),
      ('a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002',0,0,1,'2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z');
    INSERT INTO customers(id,email,email_verified_at,full_name,phone_number,status,version,created_at,updated_at) VALUES
      ('b1000000-0000-4000-8000-000000000001','customer@example.com','2026-08-01T00:00:00.000Z','Private Buyer','0901000001','active',1,'2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z'),
      ('b1000000-0000-4000-8000-000000000002','zero@example.com','2026-08-01T00:00:00.000Z','Zero Buyer','0901000002','active',1,'2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z');
    INSERT INTO carts(id,customer_id,status,version,expires_at,created_at,updated_at) VALUES
      ('c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','checkout_ready',1,'2026-08-02T00:00:00.000Z','2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z'),
      ('c1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','checkout_ready',1,'2026-08-02T00:00:00.000Z','2026-08-01T01:00:00.000Z','2026-08-01T01:00:00.000Z'),
      ('c1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','checkout_ready',1,'2026-07-31T00:00:00.000Z','2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z');
    INSERT INTO checkout_sessions(id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,subtotal_vnd,discount_vnd,total_vnd,status,idempotency_key,request_fingerprint,expires_at,created_at,updated_at) VALUES
      ('c2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',1,'{}','{}',1000,0,1000,'order_created','key-1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2026-08-02T00:00:00.000Z','2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z'),
      ('c2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002',1,'{}','{}',400,0,400,'order_created','key-2','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','2026-08-02T00:00:00.000Z','2026-08-01T01:00:00.000Z','2026-08-01T01:00:00.000Z'),
      ('c2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003',1,'{}','{}',2000,0,2000,'order_created','key-3','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','2026-07-31T00:00:00.000Z','2026-07-30T00:00:00.000Z','2026-07-30T00:00:00.000Z');
    INSERT INTO orders(id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,paid_at,version,created_at,updated_at) VALUES
      ('d1000000-0000-4000-8000-000000000001','NVC-20260801-AAAAAAAA','b1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','{}','{}',1000,0,1000,'paid','2026-08-01T02:00:00.000Z','2026-08-01T00:30:00.000Z',2,'2026-08-01T00:00:00.000Z','2026-08-01T00:30:00.000Z'),
      ('d1000000-0000-4000-8000-000000000002','NVC-20260801-BBBBBBBB','b1000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','{}','{}',400,0,400,'pending_payment','2026-08-01T03:00:00.000Z',NULL,1,'2026-08-01T01:00:00.000Z','2026-08-01T01:00:00.000Z'),
      ('d1000000-0000-4000-8000-000000000003','NVC-20260730-CCCCCCCC','b1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000003','{}','{}',2000,0,2000,'paid','2026-07-30T02:00:00.000Z','2026-07-30T00:30:00.000Z',2,'2026-07-30T00:00:00.000Z','2026-07-30T00:30:00.000Z');
    INSERT INTO order_lines(id,order_id,variant_id,sku,product_title,variant_label,quantity,unit_price_vnd,discount_allocation_vnd,line_total_vnd,line_position) VALUES
      ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','TECH-001','Tech Laptop','Laptop 16',2,500,0,1000,0),
      ('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001','TECH-001','Tech Laptop','Laptop 16',1,2000,0,2000,0);
    INSERT INTO payments(id,order_id,provider,expected_amount_vnd,status,paid_at,version,created_at,updated_at) VALUES
      ('e1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','sepay',1000,'paid','2026-08-01T00:30:00.000Z',2,'2026-08-01T00:00:00.000Z','2026-08-01T00:30:00.000Z'),
      ('e1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','sepay',400,'pending_provider',NULL,1,'2026-08-01T01:00:00.000Z','2026-08-01T01:00:00.000Z'),
      ('e1000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003','sepay',2000,'paid','2026-07-30T00:30:00.000Z',2,'2026-07-30T00:00:00.000Z','2026-07-30T00:30:00.000Z');
    INSERT INTO crm_followups(id,customer_id,due_at,description,status,version,created_by_id,created_at,updated_at) VALUES
      ('f1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','2026-08-01T00:00:00.000Z','Overdue','open',1,'crm-1','2026-07-31T00:00:00.000Z','2026-07-31T00:00:00.000Z');
    INSERT INTO support_tickets(id,customer_id,subject,description,priority,status,version,created_by_id,created_at,updated_at) VALUES
      ('f2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Ticket','ticket message','urgent','new',1,'crm-1','2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z');
  `);
}

async function seedScaleFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO categories(id,name,slug,status)
    VALUES ('aa000000-0000-4000-8000-000000000001','Scale','scale','active')
    ON CONFLICT DO NOTHING;
    INSERT INTO products(id,category_id,name,slug,description,status)
    VALUES ('aa100000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Scale SKU','scale-sku','Scale','draft')
    ON CONFLICT DO NOTHING;
    INSERT INTO product_variants(id,product_id,sku,title,option_values,status)
    VALUES ('aa200000-0000-4000-8000-000000000001','aa100000-0000-4000-8000-000000000001','SCALE-001','Scale','{}','active')
    ON CONFLICT DO NOTHING;
    INSERT INTO inventory_items(id,variant_id,on_hand,reserved,version,created_at,updated_at)
    VALUES ('aa300000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001',1000000,0,1,NOW(),NOW())
    ON CONFLICT DO NOTHING;
  `);
  await pool.query(`
    INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at)
    SELECT ('b9000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           'scale-' || g || '@example.invalid',
           '2026-08-01T00:00:00.000Z',
           'active',
           1,
           '2026-08-01T00:00:00.000Z',
           '2026-08-01T00:00:00.000Z'
    FROM generate_series(1,100000) AS g;
  `);
  await pool.query(`
    INSERT INTO carts(id,customer_id,status,version,expires_at,created_at,updated_at)
    SELECT ('c9000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           ('b9000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           'checkout_ready',
           1,
           '2026-08-03T00:00:00.000Z',
           '2026-08-01T00:00:00.000Z',
           '2026-08-01T00:00:00.000Z'
    FROM generate_series(1,100000) AS g;
  `);
  await pool.query(`
    INSERT INTO checkout_sessions(
      id,customer_id,source_cart_id,source_cart_version,address_snapshot,
      contact_snapshot,subtotal_vnd,discount_vnd,total_vnd,status,
      idempotency_key,request_fingerprint,expires_at,created_at,updated_at
    )
    SELECT ('c8000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           ('b9000000-0000-4000-8000-' || lpad((((g - 1) % 100000) + 1)::text,12,'0'))::uuid,
           ('c9000000-0000-4000-8000-' || lpad((((g - 1) % 100000) + 1)::text,12,'0'))::uuid,
           (((g - 1) / 100000)::int + 1),
           '{}',
           '{}',
           1000,
           0,
           1000,
           'order_created',
           'scale-' || g,
           md5(g::text) || md5(('x' || g)::text),
           '2026-08-03T00:00:00.000Z',
           '2026-08-01T00:00:00.000Z'::timestamptz + ((g % 86400) || ' seconds')::interval,
           '2026-08-01T00:00:00.000Z'
    FROM generate_series(1,1000000) AS g;
  `);
  await pool.query(`
    INSERT INTO orders(
      id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
      subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,paid_at,
      version,created_at,updated_at
    )
    SELECT ('d9000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           'NVC-20260801-' || upper(lpad(to_hex(g),8,'0')),
           ('b9000000-0000-4000-8000-' || lpad((((g - 1) % 100000) + 1)::text,12,'0'))::uuid,
           ('c8000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           '{}',
           '{}',
           1000,
           0,
           1000,
           CASE WHEN g % 2 = 0 THEN 'paid' ELSE 'pending_payment' END,
           '2026-08-03T00:00:00.000Z',
           CASE WHEN g % 2 = 0 THEN '2026-08-01T00:00:00.000Z'::timestamptz + ((g % 86400) || ' seconds')::interval ELSE NULL END,
           1,
           '2026-08-01T00:00:00.000Z'::timestamptz + ((g % 86400) || ' seconds')::interval,
           '2026-08-01T00:00:00.000Z'
    FROM generate_series(1,1000000) AS g;
  `);
  await pool.query(`
    INSERT INTO order_lines(id,order_id,variant_id,sku,product_title,variant_label,quantity,unit_price_vnd,discount_allocation_vnd,line_total_vnd,line_position)
    SELECT ('d8000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           ('d9000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           'aa200000-0000-4000-8000-000000000001',
           'SCALE-001',
           'Scale SKU',
           'Scale',
           1,
           1000,
           0,
           1000,
           0
    FROM generate_series(1,1000000) AS g;
  `);
  await pool.query(`
    INSERT INTO payments(id,order_id,provider,expected_amount_vnd,status,paid_at,version,created_at,updated_at)
    SELECT ('e9000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           ('d9000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
           'sepay',
           1000,
           CASE WHEN g % 2 = 0 THEN 'paid' ELSE 'pending_provider' END,
           CASE WHEN g % 2 = 0 THEN '2026-08-01T00:00:00.000Z'::timestamptz + ((g % 86400) || ' seconds')::interval ELSE NULL END,
           1,
           '2026-08-01T00:00:00.000Z',
           '2026-08-01T00:00:00.000Z'
    FROM generate_series(1,1000000) AS g;
  `);
}

function scaleQueries(): readonly (readonly [string, string, readonly string[]])[] {
  return [
    ["commerce-paid", "SELECT COALESCE(SUM(total_vnd),0)::text, COUNT(*)::text FROM orders WHERE paid_at >= $1 AND paid_at < $2 AND status IN ('paid','processing','ready_for_fulfillment','completed')", [range.start, range.end]],
    ["commerce-created", "SELECT COUNT(*)::text, COUNT(*) FILTER (WHERE paid_at IS NOT NULL AND status IN ('paid','processing','ready_for_fulfillment','completed'))::text FROM orders WHERE created_at >= $1 AND created_at < $2", [range.start, range.end]],
    ["payment-status", "SELECT p.status, COUNT(*)::text FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.created_at >= $1 AND o.created_at < $2 GROUP BY p.status", [range.start, range.end]],
    ["product-sales", "SELECT ol.sku, ol.product_title, COALESCE(SUM(ol.quantity),0)::text, COALESCE(SUM(ol.line_total_vnd),0)::text FROM order_lines ol JOIN orders o ON o.id = ol.order_id WHERE o.paid_at >= $1 AND o.paid_at < $2 AND o.status IN ('paid','processing','ready_for_fulfillment','completed') GROUP BY ol.sku, ol.product_title", [range.start, range.end]],
    ["customer-ltv", "WITH paid_by_customer AS (SELECT customer_id, COUNT(*) AS paid_count FROM orders WHERE paid_at IS NOT NULL AND status IN ('paid','processing','ready_for_fulfillment','completed') GROUP BY customer_id) SELECT (SELECT COUNT(*) FROM customers)::text, COUNT(*) FILTER (WHERE paid_count >= 2)::text FROM paid_by_customer", []],
  ];
}

async function explain(pool: Pool, statement: string, values: readonly string[]) {
  const result = await pool.query<{ "QUERY PLAN": unknown }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`,
    Array.from(values),
  );
  const plan = result.rows[0]?.["QUERY PLAN"] as [{ Plan: PlanNode; "Execution Time": number }];
  const nodeTypes: string[] = [];
  collectNodeTypes(plan[0].Plan, nodeTypes);
  return { executionMs: plan[0]["Execution Time"], nodeTypes, root: plan[0].Plan };
}

interface PlanNode {
  readonly "Node Type": string;
  readonly Plans?: readonly PlanNode[];
}

function collectNodeTypes(plan: PlanNode, output: string[]): void {
  output.push(plan["Node Type"]);
  for (const child of plan.Plans ?? []) collectNodeTypes(child, output);
}

function hasDirectSequentialNestedLoop(plan: PlanNode): boolean {
  if (plan["Node Type"] === "Nested Loop") {
    const children = plan.Plans ?? [];
    if (
      children.length >= 2 &&
      children.every((child) => child["Node Type"] === "Seq Scan")
    ) {
      return true;
    }
  }
  return (plan.Plans ?? []).some(hasDirectSequentialNestedLoop);
}
