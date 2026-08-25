// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type PromotionRedemptionState = "held" | "committed" | "released";

export interface PromotionRedemption {
  readonly id: string;
  readonly promotionId: string;
  readonly customerId: string;
  readonly checkoutId: string;
  readonly orderId?: string;
  readonly discountVnd: number;
  readonly state: PromotionRedemptionState;
  readonly idempotencyKey: string;
  readonly expiresAt: string;
  readonly committedAt?: string;
  readonly releasedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
