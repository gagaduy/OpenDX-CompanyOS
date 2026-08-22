// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type ReportingApplicationErrorCode =
  | "FORBIDDEN"
  | "INVALID_RANGE"
  | "UNSAFE_REPORTING_VALUE";

export class ReportingApplicationError extends Error {
  constructor(
    readonly code: ReportingApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReportingApplicationError";
  }
}
