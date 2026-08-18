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

  it("reapplies health indexes and preserves publication rollback", async () => {
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
    await expect(indexNames(pool)).resolves.toEqual(expect.arrayContaining([
      "products_health_status_updated_idx",
      "product_variants_health_product_status_idx",
      "product_prices_health_variant_window_idx",
      "product_media_health_product_primary_idx",
    ]));
    await pool.query(
      "TRUNCATE product_media,product_prices,product_variants,products,categories CASCADE",
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
    await pool.query("SET enable_seqscan=off");
    const explain = await pool.query<{ "QUERY PLAN": unknown }>(
      `EXPLAIN (FORMAT JSON)
       SELECT id FROM products
       WHERE status='draft' AND updated_at>=$1 AND updated_at<$2
       ORDER BY updated_at,id LIMIT 26`,
      ["2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"],
    );
    await pool.query("RESET enable_seqscan");
    expect(JSON.stringify(explain.rows[0]?.["QUERY PLAN"]))
      .toContain("products_health_status_updated_idx");

    await runCatalogMigrations(databaseUrl!, "down", 1);
    await expect(indexNames(pool)).resolves.not.toContain("products_health_status_updated_idx");
    const product = await pool.query<{ status: string }>(
      "SELECT status FROM products WHERE id = '82000000-0000-4000-8000-000000000001'",
    );
    expect(product.rows[0]).toEqual({ status: "published" });

    await runCatalogMigrations(databaseUrl!, "up");
    await expect(indexNames(pool)).resolves.toContain("products_health_status_updated_idx");

    await runCatalogMigrations(databaseUrl!, "down", 2);
    const draft = await pool.query<{ status: string }>(
      "SELECT status FROM products WHERE id = '82000000-0000-4000-8000-000000000001'",
    );
    expect(draft.rows[0]).toEqual({ status: "draft" });

    await runCatalogMigrations(databaseUrl!, "up");
    await expect(indexNames(pool)).resolves.toContain("products_health_status_updated_idx");
  });
});

async function indexNames(pool: Pool): Promise<readonly string[]> {
  const result = await pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND indexname LIKE '%_health_%'
     ORDER BY indexname`,
  );
  return result.rows.map(({ indexname }) => indexname);
}
