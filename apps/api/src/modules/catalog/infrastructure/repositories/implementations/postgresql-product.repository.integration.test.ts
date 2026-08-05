// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Product } from "../../../domain/entities/product";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { PostgresqlProductRepository } from "./postgresql-product.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  categoryA: "10000000-0000-4000-8000-000000000001",
  categoryB: "10000000-0000-4000-8000-000000000002",
  productA: "20000000-0000-4000-8000-000000000001",
  productB: "20000000-0000-4000-8000-000000000002",
  productC: "20000000-0000-4000-8000-000000000003",
  variantA: "30000000-0000-4000-8000-000000000001",
  variantB: "30000000-0000-4000-8000-000000000002",
  priceA: "40000000-0000-4000-8000-000000000001",
  priceB: "40000000-0000-4000-8000-000000000002",
  mediaA: "50000000-0000-4000-8000-000000000001",
} as const;

function product(id: string, categoryId: string, name: string, slug: string, updatedAt: string): Product {
  return {
    id,
    categoryId,
    name,
    slug,
    description: `${name} description`,
    attributes: { material: "steel" },
    status: id === ids.productC ? "archived" : "draft",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt,
    version: 1,
  };
}

describeWithDatabase("PostgresqlProductRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlProductRepository();

  beforeAll(async () => runCatalogMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    await pool.query("TRUNCATE categories CASCADE");
    await pool.query(
      `INSERT INTO categories
        (id, name, slug, sort_order, status, created_at, updated_at, version)
       VALUES ($1, 'Drinkware', 'drinkware', 0, 'active', NOW(), NOW(), 1),
              ($2, 'Electronics', 'electronics', 1, 'active', NOW(), NOW(), 1)`,
      [ids.categoryA, ids.categoryB],
    );
    await transactions.run(async (session) => {
      await repository.create(session, product(ids.productA, ids.categoryA, "Steel Bottle", "steel-bottle", "2026-08-05T00:00:00.000Z"));
      await repository.create(session, product(ids.productB, ids.categoryA, "Travel Mug", "travel-mug", "2026-08-05T00:00:00.000Z"));
      await repository.create(session, product(ids.productC, ids.categoryB, "Old Charger", "old-charger", "2026-08-04T00:00:00.000Z"));
    });
    await pool.query(
      `INSERT INTO product_variants
        (id, product_id, sku, title, option_values, status, created_at, updated_at, version)
       VALUES ($1, $3, 'BOTTLE-BLACK', 'Black', '{"color":"Black"}', 'active', NOW(), NOW(), 1),
              ($2, $3, 'BOTTLE-SILVER', 'Silver', '{"color":"Silver"}', 'active', NOW(), NOW(), 1)`,
      [ids.variantA, ids.variantB, ids.productA],
    );
    await pool.query(
      `INSERT INTO product_prices
        (id, variant_id, amount_minor, currency, tax_inclusive, valid_from, created_by)
       VALUES ($3, $1, 200000, 'VND', true, NOW(), 'user_catalog'),
              ($4, $2, 350000, 'VND', true, NOW(), 'user_catalog')`,
      [ids.variantA, ids.variantB, ids.priceA, ids.priceB],
    );
    await pool.query(
      `INSERT INTO product_media
        (id, product_id, object_key, content_type, byte_size, alt_text, sort_order, is_primary)
       VALUES ($1, $2, 'products/bottle.webp', 'image/webp', 128, 'Steel bottle', 0, true)`,
      [ids.mediaA, ids.productA],
    );
  });
  afterAll(async () => {
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("projects primary media, variants, price range, total, and deterministic order", async () => {
    const result = await transactions.runReadOnly((session) =>
      repository.list(session, { page: 1, pageSize: 20 }),
    );
    expect(result.totalItems).toBe(3);
    expect(result.items.map(({ id }) => id)).toEqual([
      ids.productA,
      ids.productB,
      ids.productC,
    ]);
    expect(result.items[0]).toMatchObject({
      categoryName: "Drinkware",
      primaryMediaId: ids.mediaA,
      variantCount: 2,
      minimumPrice: 200000,
      maximumPrice: 350000,
    });
  });

  it("searches names and SKUs and applies category/status/page filters", async () => {
    const bySku = await transactions.runReadOnly((session) =>
      repository.list(session, { query: "silver", page: 1, pageSize: 20 }),
    );
    expect(bySku.items.map(({ id }) => id)).toEqual([ids.productA]);

    const filtered = await transactions.runReadOnly((session) =>
      repository.list(session, {
        categoryId: ids.categoryA,
        status: "draft",
        page: 2,
        pageSize: 1,
      }),
    );
    expect(filtered.totalItems).toBe(2);
    expect(filtered.items.map(({ id }) => id)).toEqual([ids.productB]);
  });

  it("maps product detail and applies optimistic updates", async () => {
    const current = await transactions.runReadOnly((session) =>
      repository.findById(session, ids.productA),
    );
    expect(current).toMatchObject({ attributes: { material: "steel" }, version: 1 });
    await transactions.run(async (session) => {
      expect(
        await repository.update(
          session,
          { ...current!, name: "Updated Bottle", version: 2 },
          1,
        ),
      ).toBe(true);
      expect(
        await repository.update(session, { ...current!, version: 2 }, 1),
      ).toBe(false);
    });
  });

  it("enforces case-insensitive product slugs", async () => {
    await expect(
      transactions.run((session) =>
        repository.create(
          session,
          product(
            "20000000-0000-4000-8000-000000000009",
            ids.categoryA,
            "Duplicate",
            "STEEL-BOTTLE",
            "2026-08-06T00:00:00.000Z",
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
