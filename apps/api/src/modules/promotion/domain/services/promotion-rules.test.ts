// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Promotion } from "../entities/promotion";
import type { PromotionRedemption } from "../entities/promotion-redemption";
import { PromotionDomainError } from "../exceptions/promotion-domain.error";
import {
  commitRedemption,
  evaluatePromotion,
  normalizePromotionCode,
  releaseRedemption,
} from "./promotion-rules";

const now = "2026-08-06T08:00:00.000Z";
const base: Promotion = {
  id: "promotion-1",
  code: "NOVA10",
  name: "Nova 10%",
  type: "percentage",
  percentageBps: 1000,
  minimumSubtotalVnd: 100_000,
  maximumDiscountVnd: 150_000,
  startsAt: "2026-08-01T00:00:00.000Z",
  endsAt: "2026-09-01T00:00:00.000Z",
  totalUsageLimit: 100,
  perCustomerLimit: 1,
  status: "active",
  version: 1,
  createdAt: now,
  updatedAt: now,
};

describe("promotion rules", () => {
  it("normalizes promotion codes", () => {
    expect(normalizePromotionCode("  nova10 ")).toBe("NOVA10");
    expect(() => normalizePromotionCode(" ")).toThrowError(PromotionDomainError);
  });

  it("rounds percentage discounts down and applies the cap", () => {
    expect(evaluatePromotion(base, { subtotalVnd: 1_000_009, now, totalUsageCount: 0, customerUsageCount: 0 })).toEqual({ discountVnd: 100_000, totalVnd: 900_009 });
    expect(evaluatePromotion(base, { subtotalVnd: 2_000_000, now, totalUsageCount: 0, customerUsageCount: 0 })).toEqual({ discountVnd: 150_000, totalVnd: 1_850_000 });
  });

  it("keeps percentage arithmetic exact near the safe-integer boundary", () => {
    const subtotalVnd = Number.MAX_SAFE_INTEGER;
    const promotion: Promotion = {
      ...base,
      percentageBps: 9_999,
      maximumDiscountVnd: undefined,
      minimumSubtotalVnd: 1,
    };
    const expected = Number((BigInt(subtotalVnd) * 9_999n) / 10_000n);
    expect(
      evaluatePromotion(promotion, {
        subtotalVnd,
        now,
        totalUsageCount: 0,
        customerUsageCount: 0,
      }),
    ).toEqual({ discountVnd: expected, totalVnd: subtotalVnd - expected });
  });

  it("clamps a fixed discount to subtotal but rejects a zero-total order", () => {
    const fixed: Promotion = { ...base, type: "fixed_amount", fixedAmountVnd: 99_999, minimumSubtotalVnd: 1 };
    expect(evaluatePromotion(fixed, { subtotalVnd: 100_000, now, totalUsageCount: 0, customerUsageCount: 0 })).toEqual({ discountVnd: 99_999, totalVnd: 1 });
    expect(() => evaluatePromotion({ ...fixed, fixedAmountVnd: 100_000 }, { subtotalVnd: 100_000, now, totalUsageCount: 0, customerUsageCount: 0 })).toThrowError(expect.objectContaining({ code: "ZERO_TOTAL_NOT_SUPPORTED" }));
  });

  it.each([
    ["PROMOTION_NOT_ACTIVE", { status: "inactive" as const }, {}],
    ["PROMOTION_NOT_STARTED", { startsAt: "2026-08-07T00:00:00.000Z" }, {}],
    ["PROMOTION_EXPIRED", { endsAt: now }, {}],
    ["MINIMUM_SUBTOTAL_NOT_MET", {}, { subtotalVnd: 99_999 }],
    ["PROMOTION_USAGE_LIMIT_REACHED", {}, { totalUsageCount: 100 }],
    ["PROMOTION_CUSTOMER_LIMIT_REACHED", {}, { customerUsageCount: 1 }],
  ])("rejects %s", (code, promotionOverride, inputOverride) => {
    expect(() => evaluatePromotion(
      { ...base, ...promotionOverride } as Promotion,
      { subtotalVnd: 100_000, now, totalUsageCount: 0, customerUsageCount: 0, ...inputOverride },
    )).toThrowError(expect.objectContaining({ code }));
  });

  it("commits and releases held redemptions idempotently", () => {
    const redemption: PromotionRedemption = {
      id: "redemption-1",
      promotionId: base.id,
      customerId: "customer-1",
      checkoutId: "checkout-1",
      discountVnd: 10_000,
      state: "held",
      idempotencyKey: "key-1",
      expiresAt: "2026-08-06T08:15:00.000Z",
      createdAt: now,
      updatedAt: now,
    };
    const committed = commitRedemption(redemption, "2026-08-06T08:05:00.000Z");
    expect(committed.state).toBe("committed");
    expect(commitRedemption(committed, "2026-08-06T08:06:00.000Z")).toBe(committed);
    expect(releaseRedemption(redemption, "2026-08-06T08:05:00.000Z").state).toBe("released");
    expect(() => releaseRedemption(committed, now)).toThrowError(expect.objectContaining({ code: "INVALID_REDEMPTION_TRANSITION" }));
  });
});
