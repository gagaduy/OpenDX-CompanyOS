// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import { authenticateStaff } from "../../shared/auth/staff-auth.middleware";
import type { WorkloadTokenVerifier } from "../../shared/auth/workload-auth.middleware";
import { authenticateWorkload } from "../../shared/auth/workload-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import { AgentTaskServiceImpl } from "./application/services/implementations/agent-task.service";
import { AgenticQueryServiceImpl } from "./application/services/implementations/agentic-query.service";
import { ApprovalServiceImpl } from "./application/services/implementations/approval.service";
import { PolicyService } from "./application/services/implementations/policy.service";
import { WorkflowCommandDispatcher } from "./application/services/implementations/workflow-command-dispatcher";
import { WorkflowRunServiceImpl } from "./application/services/implementations/workflow-run.service";
import type { WorkflowGateway } from "./application/workflows/interfaces/workflow-gateway";
import { ConfigurationServiceImpl } from "./application/services/implementations/configuration.service";
import { EmergencyRevocationService } from "./application/services/implementations/emergency-revocation.service";
import { PostgresqlAgenticRepository } from "./infrastructure/repositories/implementations/postgresql-agentic.repository";
import { AgenticController } from "./presentation/controllers/agentic.controller";
import { AgenticWorkflowController } from "./presentation/controllers/agentic-workflow.controller";
import { AgenticWorkloadController } from "./presentation/controllers/agentic-workload.controller";
import { agenticErrorMiddleware } from "./presentation/middleware/agentic-error.middleware";
import { createAgenticRouter } from "./presentation/routes/agentic.routes";
import { createAgenticWorkloadRouter } from "./presentation/routes/agentic-workload.routes";

export interface AgenticModuleDependencies {
  readonly transactions: TransactionRunner;
  readonly staffTokenVerifier: StaffTokenVerifier;
  readonly workloadTokenVerifier: WorkloadTokenVerifier;
  readonly workflowGateway: WorkflowGateway;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly workflowApprovalTtlMs: number;
  readonly dispatcherIntervalMs: number;
  readonly dispatcherBatchSize: number;
  readonly onDispatcherError?: (error: unknown) => void;
  readonly executionEnabled?: boolean;
}

export function createAgenticModule(dependencies: AgenticModuleDependencies) {
  const repository = new PostgresqlAgenticRepository();
  const onDispatcherError = dependencies.onDispatcherError ?? (() => undefined);
  const policy = new PolicyService(repository, dependencies.transactions, dependencies.now);
  const dispatcher = new WorkflowCommandDispatcher(
    repository,
    dependencies.transactions,
    dependencies.workflowGateway,
    dependencies.now,
    dependencies.dispatcherIntervalMs,
    dependencies.dispatcherBatchSize,
    onDispatcherError,
  );
  const workflows = new WorkflowRunServiceImpl(
    repository,
    dependencies.transactions,
    policy,
    dependencies.workflowGateway,
    dependencies.generateId,
    dependencies.now,
    dependencies.workflowApprovalTtlMs,
    onDispatcherError,
  );
  const tasks = new AgentTaskServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const approvals = new ApprovalServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now, dispatcher, onDispatcherError);
  const configurations = new ConfigurationServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const revocations = new EmergencyRevocationService(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const queries = new AgenticQueryServiceImpl(repository, dependencies.transactions);
  const controller = new AgenticController(tasks, approvals, configurations, revocations, queries);
  const workflowController = new AgenticWorkflowController(workflows);
  const workloadController = new AgenticWorkloadController(workflows);
  const appendDenied = (denied: { readonly actorId: string; readonly action: string; readonly resourceId: string; readonly correlationId: string }) =>
    dependencies.transactions.run((session) => repository.appendAudit(session, {
      id: dependencies.generateId(), actorId: denied.actorId, actorType: "staff",
      action: denied.action, resourceType: "agentic", resourceId: denied.resourceId,
      outcome: "denied", correlationId: denied.correlationId, occurredAt: dependencies.now(),
    }));
  const adminRouter = createAgenticRouter(controller, workflowController, authenticateStaff(dependencies.staffTokenVerifier), appendDenied);
  adminRouter.use(agenticErrorMiddleware);
  const internalRouter = createAgenticWorkloadRouter(
    workloadController,
    authenticateWorkload(dependencies.workloadTokenVerifier),
  );
  internalRouter.use(agenticErrorMiddleware);
  return {
    adminRouter,
    internalRouter,
    dispatcher,
    tasks,
    approvals,
    configurations,
    workflows,
    ...(dependencies.executionEnabled === true
      ? { readiness: () => dependencies.workflowGateway.probe() }
      : {}),
  };
}
