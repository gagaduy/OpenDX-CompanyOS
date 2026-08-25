// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { StaffRole } from "../../../shared/auth/staff-principal";
import { correlationIdMiddleware } from "../../../shared/http/correlation-id.middleware";
import { createErrorHandler } from "../../../shared/http/error-handler.middleware";
import type { ReportingServiceContract } from "../application/services/interfaces/reporting.service";
import { ReportingController } from "../presentation/controllers/reporting.controller";
import { reportingErrorMiddleware } from "../presentation/middleware/reporting-error.middleware";
import { createReportingRouter } from "../presentation/routes/reporting.routes";

const range = { start: "2026-08-01", end: "2026-08-02" };

describe("Reporting admin API", () => {
  it.each(["administrator", "executive_viewer"] as const)(
    "allows %s to read all aggregate reports",
    async (role) => {
      const current = fixture(role);
      const authorization = { authorization: `Bearer ${role}` };

      const commerce = await request(current.app).get("/v1/admin/reporting/commerce").set(authorization).query(range).expect(200);
      await request(current.app).get("/v1/admin/reporting/products").set(authorization).query(range).expect(200);
      const customers = await request(current.app).get("/v1/admin/reporting/customers").set(authorization).query(range).expect(200);
      const operations = await request(current.app)
        .get("/v1/admin/reporting/operations")
        .set(authorization)
        .query(range)
        .expect(200);

      expect(operations.body.refreshedAt).toMatch(/^2026-08-10T05:00:/);
      expect(commerce.body.data).toMatchObject({
        comparison: {
          previousGrossPaidRevenueVnd: 0,
          previousPaidOrderCount: 0,
          previousAverageOrderValueVnd: 0,
          grossPaidRevenueChangeBasisPoints: 0,
          paidOrderCountChangeBasisPoints: 0,
          averageOrderValueChangeBasisPoints: 0,
        },
        daily: [],
      });
      expect(customers.body.data).toMatchObject({
        newCustomersInRange: 0,
        previousNewCustomersInRange: 0,
        newCustomersChangeBasisPoints: 0,
        dailyNewCustomers: [],
      });
      expect(current.service.getCommerce).toHaveBeenCalledWith(
        range,
        { actorId: `staff-${role}`, roles: [role], correlationId: expect.any(String) },
      );
    },
  );

  it.each([
    "crm_operator",
    "support_operator",
    "catalog_manager",
    "inventory_manager",
    "operations_manager",
    "finance_operator",
  ] as const)("audits and denies %s without invoking reporting service", async (role) => {
    const current = fixture(role);

    const response = await request(current.app)
      .get("/v1/admin/reporting/commerce")
      .set("authorization", `Bearer ${role}`)
      .query(range)
      .expect(403);

    expect(JSON.stringify(response.body)).not.toMatch(/customer@example|090|ticket/);
    expect(current.appendDenied).toHaveBeenCalledWith(expect.objectContaining({
      actorId: `staff-${role}`,
      action: "reporting.access.denied",
      resourceId: "commerce",
    }));
    expect(current.service.getCommerce).not.toHaveBeenCalled();
  });

  it.each([
    { start: "2026-08-02", end: "2026-08-01" },
    { start: "2026-08-01", end: "2027-08-03" },
    { start: "2026-08-01T00:00:00.000Z", end: "2026-08-02" },
    { start: "2026-08-01", end: "bad" },
  ])("rejects invalid reporting ranges", async (query) => {
    const current = fixture("administrator");
    await request(current.app)
      .get("/v1/admin/reporting/commerce")
      .set("authorization", "Bearer administrator")
      .query(query)
      .expect(400);
    expect(current.service.getCommerce).not.toHaveBeenCalled();
  });

  it("returns 401 without staff authentication", async () => {
    const current = fixture("administrator");
    await request(current.app).get("/v1/admin/reporting/commerce").expect(401);
  });
});

function fixture(role: StaffRole) {
  const response = {
    data: {},
    refreshedAt: "2026-08-10T05:00:00.000Z",
    range: { ...range, timezone: "Asia/Ho_Chi_Minh" as const },
  };
  const service = {
    getCommerce: vi.fn(async () => ({
      ...response,
      data: {
        grossPaidRevenueVnd: 0,
        paidOrderCount: 0,
        averageOrderValueVnd: 0,
        conversionRateBasisPoints: 0,
        comparison: {
          previousGrossPaidRevenueVnd: 0,
          previousPaidOrderCount: 0,
          previousAverageOrderValueVnd: 0,
          grossPaidRevenueChangeBasisPoints: 0,
          paidOrderCountChangeBasisPoints: 0,
          averageOrderValueChangeBasisPoints: 0,
        },
        daily: [],
        paymentStatuses: [],
      },
    })),
    getProducts: vi.fn(async () => ({
      ...response,
      data: { items: [], inventory: { onHand: 0, reserved: 0, available: 0, soldOutCount: 0 } },
    })),
    getCustomers: vi.fn(async () => ({
      ...response,
      data: {
        totalRegisteredCustomers: 0,
        repeatCustomers: 0,
        lifetimeValueVnd: 0,
        lifetimeValueBuckets: [],
        newCustomersInRange: 0,
        previousNewCustomersInRange: 0,
        newCustomersChangeBasisPoints: 0,
        dailyNewCustomers: [],
      },
    })),
    getOperations: vi.fn(async () => ({
      ...response,
      data: { openTickets: 0, overdueFollowups: 0, slaBreaches: 0 },
    })),
  };
  const authenticate: RequestHandler = (pending, res, next) => {
    if (pending.header("authorization") !== undefined) {
      res.locals.staffPrincipal = {
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
    "/v1/admin/reporting",
    createReportingRouter(
      new ReportingController(service as ReportingServiceContract),
      authenticate,
      appendDenied,
    ),
  );
  app.use(reportingErrorMiddleware);
  app.use(createErrorHandler());
  return { app, appendDenied, service };
}
