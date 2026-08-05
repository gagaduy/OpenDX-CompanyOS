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
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("adds publication and rolls back published rows before removing the catalog", async () => {
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

    await pool.query(
      `INSERT INTO categories
        (id, name, slug, sort_order, status, created_at, updated_at, version)
       VALUES ('81000000-0000-4000-8000-000000000001', 'Phones', 'phones', 0,
               'active', NOW(), NOW(), 1)`,
    );
    await pool.query(
      `INSERT INTO products
        (id, category_id, name, slug, description, status, created_at, updated_at, version)
       VALUES ('82000000-0000-4000-8000-000000000001',
               '81000000-0000-4000-8000-000000000001', 'Phone', 'phone',
               'Technology phone', 'published', NOW(), NOW(), 1)`,
    );

    await runCatalogMigrations(databaseUrl!, "down", 1);
    const product = await pool.query<{ status: string }>(
      "SELECT status FROM products WHERE id = '82000000-0000-4000-8000-000000000001'",
    );
    expect(product.rows[0]).toEqual({ status: "draft" });

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
