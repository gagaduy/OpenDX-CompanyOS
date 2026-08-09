// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CartDto } from "../../dtos/cart.dto";
import type { DatabaseSession } from "../../../../../shared/database/transaction";

export interface CheckoutReadyCartSnapshot {
  readonly cartId: string;
  readonly cartVersion: number;
  readonly items: readonly {
    readonly cartItemId: string;
    readonly variantId: string;
    readonly quantity: number;
    readonly lastValidatedUnitPriceVnd: number;
  }[];
}

export interface CheckoutReadyCartReader {
  getCheckoutReady(customerId: string, expiresAt: string): Promise<CartDto>;
  lockForCheckout(session: DatabaseSession, customerId: string, expiresAt: string): Promise<CheckoutReadyCartSnapshot>;
}
