// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type SupportAttachmentFormat = "jpg" | "png" | "webp" | "pdf" | "txt" | "csv" | "docx" | "xlsx";
export type SupportAttachmentStatus = "quarantined" | "clean" | "rejected" | "deleted";

export interface SupportAttachment {
  readonly id: string;
  readonly ticketId: string;
  readonly objectKey: string;
  readonly originalFilename: string;
  readonly format: SupportAttachmentFormat;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly status: SupportAttachmentStatus;
  readonly createdById: string;
  readonly createdAt: string;
  readonly scannedAt?: string;
  readonly rejectedAt?: string;
  readonly deletedAt?: string;
}
