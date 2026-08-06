// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CustomerSessionServiceContract, StorefrontCookieConfig } from "../customer";
import { requireCustomerSession } from "../customer";
import { authenticateStaff, type StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import { OrderService } from "./application/services/implementations/order.service";
import { PostgresqlOrderRepository } from "./infrastructure/repositories/implementations/postgresql-order.repository";
import { AdminOrderController } from "./presentation/controllers/admin-order.controller";
import { CustomerOrderController } from "./presentation/controllers/customer-order.controller";
import { orderErrorMiddleware } from "./presentation/middleware/order-error.middleware";
import { createAdminOrderRouter } from "./presentation/routes/admin-order.routes";
import { createCustomerOrderRouter } from "./presentation/routes/customer-order.routes";

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
  const service = new OrderService(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
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
  return { adminRouter, customerRouter, checkout: service };
}
