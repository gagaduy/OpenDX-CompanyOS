// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ProductPrice } from "../../../domain/entities/product-price";
import type { ProductVariant } from "../../../domain/entities/product-variant";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { PostgresqlVariantRepository } from "./postgresql-variant.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  category: "61000000-0000-4000-8000-000000000001",
  product: "62000000-0000-4000-8000-000000000001",
  variantA: "63000000-0000-4000-8000-000000000001",
  variantB: "63000000-0000-4000-8000-000000000002",
  priceA: "64000000-0000-4000-8000-000000000001",
  priceB: "64000000-0000-4000-8000-000000000002",
} as const;
const timestamp = "2026-08-05T00:00:00.000Z";

function variant(id: string, sku = "BOTTLE-BLACK"): ProductVariant {
  return {
    id,
    productId: ids.product,
    sku,
    title: "Black",
    optionValues: { color: "Black" },
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  };
}

function price(id: string, amountMinor: number): ProductPrice {
  return {
    id,
    variantId: ids.variantA,
    amountMinor,
    currency: "VND",
    taxInclusive: true,
    validFrom: timestamp,
    createdBy: "user_catalog",
  };
}

describeWithDatabase("PostgresqlVariantRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlVariantRepository();

  beforeAll(async () => runCatalogMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    await pool.query("TRUNCATE categories CASCADE");
    await pool.query(
      `INSERT INTO categories
        (id, name, slug, sort_order, status, created_at, updated_at, version)
       VALUES ($1, 'Drinkware', 'drinkware', 0, 'active', NOW(), NOW(), 1)`,
      [ids.category],
    );
    await pool.query(
      `INSERT INTO products
        (id, category_id, name, slug, description, status, created_at, updated_at, version)
       VALUES ($1, $2, 'Bottle', 'bottle', 'Description', 'draft', NOW(), NOW(), 1)`,
      [ids.product, ids.category],
    );
  });
  afterAll(async () => {
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("maps variants and applies optimistic updates", async () => {
    await transactions.run((session) => repository.create(session, variant(ids.variantA)));
    const current = await transactions.runReadOnly((session) =>
      repository.findBySku(session, "bottle-black"),
    );
    expect(current).toMatchObject({ sku: "BOTTLE-BLACK", optionValues: { color: "Black" } });
    await transactions.run(async (session) => {
      expect(await repository.update(session, { ...current!, title: "Updated", version: 2 }, 1)).toBe(true);
      expect(await repository.update(session, { ...current!, version: 2 }, 1)).toBe(false);
    });
  });

  it("allows only one concurrent write for a global case-insensitive SKU", async () => {
    const results = await Promise.allSettled([
      transactions.run((session) => repository.create(session, variant(ids.variantA, "Bottle-Black"))),
      transactions.run((session) => repository.create(session, variant(ids.variantB, "BOTTLE-BLACK"))),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
  });

  it("serializes concurrent price replacement and keeps one current price", async () => {
    await transactions.run((session) => repository.create(session, variant(ids.variantA)));
    const results = await Promise.allSettled([
      transactions.run((session) => repository.replaceCurrentPrice(session, price(ids.priceA, 200000))),
      transactions.run((session) => repository.replaceCurrentPrice(session, price(ids.priceB, 250000))),
    ]);
    expect(results.every(({ status }) => status === "fulfilled")).toBe(true);
    const rows = await pool.query<{ valid_to: Date | null }>(
      "SELECT valid_to FROM product_prices WHERE variant_id = $1 ORDER BY id",
      [ids.variantA],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.filter(({ valid_to }) => valid_to === null)).toHaveLength(1);
    expect(rows.rows.filter(({ valid_to }) => valid_to !== null)).toHaveLength(1);
  });
});
