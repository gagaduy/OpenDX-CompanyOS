// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export class CheckoutDomainError extends Error {
  constructor(readonly code: "INVALID_CHECKOUT" | "MONEY_OVERFLOW", message: string) {
    super(message);
    this.name = "CheckoutDomainError";
  }
}
