// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
} from "../../../../shared/database/run-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase("Company Operating Core migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const companyTables = [
    "company_profile",
    "departments",
    "positions",
    "human_employees",
    "goals",
    "kpis",
    "operating_tasks",
    "business_events",
    "decisions",
    "approval_requests",
  ] as const;

  afterAll(async () => {
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("creates normalized tables and enforces domain constraints", async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");

    const created = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [[...companyTables, "audit_events"]],
    );
    expect(created.rows.map((row) => row.table_name)).toEqual(
      [...companyTables, "audit_events"].sort(),
    );

    await expect(
      pool.query(
        `INSERT INTO operating_tasks
          (id, title, status, priority, assignee_type, assignee_id, created_at)
         VALUES ('invalid_task', 'Invalid', 'unknown', 'high', 'department', 'sales', NOW())`,
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO business_events
          (id, type, source, actor_type, actor_id, occurred_at, correlation_id, sensitivity)
         VALUES ('invalid_event', 'test.invalid', 'test', 'unknown', 'actor', NOW(), 'corr', 'internal')`,
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO goals
          (id, owner_type, title, status, created_at)
         VALUES ('invalid_goal', 'department', 'Invalid', 'active', NOW())`,
      ),
    ).rejects.toThrow();

    await runCompanyCoreMigrations(databaseUrl!, "down");
    const remaining = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [[...companyTables, "audit_events"]],
    );
    expect(remaining.rows.map((row) => row.table_name)).toEqual([
      "audit_events",
    ]);
  });
});
