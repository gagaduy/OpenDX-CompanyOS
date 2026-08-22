// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type {
  AgenticAnalyticsReader,
  AgenticAnalyticsWindow,
  AgenticCustomerActivity,
  AgenticCustomerSegmentSnapshot,
  AgenticVariantSales,
} from "../../../application/services/interfaces/agentic-analytics-reader";
import { ReportingApplicationError } from "../../../application/services/reporting-application.error";

const MAXIMUM_RESULT_BYTES = 256 * 1024;

interface VariantSalesRow {
  readonly variant_id: string;
  readonly window_date: string | Date;
  readonly paid_quantity: string | number;
  readonly paid_revenue_vnd: string | number;
  readonly current_unit_price_vnd: string | number;
}

interface SegmentSnapshotRow {
  readonly segment_key: AgenticCustomerSegmentSnapshot["segmentKey"];
  readonly lifetime_value_bucket: AgenticCustomerSegmentSnapshot["lifetimeValueBucket"];
  readonly recency_bucket: AgenticCustomerSegmentSnapshot["recencyBucket"];
  readonly customer_count: string | number;
  readonly repeat_customer_count: string | number;
  readonly open_followup_count: string | number;
  readonly customers_with_open_followup_count: string | number;
  readonly lifetime_paid_revenue_vnd: string | number;
  readonly as_of_date: string | Date;
}

interface CustomerActivityRow {
  readonly activity_date: string | Date;
  readonly new_customer_count: string | number;
  readonly paid_customer_count: string | number;
  readonly paid_revenue_vnd: string | number;
}

export class PostgresqlAgenticAnalyticsReader implements AgenticAnalyticsReader {
  constructor(private readonly transactions: TransactionRunner) {}

  getVariantSales(window: AgenticAnalyticsWindow): Promise<readonly AgenticVariantSales[]> {
    return this.read(
      `SELECT variant_id,window_date,
         sum(paid_quantity)::bigint AS paid_quantity,
         sum(paid_revenue_vnd)::bigint AS paid_revenue_vnd,
         max(current_unit_price_vnd)::bigint AS current_unit_price_vnd
       FROM reporting_agentic_variant_sales_v1
       WHERE (window_date>=($1::timestamptz AT TIME ZONE $3)::date
         AND window_date<($2::timestamptz AT TIME ZONE $3)::date)
         OR (window_date=(CURRENT_TIMESTAMP AT TIME ZONE $3)::date
           AND paid_quantity=0 AND paid_revenue_vnd=0)
       GROUP BY variant_id,window_date
       ORDER BY window_date,variant_id`,
      [window.start, window.end, window.timezone],
      (row: VariantSalesRow) => ({
        variantId: row.variant_id,
        windowDate: dateOnly(row.window_date),
        paidQuantity: safeInteger(row.paid_quantity),
        paidRevenueVnd: safeInteger(row.paid_revenue_vnd),
        currentUnitPriceVnd: safeInteger(row.current_unit_price_vnd),
      }),
    );
  }

  getCustomerSegmentSnapshot(
    asOf: string,
  ): Promise<readonly AgenticCustomerSegmentSnapshot[]> {
    return this.read(
      `SELECT segment_key,lifetime_value_bucket,recency_bucket,customer_count,
         repeat_customer_count,open_followup_count,customers_with_open_followup_count,
         lifetime_paid_revenue_vnd,as_of_date
       FROM reporting_agentic_customer_segment_snapshot_v2
       WHERE as_of_date=($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
       ORDER BY segment_key,recency_bucket`,
      [asOf],
      (row: SegmentSnapshotRow) => ({
        segmentKey: row.segment_key,
        lifetimeValueBucket: row.lifetime_value_bucket,
        recencyBucket: row.recency_bucket,
        customerCount: safeInteger(row.customer_count),
        repeatCustomerCount: safeInteger(row.repeat_customer_count),
        openFollowupCount: safeInteger(row.open_followup_count),
        customersWithOpenFollowupCount: safeInteger(row.customers_with_open_followup_count),
        lifetimePaidRevenueVnd: safeInteger(row.lifetime_paid_revenue_vnd),
        asOfDate: dateOnly(row.as_of_date),
      }),
    );
  }

  getCustomerActivity(
    window: AgenticAnalyticsWindow,
  ): Promise<readonly AgenticCustomerActivity[]> {
    return this.read(
      `SELECT activity_date,new_customer_count,paid_customer_count,paid_revenue_vnd
       FROM reporting_agentic_customer_activity_daily_v1
       WHERE activity_date>=($1::timestamptz AT TIME ZONE $3)::date
         AND activity_date<($2::timestamptz AT TIME ZONE $3)::date
       ORDER BY activity_date`,
      [window.start, window.end, window.timezone],
      (row: CustomerActivityRow) => ({
        activityDate: dateOnly(row.activity_date),
        newCustomerCount: safeInteger(row.new_customer_count),
        paidCustomerCount: safeInteger(row.paid_customer_count),
        paidRevenueVnd: safeInteger(row.paid_revenue_vnd),
      }),
    );
  }

  private read<Row extends object, Result>(
    statement: string,
    values: readonly unknown[],
    map: (row: Row) => Result,
  ): Promise<readonly Result[]> {
    return this.transactions.runReadOnly(async (session: DatabaseSession) => {
      await session.query("SET LOCAL statement_timeout = '750ms'");
      await session.query("SET LOCAL lock_timeout = '100ms'");
      const result = (await session.query<Row>(statement, values)).rows.map(map);
      if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAXIMUM_RESULT_BYTES) {
        throw new ReportingApplicationError(
          "UNSAFE_REPORTING_VALUE",
          "Agentic analytics result exceeds the safe output limit",
        );
      }
      return result;
    });
  }
}

function safeInteger(value: string | number): number {
  const mapped = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(mapped) || mapped < 0) {
    throw new ReportingApplicationError(
      "UNSAFE_REPORTING_VALUE",
      "Agentic analytics returned an unsafe numeric value",
    );
  }
  return mapped;
}

function dateOnly(value: string | Date): string {
  const mapped = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mapped)) {
    throw new ReportingApplicationError(
      "UNSAFE_REPORTING_VALUE",
      "Agentic analytics returned an unsafe date value",
    );
  }
  return mapped;
}
