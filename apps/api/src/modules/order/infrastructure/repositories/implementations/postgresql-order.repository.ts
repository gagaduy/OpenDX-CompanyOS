// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { OrderListQuery } from "../../../application/dtos/order.dto";
import type { OrderAggregate, OrderRepository } from "../../../application/repositories/interfaces/order.repository";
import type { Order, OrderAddressSnapshot, OrderContactSnapshot, OrderStatus } from "../../../domain/entities/order";
import type { OrderLine } from "../../../domain/entities/order-line";
import type { OrderStatusHistory } from "../../../domain/entities/order-status-history";

type Row = Record<string, unknown>;
const orderColumns = `id,public_number,customer_id,checkout_id,address_snapshot,
  contact_snapshot,promotion_code,subtotal_vnd,discount_vnd,total_vnd,currency,
  tax_mode,status,reservation_expires_at,paid_at,completed_at,version,created_at,updated_at`;

export class PostgresqlOrderRepository implements OrderRepository {
  async create(session: DatabaseSession, order: Order, lines: readonly OrderLine[], initialHistory: OrderStatusHistory): Promise<void> {
    await session.query(
      `INSERT INTO orders (${orderColumns}) VALUES
       ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      orderValues(order),
    );
    for (const line of lines) await this.insertLine(session, line);
    await this.appendHistory(session, initialHistory);
  }

  async findById(session: DatabaseSession, orderId: string, lock = false): Promise<OrderAggregate | undefined> {
    const result = await session.query<Row>(`SELECT ${orderColumns} FROM orders WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [orderId]);
    return result.rows[0] === undefined ? undefined : this.aggregate(session, mapOrder(result.rows[0]));
  }

  async findByCheckoutId(session: DatabaseSession, checkoutId: string, lock = false): Promise<OrderAggregate | undefined> {
    const result = await session.query<Row>(`SELECT ${orderColumns} FROM orders WHERE checkout_id=$1${lock ? " FOR UPDATE" : ""}`, [checkoutId]);
    return result.rows[0] === undefined ? undefined : this.aggregate(session, mapOrder(result.rows[0]));
  }

  async listForCustomer(session: DatabaseSession, customerId: string, query: OrderListQuery) {
    const { where, values } = filter(query, "customer_id=$1", [customerId]);
    const count = await session.query<{ total: string }>(`SELECT count(*)::text AS total FROM orders WHERE ${where}`, values);
    const rows = await session.query<Row>(
      `SELECT id,public_number,status,total_vnd,currency,created_at,updated_at
       FROM orders WHERE ${where} ORDER BY created_at DESC,id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { items: rows.rows.map(mapSummary), totalItems: Number(count.rows[0]?.total ?? 0) };
  }

  async listForStaff(session: DatabaseSession, query: OrderListQuery) {
    const { where, values } = filter(query, "TRUE", []);
    const count = await session.query<{ total: string }>(`SELECT count(*)::text AS total FROM orders WHERE ${where}`, values);
    const rows = await session.query<Row>(
      `SELECT o.id,o.public_number,o.customer_id,c.email AS customer_email,
              o.status,o.total_vnd,o.currency,o.created_at,o.updated_at
       FROM orders o JOIN customers c ON c.id=o.customer_id
       WHERE ${where.replaceAll("status", "o.status")}
       ORDER BY o.created_at DESC,o.id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { items: rows.rows.map((row) => ({ ...mapSummary(row), customerId: String(row.customer_id), customerEmail: String(row.customer_email) })), totalItems: Number(count.rows[0]?.total ?? 0) };
  }

  async findHistoryByIdempotencyKey(session: DatabaseSession, orderId: string, key: string): Promise<OrderStatusHistory | undefined> {
    const result = await session.query<Row>("SELECT * FROM order_status_history WHERE order_id=$1 AND idempotency_key=$2", [orderId, key]);
    return result.rows[0] === undefined ? undefined : mapHistory(result.rows[0]);
  }

  async updateStatus(session: DatabaseSession, order: Order, expectedVersion: number): Promise<boolean> {
    const result = await session.query(
      `UPDATE orders SET status=$2,paid_at=$3,completed_at=$4,version=$5,updated_at=$6
       WHERE id=$1 AND version=$7`,
      [order.id, order.status, order.paidAt ?? null, order.completedAt ?? null, order.version, order.updatedAt, expectedVersion],
    );
    return result.rowCount === 1;
  }

  async appendHistory(session: DatabaseSession, history: OrderStatusHistory): Promise<void> {
    await session.query(
      `INSERT INTO order_status_history
       (id,order_id,previous_status,new_status,actor_type,actor_id,reason_code,idempotency_key,correlation_id,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [history.id, history.orderId, history.previousStatus ?? null, history.newStatus, history.actorType, history.actorId, history.reasonCode, history.idempotencyKey, history.correlationId, history.occurredAt],
    );
  }

  async appendAudit(session: DatabaseSession, entry: Parameters<OrderRepository["appendAudit"]>[1]): Promise<void> {
    const actorType = entry.actorType === "staff" ? "user" : entry.actorType === "system" ? "service_account" : entry.actorType === "provider" ? "connector" : "customer";
    await session.query(
      `INSERT INTO audit_events
       (id,actor_type,actor_id,action,resource_type,resource_id,outcome,correlation_id,metadata,occurred_at)
       VALUES($1,$2,$3,$4,'order',$5,$6,$7,$8::jsonb,$9)`,
      [entry.id, actorType, entry.actorId, entry.action, entry.resourceId, entry.outcome ?? "success", entry.correlationId, JSON.stringify(entry.metadata), entry.occurredAt],
    );
  }

  private async aggregate(session: DatabaseSession, order: Order): Promise<OrderAggregate> {
    const [lines, history] = await Promise.all([
      session.query<Row>("SELECT * FROM order_lines WHERE order_id=$1 ORDER BY line_position", [order.id]),
      session.query<Row>("SELECT * FROM order_status_history WHERE order_id=$1 ORDER BY occurred_at,id", [order.id]),
    ]);
    return { order, lines: lines.rows.map(mapLine), history: history.rows.map(mapHistory) };
  }

  private async insertLine(session: DatabaseSession, line: OrderLine): Promise<void> {
    await session.query(
      `INSERT INTO order_lines
       (id,order_id,variant_id,sku,product_title,variant_label,quantity,unit_price_vnd,discount_allocation_vnd,line_total_vnd,line_position)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [line.id, line.orderId, line.variantId, line.sku, line.productTitle, line.variantLabel, line.quantity, line.unitPriceVnd, line.discountAllocationVnd, line.lineTotalVnd, line.linePosition],
    );
  }
}

function orderValues(order: Order): readonly unknown[] {
  return [order.id, order.publicNumber, order.customerId, order.checkoutId, JSON.stringify(order.addressSnapshot), JSON.stringify(order.contactSnapshot), order.promotionCode ?? null, order.subtotalVnd, order.discountVnd, order.totalVnd, order.currency, order.taxMode, order.status, order.reservationExpiresAt, order.paidAt ?? null, order.completedAt ?? null, order.version, order.createdAt, order.updatedAt];
}

function mapOrder(row: Row): Order {
  return {
    id: String(row.id), publicNumber: String(row.public_number), customerId: String(row.customer_id), checkoutId: String(row.checkout_id),
    addressSnapshot: json<OrderAddressSnapshot>(row.address_snapshot), contactSnapshot: json<OrderContactSnapshot>(row.contact_snapshot),
    ...(row.promotion_code === null ? {} : { promotionCode: String(row.promotion_code) }), subtotalVnd: money(row.subtotal_vnd), discountVnd: money(row.discount_vnd), totalVnd: money(row.total_vnd),
    currency: "VND", taxMode: "included_not_separated", status: status(row.status), reservationExpiresAt: iso(row.reservation_expires_at),
    ...(row.paid_at === null ? {} : { paidAt: iso(row.paid_at) }), ...(row.completed_at === null ? {} : { completedAt: iso(row.completed_at) }),
    version: Number(row.version), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}
function mapLine(row: Row): OrderLine {
  return { id: String(row.id), orderId: String(row.order_id), variantId: String(row.variant_id), sku: String(row.sku), productTitle: String(row.product_title), variantLabel: String(row.variant_label), quantity: Number(row.quantity), unitPriceVnd: money(row.unit_price_vnd), discountAllocationVnd: money(row.discount_allocation_vnd), lineTotalVnd: money(row.line_total_vnd), linePosition: Number(row.line_position) };
}
function mapHistory(row: Row): OrderStatusHistory {
  return { id: String(row.id), orderId: String(row.order_id), ...(row.previous_status === null ? {} : { previousStatus: status(row.previous_status) }), newStatus: status(row.new_status), actorType: actor(row.actor_type), actorId: String(row.actor_id), reasonCode: String(row.reason_code), idempotencyKey: String(row.idempotency_key), correlationId: String(row.correlation_id), occurredAt: iso(row.occurred_at) };
}
function mapSummary(row: Row) { return { id: String(row.id), publicNumber: String(row.public_number), status: status(row.status), totalVnd: money(row.total_vnd), currency: "VND" as const, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }; }
function filter(query: OrderListQuery, base: string, initial: readonly unknown[]) {
  const values = [...initial];
  const clauses = [base];
  if (query.status !== undefined) { values.push(query.status); clauses.push(`status=$${values.length}`); }
  return { where: clauses.join(" AND "), values };
}
function json<T>(value: unknown): T { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid persisted order snapshot"); return structuredClone(value) as T; }
function money(value: unknown): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new Error("Unsafe persisted VND value"); return parsed; }
function iso(value: unknown): string { return (value instanceof Date ? value : new Date(String(value))).toISOString(); }
function status(value: unknown): OrderStatus { const parsed = String(value) as OrderStatus; if (!["pending_payment", "paid", "processing", "ready_for_fulfillment", "completed", "canceled", "expired"].includes(parsed)) throw new Error("Invalid persisted order status"); return parsed; }
function actor(value: unknown): OrderStatusHistory["actorType"] { const parsed = String(value) as OrderStatusHistory["actorType"]; if (!["customer", "staff", "system", "provider"].includes(parsed)) throw new Error("Invalid persisted order actor"); return parsed; }
