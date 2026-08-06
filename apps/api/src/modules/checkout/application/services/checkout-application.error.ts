// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CheckoutApplicationErrorCode = "CHECKOUT_NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "PRODUCT_CHANGED" | "PAYMENT_PROVIDER_NOT_CONFIGURED" | "CHECKOUT_EXPIRED";
export class CheckoutApplicationError extends Error {
  constructor(readonly code: CheckoutApplicationErrorCode, message: string) { super(message); this.name = "CheckoutApplicationError"; }
}
