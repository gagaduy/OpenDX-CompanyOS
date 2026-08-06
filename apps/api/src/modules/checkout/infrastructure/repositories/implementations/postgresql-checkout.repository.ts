// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CheckoutAggregate, CheckoutRepository } from "../../../application/repositories/interfaces/checkout.repository";
import type { CheckoutLine } from "../../../domain/entities/checkout-line";
import type { CheckoutSession, CheckoutStatus } from "../../../domain/entities/checkout-session";

type Row = Record<string, unknown>;
const columns = "id,customer_id,source_cart_id,source_cart_version,address_snapshot,contact_snapshot,promotion_id,promotion_code,promotion_version,subtotal_vnd,discount_vnd,total_vnd,currency,tax_mode,status,idempotency_key,request_fingerprint,order_id,expires_at,completed_at,created_at,updated_at";

export class PostgresqlCheckoutRepository implements CheckoutRepository {
  async create(session: DatabaseSession, checkout: CheckoutSession, lines: readonly CheckoutLine[]): Promise<void> {
    await session.query(`INSERT INTO checkout_sessions (${columns}) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`, values(checkout));
    for (const line of lines) await session.query(
      `INSERT INTO checkout_session_lines(id,checkout_id,variant_id,sku,product_title,variant_label,quantity,unit_price_vnd,line_subtotal_vnd,line_position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [line.id, line.checkoutId, line.variantId, line.sku, line.productTitle, line.variantLabel, line.quantity, line.unitPriceVnd, line.lineSubtotalVnd, line.linePosition],
    );
  }
  findByCustomerAndKey(session: DatabaseSession, customerId: string, key: string, lock = false): Promise<CheckoutAggregate | undefined> { return this.find(session, "customer_id=$1 AND idempotency_key=$2", [customerId, key], lock); }
  findOwnedById(session: DatabaseSession, customerId: string, checkoutId: string): Promise<CheckoutAggregate | undefined> { return this.find(session, "customer_id=$1 AND id=$2", [customerId, checkoutId], false); }
  async applyPromotion(session: DatabaseSession, checkout: CheckoutSession): Promise<void> {
    await session.query("UPDATE checkout_sessions SET promotion_id=$2,promotion_code=$3,promotion_version=$4,discount_vnd=$5,total_vnd=$6,updated_at=$7 WHERE id=$1 AND status='created'", [checkout.id, checkout.promotionId ?? null, checkout.promotionCode ?? null, checkout.promotionVersion ?? null, checkout.discountVnd, checkout.totalVnd, checkout.updatedAt]);
  }
  async attachOrder(session: DatabaseSession, checkout: CheckoutSession): Promise<void> {
    const result = await session.query("UPDATE checkout_sessions SET order_id=$2,status=$3,updated_at=$4 WHERE id=$1 AND status='created'", [checkout.id, checkout.orderId, checkout.status, checkout.updatedAt]);
    if (result.rowCount !== 1) throw new Error("Checkout state changed while attaching order");
  }
  async completePaid(session: DatabaseSession, checkoutId: string, orderId: string, now: string): Promise<CheckoutSession | undefined> {
    const current = await session.query<Row>(`SELECT ${columns} FROM checkout_sessions WHERE id=$1 AND order_id=$2 FOR UPDATE`, [checkoutId, orderId]);
    if (current.rows[0] === undefined) return undefined;
    const checkout = mapCheckout(current.rows[0]);
    if (checkout.status === "completed") return checkout;
    if (checkout.status !== "order_created") return undefined;
    const updated = await session.query<Row>(`UPDATE checkout_sessions SET status='completed',completed_at=$3,updated_at=$3 WHERE id=$1 AND order_id=$2 RETURNING ${columns}`, [checkoutId, orderId, now]);
    return updated.rows[0] === undefined ? undefined : mapCheckout(updated.rows[0]);
  }
  async appendAudit(session: DatabaseSession, entry: Parameters<CheckoutRepository["appendAudit"]>[1]): Promise<void> {
    await session.query(`INSERT INTO audit_events(id,actor_type,actor_id,action,resource_type,resource_id,outcome,correlation_id,metadata,occurred_at) VALUES($1,'customer',$2,$3,'checkout',$4,'success',$5,$6::jsonb,$7)`, [entry.id, entry.actorId, entry.action, entry.resourceId, entry.correlationId, JSON.stringify(entry.metadata), entry.occurredAt]);
  }
  private async find(session: DatabaseSession, predicate: string, parameters: readonly unknown[], lock: boolean): Promise<CheckoutAggregate | undefined> {
    const result = await session.query<Row>(`SELECT ${columns} FROM checkout_sessions WHERE ${predicate}${lock ? " FOR UPDATE" : ""}`, parameters);
    if (result.rows[0] === undefined) return undefined;
    const checkout = mapCheckout(result.rows[0]);
    const lines = await session.query<Row>("SELECT * FROM checkout_session_lines WHERE checkout_id=$1 ORDER BY line_position", [checkout.id]);
    return { checkout, lines: lines.rows.map(mapLine) };
  }
}
function values(c: CheckoutSession): readonly unknown[] { return [c.id,c.customerId,c.sourceCartId,c.sourceCartVersion,JSON.stringify(c.addressSnapshot),JSON.stringify(c.contactSnapshot),c.promotionId??null,c.promotionCode??null,c.promotionVersion??null,c.subtotalVnd,c.discountVnd,c.totalVnd,c.currency,c.taxMode,c.status,c.idempotencyKey,c.requestFingerprint,c.orderId??null,c.expiresAt,c.completedAt??null,c.createdAt,c.updatedAt]; }
function mapCheckout(r: Row): CheckoutSession { return { id:String(r.id),customerId:String(r.customer_id),sourceCartId:String(r.source_cart_id),sourceCartVersion:Number(r.source_cart_version),addressSnapshot:json(r.address_snapshot),contactSnapshot:json(r.contact_snapshot),...(r.promotion_id===null?{}:{promotionId:String(r.promotion_id)}),...(r.promotion_code===null?{}:{promotionCode:String(r.promotion_code)}),...(r.promotion_version===null?{}:{promotionVersion:Number(r.promotion_version)}),subtotalVnd:money(r.subtotal_vnd),discountVnd:money(r.discount_vnd),totalVnd:money(r.total_vnd),currency:"VND",taxMode:"included_not_separated",status:status(r.status),idempotencyKey:String(r.idempotency_key),requestFingerprint:String(r.request_fingerprint),...(r.order_id===null?{}:{orderId:String(r.order_id)}),expiresAt:iso(r.expires_at),...(r.completed_at===null?{}:{completedAt:iso(r.completed_at)}),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at) }; }
function mapLine(r: Row): CheckoutLine { return { id:String(r.id),checkoutId:String(r.checkout_id),variantId:String(r.variant_id),sku:String(r.sku),productTitle:String(r.product_title),variantLabel:String(r.variant_label),quantity:Number(r.quantity),unitPriceVnd:money(r.unit_price_vnd),lineSubtotalVnd:money(r.line_subtotal_vnd),linePosition:Number(r.line_position) }; }
function status(v: unknown): CheckoutStatus { const s=String(v) as CheckoutStatus; if(!["created","order_created","completed","expired","canceled"].includes(s)) throw new Error("Invalid persisted checkout status"); return s; }
function money(v: unknown): number { const n=Number(v); if(!Number.isSafeInteger(n)) throw new Error("Unsafe persisted VND value"); return n; }
function iso(v: unknown): string { return (v instanceof Date?v:new Date(String(v))).toISOString(); }
function json(v: unknown): Readonly<Record<string, unknown>> { if(typeof v!=="object"||v===null||Array.isArray(v)) throw new Error("Invalid checkout snapshot"); return structuredClone(v) as Record<string,unknown>; }
