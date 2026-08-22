// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations, runCompanyCoreMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner, type DatabaseSession } from "../../../../../shared/database/transaction";
import { assertIntegrationEnvironment } from "../../../../../shared/testing/assert-integration-environment";
import { runCustomerMigrations } from "../../../../customer/infrastructure/database/run-customer-migrations";
import { claimFollowup, createCorrection, createNote } from "../../../domain/services/crm-rules";
import { runCrmMigrations } from "../../database/run-crm-migrations";
import { PostgresqlCrmRepository } from "./postgresql-crm.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const customerA = "d1000000-0000-4000-8000-000000000001";
const customerB = "d1000000-0000-4000-8000-000000000002";
const noteOld = "d2000000-0000-4000-8000-000000000001";
const noteTieLow = "d2000000-0000-4000-8000-000000000002";
const noteTieHigh = "d2000000-0000-4000-8000-000000000003";
const followupId = "d3000000-0000-4000-8000-000000000001";

suite("PostgresqlCrmRepository", () => {
  if (new URL(databaseUrl!).pathname !== "/opendx_test") {
    throw new Error("CRM repository tests must run only against opendx_test");
  }
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlCrmRepository();

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCrmMigrations(databaseUrl!, "up");
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE crm_audit_events,crm_followups,crm_notes,customers,audit_events CASCADE");
    await pool.query(
      `INSERT INTO customers(id,email,email_verified_at,status,version,created_at,updated_at)
       VALUES ($1,'customer-a@example.com',NOW(),'active',1,NOW(),NOW()),
              ($2,'customer-b@example.com',NOW(),'active',1,NOW(),NOW())`,
      [customerA, customerB],
    );
  });

  afterAll(async () => {
    await runCrmMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCustomerMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCompanyCoreMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCatalogMigrations(databaseUrl!, "down").catch(() => undefined);
    await pool.end();
  });

  it("lists immutable notes newest first with a stable descending ID tie break and owner-constrained corrections", async () => {
    await transactions.run(async (session) => {
      await repository.createNote(session, createNote({
        id: noteOld, customerId: customerA, authorId: "crm-1", body: "Old note",
        createdAt: "2026-08-09T00:00:00.000Z",
      }));
      await repository.createNote(session, createNote({
        id: noteTieLow, customerId: customerA, authorId: "crm-1", body: "New low",
        createdAt: "2026-08-10T00:00:00.000Z",
      }));
      await repository.createNote(session, createNote({
        id: noteTieHigh, customerId: customerA, authorId: "crm-1", body: "New high",
        createdAt: "2026-08-10T00:00:00.000Z",
      }));
      expect(await repository.findNote(session, customerB, noteTieHigh)).toBeUndefined();
      const original = await repository.findNote(session, customerA, noteTieHigh);
      expect(original).toBeDefined();
      await repository.createNote(session, createCorrection({
        id: "d2000000-0000-4000-8000-000000000004",
        customerId: customerA,
        authorId: "crm-2",
        body: "Correction",
        createdAt: "2026-08-11T00:00:00.000Z",
      }, original!));
    });

    await expect(transactions.runReadOnly((session) => repository.listNotes(session, customerA)))
      .resolves.toMatchObject([
        { body: "Correction", correctsNoteId: noteTieHigh },
        { id: noteTieHigh },
        { id: noteTieLow },
        { id: noteOld },
      ]);
  });

  it("constrains follow-ups by customer and lets exactly one concurrent self-claim win", async () => {
    await pool.query(
      `INSERT INTO crm_followups
       (id,customer_id,due_at,description,status,version,created_by_id,created_at,updated_at)
       VALUES ($1,$2,'2026-08-12T00:00:00.000Z','Call customer','open',1,'crm-creator','2026-08-10T00:00:00.000Z','2026-08-10T00:00:00.000Z')`,
      [followupId, customerA],
    );
    await expect(transactions.runReadOnly((session) => repository.findFollowup(session, customerB, followupId)))
      .resolves.toBeUndefined();

    const attempt = (actorId: string) => transactions.run(async (session) => {
      const current = await repository.findFollowup(session, customerA, followupId, true);
      if (current === undefined) throw new Error("Missing follow-up fixture");
      const claimed = claimFollowup(current, actorId, 1, "2026-08-10T01:00:00.000Z");
      if (!await repository.updateFollowup(session, claimed, 1)) throw new Error("STALE_VERSION");
      return claimed;
    });
    const results = await Promise.allSettled([attempt("crm-a"), attempt("crm-b")]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const stored = await pool.query<{ assignee_id: string; version: number }>(
      "SELECT assignee_id,version FROM crm_followups WHERE id=$1",
      [followupId],
    );
    expect(stored.rows[0]).toMatchObject({ version: 2 });
    expect(["crm-a", "crm-b"]).toContain(stored.rows[0]?.assignee_id);
  });

  it("persists audit provenance without note, description, or contact text", async () => {
    await transactions.run((session) => repository.appendAudit(session, {
      id: "d4000000-0000-4000-8000-000000000001",
      customerId: customerA,
      actorId: "crm-1",
      action: "crm.note.created",
      resourceType: "crm_note",
      resourceId: noteOld,
      correlationId: "corr-audit",
      metadata: { correction: false },
      occurredAt: "2026-08-10T00:00:00.000Z",
    }));
    const result = await pool.query<{ metadata: Record<string, unknown> }>(
      "SELECT metadata FROM crm_audit_events WHERE id=$1",
      ["d4000000-0000-4000-8000-000000000001"],
    );
    expect(result.rows[0]?.metadata).toEqual({ correction: false });
    expect(JSON.stringify(result.rows[0])).not.toMatch(/customer-a@example|Call customer|Old note/);
  });

  it("rejects unsafe persisted totals instead of narrowing them", async () => {
    const unsafeSession: DatabaseSession = {
      query: async <Row extends object>() => ({
        rows: [{ total: "9007199254740992" } as unknown as Row],
        rowCount: 1,
      }),
    };
    await expect(repository.countOverdueFollowups(
      unsafeSession,
      "2026-08-10T00:00:00.000Z",
    )).rejects.toThrow("Unsafe persisted overdue follow-up count");
  });
});
