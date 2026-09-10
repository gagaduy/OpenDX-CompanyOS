// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Client } from "minio";
import type {
  MarketingPublicMediaStoragePort,
  MarketingPublicMediaVariant,
  WriteMarketingPublicMediaVariant,
} from "../../application/ports/marketing-public-media-storage.port";
import { MarketingPublicMediaIntegrityError } from "../../application/ports/marketing-public-media-storage.port";

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

function getMetadataValue(metadata: Record<string, unknown>, name: string): unknown {
  return Object.entries(metadata).find(
    ([key]) => key.toLowerCase() === name,
  )?.[1];
}

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "string" || !POSITIVE_INTEGER_PATTERN.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseVariantMetadata(
  metadata: unknown,
): Omit<MarketingPublicMediaVariant, "bytes"> {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw new MarketingPublicMediaIntegrityError();
  }
  const values = metadata as Record<string, unknown>;
  const mediaType = getMetadataValue(values, "content-type");
  const sourceAssetId = getMetadataValue(values, "source-asset-id");
  const sourceDigest = getMetadataValue(values, "source-digest");
  const outputDigest = getMetadataValue(values, "output-digest");
  const policyFingerprint = getMetadataValue(values, "policy-fingerprint");
  const width = parsePositiveInteger(getMetadataValue(values, "width"));
  const height = parsePositiveInteger(getMetadataValue(values, "height"));

  if (
    mediaType !== "image/jpeg"
    || typeof sourceAssetId !== "string"
    || sourceAssetId.trim() === ""
    || sourceAssetId !== sourceAssetId.trim()
    || typeof sourceDigest !== "string"
    || !DIGEST_PATTERN.test(sourceDigest)
    || typeof outputDigest !== "string"
    || !DIGEST_PATTERN.test(outputDigest)
    || typeof policyFingerprint !== "string"
    || !DIGEST_PATTERN.test(policyFingerprint)
    || width === null
    || height === null
  ) {
    throw new MarketingPublicMediaIntegrityError();
  }

  return {
    mediaType: "image/jpeg",
    sourceAssetId,
    sourceDigest,
    outputDigest,
    policyFingerprint,
    width,
    height,
  };
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

    let metadata: unknown;
    try {
      const stat = await this.client.statObject(this.bucket, key);
      metadata = stat.metaData;
    } catch (error) {
      if (isMissingObjectError(error)) {
        return null;
      }
      throw error;
    }

    const provenance = parseVariantMetadata(metadata);

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
      ...provenance,
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
        "policy-fingerprint": input.policyFingerprint,
        width: String(input.width),
        height: String(input.height),
      },
    );
  }
}
