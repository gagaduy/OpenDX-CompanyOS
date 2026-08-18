// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import { describe, expect, it, vi } from "vitest";
import { isOrderStatusTransitionAllowed } from "../../../domain/services/order-rules";
import { OrderHealthReaderService } from "./order-health-reader";

const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: NOW,
  timezone: "Asia/Ho_Chi_Minh" as const,
};
const ids = Array.from({ length: 4 }, (_, index) =>
  `10000000-0000-4000-8000-00000000000${index + 1}`);

describe("OrderHealthReaderService", () => {
  it("maps every stalled state at the exact age boundary without PII", async () => {
    const { service, repository } = fixture();
    repository.readStalledOrders.mockResolvedValue({
      summary: {
        stalledCount: 3,
        stalledTotalVnd: 6_000,
        countsByStatus: [
          { status: "paid", count: 1 },
          { status: "processing", count: 1 },
          { status: "ready_for_fulfillment", count: 1 },
        ],
      },
      evidence: [
        stalled(ids[0]!, "paid", "2026-08-16T03:00:00.000Z", 1_000),
        stalled(ids[1]!, "processing", "2026-08-16T02:00:00.000Z", 2_000),
        stalled(ids[2]!, "ready_for_fulfillment", "2026-08-16T01:00:00.000Z", 3_000),
      ],
    });

    const result = await service.stalledSummary({ ...window, minimumAgeMinutes: 120 });
    expect(result.evidence.map(({ ageMinutes, reasonCode }) => ({ ageMinutes, reasonCode })))
      .toEqual([
        { ageMinutes: 240, reasonCode: "READY_NOT_COMPLETED" },
        { ageMinutes: 180, reasonCode: "PROCESSING_NOT_READY" },
        { ageMinutes: 120, reasonCode: "PAID_NOT_PROCESSING" },
      ]);
    expect(JSON.stringify(result)).not.toMatch(/CANARY_CUSTOMER|publicNumber|contact|address|line/i);
  });

  it("orders all invariant and domain transition reason codes deterministically", async () => {
    const { service, repository } = fixture();
    repository.readInvalidStateEvidence.mockResolvedValue({
      summary: {
        invalidCount: 1,
        reasonCounts: [
          { reasonCode: "ILLEGAL_STATUS_TRANSITION", count: 1 },
          { reasonCode: "TERMINAL_TIMESTAMP_CONFLICT", count: 1 },
          { reasonCode: "COMPLETED_TIMESTAMP_MISSING", count: 1 },
          { reasonCode: "PAID_TIMESTAMP_MISSING", count: 1 },
        ],
      },
      evidence: [{
        orderId: ids[0],
        status: "completed",
        version: 5,
        detectedAt: "2026-08-15T05:00:00.000Z",
        reasonCodes: [
          "ILLEGAL_STATUS_TRANSITION",
          "TERMINAL_TIMESTAMP_CONFLICT",
          "COMPLETED_TIMESTAMP_MISSING",
          "PAID_TIMESTAMP_MISSING",
        ],
        historyActor: "CANARY_ACTOR",
      }],
    });

    const result = await service.invalidStateEvidence(window);
    expect(result.evidence[0]?.reasonCodes).toEqual([
      "PAID_TIMESTAMP_MISSING",
      "COMPLETED_TIMESTAMP_MISSING",
      "TERMINAL_TIMESTAMP_CONFLICT",
      "ILLEGAL_STATUS_TRANSITION",
    ]);
    expect(result.summary.reasonCounts.map(({ reasonCode }) => reasonCode))
      .toEqual(result.evidence[0]?.reasonCodes);
    expect(JSON.stringify(result)).not.toContain("CANARY_ACTOR");

    expect(isOrderStatusTransitionAllowed("pending_payment", "paid")).toBe(true);
    expect(isOrderStatusTransitionAllowed("paid", "processing")).toBe(true);
    expect(isOrderStatusTransitionAllowed("processing", "completed")).toBe(false);
    expect(isOrderStatusTransitionAllowed("completed", "paid")).toBe(false);
  });

  it("calculates expiry minutes and exposes only backend-confirmed support context", async () => {
    const { service, repository } = fixture();
    repository.readExpiryRisk.mockResolvedValue({
      summary: { atRiskCount: 1, atRiskTotalVnd: 3_000, earliestExpiryAt: "2026-08-16T05:14:59.000Z" },
      evidence: [{
        orderId: ids[0],
        status: "pending_payment",
        totalVnd: 3_000,
        reservationExpiresAt: "2026-08-16T05:14:59.000Z",
      }],
    });
    repository.findSupportContext.mockResolvedValue({
      orderId: ids[1],
      status: "processing",
      createdAt: "2026-08-15T05:00:00.000Z",
      reservationExpiresAt: "2026-08-16T06:00:00.000Z",
      totalVnd: 5_000,
      paidAt: "2026-08-15T06:00:00.000Z",
      customerId: "CANARY_CUSTOMER",
      publicNumber: "CANARY_PUBLIC_NUMBER",
      contactSnapshot: "CANARY_CONTACT",
    });

    const expiry = await service.expiryRisk({ ...window, horizonMinutes: 15 });
    expect(expiry.evidence).toEqual([{
      orderId: ids[0],
      status: "pending_payment",
      totalVnd: 3_000,
      reservationExpiresAt: "2026-08-16T05:14:59.000Z",
      minutesRemaining: 14,
    }]);
    const context = await service.getAuthorizedContext(ids[1]!);
    expect(context).toEqual({
      orderId: ids[1],
      status: "processing",
      createdAt: "2026-08-15T05:00:00.000Z",
      reservationExpiresAt: "2026-08-16T06:00:00.000Z",
      totalVnd: 5_000,
      backendConfirmedPaid: true,
    });
    expect(JSON.stringify(context)).not.toMatch(/CANARY|customer|publicNumber|contact|address|line/i);
  });

  it("rejects invalid windows before reading Order state", async () => {
    const { service, repository } = fixture();
    await expect(service.stalledSummary({
      ...window,
      start: window.end,
      minimumAgeMinutes: 120,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.readStalledOrders).not.toHaveBeenCalled();
  });

  it("rejects windows beyond the one-minute server tolerance", async () => {
    const { service, repository } = fixture();
    await expect(service.invalidStateEvidence({
      ...window, end: "2026-08-16T05:01:00.001Z",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.readInvalidStateEvidence).not.toHaveBeenCalled();
  });
});

function fixture() {
  const repository = {
    readStalledOrders: vi.fn(),
    readInvalidStateEvidence: vi.fn(),
    readExpiryRisk: vi.fn(),
    findSupportContext: vi.fn(),
  };
  const transactions: TransactionRunner = {
    run: vi.fn(),
    runReadOnly: async work => work({ query: vi.fn() }),
  };
  return {
    repository,
    service: new OrderHealthReaderService(
      repository as never,
      transactions,
      () => NOW,
    ),
  };
}

function stalled(orderId: string, status: string, updatedAt: string, totalVnd: number) {
  return {
    orderId,
    status,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt,
    totalVnd,
    customerId: "CANARY_CUSTOMER",
    publicNumber: "CANARY_PUBLIC_NUMBER",
    contactSnapshot: "CANARY_CONTACT",
  };
}
