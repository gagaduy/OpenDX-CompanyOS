// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface CartItem {
  readonly id: string;
  readonly cartId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly lastValidatedUnitPriceVnd: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
