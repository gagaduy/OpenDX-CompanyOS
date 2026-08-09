// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { PaymentStatus } from "../../domain/entities/payment";
import type { PaymentMethod } from "../../domain/entities/payment-attempt";
import type { PaymentInitiation } from "../providers/payment-gateway";

export interface PendingPaymentDto {
  readonly paymentId: string;
  readonly attemptId: string;
  readonly orderId: string;
  readonly invoiceNumber: string;
  readonly expectedAmountVnd: number;
  readonly currency: "VND";
  readonly status: PaymentStatus;
  readonly expiresAt: string;
  readonly paymentMethod?: PaymentMethod;
}

export interface InitiatedPaymentDto extends PendingPaymentDto {
  readonly status: "pending_provider";
  readonly initiation: PaymentInitiation;
}
