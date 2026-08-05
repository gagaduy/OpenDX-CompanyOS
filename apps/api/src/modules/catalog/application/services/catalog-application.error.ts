// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CatalogApplicationErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "STALE_VERSION"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "MEDIA_TOO_LARGE"
  | "VALIDATION_ERROR"
  | "PRODUCT_NOT_PUBLISHED"
  | "PRODUCT_NOT_READY_FOR_PUBLICATION";

export class CatalogApplicationError extends Error {
  constructor(
    readonly code: CatalogApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CatalogApplicationError";
  }
}
