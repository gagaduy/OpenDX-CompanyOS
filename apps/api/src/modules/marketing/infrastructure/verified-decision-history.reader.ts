// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VerifiedDecisionHistoryReader } from "../../../shared/verified-decision-evidence";

interface Row { source_id: string; campaign_id: string; campaign_name: string | null; decision: "approved" | "canceled"; actor_id: string | null; occurred_at: Date | string; source_table: string }

export function createMarketingDecisionHistoryReader(): VerifiedDecisionHistoryReader {
  return { async listRecent(session, limit) {
    const result = await session.query<Row>(
      `SELECT * FROM (
         SELECT p.id::text AS source_id, p.campaign_id::text AS campaign_id,
                b.campaign_name, 'approved'::text AS decision,
                NULLIF(p.approval_request_id, '') AS actor_id,
                p.updated_at AS occurred_at,
                'marketing_publication_packages'::text AS source_table
         FROM marketing_publication_packages p
         LEFT JOIN marketing_campaign_briefs b ON b.campaign_id = p.campaign_id
         WHERE p.status = 'approved' AND p.approval_request_id IS NOT NULL
         UNION ALL
         SELECT c.id::text, c.id::text, b.campaign_name, 'canceled'::text,
                NULL::text, c.updated_at, 'marketing_campaigns'::text
         FROM marketing_campaigns c
         LEFT JOIN marketing_campaign_briefs b ON b.campaign_id = c.id
         WHERE c.state = 'canceled'
       ) evidence ORDER BY occurred_at DESC, source_id DESC LIMIT $1`, [limit]);
    return result.rows.map((row) => ({
      id: `source:${row.source_table}:${row.source_id}`,
      ...(row.actor_id ? { actorId: row.actor_id } : {}),
      department: "marketing", decision: row.decision,
      resourceType: "marketing_campaign", resourceId: row.campaign_id,
      summary: row.campaign_name ?? `Chiến dịch ${row.campaign_id}`,
      occurredAt: new Date(row.occurred_at).toISOString(),
      sourceTable: row.source_table, sourceId: row.source_id,
    }));
  } };
}
