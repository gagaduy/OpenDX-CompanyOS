// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Client } from "minio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapProductMediaBucket } from "./bootstrap-product-media-bucket";
import { MinioStorefrontHeroMediaStorage } from "./minio-storefront-hero-media.storage";

const endpoint = process.env.MINIO_ENDPOINT;
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;
const bucket = process.env.MINIO_BUCKET;
const configured = [endpoint, accessKey, secretKey, bucket].every((value) => value !== undefined);
const describeWithMinio = configured ? describe : describe.skip;

describeWithMinio("MinioStorefrontHeroMediaStorage", () => {
  const endpointUrl = new URL(endpoint!);
  const minio = new Client({
    endPoint: endpointUrl.hostname,
    port: Number(endpointUrl.port || (endpointUrl.protocol === "https:" ? 443 : 80)),
    useSSL: endpointUrl.protocol === "https:",
    accessKey: accessKey!,
    secretKey: secretKey!,
  });
  const storage = new MinioStorefrontHeroMediaStorage(minio, bucket!);
  const objectKey = "storefront/hero/" + "b".repeat(64) + ".mp4";
  const bytes = Buffer.from(Array.from({ length: 24 }, (_, index) => index));

  beforeAll(async () => bootstrapProductMediaBucket(minio, bucket!));
  afterAll(async () => {
    await minio.removeObject(bucket!, objectKey).catch(() => undefined);
  });

  it("uploads, opens complete and ranged content, and deletes the object", async () => {
    expect(await storage.exists(objectKey)).toBe(false);

    await storage.upload({ objectKey, bytes, contentType: "video/mp4" });

    expect(await storage.exists(objectKey)).toBe(true);
    expect(await collect(await storage.open(objectKey))).toEqual(bytes);
    expect(await collect(await storage.open(objectKey, { offset: 4, length: 8 }))).toEqual(
      bytes.subarray(4, 12),
    );

    await storage.delete(objectKey);
    expect(await storage.exists(objectKey)).toBe(false);
  });
});

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
