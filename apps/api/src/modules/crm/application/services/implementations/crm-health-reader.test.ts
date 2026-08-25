// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import { CrmHealthReaderService } from "./crm-health-reader";

const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: "2026-08-16T05:01:00.000Z",
  timezone: "Asia/Ho_Chi_Minh" as const,
};

describe("CrmHealthReaderService", () => {
  it("composes deterministic lifetime, recency, and segment aggregates", async () => {
    const { service } = fixture();
    await expect(service.segmentSummary(window)).resolves.toEqual({
      registeredCustomers: 5,
      newCustomers: 4,
      repeatCustomers: 5,
      customersByLifetimeValueBucket: [
        { bucket: "zero", count: 4 },
        { bucket: "low", count: 3 },
        { bucket: "mid", count: 2 },
        { bucket: "high", count: 1 },
      ],
      customersByRecencyBucket: [
        { bucket: "0_30_days", count: 1 },
        { bucket: "31_90_days", count: 3 },
        { bucket: "over_90_days", count: 2 },
        { bucket: "never", count: 4 },
      ],
      paidRevenueVnd: 3_000,
    });
  });

  it("returns only aggregate follow-up opportunities in closed reason order", async () => {
    const { service } = fixture();
    const result = await service.followupOpportunities(window);
    expect(result).toEqual({
      openFollowups: 3,
      overdueFollowups: 1,
      unassignedFollowups: 2,
      customersWithoutOpenFollowupBySegment: [
        { segment: "new", count: 4 },
        { segment: "repeat", count: 2 },
        { segment: "inactive", count: 2 },
      ],
      reasonCounts: [
        { reasonCode: "OVERDUE_FOLLOWUP", count: 1 },
        { reasonCode: "UNASSIGNED_FOLLOWUP", count: 2 },
        { reasonCode: "SEGMENT_WITHOUT_OPEN_FOLLOWUP", count: 8 },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /CANARY_CUSTOMER|CANARY_NOTE|CANARY_FOLLOWUP|CANARY_ASSIGNEE|description|customerId/i,
    );
  });

  it("rejects invalid windows before reading analytics or CRM rows", async () => {
    const { service, analytics, repository } = fixture();
    await expect(service.segmentSummary({ ...window, end: window.start }))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(analytics.getCustomerSegmentSnapshot).not.toHaveBeenCalled();
    expect(repository.readFollowupSummary).not.toHaveBeenCalled();
  });
});

function fixture() {
  const analytics = {
    getVariantSales: vi.fn(),
    getCustomerSegmentSnapshot: vi.fn(async () => [
      snapshot("high_value", "high", "0_30_days", 1, 1, 2, 1, 50_000_000),
      snapshot("inactive", "mid", "over_90_days", 2, 1, 0, 0, 10_000_000),
      snapshot("repeat", "low", "31_90_days", 3, 3, 1, 1, 12_000_000),
      snapshot("new", "zero", "never", 4, 0, 0, 0, 0),
    ]),
    getCustomerActivity: vi.fn(async () => [
      { activityDate: "2026-08-01", newCustomerCount: 2, paidCustomerCount: 1, paidRevenueVnd: 1_000 },
      { activityDate: "2026-08-02", newCustomerCount: 3, paidCustomerCount: 1, paidRevenueVnd: 2_000 },
    ]),
  };
  const repository = {
    readFollowupSummary: vi.fn(async () => ({
      openFollowups: 3,
      overdueFollowups: 1,
      unassignedFollowups: 2,
      noteBody: "CANARY_NOTE",
      description: "CANARY_FOLLOWUP",
      assigneeId: "CANARY_ASSIGNEE",
      customerId: "CANARY_CUSTOMER",
    })),
  };
  const transactions: TransactionRunner = {
    run: vi.fn(),
    runReadOnly: async work => work({ query: vi.fn() }),
  };
  return {
    analytics,
    repository,
    service: new CrmHealthReaderService(
      repository as never,
      analytics as never,
      transactions,
      () => NOW,
    ),
  };
}

function snapshot(
  segmentKey: "new" | "repeat" | "high_value" | "inactive",
  lifetimeValueBucket: "zero" | "low" | "mid" | "high",
  recencyBucket: "never" | "0_30_days" | "31_90_days" | "over_90_days",
  customerCount: number,
  repeatCustomerCount: number,
  openFollowupCount: number,
  customersWithOpenFollowupCount: number,
  lifetimePaidRevenueVnd: number,
) {
  return {
    segmentKey,
    lifetimeValueBucket,
    recencyBucket,
    customerCount,
    repeatCustomerCount,
    openFollowupCount,
    customersWithOpenFollowupCount,
    lifetimePaidRevenueVnd,
    asOfDate: "2026-08-16",
  };
}
