// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import { authenticateStaff } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import type { CustomerOperationsReader } from "../customer";
import type { CustomerOrderOperationsReader } from "../order";
import { CrmService } from "./application/services/implementations/crm.service";
import { PostgresqlCrmRepository } from "./infrastructure/repositories/implementations/postgresql-crm.repository";
import { CrmController } from "./presentation/controllers/crm.controller";
import { crmErrorMiddleware } from "./presentation/middleware/crm-error.middleware";
import { createCrmRouter } from "./presentation/routes/crm.routes";

export interface CrmModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly customers: CustomerOperationsReader;
  readonly orders: CustomerOrderOperationsReader;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly generateId: () => string;
  readonly now: () => string;
}

export function createCrmModule(dependencies: CrmModuleDependencies) {
  const repository = new PostgresqlCrmRepository();
  const service = new CrmService(
    repository,
    dependencies.customers,
    dependencies.orders,
    dependencies.transactions,
    dependencies.generateId,
    dependencies.now,
  );
  const appendDenied = (denied: {
    readonly actorId: string;
    readonly action: string;
    readonly resourceId: string;
    readonly correlationId: string;
  }) => dependencies.transactions.run((session) => repository.appendDeniedAudit(session, {
    id: dependencies.generateId(),
    ...denied,
    metadata: {},
    occurredAt: dependencies.now(),
  }));
  const router = createCrmRouter(
    new CrmController(service),
    authenticateStaff(dependencies.staffTokenVerifier),
    appendDenied,
  );
  router.use(crmErrorMiddleware);
  return { router, operationsSummary: service };
}
