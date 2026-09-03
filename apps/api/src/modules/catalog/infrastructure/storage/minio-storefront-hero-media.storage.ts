// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Client } from "minio";
import type { StorefrontHeroMediaStorage } from "../../application/storage/storefront-hero-media.storage";

export class MinioStorefrontHeroMediaStorage implements StorefrontHeroMediaStorage {
  constructor(
    private readonly client: Client,
    private readonly bucket: string,
  ) {}

  async upload(input: {
    readonly objectKey: string;
    readonly bytes: Uint8Array;
    readonly contentType: "video/mp4";
  }): Promise<void> {
    const buffer = Buffer.from(input.bytes);
    await this.client.putObject(
      this.bucket,
      input.objectKey,
      buffer,
      buffer.byteLength,
      { "Content-Type": input.contentType },
    );
  }

  async open(
    objectKey: string,
    range?: { readonly offset: number; readonly length: number },
  ): Promise<AsyncIterable<Uint8Array>> {
    return range === undefined
      ? this.client.getObject(this.bucket, objectKey)
      : this.client.getPartialObject(this.bucket, objectKey, range.offset, range.length);
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, objectKey);
      return true;
    } catch (error) {
      if (isMissingObjectError(error)) return false;
      throw error;
    }
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }
}

function isMissingObjectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { readonly code?: unknown }).code;
  return code === "NoSuchKey" || code === "NoSuchObject" || code === "NotFound";
}
