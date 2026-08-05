// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type InventoryApplicationErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "INVENTORY_ITEM_NOT_FOUND"
  | "STALE_VERSION"
  | "VARIANT_NOT_FOUND"
  | "VARIANT_NOT_ACTIVE";

export class InventoryApplicationError extends Error {
  constructor(
    readonly code: InventoryApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InventoryApplicationError";
  }
}
