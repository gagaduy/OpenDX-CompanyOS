// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { Client } from "minio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MinioSupportAttachmentStorage } from "./minio-support-attachment.storage";

const endpoint = process.env.MINIO_ENDPOINT;
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;
const bucket = process.env.MINIO_SUPPORT_BUCKET ?? process.env.MINIO_BUCKET;
const configured = [endpoint, accessKey, secretKey, bucket].every(value => value !== undefined);

describe("MinioSupportAttachmentStorage", () => {
  const run = configured ? it : it.skip;
  const objectKey = "support/test/attachment.txt";

  run("puts, opens, and deletes private attachment objects", async () => {
    const endpointUrl = new URL(endpoint!);
    const minio = new Client({ endPoint:endpointUrl.hostname, port:Number(endpointUrl.port || (endpointUrl.protocol==="https:"?443:80)), useSSL:endpointUrl.protocol==="https:", accessKey:accessKey!, secretKey:secretKey! });
    const storage = new MinioSupportAttachmentStorage(minio, bucket!);
    if (!(await minio.bucketExists(bucket!))) await minio.makeBucket(bucket!);
    await storage.put(objectKey, Buffer.from("evidence"), "text/plain");
    const chunks: Buffer[] = [];
    for await (const chunk of await storage.open(objectKey)) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toBe("evidence");
    await storage.delete(objectKey);
    await expect(storage.open(objectKey)).rejects.toThrow();
    await minio.removeObject(bucket!, objectKey).catch(() => undefined);
  });
});
