// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CrmApplicationErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "NOTE_NOT_FOUND"
  | "FOLLOWUP_NOT_FOUND"
  | "STALE_VERSION"
  | "INVALID_SEGMENT"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "UNSAFE_HEALTH_VALUE";

export class CrmApplicationError extends Error {
  constructor(readonly code: CrmApplicationErrorCode, message: string) {
    super(message);
    this.name = "CrmApplicationError";
  }
}
