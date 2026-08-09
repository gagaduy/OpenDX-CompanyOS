// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
} from "../../../../shared/database/run-migrations";
import { assertIntegrationEnvironment } from "../../../../shared/testing/assert-integration-environment";
import { runCartMigrations } from "../../../cart/infrastructure/database/run-cart-migrations";
import { runCheckoutMigrations } from "../../../checkout/infrastructure/database/run-checkout-migrations";
import { runCustomerMigrations } from "../../../customer/infrastructure/database/run-customer-migrations";
import { runInventoryMigrations } from "../../../inventory/infrastructure/database/run-inventory-migrations";
import { runOrderMigrations } from "../../../order/infrastructure/database/run-order-migrations";
import { runPaymentMigrations } from "../../../payment/infrastructure/database/run-payment-migrations";
import { runPromotionMigrations } from "../../../promotion/infrastructure/database/run-promotion-migrations";
import { runCrmMigrations } from "./run-crm-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("CRM migration", () => {
  if (new URL(databaseUrl!).pathname !== "/opendx_test") {
    throw new Error("CRM migrations must run only against opendx_test");
  }
  assertIntegrationEnvironment({ TEST_DATABASE_URL: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });

  afterAll(async () => {
    await runCrmMigrations(databaseUrl!, "down").catch(() => undefined);
    await runPaymentMigrations(databaseUrl!, "down").catch(() => undefined);
    await runOrderMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCheckoutMigrations(databaseUrl!, "down", 999999).catch(() => undefined);
    await runPromotionMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCartMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCustomerMigrations(databaseUrl!, "down").catch(() => undefined);
    await runInventoryMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCompanyCoreMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCatalogMigrations(databaseUrl!, "down").catch(() => undefined);
    await pool.end();
  });

  it("creates constrained CRM tables, rolls them back, and reapplies them", async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    await runCartMigrations(databaseUrl!, "up");
    await runPromotionMigrations(databaseUrl!, "up");
    await runCheckoutMigrations(databaseUrl!, "up");
    await runOrderMigrations(databaseUrl!, "up");
    await runPaymentMigrations(databaseUrl!, "up");
    await runCrmMigrations(databaseUrl!, "up");

    const tableNames = ["crm_notes", "crm_followups", "crm_audit_events"];
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name",
      [tableNames],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([...tableNames].sort());

    const foreignKeys = await pool.query<{ table_name: string; constraint_name: string }>(
      `SELECT tc.table_name, tc.constraint_name
       FROM information_schema.table_constraints tc
       WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = ANY($1::text[])
       ORDER BY tc.table_name, tc.constraint_name`,
      [tableNames],
    );
    expect(foreignKeys.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: "crm_notes", constraint_name: "crm_notes_customer_id_fkey" }),
      expect.objectContaining({ table_name: "crm_notes", constraint_name: "crm_notes_corrects_note_id_fkey" }),
      expect.objectContaining({ table_name: "crm_followups", constraint_name: "crm_followups_customer_id_fkey" }),
      expect.objectContaining({ table_name: "crm_audit_events", constraint_name: "crm_audit_events_customer_id_fkey" }),
    ]));

    const constraints = await pool.query<{ constraint_name: string }>(
      "SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [tableNames],
    );
    expect(constraints.rows.map(({ constraint_name }) => constraint_name)).toEqual(expect.arrayContaining([
      "crm_notes_body_check",
      "crm_followups_description_check",
      "crm_followups_status_check",
      "crm_followups_version_check",
      "crm_followups_completion_check",
    ]));

    const indexes = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
      [tableNames],
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(expect.arrayContaining([
      "crm_notes_customer_created_at_idx",
      "crm_followups_status_due_at_idx",
      "crm_followups_assignee_id_idx",
    ]));

    const companyColumns = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) AND column_name = 'company_id'",
      [tableNames],
    );
    expect(companyColumns.rowCount).toBe(0);

    await runCrmMigrations(databaseUrl!, "down");
    expect((await pool.query("SELECT to_regclass('public.crm_notes') AS name")).rows[0]).toEqual({ name: null });
    expect((await pool.query("SELECT to_regclass('public.crm_followups') AS name")).rows[0]).toEqual({ name: null });
    expect((await pool.query("SELECT to_regclass('public.crm_audit_events') AS name")).rows[0]).toEqual({ name: null });

    await runCrmMigrations(databaseUrl!, "up");
    expect((await pool.query("SELECT to_regclass('public.crm_followups') AS name")).rows[0]).toEqual({ name: "crm_followups" });
  });

  it("enforces immutable notes and the only legal follow-up lifecycle writes", async () => {
    const customerId = "c7000000-0000-4000-8000-000000000001";
    const noteId = "c7000000-0000-4000-8000-000000000002";
    const followupId = "c7000000-0000-4000-8000-000000000003";
    const createdAt = "2026-08-10T00:00:00.000Z";
    const claimedAt = "2026-08-10T01:00:00.000Z";
    const completedAt = "2026-08-10T02:00:00.000Z";

    await pool.query(
      "INSERT INTO customers (id, email, email_verified_at) VALUES ($1, $2, $3)",
      [customerId, "crm-migration@example.com", createdAt],
    );
    await expect(pool.query(
      "INSERT INTO crm_notes (id, customer_id, author_id, body) VALUES (gen_random_uuid(), $1, 'staff-1', ' ')",
      [customerId],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "INSERT INTO crm_followups (id, customer_id, due_at, description, created_by_id) VALUES (gen_random_uuid(), $1, $2, ' ', 'staff-1')",
      [customerId, "2026-08-11T00:00:00.000Z"],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "INSERT INTO crm_followups (id, customer_id, due_at, description, status, version, created_by_id) VALUES (gen_random_uuid(), $1, $2, 'Follow up', 'invalid', 1, 'staff-1')",
      [customerId, "2026-08-11T00:00:00.000Z"],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "INSERT INTO crm_followups (id, customer_id, due_at, description, status, version, created_by_id) VALUES (gen_random_uuid(), $1, $2, 'Follow up', 'open', 0, 'staff-1')",
      [customerId, "2026-08-11T00:00:00.000Z"],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "INSERT INTO crm_followups (id, customer_id, due_at, description, status, created_by_id) VALUES (gen_random_uuid(), $1, $2, 'Follow up', 'completed', 'staff-1')",
      [customerId, "2026-08-11T00:00:00.000Z"],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "INSERT INTO crm_followups (id, customer_id, due_at, description, status, created_by_id, assignee_id) VALUES (gen_random_uuid(), $1, $2, 'Follow up', 'open', 'staff-1', 'staff-operator')",
      [customerId, "2026-08-11T00:00:00.000Z"],
    )).rejects.toMatchObject({ code: "P0001" });

    await pool.query(
      "INSERT INTO crm_notes (id, customer_id, author_id, body, created_at) VALUES ($1, $2, 'staff-1', 'Original note', $3)",
      [noteId, customerId, createdAt],
    );
    await expect(pool.query(
      "UPDATE crm_notes SET body = 'Altered note' WHERE id = $1",
      [noteId],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("DELETE FROM crm_notes WHERE id = $1", [noteId]))
      .rejects.toMatchObject({ code: "P0001" });

    await pool.query(
      `INSERT INTO crm_followups
       (id, customer_id, due_at, description, status, version, created_by_id, created_at, updated_at)
       VALUES ($1, $2, '2026-08-11T00:00:00.000Z', 'Call customer', 'open', 1, 'staff-creator', $3, $3)`,
      [followupId, customerId, createdAt],
    );
    await expect(pool.query(
      "UPDATE crm_followups SET assignee_id = 'staff-operator', version = 2, updated_at = $2 WHERE id = $1",
      [followupId, claimedAt],
    )).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query(
      "UPDATE crm_followups SET assignee_id = 'staff-other', version = 3, updated_at = $2 WHERE id = $1",
      [followupId, completedAt],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "UPDATE crm_followups SET status = 'completed', completed_by_id = 'staff-operator', completed_at = $2, version = 2, updated_at = $2 WHERE id = $1",
      [followupId, completedAt],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "UPDATE crm_followups SET status = 'completed', completed_by_id = ' ', completed_at = $2, version = 3, updated_at = $2 WHERE id = $1",
      [followupId, completedAt],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query(
      "UPDATE crm_followups SET status = 'completed', completed_by_id = 'staff-authorized', completed_at = $2, version = 3, updated_at = $2 WHERE id = $1",
      [followupId, completedAt],
    )).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query(
      "UPDATE crm_followups SET description = 'Changed', version = 4, updated_at = $2 WHERE id = $1",
      [followupId, "2026-08-10T03:00:00.000Z"],
    )).rejects.toMatchObject({ code: "P0001" });
    await expect(pool.query("DELETE FROM crm_followups WHERE id = $1", [followupId]))
      .rejects.toMatchObject({ code: "P0001" });
  });
});
