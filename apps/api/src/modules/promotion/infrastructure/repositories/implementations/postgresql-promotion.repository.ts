// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { PromotionRepository } from "../../../application/repositories/interfaces/promotion.repository";
import type { Promotion } from "../../../domain/entities/promotion";
import type { PromotionRedemption } from "../../../domain/entities/promotion-redemption";

interface PromotionRow {
  id: string; code: string; name: string; promotion_type: string;
  percentage_bps: number | null; fixed_amount_vnd: string | number | null;
  maximum_discount_vnd: string | number | null; minimum_subtotal_vnd: string | number;
  starts_at: Date | string | null; ends_at: Date | string | null;
  total_usage_limit: number | null; per_customer_limit: number | null;
  status: string; version: number; created_at: Date | string; updated_at: Date | string;
}

interface RedemptionRow {
  id: string; promotion_id: string; customer_id: string; checkout_id: string;
  order_id: string | null; discount_vnd: string | number; state: string;
  idempotency_key: string; expires_at: Date | string;
  committed_at: Date | string | null; released_at: Date | string | null;
  created_at: Date | string; updated_at: Date | string;
}

const PROMOTION_COLUMNS = `id, code, name, promotion_type, percentage_bps,
  fixed_amount_vnd, maximum_discount_vnd, minimum_subtotal_vnd, starts_at,
  ends_at, total_usage_limit, per_customer_limit, status, version, created_at,
  updated_at`;
const REDEMPTION_COLUMNS = `id, promotion_id, customer_id, checkout_id, order_id,
  discount_vnd, state, idempotency_key, expires_at, committed_at, released_at,
  created_at, updated_at`;

export class PostgresqlPromotionRepository implements PromotionRepository {
  async list(session: DatabaseSession): Promise<readonly Promotion[]> {
    const result = await session.query<PromotionRow>(`SELECT ${PROMOTION_COLUMNS} FROM promotions ORDER BY created_at DESC, id ASC`);
    return result.rows.map(mapPromotion);
  }

  async findByCodeForUpdate(session: DatabaseSession, code: string): Promise<Promotion | undefined> {
    const result = await session.query<PromotionRow>(`SELECT ${PROMOTION_COLUMNS} FROM promotions WHERE code = $1 FOR UPDATE`, [code]);
    return result.rows[0] === undefined ? undefined : mapPromotion(result.rows[0]);
  }

  async findByIdForUpdate(session: DatabaseSession, id: string): Promise<Promotion | undefined> {
    const result = await session.query<PromotionRow>(`SELECT ${PROMOTION_COLUMNS} FROM promotions WHERE id = $1 FOR UPDATE`, [id]);
    return result.rows[0] === undefined ? undefined : mapPromotion(result.rows[0]);
  }

  async create(session: DatabaseSession, promotion: Promotion): Promise<void> {
    await session.query(
      `INSERT INTO promotions
       (id, code, name, promotion_type, percentage_bps, fixed_amount_vnd,
        maximum_discount_vnd, minimum_subtotal_vnd, starts_at, ends_at,
        total_usage_limit, per_customer_limit, status, version, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      values(promotion),
    );
  }

  async update(session: DatabaseSession, promotion: Promotion, expectedVersion: number): Promise<boolean> {
    const result = await session.query(
      `UPDATE promotions SET code=$2, name=$3, promotion_type=$4,
       percentage_bps=$5, fixed_amount_vnd=$6, maximum_discount_vnd=$7,
       minimum_subtotal_vnd=$8, starts_at=$9, ends_at=$10,
       total_usage_limit=$11, per_customer_limit=$12, status=$13, version=$14,
       updated_at=$16 WHERE id=$1 AND version=$17`,
      [...values(promotion), expectedVersion],
    );
    return result.rowCount === 1;
  }

  async countUsage(session: DatabaseSession, promotionId: string, customerId: string, now: string): Promise<{ readonly total: number; readonly customer: number }> {
    const result = await session.query<{ total: string; customer: string }>(
      `SELECT count(*)::text AS total,
       count(*) FILTER (WHERE customer_id = $2)::text AS customer
       FROM promotion_redemptions
       WHERE promotion_id = $1 AND (state = 'committed' OR (state = 'held' AND expires_at > $3))`,
      [promotionId, customerId, now],
    );
    return { total: Number(result.rows[0]?.total ?? 0), customer: Number(result.rows[0]?.customer ?? 0) };
  }

  async findRedemptionByCheckout(session: DatabaseSession, checkoutId: string): Promise<PromotionRedemption | undefined> {
    const result = await session.query<RedemptionRow>(`SELECT ${REDEMPTION_COLUMNS} FROM promotion_redemptions WHERE checkout_id = $1 FOR UPDATE`, [checkoutId]);
    return result.rows[0] === undefined ? undefined : mapRedemption(result.rows[0]);
  }

  async createRedemption(session: DatabaseSession, redemption: PromotionRedemption): Promise<void> {
    await session.query(
      `INSERT INTO promotion_redemptions
       (id,promotion_id,customer_id,checkout_id,order_id,discount_vnd,state,
        idempotency_key,expires_at,committed_at,released_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      redemptionValues(redemption),
    );
  }

  async updateRedemption(session: DatabaseSession, redemption: PromotionRedemption): Promise<void> {
    const result = await session.query(
      `UPDATE promotion_redemptions SET order_id=$2, state=$3,
       committed_at=$4, released_at=$5, updated_at=$6
       WHERE id=$1 AND state IN ('held','committed','released')`,
      [redemption.id, redemption.orderId ?? null, redemption.state,
        redemption.committedAt ?? null, redemption.releasedAt ?? null,
        redemption.updatedAt],
    );
    if (result.rowCount !== 1) throw new Error("Promotion redemption update failed");
  }

  async appendAudit(session: DatabaseSession, entry: Parameters<PromotionRepository["appendAudit"]>[1]): Promise<void> {
    await session.query(
      `INSERT INTO audit_events
       (id,actor_type,actor_id,action,resource_type,resource_id,outcome,
        correlation_id,metadata,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,'success',$7,$8::jsonb,$9)`,
      [entry.id, entry.actorType === "staff" ? "user" : entry.actorType === "system" ? "service_account" : "customer", entry.actorId, entry.action, entry.resourceType, entry.resourceId, entry.correlationId, JSON.stringify(entry.metadata), entry.occurredAt],
    );
  }
}

function values(promotion: Promotion): readonly unknown[] {
  return [promotion.id, promotion.code, promotion.name, promotion.type,
    promotion.type === "percentage" ? promotion.percentageBps : null,
    promotion.type === "fixed_amount" ? promotion.fixedAmountVnd : null,
    promotion.maximumDiscountVnd ?? null, promotion.minimumSubtotalVnd,
    promotion.startsAt ?? null, promotion.endsAt ?? null,
    promotion.totalUsageLimit ?? null, promotion.perCustomerLimit ?? null,
    promotion.status, promotion.version, promotion.createdAt, promotion.updatedAt];
}

function redemptionValues(redemption: PromotionRedemption): readonly unknown[] {
  return [redemption.id, redemption.promotionId, redemption.customerId,
    redemption.checkoutId, redemption.orderId ?? null, redemption.discountVnd,
    redemption.state, redemption.idempotencyKey, redemption.expiresAt,
    redemption.committedAt ?? null, redemption.releasedAt ?? null,
    redemption.createdAt, redemption.updatedAt];
}

function mapPromotion(row: PromotionRow): Promotion {
  const common = {
    id: row.id, code: row.code, name: row.name,
    minimumSubtotalVnd: money(row.minimum_subtotal_vnd),
    ...(row.maximum_discount_vnd === null ? {} : { maximumDiscountVnd: money(row.maximum_discount_vnd) }),
    ...(row.starts_at === null ? {} : { startsAt: iso(row.starts_at) }),
    ...(row.ends_at === null ? {} : { endsAt: iso(row.ends_at) }),
    ...(row.total_usage_limit === null ? {} : { totalUsageLimit: row.total_usage_limit }),
    ...(row.per_customer_limit === null ? {} : { perCustomerLimit: row.per_customer_limit }),
    status: enumValue(row.status, ["draft", "active", "inactive"] as const),
    version: row.version, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
  if (row.promotion_type === "percentage" && row.percentage_bps !== null) return { ...common, type: "percentage", percentageBps: row.percentage_bps };
  if (row.promotion_type === "fixed_amount" && row.fixed_amount_vnd !== null) return { ...common, type: "fixed_amount", fixedAmountVnd: money(row.fixed_amount_vnd) };
  throw new Error("Invalid persisted promotion type");
}

function mapRedemption(row: RedemptionRow): PromotionRedemption {
  return {
    id: row.id, promotionId: row.promotion_id, customerId: row.customer_id,
    checkoutId: row.checkout_id, ...(row.order_id === null ? {} : { orderId: row.order_id }),
    discountVnd: money(row.discount_vnd), state: enumValue(row.state, ["held", "committed", "released"] as const),
    idempotencyKey: row.idempotency_key, expiresAt: iso(row.expires_at),
    ...(row.committed_at === null ? {} : { committedAt: iso(row.committed_at) }),
    ...(row.released_at === null ? {} : { releasedAt: iso(row.released_at) }),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

function money(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Persisted VND value is unsafe");
  return parsed;
}

function iso(value: Date | string): string { return (value instanceof Date ? value : new Date(value)).toISOString(); }
function enumValue<const T extends readonly string[]>(value: string, allowed: T): T[number] {
  if (!allowed.includes(value)) throw new Error(`Invalid persisted enum: ${value}`);
  return value as T[number];
}
