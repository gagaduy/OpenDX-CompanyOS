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
const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: "2026-08-16T05:01:00.000Z",
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
  await pool.query(`
    INSERT INTO customers(id,email,email_verified_at,full_name,status,version,created_at,updated_at)
    SELECT ('a1000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'CANARY_CUSTOMER_'||value||'@example.invalid',NOW(),'CANARY_CUSTOMER_'||value,'active',1,
      CASE WHEN value IN (1,7) THEN '2026-08-10T00:00:00Z' ELSE '2026-01-01T00:00:00Z' END::timestamptz,
      '2026-08-10T00:00:00Z' FROM generate_series(1,7) value;
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
      (1,2,4999999,'2026-07-17T00:00:00Z'::timestamptz),
      (2,3,2500000,'2026-07-01T00:00:00Z'::timestamptz),
      (3,3,2500000,'2026-07-16T23:59:59Z'::timestamptz),
      (4,4,25000000,'2026-05-01T00:00:00Z'::timestamptz),
      (5,4,24999999,'2026-05-18T00:00:00Z'::timestamptz),
      (6,5,25000000,'2026-05-01T00:00:00Z'::timestamptz),
      (7,5,25000000,'2026-05-17T23:59:59Z'::timestamptz),
      (8,6,1000000,'2026-05-17T23:59:59Z'::timestamptz),
      (9,7,1000,'2026-08-10T00:00:00Z'::timestamptz)
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
      (1,2,4999999,'2026-07-17T00:00:00Z'::timestamptz),
      (2,3,2500000,'2026-07-01T00:00:00Z'::timestamptz),
      (3,3,2500000,'2026-07-16T23:59:59Z'::timestamptz),
      (4,4,25000000,'2026-05-01T00:00:00Z'::timestamptz),
      (5,4,24999999,'2026-05-18T00:00:00Z'::timestamptz),
      (6,5,25000000,'2026-05-01T00:00:00Z'::timestamptz),
      (7,5,25000000,'2026-05-17T23:59:59Z'::timestamptz),
      (8,6,1000000,'2026-05-17T23:59:59Z'::timestamptz),
      (9,7,1000,'2026-08-10T00:00:00Z'::timestamptz)
    ) paid_orders(sequence,customer_number,amount_vnd,paid_at);
    INSERT INTO crm_notes(id,customer_id,author_id,body,created_at) VALUES
      ('e1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
       'CANARY_ASSIGNEE','CANARY_NOTE','2026-08-15T00:00:00Z');
    INSERT INTO crm_followups
      (id,customer_id,due_at,description,status,version,created_by_id,created_at,updated_at) VALUES
      ('f1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','2026-08-20T00:00:00Z','CANARY_DESCRIPTION_1','open',1,'CANARY_CREATOR','2026-08-10T00:00:00Z','2026-08-10T00:00:00Z'),
      ('f1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003','2026-08-15T00:00:00Z','CANARY_DESCRIPTION_2','open',1,'CANARY_CREATOR','2026-08-10T00:00:00Z','2026-08-10T00:00:00Z'),
      ('f1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000004','2026-08-16T05:01:00Z','CANARY_DESCRIPTION_3','open',1,'CANARY_CREATOR','2026-08-10T00:00:00Z','2026-08-10T00:00:00Z'),
      ('f1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000005','2026-08-16T05:00:00Z','CANARY_DESCRIPTION_4','open',1,'CANARY_CREATOR','2026-08-10T00:00:00Z','2026-08-10T00:00:00Z');
    UPDATE crm_followups SET assignee_id='CANARY_ASSIGNEE',version=2,updated_at='2026-08-11T00:00:00Z'
    WHERE id IN ('f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004');
  `);
}
