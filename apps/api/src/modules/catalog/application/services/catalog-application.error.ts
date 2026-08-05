// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CatalogApplicationErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_VERSION"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "MEDIA_TOO_LARGE"
  | "VALIDATION_ERROR";

export class CatalogApplicationError extends Error {
  constructor(
    readonly code: CatalogApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CatalogApplicationError";
  }
}
