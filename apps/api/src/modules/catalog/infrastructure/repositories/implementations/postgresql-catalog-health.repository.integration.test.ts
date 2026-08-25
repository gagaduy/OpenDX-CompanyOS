// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresTransactionRunner } from "../../../../../shared/database/transaction";
import { runCatalogMigrations } from "../../../../../shared/database/run-migrations";
import { CatalogHealthReaderService } from "../../../application/services/implementations/catalog-health-reader";
import { PostgresqlCatalogHealthRepository } from "./postgresql-catalog-health.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl === undefined ? describe.skip : describe;
const asOf = "2026-08-16T05:00:00.000Z";

suite("PostgresqlCatalogHealthRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const reader = new CatalogHealthReaderService(
    new PostgresqlCatalogHealthRepository(),
    transactions,
    () => asOf,
  );

  beforeAll(async () => runCatalogMigrations(databaseUrl!, "up"));
  beforeEach(async () => {
    await pool.query("TRUNCATE product_media,product_prices,product_variants,products,categories CASCADE");
    await insertFixture(pool);
  });
  afterAll(async () => {
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("calculates completeness without exposing catalog content", async () => {
    const result = await reader.productCompleteness(asOf);
    expect(result).toEqual({
      totalProducts: 5,
      draftProducts: 3,
      publishedProducts: 2,
      missingBrand: 1,
      emptyAttributes: 1,
      withoutActiveVariant: 1,
      withoutCurrentPrice: 2,
      withoutMedia: 1,
      withoutPrimaryMedia: 2,
      completenessBasisPoints: 4_000,
    });
    expect(JSON.stringify(result)).not.toContain("CANARY_SECRET_PRODUCT");
  });

  it("maps every publication reason with stable bounded evidence", async () => {
    const result = await reader.publicationReadiness({
      start: "2026-08-01T00:00:00.000Z",
      end: asOf,
      timezone: "Asia/Ho_Chi_Minh",
      limit: 1,
    });
    expect(result.summary).toEqual({
      draftReviewed: 3,
      readyCount: 1,
      blockedCount: 2,
      reasonCounts: [
        { reasonCode: "MISSING_BRAND", count: 1 },
        { reasonCode: "EMPTY_ATTRIBUTES", count: 1 },
        { reasonCode: "NO_ACTIVE_VARIANT", count: 1 },
        { reasonCode: "MISSING_CURRENT_PRICE", count: 1 },
        { reasonCode: "NO_MEDIA", count: 1 },
        { reasonCode: "PRIMARY_MEDIA_INVALID", count: 2 },
      ],
    });
    expect(result.evidence).toHaveLength(1);
    expect(result.nextCursor).toBeDefined();
    expect(JSON.stringify(result)).not.toContain("CANARY_SECRET_PRODUCT");
  });

  it("summarizes only active published merchandising facts", async () => {
    await expect(reader.merchandisingSummary(asOf)).resolves.toEqual({
      activeCategories: 2,
      publishedProducts: 2,
      activeVariants: 3,
      currentlyPricedVariants: 2,
      mediaCoverageBasisPoints: 10_000,
      minimumPriceVnd: 100_000,
      maximumPriceVnd: 500_000,
      categoryDistribution: [
        { categoryId: "10000000-0000-4000-8000-000000000001", productCount: 1 },
        { categoryId: "10000000-0000-4000-8000-000000000002", productCount: 1 },
      ],
      otherCategoryProductCount: 0,
    });
  });
});

async function insertFixture(pool: Pool): Promise<void> {
  await pool.query(`INSERT INTO categories
    (id,name,slug,status,created_at,updated_at) VALUES
    ('10000000-0000-4000-8000-000000000001','CANARY_SECRET_CATEGORY_A','category-a','active',$1,$1),
    ('10000000-0000-4000-8000-000000000002','CANARY_SECRET_CATEGORY_B','category-b','active',$1,$1),
    ('10000000-0000-4000-8000-000000000003','CANARY_SECRET_ARCHIVED','category-c','archived',$1,$1)`, [asOf]);
  await pool.query(`INSERT INTO products
    (id,category_id,name,slug,brand,description,attributes,status,created_at,updated_at) VALUES
    ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','CANARY_SECRET_PRODUCT_READY','ready','Acme','CANARY_DESCRIPTION','{"color":"black"}','draft',$1,'2026-08-10T00:00:00Z'),
    ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','CANARY_SECRET_PRODUCT_EMPTY','empty',NULL,'CANARY_DESCRIPTION','{}','draft',$1,'2026-08-11T00:00:00Z'),
    ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','CANARY_SECRET_PRODUCT_EXPIRED','expired','Acme','CANARY_DESCRIPTION','{"size":"m"}','draft',$1,'2026-08-12T00:00:00Z'),
    ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','CANARY_SECRET_PRODUCT_PUBLISHED_A','pub-a','Acme','CANARY_DESCRIPTION','{"size":"l"}','published',$1,'2026-08-13T00:00:00Z'),
    ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','CANARY_SECRET_PRODUCT_PUBLISHED_B','pub-b','Acme','CANARY_DESCRIPTION','{"size":"s"}','published',$1,'2026-08-14T00:00:00Z'),
    ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000003','CANARY_SECRET_PRODUCT_ARCHIVED','archived','Acme','CANARY_DESCRIPTION','{"x":1}','archived',$1,'2026-08-15T00:00:00Z')`, [asOf]);
  await pool.query(`INSERT INTO product_variants
    (id,product_id,sku,title,option_values,status,created_at,updated_at) VALUES
    ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','SKU-1','CANARY_VARIANT','{}','active',$1,$1),
    ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','SKU-2','CANARY_VARIANT','{}','active',$1,$1),
    ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004','SKU-3','CANARY_VARIANT','{}','active',$1,$1),
    ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000005','SKU-4','CANARY_VARIANT','{}','active',$1,$1),
    ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','SKU-5','CANARY_VARIANT','{}','active',$1,$1)`, [asOf]);
  await pool.query(`INSERT INTO product_prices
    (id,variant_id,amount_minor,valid_from,valid_to,created_by) VALUES
    ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',200000,'2026-08-01',NULL,'fixture'),
    ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',300000,'2026-08-01','2026-08-15','fixture'),
    ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003',100000,'2026-08-01',NULL,'fixture'),
    ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004',500000,'2026-08-01',NULL,'fixture'),
    ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005',900000,'2026-08-17',NULL,'fixture')`);
  await pool.query(`INSERT INTO product_media
    (id,product_id,object_key,content_type,byte_size,alt_text,is_primary) VALUES
    ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','CANARY_OBJECT_KEY_1','image/webp',10,'CANARY_ALT',true),
    ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','CANARY_OBJECT_KEY_2','image/webp',10,'CANARY_ALT',false),
    ('50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004','CANARY_OBJECT_KEY_3','image/webp',10,'CANARY_ALT',true),
    ('50000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000005','CANARY_OBJECT_KEY_4','image/webp',10,'CANARY_ALT',true)`);
}
