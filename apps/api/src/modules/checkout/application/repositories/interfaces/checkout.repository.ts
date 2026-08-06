// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CheckoutLine } from "../../../domain/entities/checkout-line";
import type { CheckoutSession } from "../../../domain/entities/checkout-session";

export interface CheckoutAggregate { readonly checkout: CheckoutSession; readonly lines: readonly CheckoutLine[]; }
export interface CheckoutRepository {
  create(session: DatabaseSession, checkout: CheckoutSession, lines: readonly CheckoutLine[]): Promise<void>;
  findByCustomerAndKey(session: DatabaseSession, customerId: string, idempotencyKey: string, lock?: boolean): Promise<CheckoutAggregate | undefined>;
  findOwnedById(session: DatabaseSession, customerId: string, checkoutId: string): Promise<CheckoutAggregate | undefined>;
  applyPromotion(session: DatabaseSession, checkout: CheckoutSession): Promise<void>;
  attachOrder(session: DatabaseSession, checkout: CheckoutSession): Promise<void>;
  completePaid(session: DatabaseSession, checkoutId: string, orderId: string, now: string): Promise<CheckoutSession | undefined>;
  appendAudit(session: DatabaseSession, entry: {
    readonly id: string; readonly actorId: string; readonly action: string; readonly resourceId: string;
    readonly correlationId: string; readonly metadata: Readonly<Record<string, unknown>>; readonly occurredAt: string;
  }): Promise<void>;
}
