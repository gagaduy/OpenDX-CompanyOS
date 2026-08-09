// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface SupportAttachmentStorage {
  put(objectKey: string, content: Buffer, mediaType: string): Promise<void>;
  open(objectKey: string): Promise<NodeJS.ReadableStream>;
  delete(objectKey: string): Promise<void>;
}
