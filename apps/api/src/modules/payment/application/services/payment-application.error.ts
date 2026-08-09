// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type PaymentApplicationErrorCode =
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_NOT_PENDING"
  | "PAYMENT_EXPIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "STALE_VERSION"
  | "FORBIDDEN";

export class PaymentApplicationError extends Error {
  constructor(readonly code: PaymentApplicationErrorCode, message: string) {
    super(message);
    this.name = "PaymentApplicationError";
  }
}
