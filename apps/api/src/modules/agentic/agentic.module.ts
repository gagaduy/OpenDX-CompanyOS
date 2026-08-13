// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import { authenticateStaff } from "../../shared/auth/staff-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import { AgentTaskServiceImpl } from "./application/services/implementations/agent-task.service";
import { AgenticQueryServiceImpl } from "./application/services/implementations/agentic-query.service";
import { ApprovalServiceImpl } from "./application/services/implementations/approval.service";
import { ConfigurationServiceImpl } from "./application/services/implementations/configuration.service";
import { EmergencyRevocationService } from "./application/services/implementations/emergency-revocation.service";
import { PostgresqlAgenticRepository } from "./infrastructure/repositories/implementations/postgresql-agentic.repository";
import { AgenticController } from "./presentation/controllers/agentic.controller";
import { agenticErrorMiddleware } from "./presentation/middleware/agentic-error.middleware";
import { createAgenticRouter } from "./presentation/routes/agentic.routes";

export interface AgenticModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly generateId: () => string;
  readonly now: () => string;
}

export function createAgenticModule(dependencies: AgenticModuleDependencies) {
  const repository = new PostgresqlAgenticRepository();
  const tasks = new AgentTaskServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const approvals = new ApprovalServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const configurations = new ConfigurationServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const revocations = new EmergencyRevocationService(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const queries = new AgenticQueryServiceImpl(repository, dependencies.transactions);
  const controller = new AgenticController(tasks, approvals, configurations, revocations, queries);
  const appendDenied = (denied: { readonly actorId: string; readonly action: string; readonly resourceId: string; readonly correlationId: string }) =>
    dependencies.transactions.run((session) => repository.appendAudit(session, {
      id: dependencies.generateId(), actorId: denied.actorId, actorType: "staff",
      action: denied.action, resourceType: "agentic", resourceId: denied.resourceId,
      outcome: "denied", correlationId: denied.correlationId, occurredAt: dependencies.now(),
    }));
  const adminRouter = createAgenticRouter(controller, authenticateStaff(dependencies.staffTokenVerifier), appendDenied);
  adminRouter.use(agenticErrorMiddleware);
  return { adminRouter, tasks, approvals, configurations };
}
