// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requireCsrf, requireCustomerSession, requireStorefrontOrigin, type CustomerSessionServiceContract } from "../../customer";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { CheckoutServiceContract } from "../application/services/interfaces/checkout.service";
import { CheckoutController } from "../presentation/controllers/checkout.controller";
import { createCheckoutRouter } from "../presentation/routes/checkout.routes";

const cookies = { guestName: "guest_session", customerName: "customer_session", csrfName: "storefront_csrf", secure: false };
function fixture() {
  const service: CheckoutServiceContract = {
    create: vi.fn(async () => ({ id: "checkout-1", orderId: "order-1", status: "order_created" as const, subtotalVnd: 100_000, discountVnd: 0, totalVnd: 100_000, currency: "VND" as const, expiresAt: "2026-08-06T08:15:00.000Z", lines: [], payment: { actionUrl: "https://pay-sandbox.sepay.vn/v1/checkout/init", method: "POST" as const, fields: [] } })),
    get: vi.fn(), initiatePayment: vi.fn(),
  };
  const sessions: CustomerSessionServiceContract = {
    createGuest: vi.fn(), resolveGuest: vi.fn(),
    resolveCustomer: vi.fn(async () => ({ rawToken: "rotated", principal: { customerId: "customer-1", sessionId: "session-1", email: "buyer@example.com", expiresAt: "2026-09-01T00:00:00.000Z" } })),
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }), correlationIdMiddleware);
  app.use("/v1/storefront", createCheckoutRouter(new CheckoutController(service), requireCustomerSession(sessions, cookies), requireStorefrontOrigin("http://localhost:3100"), requireCsrf(cookies), (_req, _res, next) => next()));
  app.use(createErrorHandler());
  return { app, service };
}
const validHeaders = { Cookie: "customer_session=raw; storefront_csrf=token", Origin: "http://localhost:3100", "X-CSRF-Token": "token", "Idempotency-Key": "checkout-key" };

describe("checkout API boundary", () => {
  it("requires customer session before checkout", async () => {
    const { app } = fixture();
    await request(app).post("/v1/storefront/checkouts").set("Origin", "http://localhost:3100").send({ addressId: "a1000000-0000-4000-8000-000000000001" }).expect(401);
  });
  it("enforces origin, CSRF, and idempotency headers", async () => {
    const { app } = fixture();
    await request(app).post("/v1/storefront/checkouts").set({ ...validHeaders, Origin: "https://evil.example" }).send({ addressId: "a1000000-0000-4000-8000-000000000001" }).expect(403);
    await request(app).post("/v1/storefront/checkouts").set({ Cookie: validHeaders.Cookie, Origin: validHeaders.Origin, "Idempotency-Key": validHeaders["Idempotency-Key"] }).send({ addressId: "a1000000-0000-4000-8000-000000000001" }).expect(403);
    await request(app).post("/v1/storefront/checkouts").set({ Cookie: validHeaders.Cookie, Origin: validHeaders.Origin, "X-CSRF-Token": validHeaders["X-CSRF-Token"] }).send({ addressId: "a1000000-0000-4000-8000-000000000001" }).expect(400);
  });
  it("returns purpose-specific checkout and payment initiation data", async () => {
    const { app, service } = fixture();
    const response = await request(app).post("/v1/storefront/checkouts").set(validHeaders).send({ addressId: "a1000000-0000-4000-8000-000000000001" }).expect(201);
    expect(response.body).toMatchObject({ success: true, data: { status: "order_created", orderId: "order-1", payment: { method: "POST" } } });
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "checkout-key" }), expect.objectContaining({ customerId: "customer-1" }));
  });
});
