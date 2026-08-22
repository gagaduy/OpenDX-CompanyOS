// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type AgenticIntakeFileFormat = "csv" | "txt";

export type AgenticIntakeFileStatus =
  | "uploaded"
  | "scanning"
  | "clean"
  | "previewed"
  | "approved"
  | "rejected"
  | "deleted";

export interface AgenticIntakeFile {
  readonly id: string;
  readonly objectKey: string;
  readonly originalFilename: string;
  readonly format: AgenticIntakeFileFormat;
  readonly mediaType: "text/csv" | "text/plain";
  readonly byteSize: number;
  readonly payloadDigest: string;
  readonly status: AgenticIntakeFileStatus;
  readonly createdBy: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly scannedAt?: string;
  readonly approvedAt?: string;
  readonly rejectedAt?: string;
  readonly deletedAt?: string;
}

export interface AgenticFilePreview {
  readonly id: string;
  readonly fileId: string;
  readonly previewVersion: number;
  readonly parserVersion: string;
  readonly payloadDigest: string;
  readonly previewDigest: string;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}
