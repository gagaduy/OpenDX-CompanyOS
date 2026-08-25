// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { PaymentMethod } from "../../../domain/entities/payment-attempt";
import type { InitiatedPaymentDto, PendingPaymentDto } from "../../dtos/payment.dto";

export interface CreatePendingPaymentRequest {
  readonly orderId: string;
  readonly expectedAmountVnd: number;
  readonly expiresAt: string;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly correlationId: string;
  readonly paymentMethod?: PaymentMethod;
}

export interface InitiatePaymentRequest {
  readonly paymentId: string;
  readonly customerId: string;
  readonly orderDescription: string;
  readonly actorId: string;
  readonly correlationId: string;
}

export interface PaymentServiceContract {
  createPending(session: DatabaseSession, request: CreatePendingPaymentRequest): Promise<PendingPaymentDto>;
  initiate(request: InitiatePaymentRequest): Promise<InitiatedPaymentDto>;
}
