// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface HoldPromotionRequest {
  readonly code: string;
  readonly customerId: string;
  readonly checkoutId: string;
  readonly subtotalVnd: number;
  readonly idempotencyKey: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly now: string;
}

export interface HeldPromotionDto {
  readonly promotionId: string;
  readonly code: string;
  readonly version: number;
  readonly redemptionId: string;
  readonly discountVnd: number;
  readonly totalVnd: number;
}

export interface PromotionCheckoutPort {
  hold(session: DatabaseSession, request: HoldPromotionRequest): Promise<HeldPromotionDto>;
  commit(session: DatabaseSession, checkoutId: string, orderId: string, correlationId: string, now: string): Promise<void>;
  release(session: DatabaseSession, checkoutId: string, correlationId: string, now: string): Promise<void>;
}
