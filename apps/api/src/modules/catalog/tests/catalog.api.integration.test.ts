// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { generateKeyPair, jwtVerify, SignJWT } from "jose";
import { Client } from "minio";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "../../../app";
import { runCatalogMigrations } from "../../../shared/database/run-migrations";
import { PostgresTransactionRunner } from "../../../shared/database/transaction";
import type { StaffTokenVerifier } from "../../../shared/auth/staff-auth.middleware";
import { createCatalogModule } from "../catalog.module";
import { FileTypeProductMediaInspector, MinioProductMediaStorage } from "../infrastructure/storage/minio-product-media.storage";
import { bootstrapProductMediaBucket } from "../infrastructure/storage/bootstrap-product-media-bucket";

const databaseUrl = process.env.TEST_DATABASE_URL;
const endpoint = process.env.MINIO_ENDPOINT;
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;
const bucket = process.env.MINIO_BUCKET;
const configured = [databaseUrl, endpoint, accessKey, secretKey, bucket].every(
  (value) => value !== undefined,
);
const describeWithInfrastructure = configured ? describe : describe.skip;
const issuer = "https://identity.example.test/realms/opendx";
const audience = "opendx-api";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describeWithInfrastructure("Catalog API composition", () => {
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
  let token: string;
  let app: ReturnType<typeof createApiApp>;

  beforeAll(async () => {
    await runCatalogMigrations(databaseUrl!, "up");
    await bootstrapProductMediaBucket(minio, bucket!);
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const verifier: StaffTokenVerifier = {
      async verify(value) {
        return (await jwtVerify(value, publicKey, { issuer, audience })).payload;
      },
    };
    token = await new SignJWT({
      name: "Catalog Manager",
      realm_access: { roles: ["catalog_manager"] },
    })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("user_catalog")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const catalog = createCatalogModule({
        transactions,
        mediaStorage: new MinioProductMediaStorage(minio, bucket!),
        mediaInspector: new FileTypeProductMediaInspector(),
        staffTokenVerifier: verifier,
        generateId: randomUUID,
        now: () => "2026-08-05T00:00:00.000Z",
        mediaMaximumBytes: 10 * 1024 * 1024,
        availability: { getByVariantIds: async () => new Map() },
      });
    app = createApiApp({
      catalogAdminRouter: catalog.adminRouter,
      storefrontRouter: catalog.publicRouter,
    });
  });

  afterAll(async () => {
    const objects: string[] = [];
    for await (const item of minio.listObjectsV2(bucket!, "", true)) {
      if (item.name !== undefined) objects.push(item.name);
    }
    if (objects.length > 0) await minio.removeObjects(bucket!, objects);
    if (await minio.bucketExists(bucket!)) await minio.removeBucket(bucket!);
    await runCatalogMigrations(databaseUrl!, "down");
    await pool.end();
  });

  it("executes category to product, variant, price, media, and audit through HTTP", async () => {
    const auth = { authorization: `Bearer ${token}`, "x-correlation-id": "corr_catalog_flow" };
    const category = await request(app)
      .post("/v1/admin/catalog/categories")
      .set(auth)
      .send({ name: "Drinkware" })
      .expect(201);
    const product = await request(app)
      .post("/v1/admin/catalog/products")
      .set(auth)
      .send({
        categoryId: category.body.data.id,
        name: "Steel Bottle",
        description: "Reusable bottle",
        attributes: { material: "steel" },
      })
      .expect(201);
    const variant = await request(app)
      .post(`/v1/admin/catalog/products/${product.body.data.id}/variants`)
      .set(auth)
      .send({ sku: "bottle-black", title: "Black", optionValues: { color: "Black" } })
      .expect(201);
    await request(app)
      .put(`/v1/admin/catalog/products/${product.body.data.id}/variants/${variant.body.data.id}/price`)
      .set(auth)
      .send({ amountMinor: 299000, currency: "VND" })
      .expect(200);
    const media = await request(app)
      .post(`/v1/admin/catalog/products/${product.body.data.id}/media`)
      .set(auth)
      .field("altText", "Bottle front")
      .field("isPrimary", "true")
      .attach("file", png, { filename: "bottle.png", contentType: "image/png" })
      .expect(201);
    const audit = await request(app)
      .get(`/v1/admin/catalog/products/${product.body.data.id}/audit`)
      .set(auth)
      .expect(200);

    expect(audit.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "catalog.product.created" }),
      ]),
    );
    await pool.query("UPDATE products SET status = 'published' WHERE id = $1", [
      product.body.data.id,
    ]);
    const publicProduct = await request(app)
      .get(`/v1/storefront/products/${product.body.data.slug}`)
      .expect(200);
    expect(publicProduct.body.data.variants[0]).toMatchObject({
      availableQuantity: 0,
      purchasable: false,
    });
    await request(app)
      .get(`/v1/storefront/products/${product.body.data.id}/media/${media.body.data.id}/content`)
      .expect("content-type", /image\/png/)
      .expect(200);
    const serialized = JSON.stringify({
      product: product.body,
      publicProduct: publicProduct.body,
      media: media.body,
      audit: audit.body,
    });
    for (const forbidden of ["companyId", "object_key", "objectKey", "secretKey", "databaseUrl"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
