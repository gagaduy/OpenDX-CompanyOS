// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "./database/transaction";
export type DecisionDepartment = "marketing" | "merchandising" | "operations" | "support";
export type DecisionState = "approved" | "canceled";
export type DecisionResource = "marketing_campaign" | "merchandising_proposal" | "operations_proposal" | "support_proposal";

export interface VerifiedDecisionEvidence {
  readonly id: string;
  readonly actorId?: string;
  readonly department: DecisionDepartment;
  readonly decision: DecisionState;
  readonly resourceType: DecisionResource;
  readonly resourceId: string;
  readonly summary: string;
  readonly occurredAt: string;
  readonly sourceTable: string;
  readonly sourceId: string;
}

export interface VerifiedDecisionHistoryReader {
  listRecent(session: DatabaseSession, limit: number): Promise<readonly VerifiedDecisionEvidence[]>;
}
