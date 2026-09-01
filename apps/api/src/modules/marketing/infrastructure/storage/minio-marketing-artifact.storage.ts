// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Client } from "minio";
import type {
  MarketingPublicMediaStoragePort,
  MarketingPublicMediaVariant,
  WriteMarketingPublicMediaVariant,
} from "../../application/ports/marketing-public-media-storage.port";

function assertMarketingStorageKey(key: string): void {
  if (!key.startsWith("marketing/") || key.includes("..") || key.includes("\\")) {
    throw new Error(`Unsafe marketing storage key: ${key}`);
  }
}

function isMissingObjectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === "NoSuchKey" || error.code === "NotFound";
}

function getContentType(metadata: Record<string, unknown>): unknown {
  return Object.entries(metadata).find(
    ([key]) => key.toLowerCase() === "content-type",
  )?.[1];
}

export class MinioMarketingArtifactStorage
  implements MarketingPublicMediaStoragePort
{
  constructor(
    private readonly client: Pick<
      Client,
      "getObject" | "putObject" | "statObject"
    >,
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

  async readVariant(
    key: string,
  ): Promise<MarketingPublicMediaVariant | null> {
    assertMarketingStorageKey(key);

    let metadata: Record<string, unknown>;
    try {
      const stat = await this.client.statObject(this.bucket, key);
      metadata = stat.metaData;
    } catch (error) {
      if (isMissingObjectError(error)) {
        return null;
      }
      throw error;
    }

    if (getContentType(metadata) !== "image/jpeg") {
      throw new Error("Stored Marketing public media variant must be image/jpeg");
    }

    let stream: Awaited<ReturnType<Client["getObject"]>>;
    try {
      stream = await this.client.getObject(this.bucket, key);
    } catch (error) {
      if (isMissingObjectError(error)) {
        return null;
      }
      throw error;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return {
      bytes: Buffer.concat(chunks),
      mediaType: "image/jpeg",
    };
  }

  async writeVariant(input: WriteMarketingPublicMediaVariant): Promise<void> {
    assertMarketingStorageKey(input.key);
    await this.client.putObject(
      this.bucket,
      input.key,
      input.bytes,
      input.bytes.byteLength,
      {
        "Content-Type": "image/jpeg",
        "source-asset-id": input.sourceAssetId,
        "source-digest": input.sourceDigest,
        "output-digest": input.outputDigest,
        width: String(input.width),
        height: String(input.height),
      },
    );
  }
}
