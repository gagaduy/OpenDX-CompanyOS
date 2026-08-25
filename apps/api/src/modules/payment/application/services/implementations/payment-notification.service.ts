// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { CartPaidPort } from "../../../../cart";
import type { CheckoutPaidPort } from "../../../../checkout";
import type { InventoryCheckoutPort } from "../../../../inventory";
import type { OrderCheckoutPort } from "../../../../order";
import type { PromotionCheckoutPort } from "../../../../promotion";
import type {
  DatabaseSession,
  TransactionRunner,
} from "../../../../../shared/database/transaction";
import type { PaymentEvent } from "../../../domain/entities/payment-event";
import {
  transitionPayment,
  transitionPaymentAttempt,
} from "../../../domain/services/payment-rules";
import type {
  NormalizedPaymentNotification,
  PaymentGateway,
} from "../../providers/payment-gateway";
import type { PaymentRepository } from "../../repositories/interfaces/payment.repository";
import type {
  PaymentNotificationResult,
  PaymentNotificationServiceContract,
} from "../interfaces/payment-notification.service";
import type {
  PaidTransitionResult,
  PaymentPaidTransitionPort,
} from "../interfaces/payment-paid-transition";

export class PaymentNotificationService
  implements PaymentNotificationServiceContract, PaymentPaidTransitionPort
{
  constructor(
    private readonly repository: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly orders: OrderCheckoutPort,
    private readonly inventory: InventoryCheckoutPort,
    private readonly promotions: PromotionCheckoutPort,
    private readonly checkouts: CheckoutPaidPort,
    private readonly carts: CartPaidPort,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async process(
    payload: unknown,
    correlationId: string,
  ): Promise<PaymentNotificationResult> {
    const notification = this.gateway.normalizeNotification(payload);
    const receivedAt = this.now();
    const event: PaymentEvent = {
      id: this.generateId(),
      provider: "sepay",
      authenticationResult: "authenticated",
      notificationType: notification.notificationType,
      providerEventId: notification.providerEventId,
      providerOrderId: notification.providerOrderId,
      providerTransactionId: notification.providerTransactionId,
      providerInvoiceNumber: notification.invoiceNumber,
      amountVnd: notification.amountVnd,
      ...(notification.currency === "VND" ? { currency: "VND" as const } : {}),
      redactedPayload: notification.redactedPayload,
      payloadHash: hashPayload(payload),
      normalizedState: notification.state,
      processingResult: "received",
      correlationId,
      receivedAt,
    };

    return this.transactions.run(async (session) => {
      if (!(await this.repository.insertEvent(session, event))) {
        return { result: "already_processed" };
      }
      if (notification.state !== "paid") {
        return this.review(session, event, "UNSUPPORTED_NOTIFICATION");
      }
      const ownership = await this.repository.findByInvoiceNumber(
        session,
        notification.invoiceNumber,
      );
      if (ownership !== undefined) {
        await this.repository.linkEvent(
          session,
          event.id,
          ownership.payment.id,
          ownership.activeAttempt.id,
        );
      }
      const transition = await this.applyTrustedInSession(
        session,
        notification,
        correlationId,
      );
      if (transition.result === "review_required") {
        return this.review(session, event, transition.reason);
      }
      await this.repository.updateEventResult(
        session,
        event.id,
        transition.result === "applied" ? "applied" : "already_processed",
        this.now(),
      );
      return { result: transition.result };
    });
  }

  async applyTrustedInSession(
    session: DatabaseSession,
    notification: NormalizedPaymentNotification,
    correlationId: string,
  ): Promise<PaidTransitionResult> {
    const aggregate = await this.repository.findByInvoiceNumber(
      session,
      notification.invoiceNumber,
      true,
    );
    if (aggregate === undefined) {
      return { result: "review_required", reason: "INVOICE_NOT_FOUND" };
    }
    if (aggregate.payment.expectedAmountVnd !== notification.amountVnd) {
      return { result: "review_required", reason: "AMOUNT_MISMATCH" };
    }
    if (notification.currency !== "VND") {
      return { result: "review_required", reason: "CURRENCY_MISMATCH" };
    }
    if (
      aggregate.activeAttempt.providerOrderId !== undefined &&
      aggregate.activeAttempt.providerOrderId !== notification.providerOrderId
    ) {
      return { result: "review_required", reason: "PROVIDER_ORDER_MISMATCH" };
    }
    if (aggregate.payment.status === "paid") {
      return { result: "already_processed" };
    }
    if (
      aggregate.payment.status !== "pending_provider" &&
      aggregate.payment.status !== "created"
    ) {
      return { result: "review_required", reason: "PAYMENT_TERMINAL" };
    }

    const processedAt = this.now();
    const pendingPayment =
      aggregate.payment.status === "created"
        ? transitionPayment(aggregate.payment, "pending_provider", processedAt)
        : aggregate.payment;
    const pendingAttempt =
      aggregate.activeAttempt.state === "created"
        ? transitionPaymentAttempt(
            aggregate.activeAttempt,
            "pending_provider",
            processedAt,
          )
        : aggregate.activeAttempt;
    const paidPayment = transitionPayment(pendingPayment, "paid", processedAt);
    const paidAttempt = {
      ...transitionPaymentAttempt(pendingAttempt, "paid", processedAt),
      providerOrderId: notification.providerOrderId,
    };
    if (
      !(await this.repository.updateState(
        session,
        paidPayment,
        paidAttempt,
        aggregate.payment.version,
      ))
    ) {
      throw new Error("Payment version changed during notification processing");
    }

    const order = await this.orders.transitionInSession(
      session,
      aggregate.payment.orderId,
      "paid",
      "provider",
      "sepay",
      "PAYMENT_CONFIRMED",
      `sepay:${notification.providerTransactionId}`,
      correlationId,
      processedAt,
    );
    await this.inventory.consumeInSession(
      session,
      { referenceType: "order", referenceId: order.id },
      { actorType: "system", actorId: "system:payment", correlationId },
    );
    await this.promotions.commit(
      session,
      order.checkoutId,
      order.id,
      correlationId,
      processedAt,
    );
    const checkout = await this.checkouts.completePaid(
      session,
      order.checkoutId,
      order.id,
      processedAt,
    );
    await this.carts.finalizePaidCheckout(
      session,
      checkout.cartId,
      checkout.cartVersion,
      checkout.customerId,
      processedAt,
    );
    await this.repository.appendAudit(session, {
      id: this.generateId(),
      actorType: "provider",
      actorId: "sepay",
      action: "payment.paid",
      resourceId: paidPayment.id,
      correlationId,
      metadata: {
        orderId: order.id,
        providerOrderId: notification.providerOrderId,
      },
      occurredAt: processedAt,
    });
    return { result: "applied" };
  }

  private async review(
    session: DatabaseSession,
    event: PaymentEvent,
    reason: string,
  ): Promise<PaymentNotificationResult> {
    await this.repository.updateEventResult(
      session,
      event.id,
      "review_required",
      this.now(),
      reason,
    );
    return { result: "review_required" };
  }
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(stable(payload)).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
