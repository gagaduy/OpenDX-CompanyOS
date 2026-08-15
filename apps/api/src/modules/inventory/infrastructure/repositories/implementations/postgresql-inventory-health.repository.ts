// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  InventoryCurrentStockFact,
  InventoryHealthRepository,
  InventoryReservationAnomaly,
  InventoryReservationAnomalyQuery,
  InventoryReservationAnomalyReason,
  InventoryReservationAnomalyResult,
} from "../../../application/services/interfaces/inventory-health-reader";

type Row = Record<string, unknown>;

const anomalyCte = `WITH classified AS (
  SELECT reservation.id AS reservation_id,reservation.variant_id,
    reservation.quantity,reservation.status,reservation.expires_at,
    CASE
      WHEN reservation.status='active' AND reservation.expires_at<=$3::timestamptz
        THEN reservation.expires_at
      WHEN reservation.status<>'active' AND reservation.finalized_at IS NULL
        AND reservation.updated_at<=$3::timestamptz THEN reservation.updated_at
      WHEN reservation.status='active' AND reservation.finalized_at IS NOT NULL
        AND reservation.finalized_at<=$3::timestamptz THEN reservation.finalized_at
    END AS detected_at,
    CASE
      WHEN reservation.status='active' AND reservation.expires_at<=$3::timestamptz
        THEN 'EXPIRED_ACTIVE'
      WHEN reservation.status<>'active' AND reservation.finalized_at IS NULL
        AND reservation.updated_at<=$3::timestamptz THEN 'FINALIZED_TIMESTAMP_MISSING'
      WHEN reservation.status='active' AND reservation.finalized_at IS NOT NULL
        AND reservation.finalized_at<=$3::timestamptz THEN 'STALE_PENDING'
    END AS reason_code
  FROM inventory_reservations reservation
), anomalies AS (
  SELECT * FROM classified
  WHERE detected_at>=$1::timestamptz AND detected_at<$2::timestamptz
)`;

export class PostgresqlInventoryHealthRepository implements InventoryHealthRepository {
  async readCurrentStock(
    session: DatabaseSession,
    minimumAvailable?: number,
  ): Promise<readonly InventoryCurrentStockFact[]> {
    const result = await session.query<Row>(`
      SELECT variant_id,on_hand,reserved,(on_hand-reserved)::bigint AS available
      FROM inventory_items
      WHERE $1::integer IS NULL OR on_hand-reserved>=$1
      ORDER BY variant_id`, [minimumAvailable ?? null]);
    return result.rows.map((row) => ({
      variantId: String(row.variant_id),
      onHand: integer(row.on_hand),
      reserved: integer(row.reserved),
      available: integer(row.available),
    }));
  }

  async readReservationAnomalies(
    session: DatabaseSession,
    query: InventoryReservationAnomalyQuery,
  ): Promise<Omit<InventoryReservationAnomalyResult, "nextCursor">> {
    const baseValues = [query.start, query.end, query.asOf] as const;
    const summaryResult = await session.query<Row>(`${anomalyCte}
      SELECT count(*) FILTER (WHERE reason_code='EXPIRED_ACTIVE')::bigint
          AS expired_active_count,
        count(*) FILTER (WHERE reason_code='FINALIZED_TIMESTAMP_MISSING')::bigint
          AS finalized_without_timestamp_count,
        count(*) FILTER (WHERE reason_code='STALE_PENDING')::bigint
          AS stale_pending_count,
        COALESCE(sum(quantity),0)::bigint AS affected_units
      FROM anomalies`, baseValues);
    const evidenceResult = await session.query<Row>(`${anomalyCte}
      SELECT reservation_id,variant_id,quantity,status,expires_at,detected_at,reason_code
      FROM anomalies
      WHERE ($4::timestamptz IS NULL
        OR (detected_at,reservation_id)>($4::timestamptz,$5::uuid))
      ORDER BY detected_at,reservation_id LIMIT $6`, [
      ...baseValues,
      query.after?.detectedAt ?? null,
      query.after?.reservationId ?? null,
      query.limit,
    ]);
    const summary = summaryResult.rows[0] ?? {};
    return {
      summary: {
        expiredActiveCount: integer(summary.expired_active_count),
        finalizedWithoutTimestampCount: integer(summary.finalized_without_timestamp_count),
        stalePendingCount: integer(summary.stale_pending_count),
        affectedUnits: integer(summary.affected_units),
      },
      evidence: evidenceResult.rows.map(mapAnomaly),
    };
  }
}

function mapAnomaly(row: Row): InventoryReservationAnomaly {
  return {
    reservationId: String(row.reservation_id),
    variantId: String(row.variant_id),
    quantity: integer(row.quantity),
    status: String(row.status),
    expiresAt: timestamp(row.expires_at),
    detectedAt: timestamp(row.detected_at),
    reasonCode: reason(row.reason_code),
  };
}

function integer(value: unknown): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError("Unsafe Inventory health value");
  return result;
}

function timestamp(value: unknown): string {
  const result = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(result.getTime())) throw new RangeError("Invalid Inventory health timestamp");
  return result.toISOString();
}

function reason(value: unknown): InventoryReservationAnomalyReason {
  if (
    value !== "EXPIRED_ACTIVE"
    && value !== "FINALIZED_TIMESTAMP_MISSING"
    && value !== "STALE_PENDING"
  ) throw new RangeError("Invalid Inventory anomaly reason");
  return value;
}
