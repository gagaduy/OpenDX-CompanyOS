// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import { CatalogHealthReaderService } from "./catalog-health-reader";

const session = {} as DatabaseSession;
const transactions: TransactionRunner = {
  run: (work) => work(session),
  runReadOnly: (work) => work(session),
};
const asOf = "2026-08-16T05:00:00.000Z";

describe("CatalogHealthReaderService", () => {
  it("returns the bounded product completeness snapshot", async () => {
    const repository = fixture();
    const reader = new CatalogHealthReaderService(repository, transactions, () => asOf);

    await expect(reader.productCompleteness(asOf)).resolves.toEqual({
      totalProducts: 6,
      draftProducts: 4,
      publishedProducts: 2,
      missingBrand: 1,
      emptyAttributes: 1,
      withoutActiveVariant: 1,
      withoutCurrentPrice: 1,
      withoutMedia: 1,
      withoutPrimaryMedia: 1,
      completenessBasisPoints: 1_667,
    });
    expect(repository.readProductCompleteness).toHaveBeenCalledWith(session, asOf);
  });

  it("orders readiness reasons and emits an opaque keyset cursor", async () => {
    const repository = fixture({
      readPublicationReadiness: vi.fn(async () => ({
        summary: {
          draftReviewed: 3,
          readyCount: 1,
          blockedCount: 2,
          reasonCounts: [
            { reasonCode: "NO_MEDIA" as const, count: 1 },
            { reasonCode: "MISSING_BRAND" as const, count: 2 },
          ],
        },
        evidence: [
          { productId: "11111111-1111-4111-8111-111111111111", updatedAt: "2026-08-15T01:00:00.000Z", reasonCodes: ["NO_MEDIA" as const, "MISSING_BRAND" as const] },
          { productId: "22222222-2222-4222-8222-222222222222", updatedAt: "2026-08-15T02:00:00.000Z", reasonCodes: ["PRIMARY_MEDIA_INVALID" as const] },
          { productId: "33333333-3333-4333-8333-333333333333", updatedAt: "2026-08-15T03:00:00.000Z", reasonCodes: ["EMPTY_ATTRIBUTES" as const] },
        ],
      })),
    });
    const reader = new CatalogHealthReaderService(repository, transactions, () => asOf);
    const result = await reader.publicationReadiness({
      start: "2026-08-01T00:00:00.000Z",
      end: asOf,
      timezone: "Asia/Ho_Chi_Minh",
      limit: 2,
    });

    expect(result.summary.reasonCounts.map(({ reasonCode }) => reasonCode))
      .toEqual(["MISSING_BRAND", "NO_MEDIA"]);
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[0]?.reasonCodes).toEqual(["MISSING_BRAND", "NO_MEDIA"]);
    expect(result.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns only aggregate merchandising facts", async () => {
    const repository = fixture();
    const reader = new CatalogHealthReaderService(repository, transactions, () => asOf);

    await expect(reader.merchandisingSummary(asOf)).resolves.toMatchObject({
      activeCategories: 3,
      publishedProducts: 2,
      minimumPriceVnd: 100_000,
      maximumPriceVnd: 500_000,
      categoryDistribution: [{ categoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", productCount: 2 }],
    });
  });

  it("rejects windows beyond the one-minute server tolerance", async () => {
    const repository = fixture();
    const reader = new CatalogHealthReaderService(repository, transactions, () => asOf);
    await expect(reader.publicationReadiness({
      start: "2026-08-15T05:00:00.000Z",
      end: "2026-08-16T05:01:00.001Z",
      timezone: "Asia/Ho_Chi_Minh",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.readPublicationReadiness).not.toHaveBeenCalled();
  });
});

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    readProductCompleteness: vi.fn(async () => ({
      totalProducts: 6, draftProducts: 4, publishedProducts: 2,
      missingBrand: 1, emptyAttributes: 1, withoutActiveVariant: 1,
      withoutCurrentPrice: 1, withoutMedia: 1, withoutPrimaryMedia: 1,
      completenessBasisPoints: 1_667,
    })),
    readPublicationReadiness: vi.fn(async () => ({
      summary: { draftReviewed: 0, readyCount: 0, blockedCount: 0, reasonCounts: [] },
      evidence: [],
    })),
    readMerchandisingSummary: vi.fn(async () => ({
      activeCategories: 3, publishedProducts: 2, activeVariants: 4,
      currentlyPricedVariants: 3, mediaCoverageBasisPoints: 10_000,
      minimumPriceVnd: 100_000, maximumPriceVnd: 500_000,
      categoryDistribution: [{ categoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", productCount: 2 }],
      otherCategoryProductCount: 0,
    })),
    ...overrides,
  };
}
