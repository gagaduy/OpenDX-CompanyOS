// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { VerifiedDecisionHistoryReader } from "../../../shared/verified-decision-evidence";

interface Row { id: string; summary: string; reviewed_at: Date | string; reviewed_by: string | null }

export function createInventoryDecisionHistoryReader(): VerifiedDecisionHistoryReader {
  return { async listRecent(session, limit) {
    const result = await session.query<Row>(
      `SELECT id::text, summary, reviewed_at, reviewed_by
       FROM inventory_replenishment_proposals
       WHERE status = 'approved' AND reviewed_at IS NOT NULL
       ORDER BY reviewed_at DESC, id DESC LIMIT $1`, [limit]);
    return result.rows.map((row) => ({
      id: `source:inventory_replenishment_proposals:${row.id}`,
      ...(row.reviewed_by ? { actorId: row.reviewed_by } : {}),
      department: "operations", decision: "approved",
      resourceType: "operations_proposal", resourceId: row.id,
      summary: row.summary,
      occurredAt: new Date(row.reviewed_at).toISOString(),
      sourceTable: "inventory_replenishment_proposals", sourceId: row.id,
    }));
  } };
}
