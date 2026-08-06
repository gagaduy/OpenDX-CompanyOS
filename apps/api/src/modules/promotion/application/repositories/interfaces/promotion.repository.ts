// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { Promotion } from "../../../domain/entities/promotion";
import type { PromotionRedemption } from "../../../domain/entities/promotion-redemption";

export interface PromotionRepository {
  list(session: DatabaseSession): Promise<readonly Promotion[]>;
  findByCodeForUpdate(session: DatabaseSession, code: string): Promise<Promotion | undefined>;
  findByIdForUpdate(session: DatabaseSession, id: string): Promise<Promotion | undefined>;
  create(session: DatabaseSession, promotion: Promotion): Promise<void>;
  update(session: DatabaseSession, promotion: Promotion, expectedVersion: number): Promise<boolean>;
  countUsage(session: DatabaseSession, promotionId: string, customerId: string, now: string): Promise<{ readonly total: number; readonly customer: number }>;
  findRedemptionByCheckout(session: DatabaseSession, checkoutId: string): Promise<PromotionRedemption | undefined>;
  createRedemption(session: DatabaseSession, redemption: PromotionRedemption): Promise<void>;
  updateRedemption(session: DatabaseSession, redemption: PromotionRedemption): Promise<void>;
  appendAudit(session: DatabaseSession, entry: {
    readonly id: string;
    readonly actorType: "staff" | "customer" | "system";
    readonly actorId: string;
    readonly action: string;
    readonly resourceType: "promotion" | "promotion_redemption";
    readonly resourceId: string;
    readonly correlationId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly occurredAt: string;
  }): Promise<void>;
}
