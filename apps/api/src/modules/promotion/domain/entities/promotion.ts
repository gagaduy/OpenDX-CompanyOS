// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type PromotionStatus = "draft" | "active" | "inactive";

interface PromotionBase {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly minimumSubtotalVnd: number;
  readonly maximumDiscountVnd?: number;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly totalUsageLimit?: number;
  readonly perCustomerLimit?: number;
  readonly status: PromotionStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type Promotion = PromotionBase & (
  | { readonly type: "percentage"; readonly percentageBps: number }
  | { readonly type: "fixed_amount"; readonly fixedAmountVnd: number }
);
