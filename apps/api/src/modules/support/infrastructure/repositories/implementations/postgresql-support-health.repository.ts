// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  SupportClassificationSummary,
  SupportHealthQuery,
  SupportHealthRepository,
  SupportOperationalClass,
  SupportSlaFact,
} from "../../../application/services/interfaces/support-health-reader";
import type { TicketPriority, TicketStatus } from "../../../domain/entities/support-ticket";

type Row = Record<string, unknown>;

const slaCte = `WITH open_tickets AS (
  SELECT id AS ticket_id,priority,status,
    created_at+make_interval(secs=>(
      CASE priority WHEN 'urgent' THEN 7200 WHEN 'high' THEN 28800
        WHEN 'normal' THEN 86400 ELSE 259200 END
      +sla_paused_seconds+sla_stopped_seconds
      +CASE WHEN status='waiting_customer'
        THEN floor(extract(epoch FROM $2::timestamptz-sla_pause_started_at))::integer
        ELSE 0 END
    )::double precision) AS sla_due_at
  FROM support_tickets
  WHERE status NOT IN ('resolved','closed') AND created_at<$1::timestamptz
), risk AS (
  SELECT * FROM open_tickets
  WHERE sla_due_at<LEAST($1::timestamptz,
    $2::timestamptz+$3::integer*interval '1 minute')
)`;

export class PostgresqlSupportHealthRepository implements SupportHealthRepository {
  async readSlaRisk(session: DatabaseSession, query: SupportHealthQuery) {
    const base = [query.end, query.asOf, query.horizonMinutes] as const;
    const summaryResult = await session.query<Row>(`${slaCte}
      SELECT (SELECT count(*)::bigint FROM open_tickets) AS open_tickets,
        (SELECT count(*)::bigint FROM risk) AS at_risk_count,
        (SELECT count(*)::bigint FROM risk WHERE sla_due_at<=$2::timestamptz)
          AS breached_count,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('priority',priority,'count',count)
          ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
            WHEN 'normal' THEN 3 ELSE 4 END),'[]'::jsonb)
          FROM (SELECT priority,count(*)::bigint AS count FROM risk GROUP BY priority) grouped)
          AS priority_rows`, base);
    const evidenceResult = await session.query<Row>(`${slaCte}
      SELECT ticket_id,priority,status,sla_due_at FROM risk
      WHERE ($4::timestamptz IS NULL OR (sla_due_at,ticket_id)>($4::timestamptz,$5::uuid))
      ORDER BY sla_due_at,ticket_id LIMIT $6`, [
      ...base,
      query.after?.[0] ?? null,
      query.after?.[1] ?? null,
      query.limit,
    ]);
    const row = summaryResult.rows[0] ?? {};
    return {
      summary: {
        openTickets: integer(row.open_tickets),
        atRiskCount: integer(row.at_risk_count),
        breachedCount: integer(row.breached_count),
        countsByPriority: jsonRows(row.priority_rows).map((item) => ({
          priority: priority(item.priority),
          count: integer(item.count),
        })),
      },
      evidence: evidenceResult.rows.map(mapSlaFact),
    };
  }

  async readClassificationSummary(
    session: DatabaseSession,
    input: { readonly start: string; readonly end: string },
  ): Promise<SupportClassificationSummary> {
    const result = await session.query<Row>(`
      WITH scoped AS (
        SELECT priority,status,
          CASE
            WHEN status IN ('resolved','closed') THEN 'terminal'
            WHEN status='escalated' THEN 'escalated'
            WHEN status='waiting_customer' THEN 'waiting_customer'
            WHEN status='waiting_internal' THEN 'waiting_internal'
            WHEN assignee_id IS NULL THEN 'unassigned'
            ELSE 'active_work'
          END AS operational_class
        FROM support_tickets
        WHERE created_at>=$1::timestamptz AND created_at<$2::timestamptz
      )
      SELECT
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('priority',priority,'count',count)),
          '[]'::jsonb) FROM (SELECT priority,count(*)::bigint AS count
            FROM scoped GROUP BY priority) grouped) AS priority_rows,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('status',status,'count',count)),
          '[]'::jsonb) FROM (SELECT status,count(*)::bigint AS count
            FROM scoped GROUP BY status) grouped) AS status_rows,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('class',operational_class,'count',count)),
          '[]'::jsonb) FROM (SELECT operational_class,count(*)::bigint AS count
            FROM scoped GROUP BY operational_class) grouped) AS class_rows,
        count(*) FILTER (WHERE operational_class='unassigned')::bigint AS unassigned_count,
        count(*) FILTER (WHERE operational_class='escalated')::bigint AS escalated_count
      FROM scoped`, [input.start, input.end]);
    const row = result.rows[0] ?? {};
    return {
      countsByPriority: jsonRows(row.priority_rows).map((item) => ({
        priority: priority(item.priority), count: integer(item.count),
      })),
      countsByStatus: jsonRows(row.status_rows).map((item) => ({
        status: status(item.status), count: integer(item.count),
      })),
      operationalClasses: jsonRows(row.class_rows).map((item) => ({
        class: operationalClass(item.class), count: integer(item.count),
      })),
      unassignedCount: integer(row.unassigned_count),
      escalatedCount: integer(row.escalated_count),
    };
  }

  async findRelatedOrderId(session: DatabaseSession, ticketId: string) {
    const result = await session.query<{ readonly order_id: string | null }>(
      "SELECT order_id FROM support_tickets WHERE id=$1",
      [ticketId],
    );
    const row = result.rows[0];
    return row === undefined
      ? { found: false, orderId: null }
      : { found: true, orderId: row.order_id };
  }
}

function mapSlaFact(row: Row): SupportSlaFact {
  return {
    ticketId: String(row.ticket_id),
    priority: priority(row.priority),
    status: status(row.status),
    slaDueAt: timestamp(row.sla_due_at),
  };
}

function jsonRows(value: unknown): readonly Row[] {
  if (!Array.isArray(value)) throw new RangeError("Invalid Support health aggregate");
  return value as readonly Row[];
}

function integer(value: unknown): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError("Unsafe Support health value");
  return result;
}

function timestamp(value: unknown): string {
  const result = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(result.getTime())) throw new RangeError("Invalid Support health timestamp");
  return result.toISOString();
}

function priority(value: unknown): TicketPriority {
  if (value !== "urgent" && value !== "high" && value !== "normal" && value !== "low") {
    throw new RangeError("Invalid Support priority");
  }
  return value;
}

function status(value: unknown): TicketStatus {
  if (!["new", "assigned", "in_progress", "waiting_customer", "waiting_internal",
    "escalated", "resolved", "closed"].includes(String(value))) {
    throw new RangeError("Invalid Support status");
  }
  return value as TicketStatus;
}

function operationalClass(value: unknown): SupportOperationalClass {
  if (!["unassigned", "active_work", "waiting_customer", "waiting_internal",
    "escalated", "terminal"].includes(String(value))) {
    throw new RangeError("Invalid Support operational class");
  }
  return value as SupportOperationalClass;
}
