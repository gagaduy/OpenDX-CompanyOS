// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { PostgresqlPublicCatalogRepository } from "./postgresql-public-catalog.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl === undefined ? describe.skip : describe;
const ids = {
  category: "e1000000-0000-4000-8000-000000000001",
  published: "e2000000-0000-4000-8000-000000000001",
  draft: "e2000000-0000-4000-8000-000000000002",
  variant: "e3000000-0000-4000-8000-000000000001",
  price: "e4000000-0000-4000-8000-000000000001",
  media: "e5000000-0000-4000-8000-000000000001",
} as const;

describeWithDatabase("PostgresqlPublicCatalogRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const repository = new PostgresqlPublicCatalogRepository();

  beforeAll(async () => runCatalogMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    await pool.query("TRUNCATE audit_events, categories CASCADE");
    await pool.query(
      `INSERT INTO categories
        (id, name, slug, sort_order, status, created_at, updated_at, version)
       VALUES ($1, 'Phones', 'phones', 0, 'active', NOW(), NOW(), 1)`,
      [ids.category],
    );
    await pool.query(
      `INSERT INTO products
        (id, category_id, name, slug, brand, description, attributes, status,
         created_at, updated_at, version)
       VALUES
        ($1, $3, 'Phone X', 'phone-x', 'Nova', 'Technology phone',
         '{"screen":"6.5 inch"}', 'published', NOW(), NOW(), 2),
        ($2, $3, 'Draft Phone', 'draft-phone', 'Nova', 'Private draft',
         '{}', 'draft', NOW(), NOW(), 1)`,
      [ids.published, ids.draft, ids.category],
    );
    await pool.query(
      `INSERT INTO product_variants
        (id, product_id, sku, title, option_values, status,
         created_at, updated_at, version)
       VALUES ($1, $2, 'TECH-PHONE-BLACK', 'Black', '{"color":"Black"}',
               'active', NOW(), NOW(), 1)`,
      [ids.variant, ids.published],
    );
    await pool.query(
      `INSERT INTO product_prices
        (id, variant_id, amount_minor, currency, tax_inclusive, valid_from,
         valid_to, created_by)
       VALUES ($1, $2, 19990000, 'VND', true, NOW(), NULL, 'staff-catalog')`,
      [ids.price, ids.variant],
    );
    await pool.query(
      `INSERT INTO product_media
        (id, product_id, object_key, content_type, byte_size, alt_text,
         sort_order, is_primary, created_at)
       VALUES ($1, $2, 'seed/phone-x.png', 'image/png', 100,
               'Phone X front', 0, true, NOW())`,
      [ids.media, ids.published],
    );
  });
  afterAll(async () => {
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("returns complete published products and excludes drafts", async () => {
    const page = await transactions.runReadOnly((session) =>
      repository.listProducts(session, { page: 1, pageSize: 20 }),
    );

    expect(page.totalItems).toBe(1);
    expect(page.items).toEqual([
      expect.objectContaining({
        id: ids.published,
        slug: "phone-x",
        primaryMedia: { id: ids.media, altText: "Phone X front" },
        variants: [
          expect.objectContaining({
            id: ids.variant,
            sku: "TECH-PHONE-BLACK",
            price: { amountMinor: 19_990_000, currency: "VND" },
          }),
        ],
      }),
    ]);
    await expect(
      transactions.runReadOnly((session) =>
        repository.findProductBySlug(session, "draft-phone"),
      ),
    ).resolves.toBeUndefined();
  });

  it("reports publication readiness and authorizes only published media", async () => {
    const readiness = await transactions.runReadOnly((session) =>
      repository.inspectPublicationReadiness(session, ids.published),
    );
    expect(readiness).toEqual({
      categoryActive: true,
      primaryImageCount: 1,
      activeVariants: [{ variantId: ids.variant, hasCurrentPrice: true }],
    });
    const media = await transactions.runReadOnly((session) =>
      repository.findMediaAuthorization(session, ids.published, ids.media),
    );
    expect(media).toEqual({
      productId: ids.published,
      mediaId: ids.media,
      objectKey: "seed/phone-x.png",
      contentType: "image/png",
    });
  });
});
