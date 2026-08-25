// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PaymentInitiation, PaymentMethod } from "../../../payment";

export interface CreateCheckoutRequest {
  readonly addressId: string;
  readonly promotionCode?: string;
  readonly paymentMethod?: PaymentMethod;
  readonly idempotencyKey: string;
}
export interface CheckoutCustomerContext {
  readonly customerId: string;
  readonly customerExpiresAt: string;
  readonly correlationId: string;
}
export interface CheckoutLineDto {
  readonly sku: string;
  readonly productTitle: string;
  readonly variantLabel: string;
  readonly quantity: number;
  readonly unitPriceVnd: number;
  readonly lineSubtotalVnd: number;
}
export interface CheckoutDto {
  readonly id: string;
  readonly orderId: string;
  readonly status: "order_created" | "completed" | "expired" | "canceled";
  readonly subtotalVnd: number;
  readonly discountVnd: number;
  readonly totalVnd: number;
  readonly currency: "VND";
  readonly expiresAt: string;
  readonly promotionCode?: string;
  readonly lines: readonly CheckoutLineDto[];
}
export interface CheckoutCreationDto extends CheckoutDto {
  readonly payment: PaymentInitiation;
}
