// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Client } from "minio";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../../shared/database/transaction";
import { seedCatalog } from "../../../catalog/infrastructure/seeds/catalog.seed";
import { bootstrapProductMediaBucket } from "../../../catalog/infrastructure/storage/bootstrap-product-media-bucket";
import { MinioProductMediaStorage } from "../../../catalog/infrastructure/storage/minio-product-media.storage";
import { runInventoryMigrations } from "../database/run-inventory-migrations";
import { seedInventory } from "./inventory.seed";

const databaseUrl = process.env.TEST_DATABASE_URL;
const endpoint = process.env.MINIO_ENDPOINT;
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;
const bucket = process.env.MINIO_BUCKET;
const configured = [databaseUrl, endpoint, accessKey, secretKey, bucket].every((value) => value !== undefined);
const describeWithInfrastructure = configured ? describe : describe.skip;

describeWithInfrastructure("NovaCommerce inventory seed", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const transactions = new PostgresTransactionRunner(pool);
  const endpointUrl = new URL(endpoint!);
  const minio = new Client({
    endPoint: endpointUrl.hostname,
    port: Number(endpointUrl.port || 80),
    useSSL: endpointUrl.protocol === "https:",
    accessKey: accessKey!,
    secretKey: secretKey!,
  });
  const storage = new MinioProductMediaStorage(minio, bucket!);

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await runInventoryMigrations(databaseUrl!, "up");
    await bootstrapProductMediaBucket(minio, bucket!);
  });
  afterAll(async () => {
    const objects: string[] = [];
    for await (const item of minio.listObjectsV2(bucket!, "seed/catalog/", true)) {
      if (item.name !== undefined) objects.push(item.name);
    }
    if (objects.length > 0) await minio.removeObjects(bucket!, objects);
    await runInventoryMigrations(databaseUrl!, "down");
    await runCatalogMigrations(databaseUrl!, "down");
    if (await minio.bucketExists(bucket!)) await minio.removeBucket(bucket!);
    await pool.end();
  });

  it("seeds explanatory technology stock and publication exactly once", async () => {
    await seedCatalog(transactions, storage);
    await seedInventory(transactions);
    await seedCatalog(transactions, storage);
    await seedInventory(transactions);

    const items = Number((await pool.query("SELECT count(*) FROM inventory_items")).rows[0].count);
    const receipts = Number((await pool.query("SELECT count(*) FROM stock_movements WHERE movement_type = 'receive'")).rows[0].count);
    const published = Number((await pool.query("SELECT count(*) FROM products WHERE status = 'published'")).rows[0].count);
    expect(items).toBe(24);
    expect(receipts).toBe(items);
    expect(published).toBeGreaterThan(0);
    expect(Number((await pool.query("SELECT count(*) FROM inventory_items WHERE on_hand - reserved = 0")).rows[0].count)).toBeGreaterThan(0);
    expect(Number((await pool.query("SELECT count(*) FROM inventory_items WHERE reserved > 0")).rows[0].count)).toBeGreaterThan(0);
  });
});
