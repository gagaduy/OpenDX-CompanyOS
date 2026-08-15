// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    DO $roles$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='opendx_reporting_owner')
         OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname='opendx_agentic_reader') THEN
        RAISE EXCEPTION 'Reporting database roles are not reconciled';
      END IF;
    END
    $roles$;

    GRANT SELECT(id,status) ON product_variants TO opendx_reporting_owner;
    GRANT SELECT(id,variant_id,amount_minor,currency,valid_from,valid_to)
      ON product_prices TO opendx_reporting_owner;
    GRANT SELECT(id,status,paid_at,customer_id,total_vnd)
      ON orders TO opendx_reporting_owner;
    GRANT SELECT(order_id,variant_id,quantity,line_total_vnd)
      ON order_lines TO opendx_reporting_owner;
    GRANT SELECT(id,created_at) ON customers TO opendx_reporting_owner;
    GRANT SELECT(customer_id,status) ON crm_followups TO opendx_reporting_owner;
    GRANT CREATE ON SCHEMA public TO opendx_reporting_owner;

    CREATE VIEW reporting_agentic_variant_sales_v1
      (variant_id,window_date,paid_quantity,paid_revenue_vnd,current_unit_price_vnd)
      WITH (security_barrier=true) AS
    WITH current_variants AS (
      SELECT variant.id AS variant_id,current_price.amount_minor AS current_unit_price_vnd
      FROM product_variants variant
      JOIN LATERAL (
        SELECT price.amount_minor
        FROM product_prices price
        WHERE price.variant_id=variant.id AND price.currency='VND'
          AND price.valid_from<=CURRENT_TIMESTAMP
          AND (price.valid_to IS NULL OR CURRENT_TIMESTAMP<price.valid_to)
        ORDER BY price.valid_from DESC,price.id LIMIT 1
      ) current_price ON true
      WHERE variant.status='active'
    ), paid_sales AS (
      SELECT line.variant_id,order_record.paid_at::date AS window_date,
        sum(line.quantity)::bigint AS paid_quantity,
        sum(line.line_total_vnd)::bigint AS paid_revenue_vnd
      FROM orders order_record JOIN order_lines line ON line.order_id=order_record.id
      WHERE order_record.paid_at IS NOT NULL
        AND order_record.status IN ('paid','processing','ready_for_fulfillment','completed')
      GROUP BY line.variant_id,order_record.paid_at::date
    )
    SELECT current_variants.variant_id,CURRENT_DATE,0::bigint,0::bigint,
      current_variants.current_unit_price_vnd
    FROM current_variants
    UNION ALL
    SELECT paid_sales.variant_id,paid_sales.window_date,paid_sales.paid_quantity,
      paid_sales.paid_revenue_vnd,current_variants.current_unit_price_vnd
    FROM paid_sales JOIN current_variants USING(variant_id);

    CREATE VIEW reporting_agentic_customer_segment_snapshot_v1
      (segment_key,recency_bucket,customer_count,repeat_customer_count,
       open_followup_count,lifetime_paid_revenue_vnd,as_of_date)
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
          WHEN paid_facts.last_paid_at IS NULL
            OR paid_facts.last_paid_at<CURRENT_DATE-INTERVAL '90 days' THEN 'inactive'
          WHEN paid_facts.paid_order_count>=2 THEN 'repeat'
          ELSE 'new'
        END AS segment_key,
        CASE
          WHEN paid_facts.last_paid_at IS NULL THEN 'never'
          WHEN paid_facts.last_paid_at>=CURRENT_DATE-INTERVAL '30 days' THEN '0_30_days'
          WHEN paid_facts.last_paid_at>=CURRENT_DATE-INTERVAL '90 days' THEN '31_90_days'
          ELSE 'over_90_days'
        END AS recency_bucket,
        paid_facts.paid_order_count,paid_facts.lifetime_paid_revenue_vnd,
        COALESCE(followups.open_followup_count,0) AS open_followup_count
      FROM paid_facts LEFT JOIN followups USING(customer_id)
    )
    SELECT segment_key,recency_bucket,count(*)::bigint AS customer_count,
      count(*) FILTER (WHERE paid_order_count>=2)::bigint AS repeat_customer_count,
      sum(open_followup_count)::bigint AS open_followup_count,
      sum(lifetime_paid_revenue_vnd)::bigint AS lifetime_paid_revenue_vnd,
      CURRENT_DATE AS as_of_date
    FROM classified GROUP BY segment_key,recency_bucket;

    CREATE VIEW reporting_agentic_customer_activity_daily_v1
      (activity_date,new_customer_count,paid_customer_count,paid_revenue_vnd)
      WITH (security_barrier=true) AS
    WITH registrations AS (
      SELECT created_at::date AS activity_date,count(*)::bigint AS new_customer_count
      FROM customers GROUP BY created_at::date
    ), paid_activity AS (
      SELECT paid_at::date AS activity_date,count(DISTINCT customer_id)::bigint
          AS paid_customer_count,
        sum(total_vnd)::bigint AS paid_revenue_vnd
      FROM orders WHERE paid_at IS NOT NULL
        AND status IN ('paid','processing','ready_for_fulfillment','completed')
      GROUP BY paid_at::date
    )
    SELECT COALESCE(registrations.activity_date,paid_activity.activity_date),
      COALESCE(registrations.new_customer_count,0)::bigint,
      COALESCE(paid_activity.paid_customer_count,0)::bigint,
      COALESCE(paid_activity.paid_revenue_vnd,0)::bigint
    FROM registrations FULL JOIN paid_activity USING(activity_date);

    ALTER VIEW reporting_agentic_variant_sales_v1 OWNER TO opendx_reporting_owner;
    ALTER VIEW reporting_agentic_customer_segment_snapshot_v1 OWNER TO opendx_reporting_owner;
    ALTER VIEW reporting_agentic_customer_activity_daily_v1 OWNER TO opendx_reporting_owner;
    REVOKE CREATE ON SCHEMA public FROM opendx_reporting_owner;
    REVOKE ALL ON reporting_agentic_variant_sales_v1,
      reporting_agentic_customer_segment_snapshot_v1,
      reporting_agentic_customer_activity_daily_v1 FROM PUBLIC;
    GRANT SELECT ON reporting_agentic_variant_sales_v1,
      reporting_agentic_customer_segment_snapshot_v1,
      reporting_agentic_customer_activity_daily_v1 TO opendx_agentic_reader;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    DROP VIEW IF EXISTS reporting_agentic_customer_activity_daily_v1;
    DROP VIEW IF EXISTS reporting_agentic_customer_segment_snapshot_v1;
    DROP VIEW IF EXISTS reporting_agentic_variant_sales_v1;
    REVOKE SELECT(id,status) ON product_variants FROM opendx_reporting_owner;
    REVOKE SELECT(id,variant_id,amount_minor,currency,valid_from,valid_to)
      ON product_prices FROM opendx_reporting_owner;
    REVOKE SELECT(id,status,paid_at,customer_id,total_vnd)
      ON orders FROM opendx_reporting_owner;
    REVOKE SELECT(order_id,variant_id,quantity,line_total_vnd)
      ON order_lines FROM opendx_reporting_owner;
    REVOKE SELECT(id,created_at) ON customers FROM opendx_reporting_owner;
    REVOKE SELECT(customer_id,status) ON crm_followups FROM opendx_reporting_owner;
  `);
}
