// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { PaymentEvent } from "../../../domain/entities/payment-event";
import type { PaymentReconciliation } from "../../../domain/entities/payment-reconciliation";
import type {
  PaymentDetailDto,
  PaymentListDto,
  PaymentListQuery,
  PaymentStaffContext,
  ReconcilePaymentRequest,
} from "../../dtos/payment-admin.dto";
import {
  PaymentGatewayError,
  type PaymentGateway,
  type ProviderOrderDetail,
} from "../../providers/payment-gateway";
import type {
  PaymentAggregate,
  PaymentRepository,
} from "../../repositories/interfaces/payment.repository";
import type { PaymentPaidTransitionPort } from "../interfaces/payment-paid-transition";
import type { PaymentReconciliationServiceContract } from "../interfaces/payment-reconciliation.service";
import { PaymentApplicationError } from "../payment-application.error";

interface ReconciliationActor {
  readonly actorType: "staff" | "system";
  readonly actorId: string;
  readonly correlationId: string;
}

export class PaymentReconciliationService
  implements PaymentReconciliationServiceContract
{
  constructor(
    private readonly repository: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly paidTransition: PaymentPaidTransitionPort,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async list(
    query: PaymentListQuery,
    context: PaymentStaffContext,
  ): Promise<PaymentListDto> {
    authorize(context);
    const result = await this.transactions.runReadOnly((session) =>
      this.repository.list(session, query),
    );
    return {
      ...result,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(result.totalItems / query.pageSize),
    };
  }

  async get(
    paymentId: string,
    context: PaymentStaffContext,
  ): Promise<PaymentDetailDto> {
    authorize(context);
    return this.transactions.runReadOnly(async (session) => {
      const aggregate = await this.repository.findById(session, paymentId);
      if (aggregate === undefined) notFound();
      const [events, reconciliations] = await Promise.all([
        this.repository.listEvents(session, paymentId),
        this.repository.listReconciliations(session, paymentId),
      ]);
      return detail(
        aggregate,
        events,
        reconciliations,
      );
    });
  }

  async reconcile(
    paymentId: string,
    request: ReconcilePaymentRequest,
    context: PaymentStaffContext,
  ): Promise<PaymentDetailDto> {
    authorize(context);
    await this.reconcileOne(paymentId, request.providerOrderId, {
      actorType: "staff",
      actorId: context.actorId,
      correlationId: context.correlationId,
    });
    return this.get(paymentId, context);
  }

  async reconcileDue(limit: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
      throw new Error("Invalid reconciliation batch limit");
    }
    const due = await this.transactions.runReadOnly((session) =>
      this.repository.listDuePending(session, limit),
    );
    let completed = 0;
    for (const aggregate of due) {
      await this.reconcileOne(
        aggregate.payment.id,
        aggregate.activeAttempt.providerOrderId,
        {
          actorType: "system",
          actorId: "system:payment-reconciliation",
          correlationId: `reconcile:${aggregate.payment.id}:${this.now()}`,
        },
      );
      completed += 1;
    }
    return completed;
  }

  private async reconcileOne(
    paymentId: string,
    providerOrderHint: string | undefined,
    actor: ReconciliationActor,
  ): Promise<void> {
    const aggregate = await this.transactions.runReadOnly((session) =>
      this.repository.findById(session, paymentId),
    );
    if (aggregate === undefined) notFound();

    const providerOrderId =
      aggregate.activeAttempt.providerOrderId ?? providerOrderHint;
    if (providerOrderId === undefined) {
      await this.persist(aggregate, actor, "unsupported");
      return;
    }

    let provider: ProviderOrderDetail;
    try {
      // Deliberately outside a database transaction: provider latency must not hold locks.
      provider = await this.gateway.getOrderDetail(providerOrderId);
    } catch (error) {
      await this.persist(
        aggregate,
        actor,
        "provider_error",
        undefined,
        error instanceof PaymentGatewayError ? error.category : "provider_error",
        providerOrderId,
      );
      return;
    }

    const comparison = compare(aggregate, provider, providerOrderId);
    await this.transactions.run(async (session) => {
      const record = buildReconciliation(
        this.generateId(),
        aggregate,
        actor,
        comparison,
        provider,
        providerOrderId,
        this.now(),
      );
      await this.repository.insertReconciliation(session, record);
      if (comparison !== "mismatch") {
        if (
          !(await this.repository.attachProviderOrderId(
            session,
            aggregate.activeAttempt.id,
            providerOrderId,
          ))
        ) {
          throw new Error("Payment attempt provider ownership changed");
        }
      }
      if (comparison === "matched_paid") {
        await this.paidTransition.applyTrustedInSession(
          session,
          {
            notificationType: "RECONCILIATION",
            providerEventId: record.id,
            providerOrderId: provider.providerOrderId,
            providerTransactionId: `reconciliation:${record.id}`,
            invoiceNumber: provider.invoiceNumber,
            orderStatus: provider.status,
            transactionStatus: provider.transactionApproved
              ? "APPROVED"
              : "UNKNOWN",
            amountVnd: provider.amountVnd,
            currency: provider.currency,
            state: "paid",
            redactedPayload: provider.redactedEvidence,
          },
          actor.correlationId,
        );
      }
      await this.appendAudit(session, aggregate.payment.id, actor, comparison, record.createdAt);
    });
  }

  private persist(
    aggregate: PaymentAggregate,
    actor: ReconciliationActor,
    comparison: PaymentReconciliation["comparisonResult"],
    provider?: ProviderOrderDetail,
    providerStatus?: string,
    providerOrderId?: string,
  ): Promise<void> {
    return this.transactions.run(async (session) => {
      const record = buildReconciliation(
        this.generateId(),
        aggregate,
        actor,
        comparison,
        provider,
        providerOrderId,
        this.now(),
        providerStatus,
      );
      await this.repository.insertReconciliation(session, record);
      await this.appendAudit(session, aggregate.payment.id, actor, comparison, record.createdAt);
    });
  }

  private appendAudit(
    session: Parameters<PaymentRepository["appendAudit"]>[0],
    paymentId: string,
    actor: ReconciliationActor,
    comparison: PaymentReconciliation["comparisonResult"],
    occurredAt: string,
  ): Promise<void> {
    return this.repository.appendAudit(session, {
      id: this.generateId(),
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "payment.reconciled",
      resourceId: paymentId,
      correlationId: actor.correlationId,
      metadata: { comparisonResult: comparison },
      occurredAt,
    });
  }
}

function compare(
  aggregate: PaymentAggregate,
  provider: ProviderOrderDetail,
  requestedProviderOrderId: string,
): PaymentReconciliation["comparisonResult"] {
  if (
    provider.providerOrderId !== requestedProviderOrderId ||
    provider.invoiceNumber !== aggregate.activeAttempt.providerInvoiceNumber ||
    provider.amountVnd !== aggregate.payment.expectedAmountVnd ||
    provider.currency !== "VND"
  ) {
    return "mismatch";
  }
  if (provider.status === "CAPTURED" && provider.transactionApproved) {
    return "matched_paid";
  }
  if (["CREATED", "PENDING", "AUTHENTICATION_PENDING"].includes(provider.status)) {
    return "still_pending";
  }
  return "unsupported";
}

function buildReconciliation(
  id: string,
  aggregate: PaymentAggregate,
  actor: ReconciliationActor,
  comparison: PaymentReconciliation["comparisonResult"],
  provider: ProviderOrderDetail | undefined,
  providerOrderId: string | undefined,
  createdAt: string,
  providerStatus?: string,
): PaymentReconciliation {
  return {
    id,
    paymentId: aggregate.payment.id,
    attemptId: aggregate.activeAttempt.id,
    triggerActorType: actor.actorType,
    triggerActorId: actor.actorId,
    ...(providerOrderId === undefined ? {} : { providerOrderId }),
    internalStatus: aggregate.payment.status,
    ...(provider === undefined
      ? providerStatus === undefined
        ? {}
        : { providerStatus }
      : { providerStatus: provider.status }),
    internalAmountVnd: aggregate.payment.expectedAmountVnd,
    ...(provider === undefined
      ? {}
      : {
          providerAmountVnd: provider.amountVnd,
          redactedResponse: provider.redactedEvidence,
        }),
    comparisonResult: comparison,
    correlationId: actor.correlationId,
    createdAt,
  };
}

function detail(
  aggregate: PaymentAggregate,
  events: readonly PaymentEvent[],
  reconciliations: readonly PaymentReconciliation[],
): PaymentDetailDto {
  return {
    id: aggregate.payment.id,
    orderId: aggregate.payment.orderId,
    status: aggregate.payment.status,
    expectedAmountVnd: aggregate.payment.expectedAmountVnd,
    currency: "VND",
    invoiceNumber: aggregate.activeAttempt.providerInvoiceNumber,
    ...(aggregate.activeAttempt.providerOrderId === undefined
      ? {}
      : { providerOrderId: aggregate.activeAttempt.providerOrderId }),
    updatedAt: aggregate.payment.updatedAt,
    attemptId: aggregate.activeAttempt.id,
    expiresAt: aggregate.activeAttempt.expiresAt,
    events: events.map((event) => ({
      id: event.id,
      notificationType: event.notificationType,
      ...(event.providerEventId === undefined ? {} : { providerEventId: event.providerEventId }),
      ...(event.providerOrderId === undefined ? {} : { providerOrderId: event.providerOrderId }),
      ...(event.providerTransactionId === undefined ? {} : { providerTransactionId: event.providerTransactionId }),
      ...(event.amountVnd === undefined ? {} : { amountVnd: event.amountVnd }),
      ...(event.currency === undefined ? {} : { currency: event.currency }),
      normalizedState: event.normalizedState,
      processingResult: event.processingResult,
      ...(event.failureReason === undefined ? {} : { failureReason: event.failureReason }),
      redactedPayload: structuredClone(event.redactedPayload),
      correlationId: event.correlationId,
      receivedAt: event.receivedAt,
      ...(event.processedAt === undefined ? {} : { processedAt: event.processedAt }),
    })),
    reconciliations: reconciliations.map((record) => ({
      id: record.id,
      triggerActorType: record.triggerActorType,
      ...(record.providerOrderId === undefined
        ? {}
        : { providerOrderId: record.providerOrderId }),
      internalStatus: record.internalStatus,
      ...(record.providerStatus === undefined
        ? {}
        : { providerStatus: record.providerStatus }),
      internalAmountVnd: record.internalAmountVnd,
      ...(record.providerAmountVnd === undefined
        ? {}
        : { providerAmountVnd: record.providerAmountVnd }),
      comparisonResult: record.comparisonResult,
      ...(record.redactedResponse === undefined
        ? {}
        : { redactedResponse: record.redactedResponse }),
      correlationId: record.correlationId,
      createdAt: record.createdAt,
    })),
  };
}

function authorize(context: PaymentStaffContext): void {
  if (
    !context.roles.some(
      (role) => role === "administrator" || role === "finance_operator",
    )
  ) {
    throw new PaymentApplicationError(
      "FORBIDDEN",
      "Payment access is forbidden",
    );
  }
}

function notFound(): never {
  throw new PaymentApplicationError("PAYMENT_NOT_FOUND", "Payment not found");
}
