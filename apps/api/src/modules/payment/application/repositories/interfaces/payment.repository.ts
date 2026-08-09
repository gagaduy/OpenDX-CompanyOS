// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { Payment } from "../../../domain/entities/payment";
import type { PaymentAttempt } from "../../../domain/entities/payment-attempt";
import type { PaymentEvent } from "../../../domain/entities/payment-event";
import type { PaymentReconciliation } from "../../../domain/entities/payment-reconciliation";
import type { PaymentListQuery, PaymentSummaryDto } from "../../dtos/payment-admin.dto";

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
  findByInvoiceNumber(session: DatabaseSession, invoiceNumber: string, lock?: boolean): Promise<PaymentAggregate | undefined>;
  insertEvent(session: DatabaseSession, event: PaymentEvent): Promise<boolean>;
  linkEvent(session: DatabaseSession, eventId: string, paymentId: string, attemptId: string): Promise<void>;
  updateEventResult(session: DatabaseSession, eventId: string, result: PaymentEvent["processingResult"], processedAt: string, failureReason?: string): Promise<void>;
  list(
    session: DatabaseSession,
    query: PaymentListQuery,
  ): Promise<{
    readonly items: readonly PaymentSummaryDto[];
    readonly totalItems: number;
  }>;
  listEvents(
    session: DatabaseSession,
    paymentId: string,
  ): Promise<readonly PaymentEvent[]>;
  listReconciliations(
    session: DatabaseSession,
    paymentId: string,
  ): Promise<readonly PaymentReconciliation[]>;
  insertReconciliation(
    session: DatabaseSession,
    reconciliation: PaymentReconciliation,
  ): Promise<void>;
  attachProviderOrderId(
    session: DatabaseSession,
    attemptId: string,
    providerOrderId: string,
  ): Promise<boolean>;
  listDuePending(
    session: DatabaseSession,
    limit: number,
  ): Promise<readonly PaymentAggregate[]>;
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
