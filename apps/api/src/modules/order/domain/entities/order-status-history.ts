// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { OrderActorType, OrderStatus } from "./order";

export interface OrderStatusHistory {
  readonly id: string;
  readonly orderId: string;
  readonly previousStatus?: OrderStatus;
  readonly newStatus: OrderStatus;
  readonly actorType: OrderActorType;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}
