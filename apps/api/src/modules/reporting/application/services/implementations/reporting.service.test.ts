// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { ReportingRepository } from "../../repositories/interfaces/reporting.repository";
import { ReportingApplicationError } from "../reporting-application.error";
import { ReportingService } from "./reporting.service";

const now = "2026-08-10T05:00:00.000Z"; // 2026-08-10 12:00 Asia/Ho_Chi_Minh

describe("ReportingService", () => {
  it("defaults to the previous 30 local calendar days in Vietnam", async () => {
    const { repository, service } = fixture();

    const result = await service.getCommerce({});

    expect(repository.getCommerce).toHaveBeenCalledWith({
      start: "2026-07-11T17:00:00.000Z",
      end: "2026-08-10T17:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
    });
    expect(result.range).toEqual({
      start: "2026-07-12",
      end: "2026-08-11",
      timezone: "Asia/Ho_Chi_Minh",
    });
  });

  it("uses half-open Vietnam calendar boundaries and rejects oversized ranges", async () => {
    const { repository, service } = fixture();

    await service.getProducts({ start: "2026-08-01", end: "2026-08-02" });

    expect(repository.getProducts).toHaveBeenCalledWith({
      start: "2026-07-31T17:00:00.000Z",
      end: "2026-08-01T17:00:00.000Z",
      timezone: "Asia/Ho_Chi_Minh",
    });
    await expect(service.getProducts({ start: "2026-08-02", end: "2026-08-02" }))
      .rejects.toBeInstanceOf(ReportingApplicationError);
    await expect(service.getProducts({ start: "2025-08-01", end: "2026-08-03" }))
      .rejects.toMatchObject({ code: "INVALID_RANGE" });
  });

  it("returns empty metric DTOs with zero VND and no floating-point AOV", async () => {
    const { service } = fixture({
      commerce: {
        grossPaidRevenueVnd: 0,
        paidOrderCount: 0,
        createdOrderCount: 0,
        paidCreatedOrderCount: 0,
        paymentStatuses: [],
      },
    });

    await expect(service.getCommerce({ start: "2026-08-01", end: "2026-08-02" }))
      .resolves.toMatchObject({
        data: {
          grossPaidRevenueVnd: 0,
          paidOrderCount: 0,
          averageOrderValueVnd: 0,
          conversionRateBasisPoints: 0,
          paymentStatuses: [],
        },
      });
  });

  it("rounds average order value half-up using integer arithmetic", async () => {
    const { service } = fixture({
      commerce: {
        grossPaidRevenueVnd: 101,
        paidOrderCount: 2,
        createdOrderCount: 3,
        paidCreatedOrderCount: 2,
        paymentStatuses: [{ status: "paid", count: 2 }],
      },
    });

    const result = await service.getCommerce({ start: "2026-08-01", end: "2026-08-02" });

    expect(result.data.averageOrderValueVnd).toBe(51);
    expect(result.data.conversionRateBasisPoints).toBe(6667);
  });

  it("rejects unsafe integer aggregates before mapping public DTOs", async () => {
    const { service } = fixture({
      customers: {
        totalRegisteredCustomers: Number.MAX_SAFE_INTEGER + 1,
        repeatCustomers: 0,
        lifetimeValueVnd: 0,
        lifetimeValueBuckets: [],
      },
    });

    await expect(service.getCustomers({ start: "2026-08-01", end: "2026-08-02" }))
      .rejects.toMatchObject({ code: "UNSAFE_REPORTING_VALUE" });
  });
});

function fixture(overrides: Partial<RepositoryResponses> = {}) {
  const responses: RepositoryResponses = {
    commerce: {
      grossPaidRevenueVnd: 0,
      paidOrderCount: 0,
      createdOrderCount: 0,
      paidCreatedOrderCount: 0,
      paymentStatuses: [],
    },
    products: { items: [], inventory: { onHand: 0, reserved: 0, available: 0, soldOutCount: 0 } },
    customers: {
      totalRegisteredCustomers: 0,
      repeatCustomers: 0,
      lifetimeValueVnd: 0,
      lifetimeValueBuckets: [],
    },
    operations: {
      openTickets: 0,
      overdueFollowups: 0,
      slaBreaches: 0,
    },
    ...overrides,
  };
  const repository: ReportingRepository = {
    getCommerce: vi.fn(async () => responses.commerce),
    getProducts: vi.fn(async () => responses.products),
    getCustomers: vi.fn(async () => responses.customers),
    getOperations: vi.fn(async () => responses.operations),
  };
  return {
    repository,
    service: new ReportingService(repository, () => now),
  };
}

interface RepositoryResponses {
  readonly commerce: Awaited<ReturnType<ReportingRepository["getCommerce"]>>;
  readonly products: Awaited<ReturnType<ReportingRepository["getProducts"]>>;
  readonly customers: Awaited<ReturnType<ReportingRepository["getCustomers"]>>;
  readonly operations: Awaited<ReturnType<ReportingRepository["getOperations"]>>;
}
