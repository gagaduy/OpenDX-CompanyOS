// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  PaymentAgeBucket,
  PaymentDiscrepancyComparison,
  PaymentDiscrepancyFact,
  PaymentHealthQuery,
  PaymentHealthRepository,
  PendingPaymentHealth,
  ProviderEvidenceFacts,
} from "../../../application/services/interfaces/payment-health-reader";

type Row = Record<string, unknown>;

export class PostgresqlPaymentHealthRepository implements PaymentHealthRepository {
  async readPendingPayments(
    session: DatabaseSession,
    query: PaymentHealthQuery,
  ): Promise<PendingPaymentHealth> {
    const result = await session.query<Row>(`
      WITH pending AS (
        SELECT status,expected_amount_vnd,created_at,
          CASE
            WHEN created_at>$3::timestamptz-interval '15 minutes' THEN 'under_15_minutes'
            WHEN created_at>$3::timestamptz-interval '60 minutes' THEN '15_to_60_minutes'
            WHEN created_at>$3::timestamptz-interval '24 hours' THEN '1_to_24_hours'
            ELSE 'over_24_hours'
          END AS age_bucket
        FROM payments
        WHERE status IN ('created','pending_provider')
          AND created_at>=$1::timestamptz AND created_at<$2::timestamptz
      ), totals AS (
        SELECT count(*)::bigint AS pending_count,
          COALESCE(sum(expected_amount_vnd),0)::bigint AS pending_expected_amount_vnd,
          min(created_at) AS oldest_created_at
        FROM pending
      ), statuses AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('status',status,'count',count)
          ORDER BY status),'[]'::jsonb) AS rows
        FROM (SELECT status,count(*)::bigint AS count FROM pending GROUP BY status) grouped
      ), buckets AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'bucket',age_bucket,'count',count,'amountVnd',amount_vnd)
          ORDER BY CASE age_bucket
            WHEN 'under_15_minutes' THEN 1 WHEN '15_to_60_minutes' THEN 2
            WHEN '1_to_24_hours' THEN 3 ELSE 4 END),'[]'::jsonb) AS rows
        FROM (SELECT age_bucket,count(*)::bigint AS count,
          COALESCE(sum(expected_amount_vnd),0)::bigint AS amount_vnd
          FROM pending GROUP BY age_bucket) grouped
      )
      SELECT totals.*,statuses.rows AS status_rows,buckets.rows AS bucket_rows
      FROM totals CROSS JOIN statuses CROSS JOIN buckets`, [query.start, query.end, query.asOf]);
    const row = result.rows[0] ?? {};
    return {
      pendingCount: integer(row.pending_count),
      pendingExpectedAmountVnd: integer(row.pending_expected_amount_vnd),
      oldestCreatedAt: nullableTimestamp(row.oldest_created_at),
      countsByStatus: jsonRows(row.status_rows).map((item) => ({
        status: String(item.status),
        count: integer(item.count),
      })),
      ageBuckets: jsonRows(row.bucket_rows).map((item) => ({
        bucket: ageBucket(item.bucket),
        count: integer(item.count),
        amountVnd: integer(item.amountVnd),
      })),
    };
  }

  async readReconciliationDiscrepancies(
    session: DatabaseSession,
    query: PaymentHealthQuery,
  ) {
    const values = [query.start, query.end] as const;
    const summaryResult = await session.query<Row>(`
      SELECT count(*)::bigint AS reconciliation_count,
        count(*) FILTER (WHERE comparison_result='mismatch')::bigint AS mismatch_count,
        count(*) FILTER (WHERE comparison_result='provider_error')::bigint AS provider_error_count,
        count(*) FILTER (WHERE comparison_result='unsupported')::bigint AS unsupported_count,
        COALESCE(sum(CASE WHEN provider_amount_vnd IS NULL THEN 0
          ELSE abs(internal_amount_vnd-provider_amount_vnd) END),0)::bigint AS amount_difference_vnd
      FROM payment_reconciliations
      WHERE comparison_result IN ('mismatch','provider_error','unsupported')
        AND created_at>=$1::timestamptz AND created_at<$2::timestamptz`, values);
    const evidenceResult = await session.query<Row>(`
      SELECT id,payment_id,comparison_result,internal_status,provider_status,
        internal_amount_vnd,provider_amount_vnd,created_at
      FROM payment_reconciliations
      WHERE comparison_result IN ('mismatch','provider_error','unsupported')
        AND created_at>=$1::timestamptz AND created_at<$2::timestamptz
        AND ($3::timestamptz IS NULL OR (created_at,id)>($3::timestamptz,$4::uuid))
      ORDER BY created_at,id LIMIT $5`, [
      ...values,
      query.after?.[0] ?? null,
      query.after?.[1] ?? null,
      query.limit,
    ]);
    const summary = summaryResult.rows[0] ?? {};
    return {
      summary: {
        reconciliationCount: integer(summary.reconciliation_count),
        mismatchCount: integer(summary.mismatch_count),
        providerErrorCount: integer(summary.provider_error_count),
        unsupportedCount: integer(summary.unsupported_count),
        amountDifferenceVnd: integer(summary.amount_difference_vnd),
      },
      evidence: evidenceResult.rows.map(mapDiscrepancy),
    };
  }

  async readProviderEvidenceStatus(
    session: DatabaseSession,
    query: PaymentHealthQuery,
  ): Promise<ProviderEvidenceFacts> {
    const eventResult = await session.query<Row>(`
      WITH events AS (
        SELECT authentication_result,processing_result,normalized_state
        FROM payment_events
        WHERE received_at>=$1::timestamptz AND received_at<$2::timestamptz
      ), totals AS (
        SELECT count(*) FILTER (WHERE authentication_result='authenticated')::bigint
            AS authenticated_events,
          count(*) FILTER (WHERE authentication_result='rejected')::bigint AS rejected_events,
          count(*) FILTER (WHERE processing_result='applied')::bigint AS applied_events,
          count(*) FILTER (WHERE processing_result='review_required')::bigint
            AS review_required_events
        FROM events
      ), states AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('status',normalized_state,'count',count)
          ORDER BY CASE normalized_state WHEN 'paid' THEN 1 WHEN 'unsupported' THEN 2 ELSE 3 END),
          '[]'::jsonb) AS state_rows
        FROM (SELECT normalized_state,count(*)::bigint AS count
          FROM events GROUP BY normalized_state) grouped
      )
      SELECT totals.*,states.state_rows FROM totals CROSS JOIN states`, [query.start, query.end]);
    const coverageResult = await session.query<Row>(`
      SELECT count(*)::bigint AS total_payments,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM payment_events event
          WHERE event.payment_id=payment.id
            AND event.authentication_result='authenticated'
            AND event.received_at>=$1::timestamptz AND event.received_at<$2::timestamptz
        ))::bigint AS matched_payments
      FROM payments payment
      WHERE payment.created_at>=$1::timestamptz AND payment.created_at<$2::timestamptz`,
    [query.start, query.end]);
    const events = eventResult.rows[0] ?? {};
    const coverage = coverageResult.rows[0] ?? {};
    return {
      authenticatedEvents: integer(events.authenticated_events),
      rejectedEvents: integer(events.rejected_events),
      appliedEvents: integer(events.applied_events),
      reviewRequiredEvents: integer(events.review_required_events),
      matchedPayments: integer(coverage.matched_payments),
      totalPayments: integer(coverage.total_payments),
      countsByNormalizedState: collapseStateRows(jsonRows(events.state_rows)),
    };
  }
}

function mapDiscrepancy(row: Row): PaymentDiscrepancyFact {
  return {
    reconciliationId: String(row.id),
    paymentId: String(row.payment_id),
    comparisonResult: comparison(row.comparison_result),
    internalStatus: String(row.internal_status),
    providerStatus: row.provider_status === null ? null : String(row.provider_status),
    internalAmountVnd: integer(row.internal_amount_vnd),
    providerAmountVnd: row.provider_amount_vnd === null ? null : integer(row.provider_amount_vnd),
    createdAt: timestamp(row.created_at),
  };
}

function collapseStateRows(rows: readonly Row[]) {
  return rows.map((row) => ({ status: String(row.status), count: integer(row.count) }));
}

function jsonRows(value: unknown): readonly Row[] {
  if (!Array.isArray(value)) throw new RangeError("Invalid Payment health aggregate");
  return value as readonly Row[];
}

function integer(value: unknown): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError("Unsafe Payment health value");
  return result;
}

function timestamp(value: unknown): string {
  const result = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(result.getTime())) throw new RangeError("Invalid Payment health timestamp");
  return result.toISOString();
}

function nullableTimestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : timestamp(value);
}

function comparison(value: unknown): PaymentDiscrepancyComparison {
  if (value !== "mismatch" && value !== "provider_error" && value !== "unsupported") {
    throw new RangeError("Invalid Payment discrepancy comparison");
  }
  return value;
}

function ageBucket(value: unknown): PaymentAgeBucket {
  if (
    value !== "under_15_minutes" && value !== "15_to_60_minutes"
    && value !== "1_to_24_hours" && value !== "over_24_hours"
  ) throw new RangeError("Invalid Payment age bucket");
  return value;
}
