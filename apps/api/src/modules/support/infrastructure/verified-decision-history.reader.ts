// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VerifiedDecisionHistoryReader } from "../../../shared/verified-decision-evidence";

interface Row { source_id: string; proposal_id: string; decision: "approved" | "canceled"; actor_id: string | null; occurred_at: Date | string; ticket_count: string | null; source_table: string }

export function createSupportDecisionHistoryReader(): VerifiedDecisionHistoryReader {
  return { async listRecent(session, limit) {
    const result = await session.query<Row>(
      `SELECT * FROM (
         SELECT MIN(id::text) AS source_id,
                split_part(idempotency_key, ':', 2) AS proposal_id,
                'approved'::text AS decision, NULL::text AS actor_id,
                MAX(occurred_at) AS occurred_at,
                COUNT(DISTINCT ticket_id)::text AS ticket_count,
                'support_ticket_events'::text AS source_table
         FROM support_ticket_events
         WHERE actor_id = 'support-ai-steward'
           AND idempotency_key LIKE 'ai_resolve:%'
           AND split_part(idempotency_key, ':', 2) <> ''
         GROUP BY split_part(idempotency_key, ':', 2)
         UNION ALL
         SELECT id::text, proposal_id, 'canceled'::text, actor_id,
                occurred_at, NULL::text, 'support_ai_proposal_decisions'::text
         FROM support_ai_proposal_decisions
       ) evidence ORDER BY occurred_at DESC, source_id DESC LIMIT $1`, [limit]);
    return result.rows.map((row) => ({
      id: `source:${row.source_table}:${row.source_id}`,
      ...(row.actor_id ? { actorId: row.actor_id } : {}),
      department: "support", decision: row.decision,
      resourceType: "support_proposal", resourceId: row.proposal_id,
      summary: row.decision === "approved"
        ? `Đã gửi phản hồi cho ${row.ticket_count} khách hàng.`
        : `Đã hủy kịch bản phản hồi CSKH.`,
      occurredAt: new Date(row.occurred_at).toISOString(),
      sourceTable: row.source_table, sourceId: row.source_id,
    }));
  } };
}
