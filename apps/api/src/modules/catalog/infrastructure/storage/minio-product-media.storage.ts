// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { fileTypeFromBuffer } from "file-type";
import type { Client } from "minio";
import type { ProductImageContentType } from "../../domain/entities/product-media";
import type {
  ProductMediaInspector,
  ProductMediaStorage,
} from "../../application/storage/product-media.storage";

const ALLOWED = new Set<ProductImageContentType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export class FileTypeProductMediaInspector implements ProductMediaInspector {
  async detectContentType(bytes: Uint8Array): Promise<ProductImageContentType | undefined> {
    const detected = await fileTypeFromBuffer(bytes);
    return detected !== undefined && ALLOWED.has(detected.mime as ProductImageContentType)
      ? (detected.mime as ProductImageContentType)
      : undefined;
  }
}

export class MinioProductMediaStorage implements ProductMediaStorage {
  constructor(
    private readonly client: Client,
    private readonly bucket: string,
  ) {}

  async upload(
    objectKey: string,
    bytes: Uint8Array,
    contentType: ProductImageContentType,
  ): Promise<void> {
    const buffer = Buffer.from(bytes);
    await this.client.putObject(this.bucket, objectKey, buffer, buffer.byteLength, {
      "Content-Type": contentType,
    });
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }

  async get(objectKey: string): Promise<Uint8Array> {
    const stream = await this.client.getObject(this.bucket, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
