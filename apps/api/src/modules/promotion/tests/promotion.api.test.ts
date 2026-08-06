// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import type { PromotionServiceContract } from "../application/services/interfaces/promotion.service";
import { PromotionController } from "../presentation/controllers/promotion.controller";
import { createPromotionRouter } from "../presentation/routes/promotion.routes";

const promotionId = "a1000000-0000-4000-8000-000000000001";
const requestBody = {
  code: "nova10",
  name: "Nova launch",
  type: "percentage" as const,
  percentageBps: 1_000,
  minimumSubtotalVnd: 100_000,
  status: "active" as const,
};

function fixture(role?: StaffRole) {
  const service: PromotionServiceContract = {
    list: vi.fn(async () => []),
    create: vi.fn(async (input) => ({
      id: promotionId,
      ...input,
      code: input.code.toUpperCase(),
      version: 1,
      createdAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    })),
    update: vi.fn(),
  };
  const authenticate: RequestHandler = (pending, response, next) => {
    if (pending.header("authorization") === undefined) return next();
    response.locals.staffPrincipal = { subject: "staff-user", displayName: "Staff", roles: role === undefined ? [] : [role] };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(correlationIdMiddleware);
  app.use("/v1/admin/promotions", createPromotionRouter(new PromotionController(service), authenticate));
  app.use(createErrorHandler());
  return { app, service };
}

describe("Promotion API", () => {
  it.each([
    [undefined, 401],
    ["finance_operator" as const, 403],
  ])("protects promotion creation for role %s", async (role, status) => {
    const { app, service } = fixture(role);
    const call = request(app).post("/v1/admin/promotions");
    if (role !== undefined) call.set("authorization", "Bearer token");
    await call.send(requestBody).expect(status);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("validates and forwards administrator commands", async () => {
    const { app, service } = fixture("administrator");
    await request(app)
      .post("/v1/admin/promotions")
      .set("authorization", "Bearer token")
      .set("x-correlation-id", "corr-promotion")
      .send(requestBody)
      .expect(201)
      .expect(({ body }) => expect(body.data).toMatchObject({ id: promotionId, code: "NOVA10" }));
    expect(service.create).toHaveBeenCalledWith(requestBody, {
      actorId: "staff-user",
      roles: ["administrator"],
      correlationId: "corr-promotion",
    });
  });

  it("rejects ambiguous promotion values", async () => {
    const { app, service } = fixture("administrator");
    await request(app)
      .post("/v1/admin/promotions")
      .set("authorization", "Bearer token")
      .send({ ...requestBody, fixedAmountVnd: 50_000 })
      .expect(400)
      .expect(({ body }) => expect(body.errorCode).toBe("VALIDATION_ERROR"));
    expect(service.create).not.toHaveBeenCalled();
  });
});
