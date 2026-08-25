// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CrmNote } from "../../../domain/entities/crm-note";
import type { Followup } from "../../../domain/entities/followup";

export interface CrmAuditEntry {
  readonly id: string;
  readonly customerId: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceType: "crm_note" | "followup";
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, boolean | number>>;
  readonly occurredAt: string;
}

export interface CrmDeniedAuditEntry {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, never>>;
  readonly occurredAt: string;
}

export interface CrmRepository {
  listNotes(session: DatabaseSession, customerId: string): Promise<readonly CrmNote[]>;
  findNote(session: DatabaseSession, customerId: string, noteId: string): Promise<CrmNote | undefined>;
  createNote(session: DatabaseSession, note: CrmNote): Promise<void>;
  listFollowups(session: DatabaseSession, customerId: string): Promise<readonly Followup[]>;
  findFollowup(
    session: DatabaseSession,
    customerId: string,
    followupId: string,
    lock?: boolean,
  ): Promise<Followup | undefined>;
  createFollowup(session: DatabaseSession, followup: Followup): Promise<void>;
  updateFollowup(session: DatabaseSession, followup: Followup, expectedVersion: number): Promise<boolean>;
  appendAudit(session: DatabaseSession, entry: CrmAuditEntry): Promise<void>;
  appendDeniedAudit(session: DatabaseSession, entry: CrmDeniedAuditEntry): Promise<void>;
  countOverdueFollowups(session: DatabaseSession, asOf: string): Promise<number>;
}
