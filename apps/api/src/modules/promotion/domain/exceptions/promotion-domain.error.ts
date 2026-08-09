// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type PromotionDomainErrorCode =
  | "INVALID_PROMOTION"
  | "PROMOTION_NOT_ACTIVE"
  | "PROMOTION_NOT_STARTED"
  | "PROMOTION_EXPIRED"
  | "MINIMUM_SUBTOTAL_NOT_MET"
  | "PROMOTION_USAGE_LIMIT_REACHED"
  | "PROMOTION_CUSTOMER_LIMIT_REACHED"
  | "ZERO_TOTAL_NOT_SUPPORTED"
  | "INVALID_REDEMPTION_TRANSITION";

export class PromotionDomainError extends Error {
  constructor(readonly code: PromotionDomainErrorCode, message: string) {
    super(message);
    this.name = "PromotionDomainError";
  }
}
