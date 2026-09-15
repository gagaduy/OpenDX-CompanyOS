// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VerifiedDecisionHistoryReader } from "../../../shared/verified-decision-evidence";

interface Row { source_id: string; campaign_id: string; actor_id: string; occurred_at: Date | string; name: string }

export function createCatalogDecisionHistoryReader(): VerifiedDecisionHistoryReader {
  return { async listRecent(session, limit) {
    const result = await session.query<Row>(
      `SELECT * FROM (SELECT DISTINCT ON (a.resource_id) a.id::text AS source_id,
              a.resource_id AS campaign_id, a.actor_id, a.occurred_at, c.name
       FROM audit_events a
       JOIN merchandising_campaigns c ON c.id::text = a.resource_id
       WHERE a.action = 'catalog.campaign.activated'
         AND a.resource_type = 'campaign' AND a.outcome = 'success'
       ORDER BY a.resource_id, a.occurred_at ASC, a.id ASC) evidence
       ORDER BY occurred_at DESC, source_id DESC LIMIT $1`, [limit]);
    return result.rows.map((row) => ({
      id: `source:audit_events:${row.source_id}`,
      actorId: row.actor_id,
      department: "merchandising", decision: "approved",
      resourceType: "merchandising_proposal", resourceId: row.campaign_id,
      summary: row.name,
      occurredAt: new Date(row.occurred_at).toISOString(),
      sourceTable: "audit_events", sourceId: row.source_id,
    }));
  } };
}
