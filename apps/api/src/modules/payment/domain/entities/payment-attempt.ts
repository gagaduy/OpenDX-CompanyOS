// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PaymentStatus } from "./payment";
export type PaymentMethod = "CARD" | "BANK_TRANSFER" | "NAPAS_BANK_TRANSFER";
export interface PaymentAttempt {
  readonly id: string;
  readonly paymentId: string;
  readonly providerInvoiceNumber: string;
  readonly providerOrderId?: string;
  readonly paymentMethod?: PaymentMethod;
  readonly state: PaymentStatus;
  readonly idempotencyKey: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
