// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  CrmFollowupSummary,
  CrmHealthRepository,
  CrmHealthWindow,
} from "../../../application/services/interfaces/crm-health-reader";

interface SummaryRow {
  readonly open_followups: string | number;
  readonly overdue_followups: string | number;
  readonly unassigned_followups: string | number;
}

export class PostgresqlCrmHealthRepository implements CrmHealthRepository {
  async readFollowupSummary(
    session: DatabaseSession,
    input: CrmHealthWindow & { readonly asOf: string },
  ): Promise<CrmFollowupSummary> {
    const result = await session.query<SummaryRow>(`
      SELECT count(*)::bigint AS open_followups,
        count(*) FILTER (WHERE due_at<$2::timestamptz)::bigint AS overdue_followups,
        count(*) FILTER (WHERE assignee_id IS NULL)::bigint AS unassigned_followups
      FROM crm_followups
      WHERE status='open' AND due_at<$1::timestamptz`, [input.end, input.asOf]);
    const row = result.rows[0];
    return {
      openFollowups: integer(row?.open_followups),
      overdueFollowups: integer(row?.overdue_followups),
      unassignedFollowups: integer(row?.unassigned_followups),
    };
  }
}

function integer(value: unknown): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new RangeError("Unsafe CRM health value");
  return result;
}
