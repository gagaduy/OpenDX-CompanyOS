// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  Order,
  OrderActorType,
  OrderAddressSnapshot,
  OrderContactSnapshot,
} from "../../../domain/entities/order";
import type { OrderLine } from "../../../domain/entities/order-line";

export interface CreatePendingOrderRequest {
  readonly customerId: string;
  readonly checkoutId: string;
  readonly addressSnapshot: OrderAddressSnapshot;
  readonly contactSnapshot: OrderContactSnapshot;
  readonly promotionCode?: string;
  readonly subtotalVnd: number;
  readonly discountVnd: number;
  readonly totalVnd: number;
  readonly reservationExpiresAt: string;
  readonly lines: readonly Omit<OrderLine, "id" | "orderId">[];
  readonly actorType: OrderActorType;
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}
export interface OrderCheckoutPort {
  createPending(session: DatabaseSession, request: CreatePendingOrderRequest): Promise<Order>;
  transitionInSession(session: DatabaseSession, orderId: string, targetStatus: "paid" | "canceled" | "expired", actorType: OrderActorType, actorId: string, reasonCode: string, idempotencyKey: string, correlationId: string, now: string, expectedVersion?: number): Promise<Order>;
}
