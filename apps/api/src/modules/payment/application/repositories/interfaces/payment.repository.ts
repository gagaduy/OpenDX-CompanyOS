// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { Payment } from "../../../domain/entities/payment";
import type { PaymentAttempt } from "../../../domain/entities/payment-attempt";

export interface PaymentAggregate {
  readonly payment: Payment;
  readonly activeAttempt: PaymentAttempt;
}

export interface PaymentRepository {
  create(session: DatabaseSession, payment: Payment, attempt: PaymentAttempt): Promise<void>;
  findById(session: DatabaseSession, paymentId: string, lock?: boolean): Promise<PaymentAggregate | undefined>;
  findByOrderId(session: DatabaseSession, orderId: string, lock?: boolean): Promise<PaymentAggregate | undefined>;
  updateState(
    session: DatabaseSession,
    payment: Payment,
    attempt: PaymentAttempt,
    expectedPaymentVersion: number,
  ): Promise<boolean>;
  appendAudit(session: DatabaseSession, entry: {
    readonly id: string;
    readonly actorType: "customer" | "staff" | "system" | "provider";
    readonly actorId: string;
    readonly action: string;
    readonly resourceId: string;
    readonly correlationId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly occurredAt: string;
  }): Promise<void>;
}
