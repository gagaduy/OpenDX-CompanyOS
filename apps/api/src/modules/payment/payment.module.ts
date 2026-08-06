// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../shared/database/transaction";
import { PaymentService } from "./application/services/implementations/payment.service";
import type { PaymentGateway } from "./application/providers/payment-gateway";
import { PostgresqlPaymentRepository } from "./infrastructure/repositories/implementations/postgresql-payment.repository";
import type { CartPaidPort } from "../cart";
import type { CheckoutPaidPort } from "../checkout";
import type { InventoryCheckoutPort } from "../inventory";
import type { OrderCheckoutPort } from "../order";
import type { PromotionCheckoutPort } from "../promotion";
import { PaymentNotificationService } from "./application/services/implementations/payment-notification.service";
import { SePayIpnController } from "./presentation/controllers/sepay-ipn.controller";
import { authenticateSePayIpn } from "./presentation/middleware/sepay-ipn-auth.middleware";
import { createSePayIpnRouter } from "./presentation/routes/sepay-ipn.routes";

export interface PaymentModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly gateway: PaymentGateway;
  readonly generateId: () => string;
  readonly now: () => string;
}
export interface PaymentNotificationModuleDependencies {
  readonly orders: OrderCheckoutPort; readonly inventory: InventoryCheckoutPort; readonly promotions: PromotionCheckoutPort;
  readonly checkouts: CheckoutPaidPort; readonly carts: CartPaidPort; readonly ipnSecret?: string;
}

export function createPaymentModule(dependencies: PaymentModuleDependencies) {
  const repository = new PostgresqlPaymentRepository();
  const service = new PaymentService(
    repository,
    dependencies.transactions,
    dependencies.gateway,
    dependencies.generateId,
    dependencies.now,
  );
  return {
    checkout: service,
    createWebhook(notificationDependencies: PaymentNotificationModuleDependencies) {
      const notifications = new PaymentNotificationService(repository, dependencies.gateway, notificationDependencies.orders, notificationDependencies.inventory, notificationDependencies.promotions, notificationDependencies.checkouts, notificationDependencies.carts, dependencies.transactions, dependencies.generateId, dependencies.now);
      return createSePayIpnRouter(new SePayIpnController(notifications), authenticateSePayIpn(notificationDependencies.ipnSecret));
    },
  };
}
