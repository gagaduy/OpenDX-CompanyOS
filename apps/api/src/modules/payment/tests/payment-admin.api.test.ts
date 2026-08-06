// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { PaymentReconciliationServiceContract } from "../application/services/interfaces/payment-reconciliation.service";
import { PaymentAdminController } from "../presentation/controllers/payment-admin.controller";
import { paymentErrorMiddleware } from "../presentation/middleware/payment-error.middleware";
import { createPaymentAdminRouter } from "../presentation/routes/payment-admin.routes";

const paymentId = "a1000000-0000-4000-8000-000000000001";

function fixture(role: StaffRole) {
  const detail = {
    id: paymentId, orderId: "order-1", status: "pending_provider" as const,
    expectedAmountVnd: 100_000, currency: "VND" as const,
    invoiceNumber: "NVC-PAY-A1000000000040008000000000000001",
    updatedAt: "2026-08-06T08:00:00.000Z", attemptId: "attempt-1",
    expiresAt: "2026-08-06T08:15:00.000Z", reconciliations: [],
  };
  const service: PaymentReconciliationServiceContract = {
    list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 })),
    get: vi.fn(async () => detail), reconcile: vi.fn(async () => detail),
    reconcileDue: vi.fn(async () => 0),
  };
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.staffPrincipal = {
      subject: "staff-1", displayName: "Staff", roles: [role],
    };
    next();
  };
  const appendDenied = vi.fn(async () => undefined);
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use(
    "/v1/admin/payments",
    createPaymentAdminRouter(
      new PaymentAdminController(service),
      authenticate,
      appendDenied,
    ),
  );
  app.use(paymentErrorMiddleware);
  app.use(createErrorHandler());
  return { app, appendDenied, service };
}

describe("Payment admin API", () => {
  it.each(["administrator", "finance_operator"] as const)(
    "allows %s to inspect and reconcile payments",
    async (role) => {
      const current = fixture(role);
      await request(current.app).get("/v1/admin/payments").expect(200);
      await request(current.app)
        .post(`/v1/admin/payments/${paymentId}/reconciliations`)
        .set("x-correlation-id", "corr-reconcile")
        .send({ providerOrderId: "provider-order-1" })
        .expect(200);
      expect(current.service.reconcile).toHaveBeenCalledWith(
        paymentId,
        { providerOrderId: "provider-order-1" },
        { actorId: "staff-1", roles: [role], correlationId: "corr-reconcile" },
      );
    },
  );

  it("audits and blocks unrelated staff roles", async () => {
    const current = fixture("catalog_manager");
    await request(current.app).get("/v1/admin/payments").expect(403);
    expect(current.appendDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "staff-1",
        action: "payment.read.denied",
      }),
    );
    expect(current.service.list).not.toHaveBeenCalled();
  });

  it("rejects malformed reconciliation inputs", async () => {
    const current = fixture("finance_operator");
    await request(current.app)
      .post(`/v1/admin/payments/${paymentId}/reconciliations`)
      .send({ providerOrderId: "" })
      .expect(400);
    expect(current.service.reconcile).not.toHaveBeenCalled();
  });
});
