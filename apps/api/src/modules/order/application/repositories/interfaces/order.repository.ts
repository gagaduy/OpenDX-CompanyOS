// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { Order } from "../../../domain/entities/order";
import type { OrderLine } from "../../../domain/entities/order-line";
import type { OrderStatusHistory } from "../../../domain/entities/order-status-history";
import type { AdminOrderSummaryDto, OrderListQuery, OrderSummaryDto } from "../../dtos/order.dto";

export interface OrderAggregate {
  readonly order: Order;
  readonly lines: readonly OrderLine[];
  readonly history: readonly OrderStatusHistory[];
}

export interface CustomerOrderOperationsRecord {
  readonly id: string;
  readonly publicNumber: string;
  readonly status: Order["status"];
  readonly totalVnd: number;
  readonly createdAt: string;
  readonly paidAt?: string;
}

export interface OrderRepository {
  create(session: DatabaseSession, order: Order, lines: readonly OrderLine[], initialHistory: OrderStatusHistory): Promise<void>;
  findById(session: DatabaseSession, orderId: string, lock?: boolean): Promise<OrderAggregate | undefined>;
  findByCheckoutId(session: DatabaseSession, checkoutId: string, lock?: boolean): Promise<OrderAggregate | undefined>;
  listForCustomer(session: DatabaseSession, customerId: string, query: OrderListQuery): Promise<{ readonly items: readonly OrderSummaryDto[]; readonly totalItems: number }>;
  listForStaff(session: DatabaseSession, query: OrderListQuery): Promise<{ readonly items: readonly AdminOrderSummaryDto[]; readonly totalItems: number }>;
  listOperationsByCustomer(
    session: DatabaseSession,
    customerId: string,
    limit: number,
  ): Promise<readonly CustomerOrderOperationsRecord[]>;
  findOperationsOwned(
    session: DatabaseSession,
    customerId: string,
    orderId: string,
  ): Promise<CustomerOrderOperationsRecord | undefined>;
  findHistoryByIdempotencyKey(session: DatabaseSession, orderId: string, key: string): Promise<OrderStatusHistory | undefined>;
  updateStatus(session: DatabaseSession, order: Order, expectedVersion: number): Promise<boolean>;
  appendHistory(session: DatabaseSession, history: OrderStatusHistory): Promise<void>;
  appendAudit(session: DatabaseSession, entry: {
    readonly id: string; readonly actorType: "staff" | "customer" | "system" | "provider";
    readonly actorId: string; readonly action: string; readonly resourceId: string;
    readonly correlationId: string; readonly metadata: Readonly<Record<string, unknown>>;
    readonly occurredAt: string;
    readonly outcome?: "success" | "denied";
  }): Promise<void>;
}
