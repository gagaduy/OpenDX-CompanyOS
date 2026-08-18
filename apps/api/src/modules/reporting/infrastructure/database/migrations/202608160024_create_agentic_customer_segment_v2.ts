// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    GRANT CREATE ON SCHEMA public TO opendx_reporting_owner;

    CREATE VIEW reporting_agentic_customer_segment_snapshot_v2
      (segment_key,lifetime_value_bucket,recency_bucket,customer_count,
       repeat_customer_count,open_followup_count,customers_with_open_followup_count,
       lifetime_paid_revenue_vnd,as_of_date)
      WITH (security_barrier=true) AS
    WITH paid_facts AS (
      SELECT customer.id AS customer_id,count(order_record.id)::bigint AS paid_order_count,
        COALESCE(sum(order_record.total_vnd),0)::bigint AS lifetime_paid_revenue_vnd,
        max(order_record.paid_at) AS last_paid_at
      FROM customers customer LEFT JOIN orders order_record
        ON order_record.customer_id=customer.id AND order_record.paid_at IS NOT NULL
        AND order_record.status IN ('paid','processing','ready_for_fulfillment','completed')
      GROUP BY customer.id
    ), followups AS (
      SELECT customer_id,count(*)::bigint AS open_followup_count
      FROM crm_followups WHERE status='open' GROUP BY customer_id
    ), classified AS (
      SELECT CASE
          WHEN paid_facts.lifetime_paid_revenue_vnd>=50000000 THEN 'high_value'
          WHEN paid_facts.last_paid_at IS NOT NULL
            AND (paid_facts.last_paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-90
            THEN 'inactive'
          WHEN paid_facts.paid_order_count>=2 THEN 'repeat'
          ELSE 'new'
        END AS segment_key,
        CASE
          WHEN paid_facts.lifetime_paid_revenue_vnd=0 THEN 'zero'
          WHEN paid_facts.lifetime_paid_revenue_vnd<5000000 THEN 'low'
          WHEN paid_facts.lifetime_paid_revenue_vnd<50000000 THEN 'mid'
          ELSE 'high'
        END AS lifetime_value_bucket,
        CASE
          WHEN paid_facts.last_paid_at IS NULL THEN 'never'
          WHEN (paid_facts.last_paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date>=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-30
            THEN '0_30_days'
          WHEN (paid_facts.last_paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date>=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-90
            THEN '31_90_days'
          ELSE 'over_90_days'
        END AS recency_bucket,
        paid_facts.paid_order_count,paid_facts.lifetime_paid_revenue_vnd,
        COALESCE(followups.open_followup_count,0) AS open_followup_count
      FROM paid_facts LEFT JOIN followups USING(customer_id)
    )
    SELECT segment_key,lifetime_value_bucket,recency_bucket,
      count(*)::bigint AS customer_count,
      count(*) FILTER (WHERE paid_order_count>=2)::bigint AS repeat_customer_count,
      sum(open_followup_count)::bigint AS open_followup_count,
      count(*) FILTER (WHERE open_followup_count>0)::bigint
        AS customers_with_open_followup_count,
      sum(lifetime_paid_revenue_vnd)::bigint AS lifetime_paid_revenue_vnd,
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS as_of_date
    FROM classified GROUP BY segment_key,lifetime_value_bucket,recency_bucket;

    ALTER VIEW reporting_agentic_customer_segment_snapshot_v2
      OWNER TO opendx_reporting_owner;
    REVOKE CREATE ON SCHEMA public FROM opendx_reporting_owner;
    REVOKE ALL ON reporting_agentic_customer_segment_snapshot_v1
      FROM opendx_agentic_reader;
    REVOKE ALL ON reporting_agentic_customer_segment_snapshot_v2 FROM PUBLIC;
    GRANT SELECT ON reporting_agentic_customer_segment_snapshot_v2 TO opendx_agentic_reader;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP VIEW IF EXISTS reporting_agentic_customer_segment_snapshot_v2;
    GRANT SELECT ON reporting_agentic_customer_segment_snapshot_v1
      TO opendx_agentic_reader;
  `);
}
