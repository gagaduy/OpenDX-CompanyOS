// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runOrderMigrations } from "../../../../order/infrastructure/database/run-order-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { PaymentHealthReaderService } from "../../../application/services/implementations/payment-health-reader";
import { runPaymentMigrations } from "../../database/run-payment-migrations";
import { PostgresqlPaymentHealthRepository } from "./postgresql-payment-health.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: NOW,
  timezone: "Asia/Ho_Chi_Minh" as const,
};

suite("PostgresqlPaymentHealthRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const service = new PaymentHealthReaderService(
    new PostgresqlPaymentHealthRepository(),
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
    await runPaymentMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE payment_reconciliations,payment_events,payment_attempts,
      payments,order_status_history,order_lines,orders,checkout_sessions,carts,customers CASCADE`);
    await seedFixture(pool);
  });
  afterAll(async () => {
    await runPaymentMigrations(databaseUrl!, "down");
    await runOrderMigrations(databaseUrl!, "down");
    await runCheckoutMigrations(databaseUrl!, "down");
    await runPromotionMigrations(databaseUrl!, "down");
    await runCartMigrations(databaseUrl!, "down");
    await runCustomerMigrations(databaseUrl!, "down");
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("installs bounded status, reconciliation, and event access paths", async () => {
    const result = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexname=ANY($1::text[])
      ORDER BY indexname`, [[
      "payment_events_health_idx",
      "payment_reconciliations_health_idx",
      "payments_pending_health_idx",
    ]]);
    expect(result.rows.map(({ indexname }) => indexname)).toEqual([
      "payment_events_health_idx",
      "payment_reconciliations_health_idx",
      "payments_pending_health_idx",
    ]);
  });

  it("aggregates exact pending age bucket boundaries", async () => {
    await expect(service.pendingPayments(window)).resolves.toEqual({
      pendingCount: 4,
      pendingExpectedAmountVnd: 10_000,
      oldestCreatedAt: "2026-08-15T05:00:00.000Z",
      countsByStatus: [
        { status: "created", count: 1 },
        { status: "pending_provider", count: 3 },
      ],
      ageBuckets: [
        { bucket: "under_15_minutes", count: 1, amountVnd: 1_000 },
        { bucket: "15_to_60_minutes", count: 1, amountVnd: 2_000 },
        { bucket: "1_to_24_hours", count: 1, amountVnd: 3_000 },
        { bucket: "over_24_hours", count: 1, amountVnd: 4_000 },
      ],
    });
  });

  it("returns discrepancy evidence without provider response or commerce IDs", async () => {
    const result = await service.reconciliationDiscrepancies(window);
    expect(result.summary).toEqual({
      reconciliationCount: 6,
      mismatchCount: 4,
      providerErrorCount: 1,
      unsupportedCount: 1,
      amountDifferenceVnd: 30,
    });
    expect(result.evidence.map(({ providerStatusClass }) => providerStatusClass)).toEqual([
      "paid", "pending", "failed", "unsupported", "provider_error", "unknown",
    ]);
    expect(result.evidence[4]).toMatchObject({ providerAmountVnd: null, differenceVnd: 0 });
    expect(JSON.stringify(result)).not.toMatch(
      /CANARY_RESPONSE|CANARY_PROVIDER_ORDER|CANARY_INVOICE|CANARY_ORDER|CAPTURED|DECLINED|SOMETHING_NEW/,
    );
  });

  it("summarizes provider evidence and unmatched payments without event identifiers", async () => {
    const result = await service.providerEvidenceStatus(window);
    expect(result).toEqual({
      authenticatedEvents: 3,
      rejectedEvents: 1,
      appliedEvents: 1,
      reviewRequiredEvents: 1,
      unmatchedPayments: 4,
      coverageBasisPoints: 3_333,
      countsByNormalizedState: [
        { status: "paid", count: 2 },
        { status: "unsupported", count: 1 },
        { status: "invalid", count: 1 },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/CANARY_PAYLOAD|CANARY_EVENT|CANARY_HASH|CANARY_INVOICE/);
  });

  it("serves independent bounded reads concurrently", async () => {
    const [pending, discrepancies, provider] = await Promise.all([
      service.pendingPayments(window),
      service.reconciliationDiscrepancies({ ...window, limit: 2 }),
      service.providerEvidenceStatus(window),
    ]);
    expect(pending.pendingCount).toBe(4);
    expect(discrepancies.evidence).toHaveLength(2);
    expect(discrepancies.nextCursor).toBeDefined();
    expect(provider.authenticatedEvents).toBe(3);
  });

  it.skipIf(process.env.RUN_PAYMENT_SCALE !== "1")(
    "uses bounded Payment health indexes at 10k rows",
    async () => {
      await pool.query("BEGIN");
      try {
        await seedScaleFixture(pool);
        await pool.query("ANALYZE payments");
        await pool.query("ANALYZE payment_reconciliations");
        await pool.query("ANALYZE payment_events");
        const plans = await Promise.all([
          explain(pool, `SELECT created_at,id,status,expected_amount_vnd FROM payments
            WHERE status IN ('created','pending_provider')
              AND created_at>='2026-08-15T00:00:00Z'
              AND created_at<'2026-08-16T00:00:00Z' ORDER BY created_at,id`),
          explain(pool, `SELECT created_at,id,payment_id,comparison_result
            FROM payment_reconciliations
            WHERE comparison_result IN ('mismatch','provider_error','unsupported')
              AND created_at>='2026-08-15T00:00:00Z'
              AND created_at<'2026-08-16T00:00:00Z' ORDER BY created_at,id`),
          explain(pool, `SELECT received_at,id,payment_id,authentication_result,
              processing_result,normalized_state FROM payment_events
            WHERE received_at>='2026-08-15T00:00:00Z'
              AND received_at<'2026-08-16T00:00:00Z' ORDER BY received_at,id`),
        ]);
        expect(plans[0]).toContain("payments_pending_health_idx");
        expect(plans[1]).toContain("payment_reconciliations_health_idx");
        expect(plans[2]).toContain("payment_events_health_idx");
      } finally {
        await pool.query("ROLLBACK");
      }
    },
    30_000,
  );
});

async function seedFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO customers(id,email,email_verified_at,status,version) VALUES
      ('50000000-0000-4000-8000-000000000001','finance@example.invalid',NOW(),'active',1);
    INSERT INTO carts(id,customer_id,status,version,expires_at) VALUES
      ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','checkout_ready',1,'2026-08-20T00:00:00Z');
    INSERT INTO checkout_sessions
      (id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,idempotency_key,request_fingerprint,
       expires_at,created_at,updated_at)
    SELECT ('70000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',value,
      '{}','{}',value*1000,0,value*1000,'order_created','finance-'||value,
      md5(value::text)||md5(('f'||value)::text),'2026-08-20T00:00:00Z',NOW(),NOW()
    FROM generate_series(1,6) value;
    INSERT INTO orders
      (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,version,created_at,updated_at)
    SELECT ('30000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'NVC-20260816-'||upper(lpad(to_hex(value),8,'0')),
      '50000000-0000-4000-8000-000000000001',
      ('70000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '{}','{}',value*1000,0,value*1000,'pending_payment','2026-08-20T00:00:00Z',1,NOW(),NOW()
    FROM generate_series(1,6) value;
    INSERT INTO payments
      (id,order_id,provider,expected_amount_vnd,status,version,created_at,updated_at) VALUES
      ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','sepay',1000,'created',1,'2026-08-16T04:45:01Z',NOW()),
      ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','sepay',2000,'pending_provider',1,'2026-08-16T04:45:00Z',NOW()),
      ('20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','sepay',3000,'pending_provider',1,'2026-08-16T04:00:00Z',NOW()),
      ('20000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','sepay',4000,'pending_provider',1,'2026-08-15T05:00:00Z',NOW()),
      ('20000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','sepay',5000,'paid',2,'2026-08-15T06:00:00Z',NOW()),
      ('20000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000006','sepay',6000,'paid',2,'2026-08-15T07:00:00Z',NOW());
    INSERT INTO payment_attempts
      (id,payment_id,provider_invoice_number,state,idempotency_key,expires_at)
    SELECT ('21000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      ('20000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'NVC-PAY-'||upper(lpad(to_hex(value),32,'0')),'pending_provider','attempt-'||value,
      '2026-08-20T00:00:00Z' FROM generate_series(1,6) value;
    UPDATE payments SET active_attempt_id=
      ('21000000-0000-4000-8000-'||right(id::text,12))::uuid;
    INSERT INTO payment_reconciliations
      (id,payment_id,attempt_id,trigger_actor_type,trigger_actor_id,provider_order_id,
       internal_status,provider_status,internal_amount_vnd,provider_amount_vnd,
       comparison_result,redacted_response,correlation_id,created_at) VALUES
      ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','system','finance','CANARY_PROVIDER_ORDER','pending_provider','CAPTURED',100,70,'mismatch','{"value":"CANARY_RESPONSE"}','finance','2026-08-15T01:00:00Z'),
      ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','system','finance',NULL,'pending_provider','PENDING',100,100,'mismatch',NULL,'finance','2026-08-15T02:00:00Z'),
      ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000003','system','finance',NULL,'pending_provider','DECLINED',100,100,'mismatch',NULL,'finance','2026-08-15T03:00:00Z'),
      ('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000004','system','finance',NULL,'pending_provider','UNRECOGNIZED',100,100,'unsupported',NULL,'finance','2026-08-15T04:00:00Z'),
      ('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000005','system','finance',NULL,'pending_provider','timeout',100,NULL,'provider_error',NULL,'finance','2026-08-15T05:00:00Z'),
      ('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006','21000000-0000-4000-8000-000000000006','system','finance',NULL,'pending_provider','SOMETHING_NEW',100,100,'mismatch',NULL,'finance','2026-08-15T06:00:00Z');
    INSERT INTO payment_events
      (id,payment_id,attempt_id,provider,authentication_result,notification_type,
       provider_event_id,provider_invoice_number,redacted_payload,payload_hash,
       normalized_state,processing_result,correlation_id,received_at) VALUES
      ('11000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','sepay','authenticated','payment','CANARY_EVENT_1','NVC-PAY-00000000000000000000000000000001','{"value":"CANARY_PAYLOAD"}',repeat('a',64),'paid','applied','finance','2026-08-15T01:00:00Z'),
      ('11000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','sepay','authenticated','payment','CANARY_EVENT_2','NVC-PAY-00000000000000000000000000000002','{}',repeat('b',64),'paid','already_processed','finance','2026-08-15T02:00:00Z'),
      ('11000000-0000-4000-8000-000000000003',NULL,NULL,'sepay','rejected','payment','CANARY_EVENT_3','CANARY_INVOICE','{}',repeat('c',64),'invalid','rejected','finance','2026-08-15T03:00:00Z'),
      ('11000000-0000-4000-8000-000000000004',NULL,NULL,'sepay','authenticated','payment','CANARY_EVENT_4','CANARY_INVOICE_2','{}',repeat('d',64),'unsupported','review_required','finance','2026-08-15T04:00:00Z');
  `);
}

async function seedScaleFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO checkout_sessions
      (id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,idempotency_key,request_fingerprint,
       expires_at,created_at,updated_at)
    SELECT ('72000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',value+100,
      '{}','{}',1000,0,1000,'order_created','finance-scale-'||value,
      md5(value::text)||md5(('finance-scale'||value)::text),
      '2026-08-20T00:00:00Z','2026-08-10T00:00:00Z','2026-08-10T00:00:00Z'
    FROM generate_series(1,10000) value;
    INSERT INTO orders
      (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,version,created_at,updated_at)
    SELECT ('32000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'NVC-20260816-'||upper(lpad(to_hex(value+100),8,'0')),
      '50000000-0000-4000-8000-000000000001',
      ('72000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '{}','{}',1000,0,1000,'pending_payment','2026-08-20T00:00:00Z',1,
      '2026-08-10T00:00:00Z','2026-08-10T00:00:00Z'
    FROM generate_series(1,10000) value;
    INSERT INTO payments
      (id,order_id,provider,expected_amount_vnd,status,version,created_at,updated_at)
    SELECT ('22000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      ('32000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'sepay',1000,CASE WHEN value<=10 THEN 'pending_provider' ELSE 'paid' END,1,
      CASE WHEN value<=10 THEN '2026-08-15T01:00:00Z' ELSE '2026-08-10T01:00:00Z' END::timestamptz,
      '2026-08-15T01:00:00Z'
    FROM generate_series(1,10000) value;
    INSERT INTO payment_reconciliations
      (id,payment_id,attempt_id,trigger_actor_type,trigger_actor_id,internal_status,
       provider_status,internal_amount_vnd,provider_amount_vnd,comparison_result,
       correlation_id,created_at)
    SELECT ('12000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      '20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',
      'system','scale','pending_provider','PENDING',1000,1000,
      CASE WHEN value<=10 THEN 'mismatch' ELSE 'matched_paid' END,
      'scale',CASE WHEN value<=10 THEN '2026-08-15T01:00:00Z' ELSE '2026-08-10T01:00:00Z' END::timestamptz
    FROM generate_series(1,10000) value;
    INSERT INTO payment_events
      (id,provider,authentication_result,notification_type,provider_invoice_number,
       redacted_payload,payload_hash,normalized_state,processing_result,correlation_id,received_at)
    SELECT ('13000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
      'sepay','authenticated','payment','SCALE-'||value,'{}',
      md5(value::text)||md5(('payment-scale'||value)::text),'paid','applied','scale',
      CASE WHEN value<=10 THEN '2026-08-15T01:00:00Z' ELSE '2026-08-10T01:00:00Z' END::timestamptz
    FROM generate_series(1,10000) value;
  `);
}

async function explain(pool: Pool, statement: string): Promise<string> {
  return JSON.stringify((await pool.query(`EXPLAIN (FORMAT JSON) ${statement}`)).rows);
}
