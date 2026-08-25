// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticAnalyticsReader } from "../../../../reporting";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import { describe, expect, it, vi } from "vitest";
import { InventoryHealthReaderService } from "./inventory-health-reader";

const NOW = "2026-08-16T05:00:00.000Z";
const window = {
  start: "2026-08-13T05:00:00.000Z",
  end: NOW,
  timezone: "Asia/Ho_Chi_Minh" as const,
};
const ids = Array.from({ length: 5 }, (_, index) =>
  `10000000-0000-4000-8000-00000000000${index + 1}`);

describe("InventoryHealthReaderService", () => {
  it("calculates stock risk with floor velocity and exact threshold boundaries", async () => {
    const { service } = fixture({
      stocks: [
        stock(ids[0]!, 0, 0),
        stock(ids[1]!, 6, 1),
        stock(ids[2]!, 20, 0),
        stock(ids[3]!, 28, 0),
        stock(ids[4]!, 9, 0),
      ],
      sales: [
        sale(ids[0]!, 1, 100),
        sale(ids[1]!, 1, 200),
        sale(ids[2]!, 0, 300),
        sale(ids[3]!, 6, 400),
        sale(ids[4]!, 2, 500),
      ],
    });

    await expect(service.stockRisk({ ...window, lowStockThreshold: 5 }))
      .resolves.toEqual({
        summary: {
          trackedVariants: 5,
          lowStockCount: 1,
          soldOutCount: 1,
          unitsOnHand: 63,
          unitsReserved: 1,
          unitsAvailable: 62,
        },
        evidence: [
          { variantId: ids[0], onHand: 0, reserved: 0, available: 0, quantitySold: 1, dailyVelocityMilliunits: 333, daysCover: 0, riskCode: "SOLD_OUT" },
          { variantId: ids[4], onHand: 9, reserved: 0, available: 9, quantitySold: 2, dailyVelocityMilliunits: 666, daysCover: 13, riskCode: "BELOW_14_DAY_COVER" },
          { variantId: ids[1], onHand: 6, reserved: 1, available: 5, quantitySold: 1, dailyVelocityMilliunits: 333, daysCover: 15, riskCode: "LOW_STOCK" },
          { variantId: ids[2], onHand: 20, reserved: 0, available: 20, quantitySold: 0, dailyVelocityMilliunits: 0, daysCover: null, riskCode: "NO_SALES_VELOCITY" },
        ],
      });
  });

  it("returns only priced zero-velocity slow stock and safe aggregate values", async () => {
    const { service } = fixture({
      stocks: [stock(ids[0]!, 5, 0), stock(ids[1]!, 2, 1), stock(ids[2]!, 20, 0)],
      sales: [sale(ids[0]!, 1, 100), sale(ids[1]!, 0, 300), sale(ids[2]!, 0, 125)],
    });

    const result = await service.slowStock({ ...window, minimumOnHand: 2 });
    expect(result).toEqual({
      summary: { candidateCount: 1, candidateUnits: 20, candidateValueVnd: 2_500 },
      evidence: [{
        variantId: ids[2],
        available: 20,
        quantitySold: 0,
        currentUnitPriceVnd: 125,
        stockValueVnd: 2_500,
        reasonCode: "NO_SALES_VELOCITY",
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(/CANARY|reference|customer|order/i);
  });

  it("paginates reservation anomalies without exposing their reference IDs", async () => {
    const repository = {
      readCurrentStock: vi.fn(),
      readReservationAnomalies: vi.fn(async () => ({
        summary: {
          expiredActiveCount: 1,
          finalizedWithoutTimestampCount: 1,
          stalePendingCount: 1,
          affectedUnits: 6,
        },
        evidence: [
          anomaly(1, "EXPIRED_ACTIVE", "2026-08-14T05:00:00.000Z"),
          anomaly(2, "FINALIZED_TIMESTAMP_MISSING", "2026-08-15T05:00:00.000Z"),
          anomaly(3, "STALE_PENDING", "2026-08-15T06:00:00.000Z"),
        ],
      })),
    };
    const { service } = fixture({ repository });

    const first = await service.reservationAnomalies({ ...window, limit: 2 });
    const repeated = await service.reservationAnomalies({ ...window, limit: 2 });
    expect(first.summary).toEqual({
      expiredActiveCount: 1,
      finalizedWithoutTimestampCount: 1,
      stalePendingCount: 1,
      affectedUnits: 6,
    });
    expect(first.evidence).toHaveLength(2);
    expect(first.nextCursor).toBe(repeated.nextCursor);
    expect(repository.readReservationAnomalies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 3 }),
    );
    expect(JSON.stringify(first)).not.toContain("CANARY_REFERENCE_ID");
  });

  it("rejects zero-length windows before querying dependencies", async () => {
    const { service, analytics, repository } = fixture();
    await expect(service.stockRisk({
      ...window,
      start: window.end,
      lowStockThreshold: 5,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(analytics.getVariantSales).not.toHaveBeenCalled();
    expect(repository.readCurrentStock).not.toHaveBeenCalled();
  });

  it("rejects windows beyond the one-minute server tolerance", async () => {
    const { service, repository } = fixture();
    await expect(service.reservationAnomalies({
      ...window, end: "2026-08-16T05:01:00.001Z",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((repository as unknown as { readReservationAnomalies: ReturnType<typeof vi.fn> })
      .readReservationAnomalies).not.toHaveBeenCalled();
  });
});

function fixture(overrides: {
  stocks?: readonly object[];
  sales?: readonly object[];
  repository?: object;
} = {}) {
  const repository = overrides.repository ?? {
    readCurrentStock: vi.fn(async () => overrides.stocks ?? []),
    readReservationAnomalies: vi.fn(),
  };
  const analytics = {
    getVariantSales: vi.fn(async () => overrides.sales ?? []),
    getCustomerSegmentSnapshot: vi.fn(),
    getCustomerActivity: vi.fn(),
  } as unknown as AgenticAnalyticsReader & { getVariantSales: ReturnType<typeof vi.fn> };
  const transactions: TransactionRunner = {
    run: vi.fn(),
    runReadOnly: async work => work({ query: vi.fn() }),
  };
  return {
    repository: repository as { readCurrentStock: ReturnType<typeof vi.fn> },
    analytics,
    service: new InventoryHealthReaderService(
      repository as never,
      analytics,
      transactions,
      () => NOW,
    ),
  };
}

function stock(variantId: string, onHand: number, reserved: number) {
  return { variantId, onHand, reserved, available: onHand - reserved };
}

function sale(variantId: string, paidQuantity: number, currentUnitPriceVnd: number) {
  return {
    variantId,
    windowDate: "2026-08-14",
    paidQuantity,
    paidRevenueVnd: paidQuantity * currentUnitPriceVnd,
    currentUnitPriceVnd,
  };
}

function anomaly(index: number, reasonCode: string, detectedAt: string) {
  return {
    reservationId: `20000000-0000-4000-8000-00000000000${index}`,
    variantId: ids[index]!,
    quantity: index,
    status: index === 1 ? "active" : "released",
    expiresAt: "2026-08-14T05:00:00.000Z",
    detectedAt,
    reasonCode,
    referenceId: "CANARY_REFERENCE_ID",
  };
}
