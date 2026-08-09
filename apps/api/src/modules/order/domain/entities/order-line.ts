// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface OrderLine {
  readonly id: string;
  readonly orderId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly variantLabel: string;
  readonly quantity: number;
  readonly unitPriceVnd: number;
  readonly discountAllocationVnd: number;
  readonly lineTotalVnd: number;
  readonly linePosition: number;
}
