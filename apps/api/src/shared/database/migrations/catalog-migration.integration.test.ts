// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../run-migrations";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;

describeWithDatabase("catalog migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const tables = [
    "categories",
    "products",
    "product_variants",
    "product_prices",
    "product_media",
    "audit_events",
  ] as const;

  afterAll(async () => {
    await runCatalogMigrations(databaseUrl!, "down", 1);
    await pool.end();
  });

  it("creates and removes the normalized catalog schema", async () => {
    await runCatalogMigrations(databaseUrl!, "up");

    const created = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [tables],
    );
    expect(created.rows.map((row) => row.table_name)).toEqual(
      [...tables].sort(),
    );

    await runCatalogMigrations(databaseUrl!, "down", 1);
    const removed = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [tables],
    );
    expect(removed.rows).toEqual([]);
  });
});
