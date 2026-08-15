// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { OrderStatus } from "../../../domain/entities/order";
import { orderStatusTransitionPairs } from "../../../domain/services/order-rules";
import type {
  OrderExpiryRiskFact,
  OrderExpiryRiskResult,
  OrderHealthQuery,
  OrderHealthRepository,
  OrderInvalidEvidence,
  OrderInvalidReason,
  OrderInvalidStateResult,
  OrderStalledFact,
  OrderStalledReason,
  OrderStalledResult,
  SupportOrderContext,
} from "../../../application/services/interfaces/order-health-reader";

type Row = Record<string, unknown>;

const stalledWhere = `status IN ('paid','processing','ready_for_fulfillment')
  AND created_at>=$1::timestamptz AND created_at<$2::timestamptz
  AND updated_at<=$3::timestamptz-$4::integer*interval '1 minute'`;

const invalidCte = `WITH reason_rows AS (
  SELECT order_record.id AS order_id,order_record.status,order_record.version,
    order_record.updated_at AS detected_at,reason.reason_code
  FROM orders order_record
  CROSS JOIN LATERAL (VALUES
    ('PAID_TIMESTAMP_MISSING',
      order_record.status IN ('paid','processing','ready_for_fulfillment','completed')
        AND order_record.paid_at IS NULL),
    ('COMPLETED_TIMESTAMP_MISSING',
      order_record.status='completed' AND order_record.completed_at IS NULL),
    ('TERMINAL_TIMESTAMP_CONFLICT',
      (order_record.status IN ('pending_payment','canceled','expired')
        AND (order_record.paid_at IS NOT NULL OR order_record.completed_at IS NOT NULL))
      OR (order_record.status<>'completed' AND order_record.completed_at IS NOT NULL))
  ) reason(reason_code,matches)
  WHERE reason.matches AND order_record.updated_at>=$1::timestamptz
    AND order_record.updated_at<$2::timestamptz AND order_record.updated_at<=$3::timestamptz
  UNION ALL
  SELECT order_record.id,order_record.status,order_record.version,
    history.occurred_at,'ILLEGAL_STATUS_TRANSITION'
  FROM order_status_history history JOIN orders order_record ON order_record.id=history.order_id
  WHERE history.occurred_at>=$1::timestamptz AND history.occurred_at<$2::timestamptz
    AND history.occurred_at<=$3::timestamptz
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset($4::jsonb)
        AS allowed(previous_status text,new_status text)
      WHERE allowed.previous_status IS NOT DISTINCT FROM history.previous_status
        AND allowed.new_status=history.new_status
    )
), invalid_orders AS (
  SELECT order_id,max(status) AS status,max(version)::integer AS version,
    max(detected_at) AS detected_at,array_agg(DISTINCT reason_code) AS reason_codes
  FROM reason_rows GROUP BY order_id
)`;

export class PostgresqlOrderHealthRepository implements OrderHealthRepository {
  async readStalledOrders(
    session: DatabaseSession,
    query: OrderHealthQuery & { readonly minimumAgeMinutes: number },
  ): Promise<Omit<OrderStalledResult, "nextCursor" | "evidence"> & {
    readonly evidence: readonly OrderStalledFact[];
  }> {
    const values = [query.start, query.end, query.asOf, query.minimumAgeMinutes] as const;
    const summaryResult = await session.query<Row>(`
      SELECT count(*)::bigint AS stalled_count,COALESCE(sum(total_vnd),0)::bigint
          AS stalled_total_vnd,
        count(*) FILTER (WHERE status='paid')::bigint AS paid_count,
        count(*) FILTER (WHERE status='processing')::bigint AS processing_count,
        count(*) FILTER (WHERE status='ready_for_fulfillment')::bigint AS ready_count
      FROM orders WHERE ${stalledWhere}`, values);
    const evidenceResult = await session.query<Row>(`
      SELECT id AS order_id,status,created_at,updated_at,total_vnd
      FROM orders WHERE ${stalledWhere}
        AND ($5::timestamptz IS NULL OR (updated_at,id)>($5::timestamptz,$6::uuid))
      ORDER BY updated_at,id LIMIT $7`, [
      ...values,
      stringAfter(query.after, 0),
      stringAfter(query.after, 1),
      query.limit,
    ]);
    const summary = summaryResult.rows[0] ?? {};
    return {
      summary: {
        stalledCount: integer(summary.stalled_count),
        stalledTotalVnd: integer(summary.stalled_total_vnd),
        countsByStatus: statusCounts([
          ["paid", summary.paid_count],
          ["processing", summary.processing_count],
          ["ready_for_fulfillment", summary.ready_count],
        ]),
      },
      evidence: evidenceResult.rows.map((row) => ({
        orderId: String(row.order_id),
        status: stalledStatus(row.status),
        createdAt: timestamp(row.created_at),
        updatedAt: timestamp(row.updated_at),
        totalVnd: integer(row.total_vnd),
      })),
    };
  }

  async readInvalidStateEvidence(
    session: DatabaseSession,
    query: OrderHealthQuery,
  ): Promise<Omit<OrderInvalidStateResult, "nextCursor">> {
    const baseValues = [
      query.start,
      query.end,
      query.asOf,
      JSON.stringify(orderStatusTransitionPairs().map(({ previousStatus, newStatus }) => ({
        previous_status: previousStatus,
        new_status: newStatus,
      }))),
    ] as const;
    const summaryResult = await session.query<Row>(`${invalidCte}, expanded AS (
        SELECT order_id,unnest(reason_codes) AS reason_code FROM invalid_orders
      )
      SELECT (SELECT count(*)::bigint FROM invalid_orders) AS invalid_count,
        count(*) FILTER (WHERE reason_code='PAID_TIMESTAMP_MISSING')::bigint AS paid_missing,
        count(*) FILTER (WHERE reason_code='COMPLETED_TIMESTAMP_MISSING')::bigint AS completed_missing,
        count(*) FILTER (WHERE reason_code='TERMINAL_TIMESTAMP_CONFLICT')::bigint AS terminal_conflict,
        count(*) FILTER (WHERE reason_code='ILLEGAL_STATUS_TRANSITION')::bigint AS illegal_transition
      FROM expanded`, baseValues);
    const evidenceResult = await session.query<Row>(`${invalidCte}
      SELECT order_id,status,version,detected_at,reason_codes FROM invalid_orders
      WHERE ($5::timestamptz IS NULL OR (detected_at,order_id)>($5::timestamptz,$6::uuid))
      ORDER BY detected_at,order_id LIMIT $7`, [
      ...baseValues,
      stringAfter(query.after, 0),
      stringAfter(query.after, 1),
      query.limit,
    ]);
    const summary = summaryResult.rows[0] ?? {};
    return {
      summary: {
        invalidCount: integer(summary.invalid_count),
        reasonCounts: reasonCounts([
          ["PAID_TIMESTAMP_MISSING", summary.paid_missing],
          ["COMPLETED_TIMESTAMP_MISSING", summary.completed_missing],
          ["TERMINAL_TIMESTAMP_CONFLICT", summary.terminal_conflict],
          ["ILLEGAL_STATUS_TRANSITION", summary.illegal_transition],
        ]),
      },
      evidence: evidenceResult.rows.map(mapInvalidEvidence),
    };
  }

  async readExpiryRisk(
    session: DatabaseSession,
    query: OrderHealthQuery & { readonly horizonMinutes: number },
  ): Promise<Omit<OrderExpiryRiskResult, "nextCursor" | "evidence"> & {
    readonly evidence: readonly OrderExpiryRiskFact[];
  }> {
    const where = `status='pending_payment'
      AND reservation_expires_at>=GREATEST($1::timestamptz,$3::timestamptz)
      AND reservation_expires_at<LEAST(
        $2::timestamptz,$3::timestamptz+$4::integer*interval '1 minute'
      )`;
    const values = [query.start, query.end, query.asOf, query.horizonMinutes] as const;
    const summaryResult = await session.query<Row>(`
      SELECT count(*)::bigint AS at_risk_count,COALESCE(sum(total_vnd),0)::bigint
          AS at_risk_total_vnd,min(reservation_expires_at) AS earliest_expiry_at
      FROM orders WHERE ${where}`, values);
    const evidenceResult = await session.query<Row>(`
      SELECT id AS order_id,status,total_vnd,reservation_expires_at
      FROM orders WHERE ${where}
        AND ($5::timestamptz IS NULL
          OR (reservation_expires_at,id)>($5::timestamptz,$6::uuid))
      ORDER BY reservation_expires_at,id LIMIT $7`, [
      ...values,
      stringAfter(query.after, 0),
      stringAfter(query.after, 1),
      query.limit,
    ]);
    const summary = summaryResult.rows[0] ?? {};
    return {
      summary: {
        atRiskCount: integer(summary.at_risk_count),
        atRiskTotalVnd: integer(summary.at_risk_total_vnd),
        earliestExpiryAt: nullableTimestamp(summary.earliest_expiry_at),
      },
      evidence: evidenceResult.rows.map((row) => ({
        orderId: String(row.order_id),
        status: "pending_payment" as const,
        totalVnd: integer(row.total_vnd),
        reservationExpiresAt: timestamp(row.reservation_expires_at),
      })),
    };
  }

  async findSupportContext(
    session: DatabaseSession,
    orderId: string,
  ): Promise<(Omit<SupportOrderContext, "backendConfirmedPaid"> & {
    readonly paidAt?: string;
  }) | undefined> {
    const result = await session.query<Row>(`
      SELECT id AS order_id,status,created_at,reservation_expires_at,total_vnd,paid_at
      FROM orders WHERE id=$1`, [orderId]);
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      orderId: String(row.order_id),
      status: status(row.status),
      createdAt: timestamp(row.created_at),
      reservationExpiresAt: timestamp(row.reservation_expires_at),
      totalVnd: integer(row.total_vnd),
      ...(row.paid_at === null ? {} : { paidAt: timestamp(row.paid_at) }),
    };
  }
}

function mapInvalidEvidence(row: Row): OrderInvalidEvidence {
  return {
    orderId: String(row.order_id),
    status: status(row.status),
    version: integer(row.version),
    detectedAt: timestamp(row.detected_at),
    reasonCodes: stringArray(row.reason_codes).map(invalidReason),
  };
}

function statusCounts(values: readonly (readonly [string, unknown])[]) {
  return values.flatMap(([statusValue, count]) => {
    const parsed = integer(count);
    return parsed === 0 ? [] : [{ status: statusValue, count: parsed }];
  });
}

function reasonCounts(values: readonly (readonly [OrderInvalidReason, unknown])[]) {
  return values.flatMap(([reasonCode, count]) => {
    const parsed = integer(count);
    return parsed === 0 ? [] : [{ reasonCode, count: parsed }];
  });
}

function stringAfter(value: readonly unknown[] | undefined, index: number): string | null {
  const selected = value?.[index];
  return typeof selected === "string" ? selected : null;
}

function integer(value: unknown): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError("Unsafe Order health value");
  return result;
}

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid Order health timestamp");
  return date.toISOString();
}

function nullableTimestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : timestamp(value);
}

function status(value: unknown): OrderStatus {
  const result = String(value) as OrderStatus;
  if (![
    "pending_payment", "paid", "processing", "ready_for_fulfillment",
    "completed", "canceled", "expired",
  ].includes(result)) throw new RangeError("Invalid Order health status");
  return result;
}

function stalledStatus(value: unknown): OrderStalledFact["status"] {
  const result = status(value);
  if (result !== "paid" && result !== "processing" && result !== "ready_for_fulfillment") {
    throw new RangeError("Invalid stalled Order status");
  }
  return result;
}

function invalidReason(value: string): OrderInvalidReason {
  if (![
    "PAID_TIMESTAMP_MISSING", "COMPLETED_TIMESTAMP_MISSING",
    "TERMINAL_TIMESTAMP_CONFLICT", "ILLEGAL_STATUS_TRANSITION",
  ].includes(value)) throw new RangeError("Invalid Order invariant reason");
  return value as OrderInvalidReason;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(String) : [];
}
