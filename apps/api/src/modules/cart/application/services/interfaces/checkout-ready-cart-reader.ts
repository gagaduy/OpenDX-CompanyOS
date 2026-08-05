// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CartDto } from "../../dtos/cart.dto";

export interface CheckoutReadyCartReader {
  getCheckoutReady(customerId: string, expiresAt: string): Promise<CartDto>;
}
