// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type InventoryDomainErrorCode =
  | "INSUFFICIENT_STOCK"
  | "INVALID_INVENTORY_BALANCE"
  | "INVALID_RESERVATION_QUANTITY"
  | "INVALID_STOCK_ADJUSTMENT"
  | "INVALID_STOCK_QUANTITY"
  | "RESERVATION_ALREADY_FINALIZED";

export class InventoryDomainError extends Error {
  constructor(
    readonly code: InventoryDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InventoryDomainError";
  }
}
