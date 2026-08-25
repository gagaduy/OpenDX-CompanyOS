// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { InventoryCheckoutPort } from "../../../../inventory";
import type { OrderCheckoutPort } from "../../../../order";
import type { PaymentExpiryPort } from "../../../../payment";
import type { PromotionCheckoutPort } from "../../../../promotion";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type { CheckoutRepository } from "../../repositories/interfaces/checkout.repository";
import type { CheckoutExpiryServiceContract } from "../interfaces/checkout-expiry.service";

export class CheckoutExpiryService implements CheckoutExpiryServiceContract {
  constructor(
    private readonly repository: CheckoutRepository,
    private readonly payments: PaymentExpiryPort,
    private readonly orders: OrderCheckoutPort,
    private readonly inventory: InventoryCheckoutPort,
    private readonly promotions: PromotionCheckoutPort,
    private readonly transactions: TransactionRunner,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  async expireDue(limit: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
      throw new Error("Invalid checkout expiry batch limit");
    }
    const timestamp = this.now();
    const due = await this.transactions.runReadOnly((session) =>
      this.repository.listDue(session, timestamp, limit),
    );
    let expired = 0;
    for (const checkout of due) {
      if (checkout.orderId === undefined) continue;
      const orderId = checkout.orderId;
      const applied = await this.transactions.run(async (session) => {
        const correlationId = `checkout-expiry:${checkout.id}`;
        const paymentResult = await this.payments.expireByOrderInSession(
          session,
          orderId,
          correlationId,
          timestamp,
        );
        if (paymentResult === "paid") return false;

        await this.orders.transitionInSession(
          session,
          orderId,
          "expired",
          "system",
          "system:checkout-expiry",
          "PAYMENT_WINDOW_EXPIRED",
          `checkout-expiry:${checkout.id}`,
          correlationId,
          timestamp,
        );
        await this.inventory.releaseInSession(
          session,
          { referenceType: "order", referenceId: orderId },
          {
            actorType: "system",
            actorId: "system:checkout-expiry",
            correlationId,
          },
        );
        await this.promotions.release(
          session,
          checkout.id,
          correlationId,
          timestamp,
        );
        if (!(await this.repository.markExpired(session, checkout.id, timestamp))) {
          return false;
        }
        await this.repository.appendAudit(session, {
          id: this.generateId(),
          actorId: "system:checkout-expiry",
          action: "checkout.expired",
          resourceId: checkout.id,
          correlationId,
          metadata: { orderId },
          occurredAt: timestamp,
        });
        return true;
      });
      if (applied) expired += 1;
    }
    return expired;
  }
}
