// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { Client } from "minio";
import type { SupportAttachmentStorage } from "../../application/storage/support-attachment-storage";

export class MinioSupportAttachmentStorage implements SupportAttachmentStorage {
  constructor(private readonly client: Client, private readonly bucket: string) {}

  async put(objectKey: string, content: Buffer, mediaType: string): Promise<void> {
    await this.client.putObject(this.bucket, objectKey, content, content.byteLength, { "Content-Type": mediaType });
  }

  async open(objectKey: string): Promise<NodeJS.ReadableStream> {
    return this.client.getObject(this.bucket, objectKey);
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }
}
