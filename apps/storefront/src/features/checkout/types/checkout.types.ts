// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { z } from "zod";
import type {
  checkoutCreationSchema,
  checkoutSchema,
} from "../schemas/checkout.schema";

export type Checkout = z.infer<typeof checkoutSchema>;
export type CheckoutCreation = z.infer<typeof checkoutCreationSchema>;

export interface CreateCheckoutInput {
  readonly addressId: string;
  readonly promotionCode?: string;
  readonly paymentMethod?: "CARD" | "BANK_TRANSFER" | "NAPAS_BANK_TRANSFER";
}
