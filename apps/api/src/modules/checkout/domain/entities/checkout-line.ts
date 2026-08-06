// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CheckoutLine {
  readonly id: string;
  readonly checkoutId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly variantLabel: string;
  readonly quantity: number;
  readonly unitPriceVnd: number;
  readonly lineSubtotalVnd: number;
  readonly linePosition: number;
}
