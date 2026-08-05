// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
} from "../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { seedNovaCommercePostgresql } from "../../infrastructure/seeds/nova-commerce-postgresql.seed";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase("NovaCommerce PostgreSQL seed", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
  });

  afterAll(async () => {
    await runCompanyCoreMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("is idempotent and preserves stable cross-entity relationships", async () => {
    const transactions = new PostgresTransactionRunner(pool);

    await seedNovaCommercePostgresql(transactions);
    await seedNovaCommercePostgresql(transactions);

    const tables = {
      company: "company_profile",
      departments: "departments",
      positions: "positions",
      humanEmployees: "human_employees",
      goals: "goals",
      kpis: "kpis",
      tasks: "operating_tasks",
      events: "business_events",
      decisions: "decisions",
      approvals: "approval_requests",
      auditEvents: "audit_events",
    } as const;
    const counts = Object.fromEntries(
      await Promise.all(
        Object.entries(tables).map(async ([name, table]) => {
          const result = await pool.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM ${table}`,
          );
          return [name, Number(result.rows[0]!.count)];
        }),
      ),
    );

    expect(counts).toEqual({
      company: 1,
      departments: 8,
      positions: 5,
      humanEmployees: 5,
      goals: 2,
      kpis: 2,
      tasks: 2,
      events: 4,
      decisions: 1,
      approvals: 3,
      auditEvents: 3,
    });

    const relation = await pool.query<{
      task_id: string;
      event_id: string;
      correlation_id: string;
    }>(
      `SELECT task.id AS task_id, event.id AS event_id, event.correlation_id
       FROM operating_tasks task
       JOIN business_events event ON event.id = task.related_event_id
       WHERE task.id = 'task_qualify_acme_lead'`,
    );
    expect(relation.rows[0]).toEqual({
      task_id: "task_qualify_acme_lead",
      event_id: "event_lead_created",
      correlation_id: "corr_lead_to_cash",
    });
  });
});
