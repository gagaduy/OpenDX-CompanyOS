// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { CrmRepository } from "../../../application/repositories/interfaces/crm.repository";
import type { CrmNote } from "../../../domain/entities/crm-note";
import type { Followup, FollowupStatus } from "../../../domain/entities/followup";

type Row = Record<string, unknown>;

export class PostgresqlCrmRepository implements CrmRepository {
  async listNotes(session: DatabaseSession, customerId: string): Promise<readonly CrmNote[]> {
    const result = await session.query<Row>(
      `SELECT id,customer_id,author_id,body,corrects_note_id,created_at
       FROM crm_notes WHERE customer_id=$1
       ORDER BY created_at DESC,id DESC`,
      [customerId],
    );
    return result.rows.map(mapNote);
  }

  async findNote(session: DatabaseSession, customerId: string, noteId: string): Promise<CrmNote | undefined> {
    const result = await session.query<Row>(
      `SELECT id,customer_id,author_id,body,corrects_note_id,created_at
       FROM crm_notes WHERE customer_id=$1 AND id=$2`,
      [customerId, noteId],
    );
    return result.rows[0] === undefined ? undefined : mapNote(result.rows[0]);
  }

  async createNote(session: DatabaseSession, note: CrmNote): Promise<void> {
    await session.query(
      `INSERT INTO crm_notes(id,customer_id,author_id,body,corrects_note_id,created_at)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [note.id, note.customerId, note.authorId, note.body, note.correctsNoteId ?? null, note.createdAt],
    );
  }

  async listFollowups(session: DatabaseSession, customerId: string): Promise<readonly Followup[]> {
    const result = await session.query<Row>(
      `SELECT id,customer_id,due_at,description,status,version,created_by_id,
              assignee_id,completed_by_id,completed_at,created_at,updated_at
       FROM crm_followups WHERE customer_id=$1
       ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END,due_at ASC,id ASC`,
      [customerId],
    );
    return result.rows.map(mapFollowup);
  }

  async findFollowup(
    session: DatabaseSession,
    customerId: string,
    followupId: string,
    lock = false,
  ): Promise<Followup | undefined> {
    const result = await session.query<Row>(
      `SELECT id,customer_id,due_at,description,status,version,created_by_id,
              assignee_id,completed_by_id,completed_at,created_at,updated_at
       FROM crm_followups WHERE customer_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
      [customerId, followupId],
    );
    return result.rows[0] === undefined ? undefined : mapFollowup(result.rows[0]);
  }

  async createFollowup(session: DatabaseSession, followup: Followup): Promise<void> {
    await session.query(
      `INSERT INTO crm_followups
       (id,customer_id,due_at,description,status,version,created_by_id,assignee_id,
        completed_by_id,completed_at,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        followup.id, followup.customerId, followup.dueAt, followup.description,
        followup.status, followup.version, followup.createdById, followup.assigneeId ?? null,
        followup.completedById ?? null, followup.completedAt ?? null,
        followup.createdAt, followup.updatedAt,
      ],
    );
  }

  async updateFollowup(
    session: DatabaseSession,
    followup: Followup,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await session.query(
      `UPDATE crm_followups
       SET status=$4,version=$5,assignee_id=$6,completed_by_id=$7,completed_at=$8,updated_at=$9
       WHERE id=$1 AND customer_id=$2 AND version=$3`,
      [
        followup.id, followup.customerId, expectedVersion, followup.status,
        followup.version, followup.assigneeId ?? null, followup.completedById ?? null,
        followup.completedAt ?? null, followup.updatedAt,
      ],
    );
    return result.rowCount === 1;
  }

  async appendAudit(
    session: DatabaseSession,
    entry: Parameters<CrmRepository["appendAudit"]>[1],
  ): Promise<void> {
    await session.query(
      `INSERT INTO crm_audit_events
       (id,customer_id,actor_id,action,resource_type,resource_id,correlation_id,metadata,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        entry.id, entry.customerId, entry.actorId, entry.action, entry.resourceType,
        entry.resourceId, entry.correlationId, JSON.stringify(entry.metadata), entry.occurredAt,
      ],
    );
  }

  async appendDeniedAudit(
    session: DatabaseSession,
    entry: Parameters<CrmRepository["appendDeniedAudit"]>[1],
  ): Promise<void> {
    await session.query(
      `INSERT INTO audit_events
       (id,actor_type,actor_id,action,resource_type,resource_id,outcome,correlation_id,metadata,occurred_at)
       VALUES($1,'user',$2,$3,'crm',$4,'denied',$5,'{}'::jsonb,$6)`,
      [entry.id, entry.actorId, entry.action, entry.resourceId, entry.correlationId, entry.occurredAt],
    );
  }

  async countOverdueFollowups(session: DatabaseSession, asOf: string): Promise<number> {
    const result = await session.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM crm_followups WHERE status='open' AND due_at < $1",
      [asOf],
    );
    return safeNonnegativeInteger(result.rows[0]?.total ?? "0", "overdue follow-up count");
  }
}

function mapNote(row: Row): CrmNote {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    authorId: String(row.author_id),
    body: String(row.body),
    ...(row.corrects_note_id === null || row.corrects_note_id === undefined
      ? {}
      : { correctsNoteId: String(row.corrects_note_id) }),
    createdAt: iso(row.created_at),
  };
}

function mapFollowup(row: Row): Followup {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    dueAt: iso(row.due_at),
    description: String(row.description),
    status: status(row.status),
    version: safePositiveInteger(row.version, "follow-up version"),
    createdById: String(row.created_by_id),
    ...(optional(row.assignee_id) === undefined ? {} : { assigneeId: optional(row.assignee_id)! }),
    ...(optional(row.completed_by_id) === undefined ? {} : { completedById: optional(row.completed_by_id)! }),
    ...(row.completed_at === null || row.completed_at === undefined ? {} : { completedAt: iso(row.completed_at) }),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function status(value: unknown): FollowupStatus {
  if (value !== "open" && value !== "completed") throw new Error("Invalid persisted follow-up status");
  return value;
}

function optional(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function iso(value: unknown): string {
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

function safePositiveInteger(value: unknown, label: string): number {
  const parsed = safeNonnegativeInteger(value, label);
  if (parsed < 1) throw new Error(`Unsafe persisted ${label}`);
  return parsed;
}

function safeNonnegativeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Unsafe persisted ${label}`);
  return parsed;
}
