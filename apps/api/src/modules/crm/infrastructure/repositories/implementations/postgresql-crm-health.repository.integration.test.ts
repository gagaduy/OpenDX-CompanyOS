// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations, runCrmMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runOrderMigrations } from "../../../../order/infrastructure/database/run-order-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { runReportingMigrations } from "../../../../reporting/infrastructure/database/run-reporting-migrations";
import { PostgresqlAgenticAnalyticsReader } from "../../../../reporting/infrastructure/repositories/implementations/postgresql-agentic-analytics.reader";
import { CrmHealthReaderService } from "../../../application/services/implementations/crm-health-reader";
import { PostgresqlCrmHealthRepository } from "./postgresql-crm-health.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const analyticsUrl = process.env.AGENTIC_ANALYTICS_TEST_DATABASE_URL
  ?? "postgres://opendx_agentic_reader:opendx_agentic_reader_password@localhost:5432/opendx_test";
const suite = databaseUrl === undefined ? describe.skip : describe;
const currentDate = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
}).format(new Date());
const NOW = `${currentDate}T05:00:00.000Z`;
const SNAPSHOT_BOUNDARY = new Date(`${currentDate}T00:00:00.000+07:00`).toISOString();
const window = {
  start: new Date(Date.parse(NOW) - 15 * 86_400_000).toISOString(),
  end: new Date(Date.parse(NOW) + 60_000).toISOString(),
  timezone: "Asia/Ho_Chi_Minh" as const,
};

suite("PostgresqlCrmHealthRepository", () => {
  const app = new Pool({ connectionString: databaseUrl });
  const analyticsPool = new Pool({ connectionString: analyticsUrl });
  const analytics = new PostgresqlAgenticAnalyticsReader(
    new PostgresTransactionRunner(analyticsPool),
  );
  const service = new CrmHealthReaderService(
    new PostgresqlCrmHealthRepository(),
    analytics,
    new PostgresTransactionRunner(app),
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
    await runCrmMigrations(databaseUrl!, "up");
    await runReportingMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await app.query(`TRUNCATE crm_audit_events,crm_followups,crm_notes,
      order_status_history,order_lines,orders,checkout_sessions,carts,customers CASCADE`);
    await seedFixture(app);
  });
  afterAll(async () => {
    await runReportingMigrations(databaseUrl!, "down", 999_999);
    await runCrmMigrations(databaseUrl!, "down", 999_999);
    await runOrderMigrations(databaseUrl!, "down", 999_999);
    await runCheckoutMigrations(databaseUrl!, "down", 999_999);
    await runPromotionMigrations(databaseUrl!, "down", 999_999);
    await runCartMigrations(databaseUrl!, "down", 999_999);
    await runCustomerMigrations(databaseUrl!, "down", 999_999);
    await runCompanyCoreMigrations(databaseUrl!, "down", 999_999);
    await runCatalogMigrations(databaseUrl!, "down", 999_999);
    await analyticsPool.end();
    await app.end();
  });

  it("preserves lifetime and recency boundaries in aggregate-only output", async () => {
    const result = await service.segmentSummary(window);
    expect(result).toEqual({
      registeredCustomers: 2,
      newCustomers: 3,
      repeatCustomers: 3,
      customersByLifetimeValueBucket: [
        { bucket: "zero", count: 1 },
        { bucket: "low", count: 3 },
        { bucket: "mid", count: 2 },
        { bucket: "high", count: 1 },
      ],
      customersByRecencyBucket: [
        { bucket: "0_30_days", count: 2 },
        { bucket: "31_90_days", count: 2 },
        { bucket: "over_90_days", count: 2 },
        { bucket: "never", count: 1 },
      ],
      paidRevenueVnd: 1_000,
    });
    expect(JSON.stringify(result)).not.toMatch(/CANARY_CUSTOMER|@example|customerId|orderId/i);
  });

  it("uses due-at exclusivity and returns no note, follow-up, customer, or assignee fields", async () => {
    const result = await service.followupOpportunities(window);
    expect(result).toEqual({
      openFollowups: 2,
      overdueFollowups: 1,
      unassignedFollowups: 1,
      customersWithoutOpenFollowupBySegment: [
        { segment: "new", count: 2 },
        { segment: "inactive", count: 1 },
      ],
      reasonCounts: [
        { reasonCode: "OVERDUE_FOLLOWUP", count: 1 },
        { reasonCode: "UNASSIGNED_FOLLOWUP", count: 1 },
        { reasonCode: "SEGMENT_WITHOUT_OPEN_FOLLOWUP", count: 3 },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /CANARY_NOTE|CANARY_DESCRIPTION|CANARY_ASSIGNEE|CANARY_CUSTOMER|customerId|followupId/i,
    );
  });

  it("uses the existing open follow-up due-at index", async () => {
    const result = await app.query<{ definition: string }>(`
      SELECT indexdef AS definition FROM pg_indexes
      WHERE schemaname='public' AND indexname='crm_followups_status_due_at_idx'`);
    expect(result.rows[0]?.definition).toMatch(/\(status, due_at\)/);
  });
});

async function seedFixture(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('opendx.test_now',$1,false)", [NOW]);
    await client.query(
      "SELECT set_config('opendx.test_snapshot_boundary',$1,false)",
      [SNAPSHOT_BOUNDARY],
    );
    await client.query(`
    INSERT INTO customers(id,email,email_verified_at,full_name,status,version,created_at,updated_at)
    SELECT ('a1000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'CANARY_CUSTOMER_'||value||'@example.invalid',NOW(),'CANARY_CUSTOMER_'||value,'active',1,
      CASE WHEN value IN (1,7) THEN current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days'
        ELSE current_setting('opendx.test_now')::timestamptz-INTERVAL '200 days' END,
      current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days'
      FROM generate_series(1,7) value;
    INSERT INTO carts(id,customer_id,status,version,expires_at)
    SELECT ('b1000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      ('a1000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'checkout_ready',1,'2026-08-20T00:00:00Z' FROM generate_series(1,7) value;
    INSERT INTO checkout_sessions
      (id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,idempotency_key,request_fingerprint,
       expires_at,created_at,updated_at)
    SELECT ('c1000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,
      ('a1000000-0000-4000-8000-'||lpad(customer_number::text,12,'0'))::uuid,
      ('b1000000-0000-4000-8000-'||lpad(customer_number::text,12,'0'))::uuid,
      sequence,'{"address":"CANARY_ADDRESS"}','{"contact":"CANARY_CONTACT"}',
      amount_vnd,0,amount_vnd,'order_created','crm-health-'||sequence,
      md5(sequence::text)||md5(('crm'||sequence)::text),'2026-08-20T00:00:00Z',paid_at,paid_at
    FROM (VALUES
      (1,2,4999999,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '30 days'),
      (2,3,2500000,current_setting('opendx.test_now')::timestamptz-INTERVAL '46 days'),
      (3,3,2500000,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '30 days 1 second'),
      (4,4,25000000,current_setting('opendx.test_now')::timestamptz-INTERVAL '107 days'),
      (5,4,24999999,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '90 days'),
      (6,5,25000000,current_setting('opendx.test_now')::timestamptz-INTERVAL '107 days'),
      (7,5,25000000,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '90 days 1 second'),
      (8,6,1000000,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '90 days 1 second'),
      (9,7,1000,current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days')
    ) orders(sequence,customer_number,amount_vnd,paid_at);
    INSERT INTO orders
      (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,paid_at,
       version,created_at,updated_at)
    SELECT ('d1000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,
      'NVC-20260816-'||upper(lpad(to_hex(sequence),8,'0')),
      ('a1000000-0000-4000-8000-'||lpad(customer_number::text,12,'0'))::uuid,
      ('c1000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,
      '{"address":"CANARY_ADDRESS"}','{"contact":"CANARY_CONTACT"}',
      amount_vnd,0,amount_vnd,'paid','2026-08-20T00:00:00Z',paid_at,2,paid_at,paid_at
    FROM (VALUES
      (1,2,4999999,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '30 days'),
      (2,3,2500000,current_setting('opendx.test_now')::timestamptz-INTERVAL '46 days'),
      (3,3,2500000,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '30 days 1 second'),
      (4,4,25000000,current_setting('opendx.test_now')::timestamptz-INTERVAL '107 days'),
      (5,4,24999999,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '90 days'),
      (6,5,25000000,current_setting('opendx.test_now')::timestamptz-INTERVAL '107 days'),
      (7,5,25000000,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '90 days 1 second'),
      (8,6,1000000,current_setting('opendx.test_snapshot_boundary')::timestamptz-INTERVAL '90 days 1 second'),
      (9,7,1000,current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days')
    ) paid_orders(sequence,customer_number,amount_vnd,paid_at);
    INSERT INTO crm_notes(id,customer_id,author_id,body,created_at) VALUES
      ('e1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
       'CANARY_ASSIGNEE','CANARY_NOTE',current_setting('opendx.test_now')::timestamptz-INTERVAL '1 day');
    INSERT INTO crm_followups
      (id,customer_id,due_at,description,status,version,created_by_id,created_at,updated_at) VALUES
      ('f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',current_setting('opendx.test_now')::timestamptz+INTERVAL '4 days','CANARY_DESCRIPTION_1','open',1,'CANARY_CREATOR',current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days',current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days'),
      ('f1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003',current_setting('opendx.test_now')::timestamptz-INTERVAL '1 day','CANARY_DESCRIPTION_2','open',1,'CANARY_CREATOR',current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days',current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days'),
      ('f1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000004',current_setting('opendx.test_now')::timestamptz+INTERVAL '1 minute','CANARY_DESCRIPTION_3','open',1,'CANARY_CREATOR',current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days',current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days'),
      ('f1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000005',current_setting('opendx.test_now')::timestamptz,'CANARY_DESCRIPTION_4','open',1,'CANARY_CREATOR',current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days',current_setting('opendx.test_now')::timestamptz-INTERVAL '6 days');
    UPDATE crm_followups SET assignee_id='CANARY_ASSIGNEE',version=2,
      updated_at=current_setting('opendx.test_now')::timestamptz-INTERVAL '5 days'
    WHERE id IN ('f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004');
    `);
  } finally {
    client.release();
  }
}
