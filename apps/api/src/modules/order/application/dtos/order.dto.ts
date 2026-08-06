// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Order, OrderStatus } from "../../domain/entities/order";
import type { OrderLine } from "../../domain/entities/order-line";
import type { OrderStatusHistory } from "../../domain/entities/order-status-history";

export type OrderLineDto = Omit<OrderLine, "orderId">;
export type OrderHistoryDto = Pick<OrderStatusHistory, "previousStatus" | "newStatus" | "actorType" | "reasonCode" | "occurredAt">;
export interface OrderDetailDto extends Omit<Order, "customerId"> {
  readonly lines: readonly OrderLineDto[];
  readonly history: readonly OrderHistoryDto[];
}
export interface AdminOrderDetailDto extends OrderDetailDto {
  readonly customerId: string;
}
export interface OrderListQuery {
  readonly status?: OrderStatus;
  readonly page: number;
  readonly pageSize: number;
}
export interface OrderListResult<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
export type OrderSummaryDto = Pick<Order, "id" | "publicNumber" | "status" | "totalVnd" | "currency" | "createdAt" | "updatedAt">;
export type AdminOrderSummaryDto = OrderSummaryDto & Pick<Order, "customerId"> & { readonly customerEmail: string };

export interface StaffOrderContext {
  readonly actorId: string;
  readonly roles: readonly ("administrator" | "catalog_manager" | "inventory_manager" | "operations_manager" | "finance_operator")[];
  readonly correlationId: string;
}
export interface TransitionOrderRequest {
  readonly targetStatus: Extract<OrderStatus, "canceled" | "processing" | "ready_for_fulfillment" | "completed">;
  readonly reasonCode: string;
  readonly version: number;
  readonly idempotencyKey: string;
}
