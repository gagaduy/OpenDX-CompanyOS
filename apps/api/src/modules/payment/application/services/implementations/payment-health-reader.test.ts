// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import { describe, expect, it, vi } from "vitest";
import { PaymentHealthReaderService } from "./payment-health-reader";

const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-01T00:00:00.000Z",
  end: NOW,
  timezone: "Asia/Ho_Chi_Minh" as const,
};

describe("PaymentHealthReaderService", () => {
  it("returns exact pending age buckets in stable order", async () => {
    const { service, repository } = fixture();
    repository.readPendingPayments.mockResolvedValue({
      pendingCount: 4,
      pendingExpectedAmountVnd: 10_000,
      oldestCreatedAt: "2026-08-15T05:00:00.000Z",
      countsByStatus: [
        { status: "pending_provider", count: 3 },
        { status: "created", count: 1 },
      ],
      ageBuckets: [
        { bucket: "over_24_hours", count: 1, amountVnd: 4_000 },
        { bucket: "1_to_24_hours", count: 1, amountVnd: 3_000 },
        { bucket: "15_to_60_minutes", count: 1, amountVnd: 2_000 },
        { bucket: "under_15_minutes", count: 1, amountVnd: 1_000 },
      ],
    });

    const result = await service.pendingPayments(window);
    expect(result.countsByStatus).toEqual([
      { status: "created", count: 1 },
      { status: "pending_provider", count: 3 },
    ]);
    expect(result.ageBuckets.map(({ bucket }) => bucket)).toEqual([
      "under_15_minutes",
      "15_to_60_minutes",
      "1_to_24_hours",
      "over_24_hours",
    ]);
  });

  it("maps closed provider status classes and absolute known amount differences", async () => {
    const { service, repository } = fixture();
    repository.readReconciliationDiscrepancies.mockResolvedValue({
      summary: {
        reconciliationCount: 6,
        mismatchCount: 4,
        providerErrorCount: 1,
        unsupportedCount: 1,
        amountDifferenceVnd: 30,
      },
      evidence: [
        discrepancy(1, "mismatch", "CAPTURED", 100, 70),
        discrepancy(2, "mismatch", "PENDING", 100, 100),
        discrepancy(3, "mismatch", "DECLINED", 100, 100),
        discrepancy(4, "unsupported", "UNRECOGNIZED", 100, 100),
        discrepancy(5, "provider_error", "timeout", 100, null),
        discrepancy(6, "mismatch", "SOMETHING_NEW", 100, 100),
      ],
    });

    const result = await service.reconciliationDiscrepancies(window);
    expect(result.evidence.map(({ providerStatusClass }) => providerStatusClass)).toEqual([
      "paid", "pending", "failed", "unsupported", "provider_error", "unknown",
    ]);
    expect(result.evidence[0]?.differenceVnd).toBe(30);
    expect(result.evidence[4]).toMatchObject({ providerAmountVnd: null, differenceVnd: 0 });
    for (const evidence of result.evidence) {
      expect(evidence).not.toHaveProperty("providerStatus");
      expect(evidence).not.toHaveProperty("redactedResponse");
      expect(evidence).not.toHaveProperty("providerOrderId");
      expect(evidence).not.toHaveProperty("invoiceNumber");
      expect(evidence).not.toHaveProperty("orderId");
    }
    expect(JSON.stringify(result)).not.toMatch(
      /CAPTURED|PENDING|DECLINED|UNRECOGNIZED|SOMETHING_NEW|CANARY_RESPONSE|CANARY_PROVIDER_ORDER|CANARY_INVOICE|CANARY_ORDER/,
    );
  });

  it("calculates provider evidence coverage with a safe zero denominator", async () => {
    const { service, repository } = fixture();
    repository.readProviderEvidenceStatus.mockResolvedValue({
      authenticatedEvents: 0,
      rejectedEvents: 0,
      appliedEvents: 0,
      reviewRequiredEvents: 0,
      matchedPayments: 0,
      totalPayments: 0,
      countsByNormalizedState: [],
      payloadHash: "CANARY_HASH",
      providerEventId: "CANARY_EVENT",
    });

    const result = await service.providerEvidenceStatus(window);
    expect(result).toEqual({
      authenticatedEvents: 0,
      rejectedEvents: 0,
      appliedEvents: 0,
      reviewRequiredEvents: 0,
      unmatchedPayments: 0,
      coverageBasisPoints: 10_000,
      countsByNormalizedState: [],
    });
    expect(result).not.toHaveProperty("payloadHash");
    expect(result).not.toHaveProperty("providerEventId");
    expect(JSON.stringify(result)).not.toMatch(/CANARY_HASH|CANARY_EVENT/);
  });

  it("rejects invalid windows before querying Payment state", async () => {
    const { service, repository } = fixture();
    await expect(service.pendingPayments({ ...window, start: window.end }))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.readPendingPayments).not.toHaveBeenCalled();
  });

  it("rejects windows beyond the one-minute server tolerance", async () => {
    const { service, repository } = fixture();
    await expect(service.providerEvidenceStatus({
      ...window, end: "2026-08-16T05:01:00.001Z",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.readProviderEvidenceStatus).not.toHaveBeenCalled();
  });
});

function fixture() {
  const repository = {
    readPendingPayments: vi.fn(),
    readReconciliationDiscrepancies: vi.fn(),
    readProviderEvidenceStatus: vi.fn(),
  };
  const transactions: TransactionRunner = {
    run: vi.fn(),
    runReadOnly: async work => work({ query: vi.fn() }),
  };
  return {
    repository,
    service: new PaymentHealthReaderService(
      repository as never,
      transactions,
      () => NOW,
    ),
  };
}

function discrepancy(
  index: number,
  comparisonResult: "mismatch" | "provider_error" | "unsupported",
  providerStatus: string,
  internalAmountVnd: number,
  providerAmountVnd: number | null,
) {
  return {
    reconciliationId: `10000000-0000-4000-8000-00000000000${index}`,
    paymentId: `20000000-0000-4000-8000-00000000000${index}`,
    comparisonResult,
    internalStatus: "pending_provider",
    providerStatus,
    internalAmountVnd,
    providerAmountVnd,
    createdAt: `2026-08-15T0${index}:00:00.000Z`,
    redactedResponse: "CANARY_RESPONSE",
    providerOrderId: "CANARY_PROVIDER_ORDER",
    invoiceNumber: "CANARY_INVOICE",
    orderId: "CANARY_ORDER",
  };
}
