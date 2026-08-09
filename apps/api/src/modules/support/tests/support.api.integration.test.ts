// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { SupportApplicationError } from "../application/services/support-application.error";
import type { SupportServiceContract } from "../application/services/interfaces/support.service";
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
function fixture(role:string){ const ticket={id:ticketId,customerId,subject:"Support request",description:"Need assistance",priority:"normal",status:"assigned",version:1,createdById:"staff-crm_operator",createdAt:"2026-08-10T00:00:00.000Z",updatedAt:"2026-08-10T00:00:00.000Z"}; const workflow=async()=>{if(role==="crm_operator")throw new SupportApplicationError("FORBIDDEN","FORBIDDEN");return ticket;}; const service={list:vi.fn(async()=>{if(role==="crm_operator")throw new SupportApplicationError("FORBIDDEN","FORBIDDEN");return {items:[],page:1,pageSize:20,totalItems:0,totalPages:0};}),create:vi.fn(async()=>ticket),detail:vi.fn(async()=>({ticket,context:{customer:{id:customerId,email:"buyer@example.com"}},messages:[],events:[]})),claim:vi.fn(workflow),transition:vi.fn(workflow),appendMessage:vi.fn(async()=>({id:"message",authorId:"staff",body:"Investigating",createdAt:ticket.createdAt}))} as unknown as {[K in keyof SupportServiceContract]:ReturnType<typeof vi.fn>}; const authenticate:RequestHandler=(q,r,n)=>{if(q.header("authorization")){r.locals.staffPrincipal={subject:`staff-${role}`,displayName:"Staff",roles:[role]};}n();}; const denied=vi.fn(async()=>undefined);const app=express();app.use(express.json());app.use(correlationIdMiddleware);app.use("/v1/admin/support/tickets",createSupportRouter(new SupportController(service as unknown as SupportServiceContract),authenticate,denied));app.use(supportErrorMiddleware);app.use(createErrorHandler());return {app,service,denied}; }
