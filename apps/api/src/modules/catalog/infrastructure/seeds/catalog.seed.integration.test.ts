// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Client } from "minio";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { bootstrapProductMediaBucket } from "../storage/bootstrap-product-media-bucket";
import { MinioProductMediaStorage } from "../storage/minio-product-media.storage";
import { seedCatalog } from "./catalog.seed";

const databaseUrl = process.env.TEST_DATABASE_URL;
const endpoint = process.env.MINIO_ENDPOINT;
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;
const bucket = process.env.MINIO_BUCKET;
const configured = [databaseUrl, endpoint, accessKey, secretKey, bucket].every(
  (value) => value !== undefined,
);
const describeWithInfrastructure = configured ? describe : describe.skip;

describeWithInfrastructure("NovaCommerce catalog seed", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const endpointUrl = new URL(endpoint!);
  const minio = new Client({
    endPoint: endpointUrl.hostname,
    port: Number(endpointUrl.port || (endpointUrl.protocol === "https:" ? 443 : 80)),
    useSSL: endpointUrl.protocol === "https:",
    accessKey: accessKey!,
    secretKey: secretKey!,
  });
  const storage = new MinioProductMediaStorage(minio, bucket!);

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await bootstrapProductMediaBucket(minio, bucket!);
  });

  afterAll(async () => {
    const objects: string[] = [];
    for await (const item of minio.listObjectsV2(bucket!, "seed/catalog/", true)) {
      if (item.name !== undefined) objects.push(item.name);
    }
    if (objects.length > 0) await minio.removeObjects(bucket!, objects);
    await pool.query("DELETE FROM products WHERE id::text LIKE '20000000-0000-4000-8000-%'");
    await pool.query("DELETE FROM categories WHERE id::text LIKE '10000000-0000-4000-8000-%'");
    await runCatalogMigrations(databaseUrl!, "down");
    if (await minio.bucketExists(bucket!)) await minio.removeBucket(bucket!);
    await pool.end();
  });

  it("creates a repeatable six-category technology catalog with media", async () => {
    await seedCatalog(transactions, storage);
    await pool.query(
      "UPDATE storefront_service_assurances SET title = 'stale' WHERE code = 'free-delivery'",
    );
    await seedCatalog(transactions, storage);

    const counts = await pool.query<{
      categories: string;
      products: string;
      variants: string;
      prices: string;
      media: string;
    }>(
      `SELECT
        (SELECT count(*) FROM categories)::text AS categories,
        (SELECT count(*) FROM products)::text AS products,
        (SELECT count(*) FROM product_variants)::text AS variants,
        (SELECT count(*) FROM product_prices WHERE valid_to IS NULL)::text AS prices,
        (SELECT count(*) FROM product_media)::text AS media`,
    );
    expect(counts.rows[0]).toEqual({
      categories: "6",
      products: "12",
      variants: "24",
      prices: "24",
      media: "12",
    });

    const objects: string[] = [];
    for await (const item of minio.listObjectsV2(bucket!, "seed/catalog/", true)) {
      if (item.name !== undefined) objects.push(item.name);
    }
    expect(objects).toHaveLength(12);
    const categorySlugs = await pool.query<{ slug: string }>(
      "SELECT slug FROM categories WHERE status = 'active' ORDER BY slug",
    );
    expect(categorySlugs.rows.map(({ slug }) => slug)).toEqual([
      "accessories",
      "computer-components",
      "laptops",
      "phones",
      "smart-watches",
      "tablets",
    ]);
    const productSlugs = await pool.query<{ slug: string }>(
      "SELECT slug FROM products ORDER BY slug",
    );
    expect(productSlugs.rows.map(({ slug }) => slug)).toContain("graphics-card");
    expect(productSlugs.rows.map(({ slug }) => slug)).toContain("phone-pro");

    const assurances = await pool.query<{
      code: string;
      icon_key: string;
      title: string;
      description: string;
      sort_order: number;
      enabled: boolean;
    }>(`SELECT code, icon_key, title, description, sort_order, enabled
        FROM storefront_service_assurances ORDER BY sort_order, code`);
    expect(assurances.rows).toEqual([
      { code: "free-delivery", icon_key: "truck", title: "Miễn phí vận chuyển", description: "Cho đơn hàng đủ điều kiện", sort_order: 0, enabled: true },
      { code: "official-warranty", icon_key: "shield-check", title: "Bảo hành chính hãng", description: "Cam kết sản phẩm xác thực", sort_order: 1, enabled: true },
      { code: "zero-installment", icon_key: "badge-percent", title: "Trả góp 0%", description: "Theo điều kiện thanh toán", sort_order: 2, enabled: true },
      { code: "customer-support", icon_key: "headphones", title: "Hỗ trợ 24/7", description: "Đồng hành khi bạn cần", sort_order: 3, enabled: true },
    ]);

    const metrics = await pool.query<{
      code: string;
      display_value: string;
      label: string;
      sort_order: number;
      enabled: boolean;
    }>(`SELECT code, display_value, label, sort_order, enabled
        FROM storefront_trust_metrics ORDER BY sort_order, code`);
    expect(metrics.rows).toEqual([
      { code: "authentic-products", display_value: "100%", label: "Sản phẩm chính hãng", sort_order: 0, enabled: true },
      { code: "trusted-brands", display_value: "30+", label: "Thương hiệu uy tín", sort_order: 1, enabled: true },
      { code: "product-selection", display_value: "1.000+", label: "Sản phẩm đa dạng", sort_order: 2, enabled: true },
      { code: "trusted-customers", display_value: "50.000+", label: "Khách hàng tin tưởng", sort_order: 3, enabled: true },
    ]);
  });
});
