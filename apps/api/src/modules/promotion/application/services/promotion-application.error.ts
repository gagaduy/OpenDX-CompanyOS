// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type PromotionApplicationErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "IDEMPOTENCY_CONFLICT";

export class PromotionApplicationError extends Error {
  constructor(readonly code: PromotionApplicationErrorCode, message: string) {
    super(message);
    this.name = "PromotionApplicationError";
  }
}
