// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../shared/testing/assert-integration-environment";
import { runCatalogMigrations, runCompanyCoreMigrations, runCrmMigrations } from "../../../shared/database/run-migrations";
import { runCartMigrations } from "../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "../../payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "../../promotion/infrastructure/database/run-promotion-migrations";
import { SupportApplicationError } from "../application/services/support-application.error";
import type { SupportServiceContract } from "../application/services/interfaces/support.service";
import { SupportService } from "../application/services/implementations/support.service";
import { runSupportMigrations } from "../infrastructure/database/run-support-migrations";
import { PostgresqlSupportRepository } from "../infrastructure/repositories/implementations/postgresql-support.repository";
import { SupportController } from "../presentation/controllers/support.controller";
import { supportErrorMiddleware } from "../presentation/middleware/support-error.middleware";
import { createSupportRouter } from "../presentation/routes/support.routes";

const ticketId = "f2000000-0000-4000-8000-000000000001";
const customerId = "f2000000-0000-4000-8000-000000000002";
describe("Support ticket API", () => {
  it.each(["administrator", "support_operator"] as const)("allows %s queue and operations", async role => {
    const current = fixture(role); const auth={authorization:`Bearer ${role}`};
    await request(current.app).get("/v1/admin/support/tickets?page=1&pageSize=20").set(auth).expect(200);
    await request(current.app).post("/v1/admin/support/tickets").set(auth).send(createBody()).expect(201);
    await request(current.app).get(`/v1/admin/support/tickets/${ticketId}`).set(auth).expect(200);
    await request(current.app).post(`/v1/admin/support/tickets/${ticketId}/claim`).set(auth).send({version:1}).expect(200);
    await request(current.app).patch(`/v1/admin/support/tickets/${ticketId}`).set(auth).send({status:"in_progress",version:2,idempotencyKey:"transition-1"}).expect(200);
    await request(current.app).post(`/v1/admin/support/tickets/${ticketId}/messages`).set(auth).send({body:"Investigating"}).expect(201);
  });
  it("routes administrator reassignment through the approved PATCH surface", async () => {
    const current = fixture("administrator");

    await request(current.app)
      .patch(`/v1/admin/support/tickets/${ticketId}`)
      .set("authorization", "Bearer administrator")
      .send({ assigneeId: "support-b", version: 2, idempotencyKey: "reassign-1" })
      .expect(200);

    expect(current.service.reassign).toHaveBeenCalledWith(ticketId, { assigneeId: "support-b", version: 2, idempotencyKey: "reassign-1" }, expect.objectContaining({ actorId: "staff-administrator" }));
    expect(current.service.transition).not.toHaveBeenCalled();
  });
  it("allows CRM create and creator-owned detail but denies queue and workflow", async () => {
    const current=fixture("crm_operator"); const auth={authorization:"Bearer crm_operator"};
    await request(current.app).post("/v1/admin/support/tickets").set(auth).send(createBody()).expect(201);
    await request(current.app).get(`/v1/admin/support/tickets/${ticketId}`).set(auth).expect(200);
    await request(current.app).get("/v1/admin/support/tickets").set(auth).expect(403);
    await request(current.app).post(`/v1/admin/support/tickets/${ticketId}/claim`).set(auth).send({version:1}).expect(403);
    await request(current.app).patch(`/v1/admin/support/tickets/${ticketId}`).set(auth).send({status:"in_progress",version:1,idempotencyKey:"x"}).expect(403);
  });
  it.each(["executive_viewer","catalog_manager","inventory_manager","operations_manager","finance_operator"])("audits and denies %s", async role => {
    const current=fixture(role); await request(current.app).get("/v1/admin/support/tickets").set("authorization",`Bearer ${role}`).expect(403); expect(current.denied).toHaveBeenCalled();
  });
  it("requires authentication and validates IDs, pagination, bodies and transitions", async () => {
    const current=fixture("support_operator"); const auth={authorization:"Bearer support_operator"};
    await request(current.app).get("/v1/admin/support/tickets").expect(401);
    await request(current.app).get("/v1/admin/support/tickets?pageSize=101").set(auth).expect(400);
    await request(current.app).get("/v1/admin/support/tickets/nope").set(auth).expect(400);
    await request(current.app).post("/v1/admin/support/tickets").set(auth).send({...createBody(),subject:""}).expect(400);
    await request(current.app).patch(`/v1/admin/support/tickets/${ticketId}`).set(auth).send({status:"new",version:0,idempotencyKey:""}).expect(400);
  });
  it.each([["STALE_VERSION",409],["ALREADY_CLAIMED",409],["TICKET_NOT_FOUND",404],["FORBIDDEN",403]] as const)("maps %s stably", async (code,status) => { const current=fixture("support_operator"); current.service.detail.mockRejectedValueOnce(new SupportApplicationError(code,code)); const response=await request(current.app).get(`/v1/admin/support/tickets/${ticketId}`).set("authorization","Bearer support_operator").expect(status); expect(response.body.errorCode).toBe(code); });
});
function createBody(){return {customerId,subject:"Support request",description:"Need assistance",priority:"normal"};}
function fixture(role:string){ const ticket={id:ticketId,customerId,subject:"Support request",description:"Need assistance",priority:"normal",status:"assigned",version:1,createdById:"staff-crm_operator",createdAt:"2026-08-10T00:00:00.000Z",updatedAt:"2026-08-10T00:00:00.000Z"}; const workflow=async()=>{if(role==="crm_operator")throw new SupportApplicationError("FORBIDDEN","FORBIDDEN");return ticket;}; const service={list:vi.fn(async()=>{if(role==="crm_operator")throw new SupportApplicationError("FORBIDDEN","FORBIDDEN");return {items:[],page:1,pageSize:20,totalItems:0,totalPages:0};}),create:vi.fn(async()=>ticket),detail:vi.fn(async()=>({ticket,context:{customer:{id:customerId,email:"buyer@example.com"}},messages:[],events:[]})),claim:vi.fn(workflow),transition:vi.fn(workflow),reassign:vi.fn(workflow),appendMessage:vi.fn(async()=>({id:"message",authorId:"staff",body:"Investigating",createdAt:ticket.createdAt}))} as unknown as {[K in keyof SupportServiceContract]:ReturnType<typeof vi.fn>}; const authenticate:RequestHandler=(q,r,n)=>{if(q.header("authorization")){r.locals.staffPrincipal={subject:`staff-${role}`,displayName:"Staff",roles:[role]};}n();}; const denied=vi.fn(async()=>undefined);const app=express();app.use(express.json());app.use(correlationIdMiddleware);app.use("/v1/admin/support/tickets",createSupportRouter(new SupportController(service as unknown as SupportServiceContract),authenticate,denied));app.use(supportErrorMiddleware);app.use(createErrorHandler());return {app,service,denied}; }

const databaseUrl = process.env.TEST_DATABASE_URL;
const realSuite = databaseUrl === undefined ? describe.skip : describe;

realSuite("Support ticket API with PostgreSQL service", () => {
  if (new URL(databaseUrl!).pathname !== "/opendx_test") throw new Error("Support API PostgreSQL tests must run only against opendx_test");
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up"); await runCompanyCoreMigrations(databaseUrl!, "up"); await runInventoryMigrations(databaseUrl!, "up"); await runCustomerMigrations(databaseUrl!, "up"); await runCartMigrations(databaseUrl!, "up"); await runPromotionMigrations(databaseUrl!, "up"); await runCheckoutMigrations(databaseUrl!, "up"); await runOrderMigrations(databaseUrl!, "up"); await runPaymentMigrations(databaseUrl!, "up"); await runCrmMigrations(databaseUrl!, "up"); await runSupportMigrations(databaseUrl!, "down", 999999); await runSupportMigrations(databaseUrl!, "up");
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE support_audit_events,support_ticket_events,support_ticket_messages,support_tickets,customers,audit_events CASCADE");
    await pool.query("INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at) VALUES($1,'support-api@example.com',$2,'active',1,$2,$2)", [customerId, "2026-08-10T00:00:00.000Z"]);
  });
  afterAll(async () => { await pool.end(); });

  it("persists route calls through service and repository ownership rules", async () => {
    const ids = uuidSequence();
    const app = realApp("administrator", ids);
    const created = await request(app).post("/v1/admin/support/tickets").set("authorization", "Bearer administrator").send(createBody()).expect(201);
    const createdTicketId = created.body.data.id as string;

    await request(app).patch(`/v1/admin/support/tickets/${createdTicketId}`).set("authorization", "Bearer administrator").send({ assigneeId: "staff-support-a", version: 1, idempotencyKey: "reassign-1" }).expect(200);
    await request(realApp("support-b", ids)).get(`/v1/admin/support/tickets/${createdTicketId}`).set("authorization", "Bearer support-b").expect(403).expect(({ body }) => expect(body.errorCode).toBe("TICKET_NOT_OWNED"));
    await request(realApp("support-a", ids)).patch(`/v1/admin/support/tickets/${createdTicketId}`).set("authorization", "Bearer support-a").send({ status: "assigned", version: 2, idempotencyKey: "assign-1" }).expect(200);
    await request(realApp("support-a", ids)).post(`/v1/admin/support/tickets/${createdTicketId}/messages`).set("authorization", "Bearer support-a").send({ body: "Investigating" }).expect(201);
    await request(realApp("support-a", ids)).patch(`/v1/admin/support/tickets/${createdTicketId}`).set("authorization", "Bearer support-a").send({ status: "in_progress", version: 3, idempotencyKey: "progress-1" }).expect(200);
    await request(realApp("support-a", ids)).patch(`/v1/admin/support/tickets/${createdTicketId}`).set("authorization", "Bearer support-a").send({ status: "resolved", version: 4, idempotencyKey: "resolve-1" }).expect(200);
    await request(realApp("support-a", ids)).patch(`/v1/admin/support/tickets/${createdTicketId}`).set("authorization", "Bearer support-a").send({ status: "closed", version: 5, idempotencyKey: "close-1" }).expect(200);
    await request(realApp("support-a", ids)).post(`/v1/admin/support/tickets/${createdTicketId}/messages`).set("authorization", "Bearer support-a").send({ body: "Late message" }).expect(400).expect(({ body }) => expect(body.errorCode).toBe("TICKET_CLOSED"));

    expect((await pool.query<{ count: string }>("SELECT count(*) FROM support_ticket_messages WHERE ticket_id=$1", [createdTicketId])).rows[0]?.count).toBe("1");
  });

  function realApp(role: string, ids: () => string) {
    const repository = new PostgresqlSupportRepository();
    const service = new SupportService(repository, {
      get: async (id: string) => id === customerId ? { id, email: "support-api@example.com" } : undefined,
      getSupportContext: async (id: string) => id === customerId ? { id, email: "support-api@example.com" } : undefined,
    } as never, { getOwned: async () => undefined } as never, transactions, ids, () => "2026-08-10T01:00:00.000Z");
    const authenticate: RequestHandler = (q, r, n) => { if (q.header("authorization")) r.locals.staffPrincipal = { subject: `staff-${role}`, displayName: "Staff", roles: [role === "support-a" || role === "support-b" ? "support_operator" : role] }; n(); };
    const app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    app.use("/v1/admin/support/tickets", createSupportRouter(new SupportController(service), authenticate, async () => undefined));
    app.use(supportErrorMiddleware);
    app.use(createErrorHandler());
    return app;
  }
});

function uuidSequence() {
  let sequence = 10;
  return () => `f2000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
}
