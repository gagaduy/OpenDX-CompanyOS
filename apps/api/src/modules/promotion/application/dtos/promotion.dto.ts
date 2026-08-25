// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Promotion, PromotionStatus } from "../../domain/entities/promotion";
import type { StaffRole } from "../../../../shared/auth/staff-principal";

export interface PromotionDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: "percentage" | "fixed_amount";
  readonly percentageBps?: number;
  readonly fixedAmountVnd?: number;
  readonly maximumDiscountVnd?: number;
  readonly minimumSubtotalVnd: number;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly totalUsageLimit?: number;
  readonly perCustomerLimit?: number;
  readonly status: PromotionStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type PromotionRequestBase = Omit<Promotion, "id" | "createdAt" | "updatedAt" | "version" | "type" | "percentageBps" | "fixedAmountVnd">;
export type CreatePromotionRequest = PromotionRequestBase & (
  | { readonly type: "percentage"; readonly percentageBps: number }
  | { readonly type: "fixed_amount"; readonly fixedAmountVnd: number }
);
export type UpdatePromotionRequest = CreatePromotionRequest & { readonly version: number };

export interface PromotionCommandContext {
  readonly actorId: string;
  readonly roles: readonly StaffRole[];
  readonly correlationId: string;
}
