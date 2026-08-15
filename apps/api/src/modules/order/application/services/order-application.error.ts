// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type OrderApplicationErrorCode = "ORDER_NOT_FOUND" | "FORBIDDEN" | "STALE_VERSION" | "IDEMPOTENCY_CONFLICT" | "ORDER_ALREADY_PAID" | "ORDER_NOT_CANCELABLE" | "VALIDATION_ERROR" | "UNSAFE_HEALTH_VALUE";
export class OrderApplicationError extends Error {
  constructor(readonly code: OrderApplicationErrorCode, message: string) {
    super(message);
    this.name = "OrderApplicationError";
  }
}
