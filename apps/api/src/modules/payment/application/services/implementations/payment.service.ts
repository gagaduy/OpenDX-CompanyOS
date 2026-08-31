// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../../shared/database/transaction";
import type { Payment } from "../../../domain/entities/payment";
import type { PaymentAttempt } from "../../../domain/entities/payment-attempt";
import { createProviderInvoiceNumber, transitionPayment, transitionPaymentAttempt, validatePayment } from "../../../domain/services/payment-rules";
import type { InitiatedPaymentDto, PendingPaymentDto } from "../../dtos/payment.dto";
import type { PaymentGateway } from "../../providers/payment-gateway";
import type { PaymentAggregate, PaymentRepository } from "../../repositories/interfaces/payment.repository";
import { PaymentApplicationError } from "../payment-application.error";
import type { CreatePendingPaymentRequest, InitiatePaymentRequest, PaymentServiceContract } from "../interfaces/payment.service";
import type {
  PaymentExpiryPort,
  PaymentExpiryResult,
} from "../interfaces/payment-expiry-port";

export class PaymentService implements PaymentServiceContract, PaymentExpiryPort {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly transactions: TransactionRunner,
    private readonly gateway: PaymentGateway,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async createPending(session: DatabaseSession, request: CreatePendingPaymentRequest): Promise<PendingPaymentDto> {
    const existing = await this.repository.findByOrderId(session, request.orderId, true);
    if (existing !== undefined) {
      assertReplay(existing, request);
      return mapPending(existing);
    }

    const timestamp = this.now();
    const paymentId = this.generateId();
    const attemptId = this.generateId();
    const payment: Payment = {
      id: paymentId,
      orderId: request.orderId,
      provider: "sepay",
      expectedAmountVnd: request.expectedAmountVnd,
      currency: "VND",
      status: "created",
      activeAttemptId: attemptId,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const attempt: PaymentAttempt = {
      id: attemptId,
      paymentId,
      providerInvoiceNumber: createProviderInvoiceNumber(attemptId),
      ...(request.paymentMethod === undefined ? {} : { paymentMethod: request.paymentMethod }),
      state: "created",
      idempotencyKey: request.idempotencyKey,
      expiresAt: request.expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    validatePayment(payment);
    await this.repository.create(session, payment, attempt);
    await this.repository.appendAudit(session, {
      id: this.generateId(), actorType: "customer", actorId: request.actorId,
      action: "payment.created", resourceId: payment.id,
      correlationId: request.correlationId, metadata: { orderId: request.orderId }, occurredAt: timestamp,
    });
    return mapPending({ payment, activeAttempt: attempt });
  }

  async initiate(request: InitiatePaymentRequest): Promise<InitiatedPaymentDto> {
    const current = await this.transactions.runReadOnly((session) => this.repository.findById(session, request.paymentId));
    if (current === undefined) throw new PaymentApplicationError("PAYMENT_NOT_FOUND", "Payment not found");
    ensureInitiatable(current, this.now());

    const initiation = await this.gateway.createCheckout({
      amountVnd: current.payment.expectedAmountVnd,
      invoiceNumber: current.activeAttempt.providerInvoiceNumber,
      orderDescription: request.orderDescription,
      customerId: request.customerId,
      ...(current.activeAttempt.paymentMethod === undefined ? {} : { paymentMethod: current.activeAttempt.paymentMethod }),
    });

    const updated = await this.transactions.run(async (session) => {
      const locked = await this.repository.findById(session, request.paymentId, true);
      if (locked === undefined) throw new PaymentApplicationError("PAYMENT_NOT_FOUND", "Payment not found");
      ensureInitiatable(locked, this.now());
      if (locked.payment.status === "pending_provider") return locked;
      const timestamp = this.now();
      const payment = transitionPayment(locked.payment, "pending_provider", timestamp);
      const attempt = transitionPaymentAttempt(locked.activeAttempt, "pending_provider", timestamp);
      if (!(await this.repository.updateState(session, payment, attempt, locked.payment.version))) {
        throw new PaymentApplicationError("STALE_VERSION", "Payment version is stale");
      }
      await this.repository.appendAudit(session, {
        id: this.generateId(), actorType: "customer", actorId: request.actorId,
        action: "payment.initiated", resourceId: payment.id,
        correlationId: request.correlationId,
        metadata: { invoiceNumber: attempt.providerInvoiceNumber }, occurredAt: timestamp,
      });
      return { payment, activeAttempt: attempt };
    });

    return { ...mapPending(updated), status: "pending_provider", initiation };
  }

  async expireByOrderInSession(
    session: DatabaseSession,
    orderId: string,
    correlationId: string,
    now: string,
  ): Promise<PaymentExpiryResult> {
    const aggregate = await this.repository.findByOrderId(session, orderId, true);
    if (aggregate === undefined) {
      return "expired";
    }
    if (aggregate.payment.status === "paid") return "paid";
    if (aggregate.payment.status === "expired") return "expired";
    if (
      aggregate.payment.status !== "created" &&
      aggregate.payment.status !== "pending_provider"
    ) {
      return "already_terminal";
    }

    const payment = transitionPayment(aggregate.payment, "expired", now);
    const attempt = transitionPaymentAttempt(
      aggregate.activeAttempt,
      "expired",
      now,
    );
    if (
      !(await this.repository.updateState(
        session,
        payment,
        attempt,
        aggregate.payment.version,
      ))
    ) {
      throw new PaymentApplicationError(
        "STALE_VERSION",
        "Payment version is stale",
      );
    }
    await this.repository.appendAudit(session, {
      id: this.generateId(),
      actorType: "system",
      actorId: "system:checkout-expiry",
      action: "payment.expired",
      resourceId: payment.id,
      correlationId,
      metadata: { orderId },
      occurredAt: now,
    });
    return "expired";
  }

  async cancelByOrderInSession(
    session: DatabaseSession,
    orderId: string,
    actorId: string,
    correlationId: string,
    now: string,
  ): Promise<"canceled" | "already_canceled" | "paid" | "already_terminal"> {
    const aggregate = await this.repository.findByOrderId(session, orderId, true);
    if (aggregate === undefined) {
      throw new PaymentApplicationError("PAYMENT_NOT_FOUND", "Payment not found");
    }
    if (aggregate.payment.status === "paid") return "paid";
    if (aggregate.payment.status === "canceled") return "already_canceled";
    if (
      aggregate.payment.status !== "created" &&
      aggregate.payment.status !== "pending_provider"
    ) return "already_terminal";

    const payment = transitionPayment(aggregate.payment, "canceled", now);
    const attempt = transitionPaymentAttempt(aggregate.activeAttempt, "canceled", now);
    if (!(await this.repository.updateState(session, payment, attempt, aggregate.payment.version))) {
      throw new PaymentApplicationError("STALE_VERSION", "Payment version is stale");
    }
    await this.repository.appendAudit(session, {
      id: this.generateId(), actorType: "staff", actorId,
      action: "payment.canceled", resourceId: payment.id, correlationId,
      metadata: { orderId }, occurredAt: now,
    });
    return "canceled";
  }
}

function assertReplay(aggregate: PaymentAggregate, request: CreatePendingPaymentRequest): void {
  const attempt = aggregate.activeAttempt;
  if (
    aggregate.payment.expectedAmountVnd !== request.expectedAmountVnd
    || attempt.idempotencyKey !== request.idempotencyKey
    || attempt.expiresAt !== request.expiresAt
    || (request.paymentMethod !== undefined && attempt.paymentMethod !== request.paymentMethod)
  ) {
    throw new PaymentApplicationError("IDEMPOTENCY_CONFLICT", "Order payment conflicts with an existing request");
  }
}

function ensureInitiatable(aggregate: PaymentAggregate, timestamp: string): void {
  if (Date.parse(aggregate.activeAttempt.expiresAt) <= Date.parse(timestamp)) {
    throw new PaymentApplicationError("PAYMENT_EXPIRED", "Payment attempt expired");
  }
  if (aggregate.payment.status !== "created" && aggregate.payment.status !== "pending_provider") {
    throw new PaymentApplicationError("PAYMENT_NOT_PENDING", "Payment is not pending");
  }
}

function mapPending({ payment, activeAttempt }: PaymentAggregate): PendingPaymentDto {
  return {
    paymentId: payment.id,
    attemptId: activeAttempt.id,
    orderId: payment.orderId,
    invoiceNumber: activeAttempt.providerInvoiceNumber,
    expectedAmountVnd: payment.expectedAmountVnd,
    currency: "VND",
    status: payment.status,
    expiresAt: activeAttempt.expiresAt,
    ...(activeAttempt.paymentMethod === undefined ? {} : { paymentMethod: activeAttempt.paymentMethod }),
  };
}
