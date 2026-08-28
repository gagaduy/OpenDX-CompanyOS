// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Client } from "minio";

function assertMarketingStorageKey(key: string): void {
  if (!key.startsWith("marketing/") || key.includes("..") || key.includes("\\")) {
    throw new Error(`Unsafe marketing storage key: ${key}`);
  }
}

export class MinioMarketingArtifactStorage {
  constructor(
    private readonly client: Pick<Client, "getObject" | "putObject">,
    private readonly bucket: string,
  ) {}

  async write(key: string, buffer: Buffer, mediaType: string): Promise<void> {
    assertMarketingStorageKey(key);
    await this.client.putObject(
      this.bucket,
      key,
      buffer,
      buffer.byteLength,
      { "Content-Type": mediaType },
    );
  }

  async read(key: string): Promise<Buffer> {
    assertMarketingStorageKey(key);
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
