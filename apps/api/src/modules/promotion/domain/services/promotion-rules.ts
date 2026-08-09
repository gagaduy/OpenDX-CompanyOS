// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Promotion } from "../entities/promotion";
import type { PromotionRedemption } from "../entities/promotion-redemption";
import { PromotionDomainError } from "../exceptions/promotion-domain.error";

const MAX_SAFE_VND = Number.MAX_SAFE_INTEGER;

export interface PromotionEvaluationInput {
  readonly subtotalVnd: number;
  readonly now: string;
  readonly totalUsageCount: number;
  readonly customerUsageCount: number;
}

export interface PromotionEvaluation {
  readonly discountVnd: number;
  readonly totalVnd: number;
}

export function normalizePromotionCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (code.length === 0 || code.length > 64) {
    throw new PromotionDomainError("INVALID_PROMOTION", "Promotion code is invalid");
  }
  return code;
}

export function evaluatePromotion(
  promotion: Promotion,
  input: PromotionEvaluationInput,
): PromotionEvaluation {
  assertPromotion(promotion);
  assertSafeVnd(input.subtotalVnd, "Subtotal");
  assertCount(input.totalUsageCount);
  assertCount(input.customerUsageCount);
  const timestamp = Date.parse(input.now);
  if (!Number.isFinite(timestamp)) {
    throw new PromotionDomainError("INVALID_PROMOTION", "Evaluation time is invalid");
  }
  if (promotion.status !== "active") {
    throw new PromotionDomainError("PROMOTION_NOT_ACTIVE", "Promotion is not active");
  }
  if (promotion.startsAt !== undefined && timestamp < Date.parse(promotion.startsAt)) {
    throw new PromotionDomainError("PROMOTION_NOT_STARTED", "Promotion has not started");
  }
  if (promotion.endsAt !== undefined && timestamp >= Date.parse(promotion.endsAt)) {
    throw new PromotionDomainError("PROMOTION_EXPIRED", "Promotion has expired");
  }
  if (input.subtotalVnd < promotion.minimumSubtotalVnd) {
    throw new PromotionDomainError("MINIMUM_SUBTOTAL_NOT_MET", "Minimum subtotal is not met");
  }
  if (promotion.totalUsageLimit !== undefined && input.totalUsageCount >= promotion.totalUsageLimit) {
    throw new PromotionDomainError("PROMOTION_USAGE_LIMIT_REACHED", "Promotion usage limit is reached");
  }
  if (promotion.perCustomerLimit !== undefined && input.customerUsageCount >= promotion.perCustomerLimit) {
    throw new PromotionDomainError("PROMOTION_CUSTOMER_LIMIT_REACHED", "Customer promotion limit is reached");
  }

  const calculated = promotion.type === "percentage"
    ? Number(
        (BigInt(input.subtotalVnd) * BigInt(promotion.percentageBps)) /
          10_000n,
      )
    : promotion.fixedAmountVnd;
  const capped = promotion.maximumDiscountVnd === undefined
    ? calculated
    : Math.min(calculated, promotion.maximumDiscountVnd);
  const discountVnd = Math.min(capped, input.subtotalVnd);
  const totalVnd = input.subtotalVnd - discountVnd;
  if (totalVnd <= 0) {
    throw new PromotionDomainError("ZERO_TOTAL_NOT_SUPPORTED", "Promotion cannot create a zero-total order");
  }
  return { discountVnd, totalVnd };
}

export function validatePromotion(promotion: Promotion): void {
  assertPromotion(promotion);
}

export function commitRedemption(redemption: PromotionRedemption, timestamp: string): PromotionRedemption {
  if (redemption.state === "committed") return redemption;
  if (redemption.state !== "held") {
    throw new PromotionDomainError("INVALID_REDEMPTION_TRANSITION", "Only held redemptions can be committed");
  }
  return { ...redemption, state: "committed", committedAt: timestamp, updatedAt: timestamp };
}

export function releaseRedemption(redemption: PromotionRedemption, timestamp: string): PromotionRedemption {
  if (redemption.state === "released") return redemption;
  if (redemption.state !== "held") {
    throw new PromotionDomainError("INVALID_REDEMPTION_TRANSITION", "Only held redemptions can be released");
  }
  return { ...redemption, state: "released", releasedAt: timestamp, updatedAt: timestamp };
}

function assertPromotion(promotion: Promotion): void {
  if (normalizePromotionCode(promotion.code) !== promotion.code || promotion.version <= 0) {
    throw new PromotionDomainError("INVALID_PROMOTION", "Promotion identity or version is invalid");
  }
  assertSafeVnd(promotion.minimumSubtotalVnd, "Minimum subtotal");
  if (promotion.maximumDiscountVnd !== undefined) assertPositiveVnd(promotion.maximumDiscountVnd, "Maximum discount");
  if (promotion.type === "percentage") {
    if (!Number.isInteger(promotion.percentageBps) || promotion.percentageBps < 1 || promotion.percentageBps > 10_000) {
      throw new PromotionDomainError("INVALID_PROMOTION", "Percentage basis points are invalid");
    }
  } else {
    assertPositiveVnd(promotion.fixedAmountVnd, "Fixed discount");
  }
  if (promotion.startsAt !== undefined && !Number.isFinite(Date.parse(promotion.startsAt))) {
    throw new PromotionDomainError("INVALID_PROMOTION", "Promotion start is invalid");
  }
  if (promotion.endsAt !== undefined && !Number.isFinite(Date.parse(promotion.endsAt))) {
    throw new PromotionDomainError("INVALID_PROMOTION", "Promotion end is invalid");
  }
  if (promotion.startsAt !== undefined && promotion.endsAt !== undefined && Date.parse(promotion.startsAt) >= Date.parse(promotion.endsAt)) {
    throw new PromotionDomainError("INVALID_PROMOTION", "Promotion window is invalid");
  }
  if (promotion.totalUsageLimit !== undefined) assertPositiveCount(promotion.totalUsageLimit);
  if (promotion.perCustomerLimit !== undefined) assertPositiveCount(promotion.perCustomerLimit);
}

function assertSafeVnd(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_VND) {
    throw new PromotionDomainError("INVALID_PROMOTION", `${label} is invalid`);
  }
}

function assertPositiveVnd(value: number, label: string): void {
  assertSafeVnd(value, label);
  if (value === 0) throw new PromotionDomainError("INVALID_PROMOTION", `${label} must be positive`);
}

function assertCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PromotionDomainError("INVALID_PROMOTION", "Usage count is invalid");
  }
}

function assertPositiveCount(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PromotionDomainError("INVALID_PROMOTION", "Usage limit is invalid");
  }
}
