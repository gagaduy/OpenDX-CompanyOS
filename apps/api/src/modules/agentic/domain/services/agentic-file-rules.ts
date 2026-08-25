// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  AgenticIntakeFile,
  AgenticIntakeFileFormat,
  AgenticIntakeFileStatus,
} from "../entities/agentic-file";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";

export const AGENTIC_FILE_LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxRows: 10_000,
  maxColumns: 64,
  maxFieldBytes: 16 * 1024,
  maxPreviewBytes: 256 * 1024,
  maxInvalidRowSamples: 100,
  maxSourceSamples: 50,
  maxProcessingMs: 5_000,
} as const;

const expectedFileTypes: Readonly<Record<AgenticIntakeFileFormat, {
  readonly mediaType: "text/csv" | "text/plain";
  readonly signature: "text";
}>> = {
  csv: { mediaType: "text/csv", signature: "text" },
  txt: { mediaType: "text/plain", signature: "text" },
};

const allowedTransitions: Readonly<Record<AgenticIntakeFileStatus, readonly AgenticIntakeFileStatus[]>> = {
  uploaded: ["scanning", "rejected"],
  scanning: ["clean", "rejected"],
  clean: ["previewed", "rejected"],
  previewed: ["approved", "rejected"],
  approved: ["deleted"],
  rejected: ["deleted"],
  deleted: [],
};

export interface AgenticFileUploadInput {
  readonly extension: string;
  readonly mediaType: string;
  readonly signature: string;
  readonly byteSize: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly largestFieldBytes: number;
  readonly hasValidUtf8: boolean;
  readonly hasNulByte: boolean;
}

export function validateAgenticFileUpload(input: AgenticFileUploadInput): {
  readonly format: AgenticIntakeFileFormat;
} {
  const format = input.extension.trim().toLowerCase() as AgenticIntakeFileFormat;
  const expected = expectedFileTypes[format];
  if (expected === undefined || input.mediaType !== expected.mediaType || input.signature !== expected.signature) {
    fail("FILE_TYPE_NOT_ALLOWED", "Only CSV and plain-text file intake is allowed");
  }
  if (
    !isBoundedInteger(input.byteSize, 1, AGENTIC_FILE_LIMITS.maxFileBytes)
    || !isBoundedInteger(input.rowCount, 1, AGENTIC_FILE_LIMITS.maxRows)
    || !isBoundedInteger(input.columnCount, 1, AGENTIC_FILE_LIMITS.maxColumns)
    || !isBoundedInteger(input.largestFieldBytes, 0, AGENTIC_FILE_LIMITS.maxFieldBytes)
    || !input.hasValidUtf8
    || input.hasNulByte
  ) {
    fail("FILE_CONTENT_INVALID", "File content exceeds the safe intake limits");
  }
  return { format };
}

export function transitionAgenticIntakeFile(
  file: AgenticIntakeFile,
  target: AgenticIntakeFileStatus,
  at: string,
): AgenticIntakeFile {
  if (!allowedTransitions[file.status].includes(target)) {
    fail("FILE_STATE_INVALID", "File intake transition is not allowed");
  }
  return {
    ...file,
    status: target,
    version: file.version + 1,
    updatedAt: at,
    scannedAt: target === "clean" ? at : file.scannedAt,
    approvedAt: target === "approved" ? at : file.approvedAt,
    rejectedAt: target === "rejected" ? at : file.rejectedAt,
    deletedAt: target === "deleted" ? at : file.deletedAt,
  };
}

function isBoundedInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function fail(code: string, message: string): never {
  throw new AgenticDomainError(code, message);
}
