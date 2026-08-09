// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type OrderDomainErrorCode = "INVALID_ORDER" | "INVALID_ORDER_TRANSITION";

export class OrderDomainError extends Error {
  constructor(readonly code: OrderDomainErrorCode, message: string) {
    super(message);
    this.name = "OrderDomainError";
  }
}
