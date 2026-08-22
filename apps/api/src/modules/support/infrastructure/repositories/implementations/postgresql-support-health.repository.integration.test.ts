// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations, runCrmMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../../../order/infrastructure/database/run-order-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { SupportHealthReaderService } from "../../../application/services/implementations/support-health-reader";
import { runSupportMigrations } from "../../database/run-support-migrations";
import { PostgresqlSupportHealthRepository } from "./postgresql-support-health.repository";

const url = process.env.TEST_DATABASE_URL;
const suite = url === undefined ? describe.skip : describe;
const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: NOW,
  timezone: "Asia/Ho_Chi_Minh" as const,
};

suite("PostgresqlSupportHealthRepository", () => {
  const pool = new Pool({ connectionString: url });
  const orders = {
    getAuthorizedContext: vi.fn(async (orderId: string) => ({
      orderId,
      status: "paid" as const,
      createdAt: "2026-08-15T00:00:00.000Z",
      reservationExpiresAt: "2026-08-16T10:00:00.000Z",
      totalVnd: 50_000,
      backendConfirmedPaid: true,
    })),
  };
  const service = new SupportHealthReaderService(
    new PostgresqlSupportHealthRepository(),
    orders,
    new PostgresTransactionRunner(pool),
    () => NOW,
  );

  beforeAll(async () => {
    await runCatalogMigrations(url!, "up");
    await runCompanyCoreMigrations(url!, "up");
    await runInventoryMigrations(url!, "up");
    await runCustomerMigrations(url!, "up");
    await runCartMigrations(url!, "up");
    await runPromotionMigrations(url!, "up");
    await runCheckoutMigrations(url!, "up");
    await runOrderMigrations(url!, "up");
    await runCrmMigrations(url!, "up");
    await runSupportMigrations(url!, "up");
  });
  beforeEach(async () => {
    await pool.query(`TRUNCATE support_audit_events,support_attachments,support_ticket_events,
      support_ticket_messages,support_tickets,order_status_history,order_lines,orders,
      checkout_sessions,carts,customers CASCADE`);
    await seedFixture(pool);
    orders.getAuthorizedContext.mockClear();
  });
  afterAll(async () => {
    await runSupportMigrations(url!, "down");
    await runCrmMigrations(url!, "down");
    await runOrderMigrations(url!, "down");
    await runCheckoutMigrations(url!, "down");
    await runPromotionMigrations(url!, "down");
    await runCartMigrations(url!, "down");
    await runCustomerMigrations(url!, "down");
    await runInventoryMigrations(url!, "down");
    await runCompanyCoreMigrations(url!, "down");
    await runCatalogMigrations(url!, "down");
    await pool.end();
  });

  it("calculates priority deadlines with pause time and exclusive horizon", async () => {
    const result = await service.slaRisk({ ...window, horizonMinutes: 240 });
    expect(result.summary).toEqual({
      openTickets: 6,
      atRiskCount: 2,
      breachedCount: 1,
      countsByPriority: [
        { priority: "urgent", count: 1 },
        { priority: "high", count: 1 },
      ],
    });
    expect(result.evidence).toEqual([
      {
        ticketId: "10000000-0000-4000-8000-000000000001",
        priority: "urgent",
        status: "in_progress",
        slaDueAt: "2026-08-16T04:59:00.000Z",
        minutesRemaining: -1,
        riskCode: "BREACHED",
      },
      {
        ticketId: "10000000-0000-4000-8000-000000000002",
        priority: "high",
        status: "waiting_customer",
        slaDueAt: "2026-08-16T05:30:00.000Z",
        minutesRemaining: 30,
        riskCode: "DUE_WITHIN_HORIZON",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/CANARY_/);
  });

  it("classifies all lifecycle states without reading ticket text", async () => {
    const result = await service.classificationSummary(window);
    expect(result.operationalClasses).toEqual([
      { class: "unassigned", count: 1 },
      { class: "active_work", count: 2 },
      { class: "waiting_customer", count: 1 },
      { class: "waiting_internal", count: 1 },
      { class: "escalated", count: 1 },
      { class: "terminal", count: 1 },
    ]);
    expect(result.unassignedCount).toBe(1);
    expect(result.escalatedCount).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(
      /CANARY_|"subject"|"description"|"customer(Id)?"|"assignee(Id)?"/i,
    );
  });

  it("binds related context to the order stored on the ticket", async () => {
    const result = await service.findRelatedOrder("10000000-0000-4000-8000-000000000007");
    expect(result).toMatchObject({
      ticketId: "10000000-0000-4000-8000-000000000007",
      hasRelatedOrder: true,
      orderId: "20000000-0000-4000-8000-000000000001",
      paymentConfirmed: true,
    });
    expect(orders.getAuthorizedContext).toHaveBeenCalledWith(
      "20000000-0000-4000-8000-000000000001",
    );
    await expect(service.findRelatedOrder("10000000-0000-4000-8000-000000000003"))
      .resolves.toEqual({
        ticketId: "10000000-0000-4000-8000-000000000003",
        hasRelatedOrder: false,
      });
  });

  it("installs the bounded nonterminal Support health path", async () => {
    const result = await pool.query<{ name: string }>(`
      SELECT indexname AS name FROM pg_indexes
      WHERE schemaname='public' AND indexname='support_tickets_health_window_idx'`);
    expect(result.rows).toEqual([{ name: "support_tickets_health_window_idx" }]);
  });

  it.skipIf(process.env.RUN_SUPPORT_SCALE !== "1")(
    "uses the nonterminal health index at 10k tickets",
    async () => {
      await pool.query("BEGIN");
      try {
        await pool.query(`
          INSERT INTO support_tickets
            (id,customer_id,subject,description,priority,status,version,created_by_id,
             created_at,updated_at)
          SELECT ('11000000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid,
            '30000000-0000-4000-8000-000000000001','scale','scale','normal','new',1,
            'scale',CASE WHEN value<=10 THEN '2026-08-15T00:00:00Z'
              ELSE '2026-07-01T00:00:00Z' END::timestamptz,'2026-08-15T00:00:00Z'
          FROM generate_series(1,10000) value`);
        await pool.query("ANALYZE support_tickets");
        const plan = await pool.query(`EXPLAIN (FORMAT JSON)
          SELECT id,priority,status,created_at,sla_paused_seconds,sla_stopped_seconds,
            sla_pause_started_at
          FROM support_tickets
          WHERE status NOT IN ('resolved','closed')
            AND created_at>='2026-08-15T00:00:00Z'
            AND created_at<'2026-08-16T00:00:00Z'
          ORDER BY created_at,id`);
        expect(JSON.stringify(plan.rows)).toContain("support_tickets_health_window_idx");
      } finally {
        await pool.query("ROLLBACK");
      }
    },
    30_000,
  );
});

async function seedFixture(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at) VALUES
      ('30000000-0000-4000-8000-000000000001','CANARY_CUSTOMER@example.invalid',NOW(),'active',1,'2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
    INSERT INTO carts(id,customer_id,status,version,expires_at) VALUES
      ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','checkout_ready',1,'2026-08-20T00:00:00Z');
    INSERT INTO checkout_sessions
      (id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,idempotency_key,request_fingerprint,
       expires_at,created_at,updated_at) VALUES
      ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
       '40000000-0000-4000-8000-000000000001',1,'{"address":"CANARY_ADDRESS"}',
       '{"contact":"CANARY_CONTACT"}',50000,0,50000,'order_created','support-health',
       repeat('a',64),'2026-08-20T00:00:00Z','2026-08-15T00:00:00Z','2026-08-15T00:00:00Z');
    INSERT INTO orders
      (id,public_number,customer_id,checkout_id,address_snapshot,contact_snapshot,
       subtotal_vnd,discount_vnd,total_vnd,status,reservation_expires_at,paid_at,
       version,created_at,updated_at) VALUES
      ('20000000-0000-4000-8000-000000000001','NVC-20260815-00000001',
       '30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
       '{"address":"CANARY_ADDRESS"}','{"contact":"CANARY_CONTACT"}',50000,0,50000,
       'paid','2026-08-16T10:00:00Z','2026-08-15T01:00:00Z',2,
       '2026-08-15T00:00:00Z','2026-08-15T01:00:00Z');
    ALTER TABLE support_tickets DISABLE TRIGGER USER;
    INSERT INTO support_tickets
      (id,customer_id,order_id,subject,description,priority,status,version,created_by_id,
       assignee_id,sla_paused_seconds,sla_stopped_seconds,sla_pause_started_at,
       sla_stopped_at,closed_at,created_at,updated_at) VALUES
      ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',NULL,'CANARY_SUBJECT_1','CANARY_DESCRIPTION_1','urgent','in_progress',3,'CANARY_CREATOR','CANARY_ASSIGNEE',0,0,NULL,NULL,NULL,'2026-08-16T02:59:00Z','2026-08-16T03:00:00Z'),
      ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',NULL,'CANARY_SUBJECT_2','CANARY_DESCRIPTION_2','high','waiting_customer',4,'CANARY_CREATOR','CANARY_ASSIGNEE',0,0,'2026-08-16T04:00:00Z',NULL,NULL,'2026-08-15T20:30:00Z','2026-08-16T04:00:00Z'),
      ('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',NULL,'CANARY_SUBJECT_3','CANARY_DESCRIPTION_3','normal','new',1,'CANARY_CREATOR',NULL,0,0,NULL,NULL,NULL,'2026-08-15T09:00:00Z','2026-08-15T09:00:00Z'),
      ('10000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001',NULL,'CANARY_SUBJECT_4','CANARY_DESCRIPTION_4','low','waiting_internal',4,'CANARY_CREATOR','CANARY_ASSIGNEE',0,0,NULL,NULL,NULL,'2026-08-16T00:00:00Z','2026-08-16T01:00:00Z'),
      ('10000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001',NULL,'CANARY_SUBJECT_5','CANARY_DESCRIPTION_5','normal','escalated',2,'CANARY_CREATOR',NULL,0,0,NULL,NULL,NULL,'2026-08-16T00:00:00Z','2026-08-16T01:00:00Z'),
      ('10000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000001',NULL,'CANARY_SUBJECT_6','CANARY_DESCRIPTION_6','normal','closed',5,'CANARY_CREATOR','CANARY_ASSIGNEE',0,0,NULL,'2026-08-16T02:00:00Z','2026-08-16T03:00:00Z','2026-08-15T00:00:00Z','2026-08-16T03:00:00Z'),
      ('10000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','CANARY_SUBJECT_7','CANARY_DESCRIPTION_7','normal','assigned',2,'CANARY_CREATOR','CANARY_ASSIGNEE',0,0,NULL,NULL,NULL,'2026-08-16T04:00:00Z','2026-08-16T04:01:00Z');
    ALTER TABLE support_tickets ENABLE TRIGGER USER;
    INSERT INTO support_ticket_messages(id,ticket_id,author_id,body,created_at) VALUES
      ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','CANARY_AUTHOR','CANARY_MESSAGE','2026-08-16T04:00:00Z');
    INSERT INTO support_attachments
      (id,ticket_id,object_key,original_filename,format,media_type,byte_size,status,version,
       created_by_id,created_at) VALUES
      ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
       'CANARY_OBJECT','CANARY_ATTACHMENT.pdf','pdf','application/pdf',10,'quarantined',1,
       'CANARY_CREATOR','2026-08-16T04:00:00Z');
  `);
}
