// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { AgenticIntakeFile } from "../entities/agentic-file";
import { AgenticDomainError } from "../exceptions/agentic-domain.error";
import {
  AGENTIC_FILE_LIMITS,
  transitionAgenticIntakeFile,
  validateAgenticFileUpload,
} from "./agentic-file-rules";

const createdAt = "2026-08-22T00:00:00.000Z";

function intakeFile(status: AgenticIntakeFile["status"] = "uploaded"): AgenticIntakeFile {
  return {
    id: "file-1",
    objectKey: "agentic-intake/file-1",
    originalFilename: "catalog.csv",
    format: "csv",
    mediaType: "text/csv",
    byteSize: 32,
    payloadDigest: "a".repeat(64),
    status,
    createdBy: "governance-admin",
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

function expectDomainError(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining<Partial<AgenticDomainError>>({ code }));
}

describe("agentic file intake rules", () => {
  it.each([
    ["csv", "text/csv", "text"],
    ["txt", "text/plain", "text"],
  ] as const)("accepts bounded %s input only when declared MIME agrees with content signature", (extension, mediaType, signature) => {
    expect(validateAgenticFileUpload({
      extension,
      mediaType,
      signature,
      byteSize: AGENTIC_FILE_LIMITS.maxFileBytes,
      rowCount: 10_000,
      columnCount: 64,
      largestFieldBytes: 16 * 1024,
      hasValidUtf8: true,
      hasNulByte: false,
    })).toEqual({ format: extension });
  });

  it("rejects unsupported, binary, malformed, and over-limit input before it becomes task context", () => {
    for (const input of [
      { extension: "pdf", mediaType: "application/pdf", signature: "pdf" },
      { extension: "csv", mediaType: "text/plain", signature: "text" },
      { extension: "txt", mediaType: "text/plain", signature: "zip" },
    ]) {
      expectDomainError(() => validateAgenticFileUpload({
        ...input,
        byteSize: 1,
        rowCount: 1,
        columnCount: 1,
        largestFieldBytes: 1,
        hasValidUtf8: true,
        hasNulByte: false,
      }), "FILE_TYPE_NOT_ALLOWED");
    }

    for (const input of [
      { byteSize: AGENTIC_FILE_LIMITS.maxFileBytes + 1 },
      { rowCount: 10_001 },
      { columnCount: 65 },
      { largestFieldBytes: 16 * 1024 + 1 },
      { hasValidUtf8: false },
      { hasNulByte: true },
    ]) {
      expectDomainError(() => validateAgenticFileUpload({
        extension: "csv",
        mediaType: "text/csv",
        signature: "text",
        byteSize: 1,
        rowCount: 1,
        columnCount: 1,
        largestFieldBytes: 1,
        hasValidUtf8: true,
        hasNulByte: false,
        ...input,
      }), "FILE_CONTENT_INVALID");
    }
  });

  it("allows only the approved immutable intake lifecycle", () => {
    const scanning = transitionAgenticIntakeFile(intakeFile(), "scanning", "2026-08-22T00:01:00.000Z");
    const clean = transitionAgenticIntakeFile(scanning, "clean", "2026-08-22T00:02:00.000Z");
    const previewed = transitionAgenticIntakeFile(clean, "previewed", "2026-08-22T00:03:00.000Z");
    const approved = transitionAgenticIntakeFile(previewed, "approved", "2026-08-22T00:04:00.000Z");

    expect(approved).toMatchObject({
      status: "approved",
      version: 5,
      scannedAt: "2026-08-22T00:02:00.000Z",
      approvedAt: "2026-08-22T00:04:00.000Z",
    });
    expect(transitionAgenticIntakeFile(intakeFile("scanning"), "rejected", "2026-08-22T00:02:00.000Z"))
      .toMatchObject({ status: "rejected", rejectedAt: "2026-08-22T00:02:00.000Z" });
    expectDomainError(
      () => transitionAgenticIntakeFile(clean, "approved", "2026-08-22T00:03:00.000Z"),
      "FILE_STATE_INVALID",
    );
    expect(transitionAgenticIntakeFile(approved, "deleted", "2026-09-21T00:04:00.000Z"))
      .toMatchObject({ status: "deleted", deletedAt: "2026-09-21T00:04:00.000Z" });
  });
});
