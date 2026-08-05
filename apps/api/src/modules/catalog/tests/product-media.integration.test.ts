// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Client } from "minio";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCatalogMigrations } from "../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import { ProductMediaService } from "../application/services/implementations/product-media.service";
import { PostgresqlCatalogAuditRepository } from "../infrastructure/repositories/implementations/postgresql-catalog-audit.repository";
import { PostgresqlProductMediaRepository } from "../infrastructure/repositories/implementations/postgresql-product-media.repository";
import { PostgresqlProductRepository } from "../infrastructure/repositories/implementations/postgresql-product.repository";
import { bootstrapProductMediaBucket } from "../infrastructure/storage/bootstrap-product-media-bucket";
import {
  FileTypeProductMediaInspector,
  MinioProductMediaStorage,
} from "../infrastructure/storage/minio-product-media.storage";

const databaseUrl = process.env.TEST_DATABASE_URL;
const endpoint = process.env.MINIO_ENDPOINT;
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;
const bucket = process.env.MINIO_BUCKET;
const configured = [databaseUrl, endpoint, accessKey, secretKey, bucket].every(
  (value) => value !== undefined,
);
const describeWithInfrastructure = configured ? describe : describe.skip;
const ids = {
  category: "81000000-0000-4000-8000-000000000001",
  product: "82000000-0000-4000-8000-000000000001",
  mediaA: "83000000-0000-4000-8000-000000000001",
  auditA: "84000000-0000-4000-8000-000000000001",
  mediaB: "83000000-0000-4000-8000-000000000002",
  auditB: "84000000-0000-4000-8000-000000000002",
  auditC: "84000000-0000-4000-8000-000000000003",
  auditD: "84000000-0000-4000-8000-000000000004",
} as const;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describeWithInfrastructure("Product media PostgreSQL and MinIO integration", () => {
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
  const generatedIds = Object.values(ids).slice(2)[Symbol.iterator]();
  const service = new ProductMediaService(
    new PostgresqlProductMediaRepository(),
    new PostgresqlProductRepository(),
    storage,
    new FileTypeProductMediaInspector(),
    new PostgresqlCatalogAuditRepository(),
    transactions,
    () => generatedIds.next().value!,
    () => "2026-08-05T00:00:00.000Z",
    10 * 1024 * 1024,
  );
  const context = { actorId: "user_catalog", correlationId: "corr_media" };

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await bootstrapProductMediaBucket(minio, bucket!);
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
    const objects: string[] = [];
    const stream = minio.listObjectsV2(bucket!, "", true);
    for await (const item of stream) if (item.name !== undefined) objects.push(item.name);
    if (objects.length > 0) await minio.removeObjects(bucket!, objects);
    if (await minio.bucketExists(bucket!)) await minio.removeBucket(bucket!);
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("uploads sniffed bytes and atomically maintains one primary row", async () => {
    const first = await service.upload(
      ids.product,
      { bytes: png, suppliedContentType: "application/octet-stream", altText: "Front", sortOrder: 1, isPrimary: true },
      context,
    );
    const second = await service.upload(
      ids.product,
      { bytes: png, suppliedContentType: "image/jpeg", altText: "Side", sortOrder: 0, isPrimary: true },
      context,
    );
    expect(first.contentType).toBe("image/png");
    expect((await service.getContent(ids.product, first.id)).bytes).toEqual(png);
    const listed = await service.list(ids.product);
    expect(listed.filter(({ isPrimary }) => isPrimary)).toEqual([
      expect.objectContaining({ id: second.id }),
    ]);
    expect(listed.map(({ id }) => id)).toEqual([second.id, first.id]);
  });

  it("updates primary/order metadata and deletes objects idempotently", async () => {
    const listed = await service.list(ids.product);
    const first = listed.find(({ altText }) => altText === "Front")!;
    await service.update(ids.product, first.id, { altText: "Bottle front", sortOrder: 0, isPrimary: true }, context);
    expect((await service.list(ids.product)).filter(({ isPrimary }) => isPrimary)).toEqual([
      expect.objectContaining({ id: first.id }),
    ]);
    await service.delete(ids.product, first.id, context);
    await service.delete(ids.product, first.id, context);
    await expect(storage.get(first.objectKey)).rejects.toThrow();
  });
});
