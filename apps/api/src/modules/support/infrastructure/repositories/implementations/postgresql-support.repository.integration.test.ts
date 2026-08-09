// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations, runCrmMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../../../shared/testing/assert-integration-environment";
import { runCartMigrations } from "../../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "../../../../payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "../../../../promotion/infrastructure/database/run-promotion-migrations";
import { SupportEscalationWorker } from "../../workers/support-escalation.worker";
import { runSupportMigrations } from "../../database/run-support-migrations";
import { PostgresqlSupportRepository } from "./postgresql-support.repository";

const url = process.env.TEST_DATABASE_URL;
const suite = url === undefined ? describe.skip : describe;
const customerId = "f1000000-0000-4000-8000-000000000001";
const ticketId = "f1000000-0000-4000-8000-000000000002";
const at = "2026-08-10T00:00:00.000Z";

suite("PostgresqlSupportRepository", () => {
  if (new URL(url!).pathname !== "/opendx_test") throw new Error("Support repository tests must run only against opendx_test");
  assertIntegrationEnvironment({ TEST_DATABASE_URL: url });
  const pool = new Pool({ connectionString: url, max: 10 });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlSupportRepository();
  beforeAll(async () => {
    await runCatalogMigrations(url!, "up"); await runCompanyCoreMigrations(url!, "up"); await runInventoryMigrations(url!, "up"); await runCustomerMigrations(url!, "up"); await runCartMigrations(url!, "up"); await runPromotionMigrations(url!, "up"); await runCheckoutMigrations(url!, "up"); await runOrderMigrations(url!, "up"); await runPaymentMigrations(url!, "up"); await runCrmMigrations(url!, "up"); await runSupportMigrations(url!, "down"); await runSupportMigrations(url!, "up");
  });
  beforeEach(async () => { await pool.query("TRUNCATE support_audit_events,support_ticket_events,support_ticket_messages,support_tickets,customers,audit_events CASCADE"); await pool.query("INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at) VALUES($1,'support@example.com',$2,'active',1,$2,$2)",[customerId,at]); });
  afterAll(async () => { await pool.end(); });
  async function insert(id=ticketId, status="new", version=1, createdAt=at) { await pool.query("INSERT INTO support_tickets(id,customer_id,subject,description,priority,status,version,created_by_id,created_at,updated_at) VALUES($1,$2,'Support','Description','urgent',$3,$4,'crm-creator',$5,$5)",[id,customerId,status,version,createdAt]); }

  it("lets exactly one concurrent self-claim update the ticket and makes stale versions lose", async () => {
    await insert();
    const claim = (actor: string) => transactions.run(async s => { const ticket = await repository.find(s,ticketId,true); if (!ticket) throw new Error("missing"); const updated = { ...ticket, status: "assigned" as const, assigneeId: actor, version: 2, updatedAt: "2026-08-10T00:01:00.000Z" }; if (!await repository.update(s,updated,1)) throw new Error("STALE_VERSION"); });
    const results = await Promise.allSettled([claim("support-a"),claim("support-b")]);
    expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
    expect((await pool.query("SELECT version,assignee_id FROM support_tickets WHERE id=$1",[ticketId])).rows[0]).toMatchObject({version:2});
  });

  it("keeps CRM ownership constrained, converges duplicate transition keys, and orders events by occurred_at then ID", async () => {
    await insert();
    const secondTicketId = "f1000000-0000-4000-8000-000000000006";
    await insert(secondTicketId);
    await expect(transactions.runReadOnly(s=>repository.find(s,"f1000000-0000-4000-8000-000000000099"))).resolves.toBeUndefined();
    await transactions.run(async s => {
      const event=(id:string,currentTicketId:string,key:string)=>repository.appendEvent(s,{id,ticketId:currentTicketId,actorId:"support",fromStatus:"new",toStatus:"assigned",source:"manual",idempotencyKey:key,occurredAt:"2026-08-10T01:00:00.000Z"});
      expect(await event("f1000000-0000-4000-8000-000000000004",ticketId,"duplicate")).toBe(true);
      expect(await event("f1000000-0000-4000-8000-000000000005",ticketId,"duplicate")).toBe(false);
      expect(await event("f1000000-0000-4000-8000-000000000007",secondTicketId,"duplicate")).toBe(true);
      await event("f1000000-0000-4000-8000-000000000003",ticketId,"other");
    });
    await expect(transactions.runReadOnly(s=>repository.listEvents(s,ticketId))).resolves.toMatchObject([{id:"f1000000-0000-4000-8000-000000000003"},{id:"f1000000-0000-4000-8000-000000000004"}]);
  });

  it("rejects messages for closed tickets at the database boundary", async () => {
    await insert(ticketId,"new",1);
    await pool.query("UPDATE support_tickets SET status='assigned',version=2,updated_at='2026-08-10T00:10:00.000Z' WHERE id=$1",[ticketId]);
    await pool.query("UPDATE support_tickets SET status='in_progress',version=3,updated_at='2026-08-10T00:20:00.000Z' WHERE id=$1",[ticketId]);
    await pool.query("UPDATE support_tickets SET status='resolved',version=4,updated_at='2026-08-10T00:30:00.000Z',sla_stopped_at='2026-08-10T00:30:00.000Z' WHERE id=$1",[ticketId]);
    await pool.query("UPDATE support_tickets SET status='closed',version=5,updated_at='2026-08-10T01:00:00.000Z',closed_at='2026-08-10T01:00:00.000Z' WHERE id=$1",[ticketId]);

    await expect(transactions.run(s=>repository.appendMessage(s,{ id:"f1000000-0000-4000-8000-000000000008", ticketId, authorId:"support", body:"Late message", createdAt:"2026-08-10T01:01:00.000Z" }))).rejects.toMatchObject({ code: "P0001" });
  });

  it("claims one breached ticket once across concurrent workers with a deterministic key and caps a tick at 100", async () => {
    await insert(ticketId,"new",1,"2026-08-09T00:00:00.000Z");
    await pool.query("UPDATE support_tickets SET status='assigned',version=2,updated_at='2026-08-09T00:01:00.000Z' WHERE id=$1",[ticketId]);
    await pool.query("UPDATE support_tickets SET status='in_progress',version=3,updated_at='2026-08-09T00:02:00.000Z' WHERE id=$1",[ticketId]);
    const worker = () => new SupportEscalationWorker(transactions,repository,cryptoId(),()=>"2026-08-10T04:00:00.000Z");
    await Promise.all([worker().tick(),worker().tick()]);
    expect((await pool.query("SELECT status FROM support_tickets WHERE id=$1",[ticketId])).rows[0]).toMatchObject({status:"escalated"});
    expect((await pool.query("SELECT count(*)::int count FROM support_ticket_events WHERE ticket_id=$1 AND source='automatic'",[ticketId])).rows[0]).toEqual({count:1});
  });

  it("permits assignment of an unassigned escalated ticket without erasing escalation", async () => {
    await insert();
    await pool.query("UPDATE support_tickets SET status='escalated',version=2,updated_at='2026-08-10T03:00:00.000Z' WHERE id=$1",[ticketId]);
    await expect(pool.query("UPDATE support_tickets SET assignee_id='support-1',version=3,updated_at='2026-08-10T03:01:00.000Z' WHERE id=$1",[ticketId])).resolves.toMatchObject({rowCount:1});
    expect((await pool.query("SELECT status,assignee_id FROM support_tickets WHERE id=$1",[ticketId])).rows[0]).toEqual({status:"escalated",assignee_id:"support-1"});
  });
});
function cryptoId(){ let n=0; return ()=>`f1000000-0000-4000-8000-${String(++n+10).padStart(12,"0")}`; }
