// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type PaymentDomainErrorCode = "INVALID_PAYMENT" | "INVALID_PAYMENT_TRANSITION";
export class PaymentDomainError extends Error {
  constructor(readonly code: PaymentDomainErrorCode, message: string) {
    super(message);
    this.name = "PaymentDomainError";
  }
}
