// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import { CrmApplicationError } from "../application/services/crm-application.error";
import type { CrmServiceContract } from "../application/services/interfaces/crm.service";
import { CrmController } from "../presentation/controllers/crm.controller";
import { crmErrorMiddleware } from "../presentation/middleware/crm-error.middleware";
import { createCrmRouter } from "../presentation/routes/crm.routes";

const customerId = "e1000000-0000-4000-8000-000000000001";
const noteId = "e2000000-0000-4000-8000-000000000001";
const followupId = "e3000000-0000-4000-8000-000000000001";

describe("CRM admin API", () => {
  it.each(["crm_operator", "administrator"] as const)(
    "allows %s through every CRM route with validated context",
    async (role) => {
      const current = fixture(role);
      const authorization = { authorization: `Bearer ${role}` };
      await request(current.app).get("/v1/admin/customers?page=2&pageSize=1").set(authorization).expect(200);
      await request(current.app).get(`/v1/admin/customers/${customerId}`).set(authorization).expect(200);
      await request(current.app).get(`/v1/admin/customers/${customerId}/notes`).set(authorization).expect(200);
      await request(current.app).post(`/v1/admin/customers/${customerId}/notes`).set(authorization)
        .send({ body: "Correction", correctsNoteId: noteId }).expect(201);
      await request(current.app).get(`/v1/admin/customers/${customerId}/followups`).set(authorization).expect(200);
      await request(current.app).post(`/v1/admin/customers/${customerId}/followups`).set(authorization)
        .send({ dueAt: "2026-08-11T00:00:00.000Z", description: "Call customer" }).expect(201);
      await request(current.app).patch(`/v1/admin/customers/${customerId}/followups/${followupId}`).set(authorization)
        .send({ action: "claim", version: 1 }).expect(200);
      await request(current.app).get("/v1/admin/customers/segments").set(authorization).expect(200);
      await request(current.app).get("/v1/admin/customers/segments/high_value/customers?page=1&pageSize=20").set(authorization).expect(200);

      expect(current.service.searchCustomers).toHaveBeenCalledWith(
        { page: 2, pageSize: 1 },
        expect.objectContaining({ actorId: `staff-${role}`, roles: [role] }),
      );
      expect(current.service.createNote).toHaveBeenCalledWith(customerId, {
        body: "Correction", correctsNoteId: noteId,
      }, expect.objectContaining({ roles: [role] }));
      expect(current.service.updateFollowup).toHaveBeenCalledWith(customerId, followupId, {
        action: "claim", version: 1,
      }, expect.objectContaining({ roles: [role] }));
    },
  );

  it("declares the static segments route before the customer ID route", async () => {
    const current = fixture("crm_operator");
    await request(current.app).get("/v1/admin/customers/segments").set("authorization", "Bearer crm_operator").expect(200);
    expect(current.service.listSegments).toHaveBeenCalledTimes(1);
    expect(current.service.getCustomer).not.toHaveBeenCalled();
  });

  it("returns 401 without staff authentication", async () => {
    const current = fixture("crm_operator");
    await request(current.app).get("/v1/admin/customers").expect(401);
    expect(current.service.searchCustomers).not.toHaveBeenCalled();
  });

  it("does not expose a customer profile or address mutation route", async () => {
    const current = fixture("administrator");
    await request(current.app)
      .patch(`/v1/admin/customers/${customerId}`)
      .set("authorization", "Bearer administrator")
      .send({ fullName: "Staff edit" })
      .expect(404);
    expect(current.service.getCustomer).not.toHaveBeenCalled();
  });

  it.each([
    "support_operator",
    "executive_viewer",
    "catalog_manager",
    "inventory_manager",
    "operations_manager",
    "finance_operator",
  ] as const)("audits and denies %s without exposing PII", async (role) => {
    const current = fixture(role);
    const response = await request(current.app)
      .get(`/v1/admin/customers/${customerId}`)
      .set("authorization", `Bearer ${role}`)
      .expect(403);
    expect(response.text).not.toMatch(/buyer@example|0901000001/);
    expect(current.appendDenied).toHaveBeenCalledWith(expect.objectContaining({
      actorId: `staff-${role}`,
      action: "crm.access.denied",
      resourceId: customerId,
    }));
    expect(current.service.getCustomer).not.toHaveBeenCalled();
  });

  it.each([
    ["get", "/v1/admin/customers/not-a-uuid"],
    ["get", "/v1/admin/customers?page=0"],
    ["get", "/v1/admin/customers?pageSize=101"],
    ["get", "/v1/admin/customers/segments/nope/customers"],
  ] as const)("rejects invalid GET input for %s %s", async (method, path) => {
    const current = fixture("crm_operator");
    await request(current.app)[method](path).set("authorization", "Bearer crm_operator").expect(400);
  });

  it("rejects malformed note and follow-up bodies", async () => {
    const current = fixture("crm_operator");
    const authorization = { authorization: "Bearer crm_operator" };
    await request(current.app).post(`/v1/admin/customers/${customerId}/notes`).set(authorization)
      .send({ body: "", unexpected: true }).expect(400);
    await request(current.app).post(`/v1/admin/customers/${customerId}/followups`).set(authorization)
      .send({ dueAt: "tomorrow", description: "" }).expect(400);
    await request(current.app).patch(`/v1/admin/customers/${customerId}/followups/${followupId}`).set(authorization)
      .send({ action: "assign", version: 0 }).expect(400);
  });

  it.each([
    ["CUSTOMER_NOT_FOUND", 404],
    ["NOTE_NOT_FOUND", 404],
    ["FOLLOWUP_NOT_FOUND", 404],
    ["STALE_VERSION", 409],
    ["INVALID_SEGMENT", 400],
    ["FORBIDDEN", 403],
  ] as const)("maps %s to HTTP %s", async (code, status) => {
    const current = fixture("crm_operator");
    current.service.getCustomer.mockRejectedValueOnce(new CrmApplicationError(code, code));
    const response = await request(current.app)
      .get(`/v1/admin/customers/${customerId}`)
      .set("authorization", "Bearer crm_operator")
      .expect(status);
    expect(response.body.errorCode).toBe(code);
  });
});

function fixture(role: StaffRole) {
  const service = {
    searchCustomers: vi.fn(async (query) => ({ items: [], ...query, totalItems: 0, totalPages: 0 })),
    getCustomer: vi.fn(async () => ({ customer: { id: customerId }, orders: [], notes: [], followups: [] })),
    listNotes: vi.fn(async () => []),
    createNote: vi.fn(async () => ({ id: noteId, customerId })),
    listFollowups: vi.fn(async () => []),
    createFollowup: vi.fn(async () => ({ id: followupId, customerId })),
    updateFollowup: vi.fn(async () => ({ id: followupId, customerId, status: "open", version: 2 })),
    listSegments: vi.fn(async () => ({ items: [], calculatedAt: "2026-08-10T00:00:00.000Z" })),
    listSegmentCustomers: vi.fn(async (_segmentId, query) => ({
      items: [], ...query, totalItems: 0, totalPages: 0, calculatedAt: "2026-08-10T00:00:00.000Z",
    })),
  } as unknown as { [K in keyof CrmServiceContract]: ReturnType<typeof vi.fn> };
  const authenticate: RequestHandler = (pending, response, next) => {
    if (pending.header("authorization") !== undefined) {
      response.locals.staffPrincipal = {
        subject: `staff-${role}`,
        displayName: "Staff",
        roles: [role],
      };
    }
    next();
  };
  const appendDenied = vi.fn(async () => undefined);
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(
    "/v1/admin/customers",
    createCrmRouter(new CrmController(service as unknown as CrmServiceContract), authenticate, appendDenied),
  );
  app.use(crmErrorMiddleware);
  app.use(createErrorHandler());
  return { app, appendDenied, service };
}
