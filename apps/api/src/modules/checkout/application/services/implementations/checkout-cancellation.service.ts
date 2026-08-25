// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryCheckoutPort } from "../../../../inventory";
import type { CancelPendingOrderRequest, OrderCheckoutPort, PendingOrderCancellationPort } from "../../../../order";
import type { PaymentExpiryPort } from "../../../../payment";
import type { PromotionCheckoutPort } from "../../../../promotion";
import type { CheckoutRepository } from "../../repositories/interfaces/checkout.repository";
import { CheckoutApplicationError } from "../checkout-application.error";

export class CheckoutCancellationService implements PendingOrderCancellationPort {
  constructor(
    private readonly repository: CheckoutRepository,
    private readonly payments: PaymentExpiryPort,
    private readonly orders: OrderCheckoutPort,
    private readonly inventory: InventoryCheckoutPort,
    private readonly promotions: PromotionCheckoutPort,
    private readonly generateId: () => string,
  ) {}

  async cancelInSession(
    session: Parameters<PendingOrderCancellationPort["cancelInSession"]>[0],
    request: CancelPendingOrderRequest,
  ): Promise<"canceled" | "already_paid" | "not_cancelable"> {
    const payment = await this.payments.cancelByOrderInSession(
      session,
      request.orderId,
      request.actorId,
      request.correlationId,
      request.now,
    );
    if (payment === "paid") return "already_paid";
    if (payment === "already_canceled") return "canceled";
    if (payment === "already_terminal") return "not_cancelable";
    const order = await this.orders.transitionInSession(
      session,
      request.orderId,
      "canceled",
      "staff",
      request.actorId,
      request.reasonCode,
      request.idempotencyKey,
      request.correlationId,
      request.now,
      request.expectedVersion,
    );
    await this.inventory.releaseInSession(
      session,
      { referenceType: "order", referenceId: order.id },
      { actorType: "staff", actorId: request.actorId, correlationId: request.correlationId },
    );
    await this.promotions.release(
      session,
      order.checkoutId,
      request.correlationId,
      request.now,
    );
    if (!(await this.repository.markCanceled(session, order.checkoutId, order.id, request.now))) {
      throw new CheckoutApplicationError("CHECKOUT_NOT_CANCELABLE", "Checkout cannot be canceled");
    }
    await this.repository.appendAudit(session, {
      id: this.generateId(), actorId: request.actorId,
      action: "checkout.canceled", resourceId: order.checkoutId,
      correlationId: request.correlationId, metadata: { orderId: order.id },
      occurredAt: request.now,
    });
    return "canceled";
  }
}
