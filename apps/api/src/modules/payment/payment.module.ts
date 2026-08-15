// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { TransactionRunner } from "../../shared/database/transaction";
import {
  authenticateStaff,
  type StaffTokenVerifier,
} from "../../shared/auth/staff-auth.middleware";
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
import { PaymentReconciliationService } from "./application/services/implementations/payment-reconciliation.service";
import { PaymentAdminController } from "./presentation/controllers/payment-admin.controller";
import { createPaymentAdminRouter } from "./presentation/routes/payment-admin.routes";
import { paymentErrorMiddleware } from "./presentation/middleware/payment-error.middleware";
import { PaymentReconciliationWorker } from "./infrastructure/workers/payment-reconciliation.worker";
import { PaymentHealthReaderService } from "./application/services/implementations/payment-health-reader";
import { PostgresqlPaymentHealthRepository } from "./infrastructure/repositories/implementations/postgresql-payment-health.repository";

export interface PaymentModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly gateway: PaymentGateway;
  readonly generateId: () => string;
  readonly now: () => string;
}
export interface PaymentNotificationModuleDependencies {
  readonly orders: OrderCheckoutPort;
  readonly inventory: InventoryCheckoutPort;
  readonly promotions: PromotionCheckoutPort;
  readonly checkouts: CheckoutPaidPort;
  readonly carts: CartPaidPort;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly reconciliationIntervalMs: number;
  readonly onWorkerError: (error: unknown) => void;
  readonly ipnSecret?: string;
}

export interface PaymentHealthDependencies {
  readonly transactions: TransactionRunner;
  readonly now: () => string;
}

export function createPaymentHealthReader(dependencies: PaymentHealthDependencies) {
  return new PaymentHealthReaderService(
    new PostgresqlPaymentHealthRepository(),
    dependencies.transactions,
    dependencies.now,
  );
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
    createOperations(notificationDependencies: PaymentNotificationModuleDependencies) {
      const notifications = new PaymentNotificationService(
        repository,
        dependencies.gateway,
        notificationDependencies.orders,
        notificationDependencies.inventory,
        notificationDependencies.promotions,
        notificationDependencies.checkouts,
        notificationDependencies.carts,
        dependencies.transactions,
        dependencies.generateId,
        dependencies.now,
      );
      const reconciliation = new PaymentReconciliationService(
        repository,
        dependencies.gateway,
        notifications,
        dependencies.transactions,
        dependencies.generateId,
        dependencies.now,
      );
      const adminRouter = createPaymentAdminRouter(
        new PaymentAdminController(reconciliation),
        authenticateStaff(notificationDependencies.staffTokenVerifier),
        (denied) =>
          dependencies.transactions.run((session) =>
            repository.appendAudit(session, {
              id: dependencies.generateId(),
              actorType: "staff",
              actorId: denied.actorId,
              action: denied.action,
              resourceId: denied.resourceId,
              correlationId: denied.correlationId,
              metadata: {},
              occurredAt: dependencies.now(),
            }),
          ),
      );
      adminRouter.use(paymentErrorMiddleware);
      return {
        adminRouter,
        webhookRouter: createSePayIpnRouter(
          new SePayIpnController(notifications),
          authenticateSePayIpn(notificationDependencies.ipnSecret),
        ),
        reconciliationWorker: new PaymentReconciliationWorker(
          reconciliation,
          notificationDependencies.reconciliationIntervalMs,
          notificationDependencies.onWorkerError,
        ),
      };
    },
  };
}
