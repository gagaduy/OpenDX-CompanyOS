// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  runCatalogMigrations,
  runCompanyCoreMigrations,
} from "../../../../shared/database/run-migrations";
import { runCustomerMigrations } from "./run-customer-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;

suite("customer migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  afterAll(async () => {
    await runCustomerMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCompanyCoreMigrations(databaseUrl!, "down").catch(() => undefined);
    await runCatalogMigrations(databaseUrl!, "down").catch(() => undefined);
    await pool.end();
  });

  it("creates hash-only customer storage, permits customer audit actors, and rolls back", async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runCompanyCoreMigrations(databaseUrl!, "up");
    await runCustomerMigrations(databaseUrl!, "up");
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [
        [
          "customers",
          "customer_external_identities",
          "customer_sessions",
          "guest_sessions",
          "customer_addresses",
        ],
      ],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toHaveLength(5);
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('customer_sessions', 'guest_sessions')
       ORDER BY column_name`,
    );
    expect(columns.rows.map(({ column_name }) => column_name)).not.toContain(
      "token",
    );
    expect(columns.rows.map(({ column_name }) => column_name)).toContain(
      "token_hash",
    );
    await expect(
      pool.query(`
      INSERT INTO audit_events(
        id, actor_type, actor_id, action, resource_type, resource_id,
        outcome, correlation_id, metadata, occurred_at
      ) VALUES ('customer-audit-test', 'customer', 'customer-1', 'customer.auth.login',
        'customer_session', 'session-1', 'success', 'correlation-1', '{}', NOW())
    `),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(`
      INSERT INTO audit_events(
        id, actor_type, actor_id, action, resource_type, resource_id,
        outcome, correlation_id, metadata, occurred_at
      ) VALUES ('invalid-audit-test', 'unknown', 'actor-1', 'invalid',
        'resource', 'resource-1', 'denied', 'correlation-2', '{}', NOW())
    `),
    ).rejects.toMatchObject({ code: "23514" });

    await runCustomerMigrations(databaseUrl!, "down", 1);
    expect(
      (await pool.query("SELECT to_regclass('public.customers') AS name"))
        .rows[0],
    ).toEqual({ name: null });
    expect(
      (await pool.query(
        "SELECT count(*)::text AS count FROM audit_events WHERE actor_type='customer'",
      )).rows[0],
    ).toEqual({ count: "0" });
    await expect(
      pool.query(`
      INSERT INTO audit_events(
        id, actor_type, actor_id, action, resource_type, resource_id,
        outcome, correlation_id, metadata, occurred_at
      ) VALUES ('customer-audit-after-rollback', 'customer', 'customer-1', 'invalid',
        'resource', 'resource-1', 'denied', 'correlation-3', '{}', NOW())
    `),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
