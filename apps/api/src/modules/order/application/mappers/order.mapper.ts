// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AdminOrderDetailDto, OrderDetailDto } from "../dtos/order.dto";
import type { OrderAggregate } from "../repositories/interfaces/order.repository";

export function toCustomerOrderDetail(aggregate: OrderAggregate): OrderDetailDto {
  const { customerId: _customerId, ...order } = aggregate.order;
  return {
    ...structuredClone(order),
    lines: aggregate.lines.map(({ orderId: _orderId, ...line }) => structuredClone(line)),
    history: aggregate.history.map(({ previousStatus, newStatus, actorType, reasonCode, occurredAt }) => ({
      ...(previousStatus === undefined ? {} : { previousStatus }),
      newStatus, actorType, reasonCode, occurredAt,
    })),
  };
}
export function toAdminOrderDetail(aggregate: OrderAggregate): AdminOrderDetailDto {
  return { ...toCustomerOrderDetail(aggregate), customerId: aggregate.order.customerId };
}
