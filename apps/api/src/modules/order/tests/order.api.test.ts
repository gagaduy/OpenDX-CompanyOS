// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { OrderServiceContract } from "../application/services/interfaces/order.service";
import { AdminOrderController } from "../presentation/controllers/admin-order.controller";
import { CustomerOrderController } from "../presentation/controllers/customer-order.controller";
import { orderErrorMiddleware } from "../presentation/middleware/order-error.middleware";
import { createAdminOrderRouter } from "../presentation/routes/admin-order.routes";
import { createCustomerOrderRouter } from "../presentation/routes/customer-order.routes";

const orderId = "c1000000-0000-4000-8000-000000000001";
function fixture(role?: StaffRole) {
  const service = {
    listForCustomer: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 })),
    getForCustomer: vi.fn(),
    listForStaff: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 })),
    getForStaff: vi.fn(),
    transition: vi.fn(async () => ({ id: orderId, status: "processing" })),
  } as unknown as OrderServiceContract;
  const staff: RequestHandler = (pending, response, next) => {
    if (pending.header("authorization") !== undefined) response.locals.staffPrincipal = { subject: "staff-1", displayName: "Staff", roles: role === undefined ? [] : [role] };
    next();
  };
  const customer: RequestHandler = (_pending, response, next) => {
    response.locals.customer = { customerId: "customer-1", sessionId: "session-1", email: "buyer@example.com", expiresAt: "2026-09-01T00:00:00.000Z" };
    next();
  };
  const appendDenied = vi.fn(async () => undefined);
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/v1/admin/orders", createAdminOrderRouter(new AdminOrderController(service), staff, appendDenied));
  app.use("/v1/storefront", createCustomerOrderRouter(new CustomerOrderController(service), customer));
  app.use(orderErrorMiddleware);
  app.use(createErrorHandler());
  return { app, appendDenied, service };
}

describe("Order API", () => {
  it("audits denied staff reads", async () => {
    const { app, appendDenied, service } = fixture("finance_operator");
    await request(app).get("/v1/admin/orders").set("authorization", "Bearer token").expect(403);
    expect(appendDenied).toHaveBeenCalledWith(expect.objectContaining({ actorId: "staff-1", action: "order.read.denied" }));
    expect(service.listForStaff).not.toHaveBeenCalled();
  });

  it("forwards validated operations transitions and the header idempotency key", async () => {
    const { app, service } = fixture("operations_manager");
    await request(app)
      .post(`/v1/admin/orders/${orderId}/transitions`)
      .set("authorization", "Bearer token")
      .set("idempotency-key", "processing-1")
      .set("x-correlation-id", "corr-processing")
      .send({ targetStatus: "processing", reasonCode: "PACKING_STARTED", version: 1 })
      .expect(200);
    expect(service.transition).toHaveBeenCalledWith(orderId, {
      targetStatus: "processing", reasonCode: "PACKING_STARTED", version: 1, idempotencyKey: "processing-1",
    }, { actorId: "staff-1", roles: ["operations_manager"], correlationId: "corr-processing" });
  });

  it("constrains storefront list calls to the authenticated customer", async () => {
    const { app, service } = fixture();
    await request(app).get("/v1/storefront/orders").expect(200);
    expect(service.listForCustomer).toHaveBeenCalledWith("customer-1", { page: 1, pageSize: 20 });
  });
});
