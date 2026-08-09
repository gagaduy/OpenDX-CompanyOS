// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner, DatabaseSession } from "../../../../../shared/database/transaction";
import type { Order, OrderActorType, OrderStatus } from "../../../domain/entities/order";
import type { OrderStatusHistory } from "../../../domain/entities/order-status-history";
import { createPublicOrderNumber, transitionOrder, validateOrderSnapshot } from "../../../domain/services/order-rules";
import type { AdminOrderDetailDto, AdminOrderSummaryDto, OrderDetailDto, OrderListQuery, OrderListResult, OrderSummaryDto, StaffOrderContext, TransitionOrderRequest } from "../../dtos/order.dto";
import { toAdminOrderDetail, toCustomerOrderDetail } from "../../mappers/order.mapper";
import type { OrderAggregate, OrderRepository } from "../../repositories/interfaces/order.repository";
import { OrderApplicationError } from "../order-application.error";
import type { CreatePendingOrderRequest, OrderCheckoutPort } from "../interfaces/order-checkout-port";
import type { OrderServiceContract } from "../interfaces/order.service";
import type { PendingOrderCancellationPort } from "../interfaces/pending-order-cancellation-port";

export class OrderService implements OrderServiceContract, OrderCheckoutPort {
  constructor(
    private readonly repository: OrderRepository,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
    private readonly cancellation?: PendingOrderCancellationPort,
  ) {}

  async listForCustomer(customerId: string, query: OrderListQuery): Promise<OrderListResult<OrderSummaryDto>> {
    return this.transactions.runReadOnly(async (session) => page(await this.repository.listForCustomer(session, customerId, query), query));
  }

  async getForCustomer(customerId: string, orderId: string): Promise<OrderDetailDto> {
    return this.transactions.runReadOnly(async (session) => {
      const aggregate = await this.repository.findById(session, orderId);
      if (aggregate === undefined || aggregate.order.customerId !== customerId) notFound();
      return toCustomerOrderDetail(aggregate);
    });
  }

  async listForStaff(query: OrderListQuery, context: StaffOrderContext): Promise<OrderListResult<AdminOrderSummaryDto>> {
    requireOperations(context);
    return this.transactions.runReadOnly(async (session) => page(await this.repository.listForStaff(session, query), query));
  }

  async getForStaff(orderId: string, context: StaffOrderContext): Promise<AdminOrderDetailDto> {
    requireOperations(context);
    return this.transactions.runReadOnly(async (session) => {
      const aggregate = await this.repository.findById(session, orderId);
      if (aggregate === undefined) notFound();
      return toAdminOrderDetail(aggregate);
    });
  }

  async transition(orderId: string, request: TransitionOrderRequest, context: StaffOrderContext): Promise<AdminOrderDetailDto> {
    requireOperations(context);
    if (request.targetStatus === "canceled") {
      if (this.cancellation === undefined) {
        throw new Error("Order cancellation is not configured");
      }
      const aggregate = await this.transactions.run(async (session) => {
        const result = await this.cancellation!.cancelInSession(session, {
          orderId,
          expectedVersion: request.version,
          actorId: context.actorId,
          reasonCode: request.reasonCode,
          idempotencyKey: request.idempotencyKey,
          correlationId: context.correlationId,
          now: this.now(),
        });
        if (result === "already_paid") {
          throw new OrderApplicationError("ORDER_ALREADY_PAID", "A paid order cannot be canceled");
        }
        if (result === "not_cancelable") {
          throw new OrderApplicationError("ORDER_NOT_CANCELABLE", "Order is not cancelable");
        }
        const current = await this.repository.findById(session, orderId);
        if (current === undefined) notFound();
        return current;
      });
      return toAdminOrderDetail(aggregate);
    }
    const aggregate = await this.transactions.run((session) => this.applyTransition(
      session, orderId, request.targetStatus, "staff", context.actorId,
      request.reasonCode, request.idempotencyKey, context.correlationId,
      this.now(), request.version,
    ));
    return toAdminOrderDetail(aggregate);
  }

  async createPending(session: DatabaseSession, request: CreatePendingOrderRequest): Promise<Order> {
    const existing = await this.repository.findByCheckoutId(session, request.checkoutId, true);
    if (existing !== undefined) {
      return existing.order;
    }
    const timestamp = this.now();
    const id = this.generateId();
    const order: Order = {
      id,
      publicNumber: createPublicOrderNumber(
        timestamp,
        id.replaceAll("-", "").slice(0, 8),
      ),
      customerId: request.customerId,
      checkoutId: request.checkoutId,
      addressSnapshot: structuredClone(request.addressSnapshot),
      contactSnapshot: structuredClone(request.contactSnapshot),
      ...(request.promotionCode === undefined ? {} : { promotionCode: request.promotionCode }),
      subtotalVnd: request.subtotalVnd,
      discountVnd: request.discountVnd,
      totalVnd: request.totalVnd,
      currency: "VND",
      taxMode: "included_not_separated",
      status: "pending_payment",
      reservationExpiresAt: request.reservationExpiresAt,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const lines = request.lines.map((line) => ({
      ...structuredClone(line),
      id: this.generateId(),
      orderId: id,
    }));
    validateOrderSnapshot(order, lines);
    const initialHistory = this.history(order, undefined, "pending_payment", request.actorType, request.actorId, "ORDER_CREATED", request.idempotencyKey, request.correlationId, timestamp);
    await this.repository.create(session, order, lines, initialHistory);
    await this.audit(session, id, request.actorType, request.actorId, "order.created", request.correlationId, timestamp, { publicNumber: order.publicNumber });
    return order;
  }

  async transitionInSession(
    session: DatabaseSession,
    orderId: string,
    targetStatus: "paid" | "canceled" | "expired",
    actorType: OrderActorType,
    actorId: string,
    reasonCode: string,
    idempotencyKey: string,
    correlationId: string,
    now: string,
    expectedVersion?: number,
  ): Promise<Order> {
    return (await this.applyTransition(session, orderId, targetStatus, actorType, actorId, reasonCode, idempotencyKey, correlationId, now, expectedVersion)).order;
  }

  private async applyTransition(
    session: DatabaseSession,
    orderId: string,
    targetStatus: OrderStatus,
    actorType: OrderActorType,
    actorId: string,
    reasonCode: string,
    idempotencyKey: string,
    correlationId: string,
    now: string,
    expectedVersion?: number,
  ): Promise<OrderAggregate> {
    const aggregate = await this.repository.findById(session, orderId, true);
    if (aggregate === undefined) notFound();
    const replay = await this.repository.findHistoryByIdempotencyKey(session, orderId, idempotencyKey);
    if (replay !== undefined) {
      if (replay.newStatus !== targetStatus || replay.actorId !== actorId) throw new OrderApplicationError("IDEMPOTENCY_CONFLICT", "Transition key belongs to another command");
      return aggregate;
    }
    if (expectedVersion !== undefined && aggregate.order.version !== expectedVersion) throw new OrderApplicationError("STALE_VERSION", "Order version is stale");
    const updated = transitionOrder(aggregate.order, targetStatus, actorType, now);
    if (!(await this.repository.updateStatus(session, updated, aggregate.order.version))) throw new OrderApplicationError("STALE_VERSION", "Order version is stale");
    const history = this.history(updated, aggregate.order.status, targetStatus, actorType, actorId, reasonCode, idempotencyKey, correlationId, now);
    await this.repository.appendHistory(session, history);
    await this.audit(session, orderId, actorType, actorId, "order.status.changed", correlationId, now, { previousStatus: aggregate.order.status, newStatus: targetStatus, reasonCode });
    return { order: updated, lines: aggregate.lines, history: [...aggregate.history, history] };
  }

  private history(order: Order, previousStatus: OrderStatus | undefined, newStatus: OrderStatus, actorType: OrderActorType, actorId: string, reasonCode: string, idempotencyKey: string, correlationId: string, occurredAt: string): OrderStatusHistory {
    return { id: this.generateId(), orderId: order.id, ...(previousStatus === undefined ? {} : { previousStatus }), newStatus, actorType, actorId, reasonCode, idempotencyKey, correlationId, occurredAt };
  }

  private audit(session: DatabaseSession, orderId: string, actorType: OrderActorType, actorId: string, action: string, correlationId: string, occurredAt: string, metadata: Readonly<Record<string, unknown>>): Promise<void> {
    return this.repository.appendAudit(session, { id: this.generateId(), actorType, actorId, action, resourceId: orderId, correlationId, metadata, occurredAt });
  }
}

function requireOperations(context: StaffOrderContext): void {
  if (!context.roles.some((role) => role === "administrator" || role === "operations_manager")) throw new OrderApplicationError("FORBIDDEN", "Operations role is required");
}
function notFound(): never { throw new OrderApplicationError("ORDER_NOT_FOUND", "Order not found"); }
function page<T>(result: { readonly items: readonly T[]; readonly totalItems: number }, query: OrderListQuery): OrderListResult<T> {
  return { ...result, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(result.totalItems / query.pageSize) };
}
