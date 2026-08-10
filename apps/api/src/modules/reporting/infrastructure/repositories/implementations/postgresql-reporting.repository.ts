// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  CustomerReportDto,
  OperationsReportDto,
  ProductReportDto,
  ReportingQueryRange,
} from "../../../application/dtos/reporting.dto";
import type {
  CommerceReportFacts,
  ReportingRepository,
} from "../../../application/repositories/interfaces/reporting.repository";

interface Queryable {
  query<Row extends object>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }>;
}

export class PostgresqlReportingRepository implements ReportingRepository {
  constructor(private readonly database: Queryable) {}

  async getCommerce(range: ReportingQueryRange): Promise<CommerceReportFacts> {
    const [paid, created, statuses] = await Promise.all([
      this.database.query<{ revenue: string; count: string }>(
        `SELECT COALESCE(SUM(total_vnd),0)::text AS revenue, COUNT(*)::text AS count
         FROM orders
         WHERE paid_at >= $1 AND paid_at < $2
           AND status IN ('paid','processing','ready_for_fulfillment','completed')`,
        [range.start, range.end],
      ),
      this.database.query<{ created_count: string; paid_count: string }>(
        `SELECT COUNT(*)::text AS created_count,
                COUNT(*) FILTER (
                  WHERE paid_at IS NOT NULL
                    AND status IN ('paid','processing','ready_for_fulfillment','completed')
                )::text AS paid_count
         FROM orders
         WHERE created_at >= $1 AND created_at < $2`,
        [range.start, range.end],
      ),
      this.database.query<{ status: string; count: string }>(
        `SELECT p.status, COUNT(*)::text AS count
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.created_at >= $1 AND o.created_at < $2
         GROUP BY p.status
         ORDER BY p.status = 'paid' DESC, p.status ASC`,
        [range.start, range.end],
      ),
    ]);

    return {
      grossPaidRevenueVnd: parseSafeInteger(paid.rows[0]?.revenue ?? "0"),
      paidOrderCount: parseSafeInteger(paid.rows[0]?.count ?? "0"),
      createdOrderCount: parseSafeInteger(created.rows[0]?.created_count ?? "0"),
      paidCreatedOrderCount: parseSafeInteger(created.rows[0]?.paid_count ?? "0"),
      paymentStatuses: statuses.rows.map((row) => ({
        status: row.status,
        count: parseSafeInteger(row.count),
      })),
    };
  }

  async getProducts(range: ReportingQueryRange): Promise<ProductReportDto> {
    const [sales, inventory] = await Promise.all([
      this.database.query<{
        sku: string;
        product_title: string;
        quantity_sold: string;
        paid_revenue_vnd: string;
      }>(
        `SELECT ol.sku, ol.product_title,
                COALESCE(SUM(ol.quantity),0)::text AS quantity_sold,
                COALESCE(SUM(ol.line_total_vnd),0)::text AS paid_revenue_vnd
         FROM order_lines ol
         JOIN orders o ON o.id = ol.order_id
         WHERE o.paid_at >= $1 AND o.paid_at < $2
           AND o.status IN ('paid','processing','ready_for_fulfillment','completed')
         GROUP BY ol.sku, ol.product_title
         ORDER BY paid_revenue_vnd DESC, ol.sku ASC`,
        [range.start, range.end],
      ),
      this.database.query<{
        on_hand: string;
        reserved: string;
        available: string;
        sold_out_count: string;
      }>(
        `SELECT COALESCE(SUM(on_hand),0)::text AS on_hand,
                COALESCE(SUM(reserved),0)::text AS reserved,
                COALESCE(SUM(on_hand - reserved),0)::text AS available,
                COUNT(*) FILTER (WHERE on_hand - reserved = 0)::text AS sold_out_count
         FROM inventory_items`,
      ),
    ]);

    return {
      items: sales.rows.map((row) => ({
        sku: row.sku,
        productTitle: row.product_title,
        quantitySold: parseSafeInteger(row.quantity_sold),
        paidRevenueVnd: parseSafeInteger(row.paid_revenue_vnd),
      })),
      inventory: {
        onHand: parseSafeInteger(inventory.rows[0]?.on_hand ?? "0"),
        reserved: parseSafeInteger(inventory.rows[0]?.reserved ?? "0"),
        available: parseSafeInteger(inventory.rows[0]?.available ?? "0"),
        soldOutCount: parseSafeInteger(inventory.rows[0]?.sold_out_count ?? "0"),
      },
    };
  }

  async getCustomers(_range: ReportingQueryRange): Promise<CustomerReportDto> {
    const [counts, lifetime, buckets] = await Promise.all([
      this.database.query<{ total: string; repeat: string }>(
        `WITH paid_by_customer AS (
           SELECT customer_id, COUNT(*) AS paid_count
           FROM orders
           WHERE paid_at IS NOT NULL
             AND status IN ('paid','processing','ready_for_fulfillment','completed')
           GROUP BY customer_id
         )
         SELECT (SELECT COUNT(*) FROM customers)::text AS total,
                COUNT(*) FILTER (WHERE paid_count >= 2)::text AS repeat
         FROM paid_by_customer`,
      ),
      this.database.query<{ value: string }>(
        `SELECT COALESCE(SUM(total_vnd),0)::text AS value
         FROM orders
         WHERE paid_at IS NOT NULL
           AND status IN ('paid','processing','ready_for_fulfillment','completed')`,
      ),
      this.database.query<{ bucket: "zero" | "low" | "mid" | "high"; count: string }>(
        `WITH customer_ltv AS (
           SELECT c.id, COALESCE(SUM(o.total_vnd),0) AS value
           FROM customers c
           LEFT JOIN orders o ON o.customer_id = c.id
             AND o.paid_at IS NOT NULL
             AND o.status IN ('paid','processing','ready_for_fulfillment','completed')
           GROUP BY c.id
         ), bucketed AS (
           SELECT CASE
                    WHEN value = 0 THEN 'zero'
                    WHEN value < 5000000 THEN 'low'
                    WHEN value < 50000000 THEN 'mid'
                    ELSE 'high'
                  END AS bucket
           FROM customer_ltv
         )
         SELECT bucket, COUNT(*)::text AS count
         FROM bucketed
         GROUP BY bucket
         ORDER BY CASE bucket WHEN 'low' THEN 1 WHEN 'mid' THEN 2 WHEN 'high' THEN 3 ELSE 4 END`,
      ),
    ]);

    return {
      totalRegisteredCustomers: parseSafeInteger(counts.rows[0]?.total ?? "0"),
      repeatCustomers: parseSafeInteger(counts.rows[0]?.repeat ?? "0"),
      lifetimeValueVnd: parseSafeInteger(lifetime.rows[0]?.value ?? "0"),
      lifetimeValueBuckets: buckets.rows.map((row) => ({
        bucket: row.bucket,
        count: parseSafeInteger(row.count),
      })),
    };
  }

  async getOperations(range: ReportingQueryRange): Promise<OperationsReportDto> {
    const result = await this.database.query<{
      open_tickets: string;
      overdue_followups: string;
      sla_breaches: string;
    }>(
      `WITH ticket_sla AS (
         SELECT *,
                created_at
                  + CASE priority
                      WHEN 'urgent' THEN INTERVAL '2 hours'
                      WHEN 'high' THEN INTERVAL '8 hours'
                      WHEN 'normal' THEN INTERVAL '24 hours'
                      ELSE INTERVAL '72 hours'
                    END
                  + make_interval(secs => sla_paused_seconds::int) AS due_at
         FROM support_tickets
       )
       SELECT
         (SELECT COUNT(*) FROM support_tickets WHERE status NOT IN ('resolved','closed'))::text AS open_tickets,
         (SELECT COUNT(*) FROM crm_followups WHERE status = 'open' AND due_at < $2)::text AS overdue_followups,
         (SELECT COUNT(*) FROM ticket_sla
          WHERE due_at >= $1 AND due_at < $2
            AND COALESCE(sla_stopped_at, $2::timestamptz) > due_at)::text AS sla_breaches`,
      [range.start, range.end],
    );

    return {
      openTickets: parseSafeInteger(result.rows[0]?.open_tickets ?? "0"),
      overdueFollowups: parseSafeInteger(result.rows[0]?.overdue_followups ?? "0"),
      slaBreaches: parseSafeInteger(result.rows[0]?.sla_breaches ?? "0"),
    };
  }
}

function parseSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Unsafe reporting aggregate: ${value}`);
  }
  return parsed;
}
