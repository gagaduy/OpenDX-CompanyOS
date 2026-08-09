// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type CheckoutApplicationErrorCode = "CHECKOUT_NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "CART_ALREADY_CHECKED_OUT" | "PRODUCT_CHANGED" | "PAYMENT_PROVIDER_NOT_CONFIGURED" | "CHECKOUT_EXPIRED" | "CHECKOUT_NOT_CANCELABLE";
export class CheckoutApplicationError extends Error {
  constructor(readonly code: CheckoutApplicationErrorCode, message: string) { super(message); this.name = "CheckoutApplicationError"; }
}
