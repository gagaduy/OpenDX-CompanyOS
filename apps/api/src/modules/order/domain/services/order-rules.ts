// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Order, OrderActorType, OrderStatus } from "../entities/order";
import type { OrderLine } from "../entities/order-line";
import { OrderDomainError } from "../exceptions/order-domain.error";

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ["paid", "canceled", "expired"],
  paid: ["processing"],
  processing: ["ready_for_fulfillment"],
  ready_for_fulfillment: ["completed"],
  completed: [],
  canceled: [],
  expired: [],
};

export function validateOrderSnapshot(order: Order, lines: readonly OrderLine[]): void {
  if (!/^NVC-[0-9]{8}-[A-F0-9]{8}$/.test(order.publicNumber) || order.version <= 0) invalid("Order identity is invalid");
  if (order.currency !== "VND" || order.taxMode !== "included_not_separated") invalid("Order currency or tax mode is invalid");
  assertMoney(order.subtotalVnd);
  assertMoney(order.discountVnd);
  assertMoney(order.totalVnd, true);
  if (order.discountVnd > order.subtotalVnd || order.totalVnd !== order.subtotalVnd - order.discountVnd) invalid("Order totals are inconsistent");
  if (lines.length === 0 || lines.length > 100) invalid("Order lines are invalid");
  const positions = new Set<number>();
  const variants = new Set<string>();
  let subtotal = 0;
  let discount = 0;
  let total = 0;
  for (const line of lines) {
    if (line.orderId !== order.id || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) invalid("Order line identity or quantity is invalid");
    assertMoney(line.unitPriceVnd);
    assertMoney(line.discountAllocationVnd);
    assertMoney(line.lineTotalVnd);
    if (!Number.isSafeInteger(line.linePosition) || line.linePosition < 0 || positions.has(line.linePosition) || variants.has(line.variantId)) invalid("Order line position or variant is invalid");
    const lineSubtotal = safeMultiply(line.unitPriceVnd, line.quantity);
    if (line.discountAllocationVnd > lineSubtotal || line.lineTotalVnd !== lineSubtotal - line.discountAllocationVnd) invalid("Order line totals are inconsistent");
    positions.add(line.linePosition);
    variants.add(line.variantId);
    subtotal = safeAdd(subtotal, lineSubtotal);
    discount = safeAdd(discount, line.discountAllocationVnd);
    total = safeAdd(total, line.lineTotalVnd);
  }
  if (subtotal !== order.subtotalVnd || discount !== order.discountVnd || total !== order.totalVnd) invalid("Order and line totals do not match");
  if (order.addressSnapshot.version <= 0 || order.addressSnapshot.recipientName.trim().length === 0 || order.addressSnapshot.phoneNumber.trim().length === 0 || order.contactSnapshot.email.trim().length === 0) invalid("Order customer snapshots are invalid");
  if (!Number.isFinite(Date.parse(order.createdAt)) || !Number.isFinite(Date.parse(order.reservationExpiresAt)) || Date.parse(order.reservationExpiresAt) <= Date.parse(order.createdAt)) invalid("Order timestamps are invalid");
}

export function transitionOrder(order: Order, target: OrderStatus, actorType: OrderActorType, timestamp: string): Order {
  if (!transitions[order.status].includes(target) || !actorCanTransition(order.status, target, actorType)) {
    throw new OrderDomainError("INVALID_ORDER_TRANSITION", `Cannot transition order from ${order.status} to ${target}`);
  }
  if (!Number.isFinite(Date.parse(timestamp))) invalid("Transition timestamp is invalid");
  return {
    ...order,
    status: target,
    version: order.version + 1,
    updatedAt: timestamp,
    ...(target === "paid" ? { paidAt: timestamp } : {}),
    ...(target === "completed" ? { completedAt: timestamp } : {}),
  };
}

export function createPublicOrderNumber(timestamp: string, suffix: string): string {
  const date = new Date(timestamp);
  const normalizedSuffix = suffix.toUpperCase();
  if (!Number.isFinite(date.getTime()) || !/^[A-F0-9]{8}$/.test(normalizedSuffix)) invalid("Order number input is invalid");
  return `NVC-${date.toISOString().slice(0, 10).replaceAll("-", "")}-${normalizedSuffix}`;
}

function actorCanTransition(current: OrderStatus, target: OrderStatus, actor: OrderActorType): boolean {
  if (current === "pending_payment" && target === "paid") return actor === "provider" || actor === "system";
  if (current === "pending_payment" && target === "canceled") return actor === "customer" || actor === "staff";
  if (current === "pending_payment" && target === "expired") return actor === "system";
  return actor === "staff";
}

function assertMoney(value: number, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) invalid("Order money is invalid");
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) invalid("Order money overflowed");
  return result;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) invalid("Order money overflowed");
  return result;
}

function invalid(message: string): never {
  throw new OrderDomainError("INVALID_ORDER", message);
}
