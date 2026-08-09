// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerSessionServiceContract, StorefrontCookieConfig } from "../customer";
import { requireCustomerSession } from "../customer";
import { authenticateStaff, type StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import { OrderService } from "./application/services/implementations/order.service";
import { CustomerOrderOperationsReaderService } from "./application/services/implementations/customer-order-operations-reader";
import { PostgresqlOrderRepository } from "./infrastructure/repositories/implementations/postgresql-order.repository";
import { AdminOrderController } from "./presentation/controllers/admin-order.controller";
import { CustomerOrderController } from "./presentation/controllers/customer-order.controller";
import { orderErrorMiddleware } from "./presentation/middleware/order-error.middleware";
import { createAdminOrderRouter } from "./presentation/routes/admin-order.routes";
import { createCustomerOrderRouter } from "./presentation/routes/customer-order.routes";
import type { PendingOrderCancellationPort } from "./application/services/interfaces/pending-order-cancellation-port";

export interface OrderModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly customerSessions: CustomerSessionServiceContract;
  readonly cookies: StorefrontCookieConfig;
  readonly generateId: () => string;
  readonly now: () => string;
}
export function createOrderModule(dependencies: OrderModuleDependencies) {
  const repository = new PostgresqlOrderRepository();
  let cancellation: PendingOrderCancellationPort | undefined;
  const deferredCancellation: PendingOrderCancellationPort = {
    cancelInSession(session, request) {
      if (cancellation === undefined) throw new Error("Order cancellation is not configured");
      return cancellation.cancelInSession(session, request);
    },
  };
  const service = new OrderService(repository, dependencies.transactions, dependencies.generateId, dependencies.now, deferredCancellation);
  const operations = new CustomerOrderOperationsReaderService(repository, dependencies.transactions);
  const appendDenied = (denied: { actorId: string; action: string; resourceId: string; correlationId: string }) =>
    dependencies.transactions.run((session) => repository.appendAudit(session, {
      id: dependencies.generateId(), actorType: "staff", actorId: denied.actorId,
      action: denied.action, resourceId: denied.resourceId,
      correlationId: denied.correlationId, metadata: {}, outcome: "denied", occurredAt: dependencies.now(),
    }));
  const adminRouter = createAdminOrderRouter(new AdminOrderController(service), authenticateStaff(dependencies.staffTokenVerifier), appendDenied);
  adminRouter.use(orderErrorMiddleware);
  const customerRouter = createCustomerOrderRouter(new CustomerOrderController(service), requireCustomerSession(dependencies.customerSessions, dependencies.cookies));
  customerRouter.use(orderErrorMiddleware);
  return {
    adminRouter,
    customerRouter,
    checkout: service,
    operations,
    connectCancellation(port: PendingOrderCancellationPort) {
      if (cancellation !== undefined) throw new Error("Order cancellation is already configured");
      cancellation = port;
    },
  };
}
