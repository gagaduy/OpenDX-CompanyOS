// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffTokenVerifier } from "../../shared/auth/staff-auth.middleware";
import { authenticateStaff } from "../../shared/auth/staff-auth.middleware";
import type { WorkloadTokenVerifier } from "../../shared/auth/workload-auth.middleware";
import { authenticateWorkload } from "../../shared/auth/workload-auth.middleware";
import type { TransactionRunner } from "../../shared/database/transaction";
import { AgentTaskServiceImpl } from "./application/services/implementations/agent-task.service";
import { AgenticFileServiceImpl } from "./application/services/implementations/agentic-file.service";
import { AgenticFileRetentionService } from "./application/services/implementations/agentic-file-retention.service";
import { AgenticFileLifecycleWorker } from "./infrastructure/workers/agentic-file-lifecycle.worker";
import type { AgenticFileParser } from "./application/parsing/agentic-file-parser";
import type { AgenticFileScanner } from "./application/security/agentic-file-scanner";
import type { AgenticFileStorage } from "./application/storage/agentic-file-storage";
import { AgenticQueryServiceImpl } from "./application/services/implementations/agentic-query.service";
import { ApprovalServiceImpl } from "./application/services/implementations/approval.service";
import { PolicyService } from "./application/services/implementations/policy.service";
import { WorkflowCommandDispatcher } from "./application/services/implementations/workflow-command-dispatcher";
import { WorkflowRunServiceImpl } from "./application/services/implementations/workflow-run.service";
import { ModelRunServiceImpl } from "./application/services/implementations/model-run.service";
import type { WorkflowGateway } from "./application/workflows/interfaces/workflow-gateway";
import { ConfigurationServiceImpl } from "./application/services/implementations/configuration.service";
import { EmergencyRevocationService } from "./application/services/implementations/emergency-revocation.service";
import { PostgresqlAgenticRepository } from "./infrastructure/repositories/implementations/postgresql-agentic.repository";
import { AgenticController } from "./presentation/controllers/agentic.controller";
import { AgenticWorkflowController } from "./presentation/controllers/agentic-workflow.controller";
import { AgenticWorkloadController } from "./presentation/controllers/agentic-workload.controller";
import { AgenticToolController } from "./presentation/controllers/agentic-tool.controller";
import { authenticateAgentService } from "./presentation/middleware/agent-service-auth.middleware";
import { agenticErrorMiddleware } from "./presentation/middleware/agentic-error.middleware";
import { createAgenticRouter } from "./presentation/routes/agentic.routes";
import { createAgenticToolRouter } from "./presentation/routes/agentic-tool.routes";
import { createAgenticWorkloadRouter } from "./presentation/routes/agentic-workload.routes";
import type { DepartmentToolAdapterRegistry } from "./application/services/interfaces/department-tool-adapter";
import { ToolRegistryService } from "./application/services/implementations/tool-registry.service";
import { ZodDepartmentToolSchemaRegistry } from "./infrastructure/tools/zod-department-tool-schema.registry";
import type { Logger } from "../../shared/observability/logger";
import type { MetricsRegistry } from "../../shared/observability/metrics";

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
  readonly toolAdapters: DepartmentToolAdapterRegistry;
  readonly agenticFileStorage?: AgenticFileStorage;
  readonly agenticFileScanner?: AgenticFileScanner;
  readonly agenticFileParser?: AgenticFileParser;
  readonly fileLifecycleIntervalMs?: number;
  readonly fileLifecycleBatchSize?: number;
  readonly logger?: Logger;
  readonly metrics?: MetricsRegistry;
  readonly monotonicNow?: () => number;
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
  const modelRuns = new ModelRunServiceImpl(
    repository,
    dependencies.transactions,
    policy,
    dependencies.generateId,
    dependencies.now,
  );
  const tasks = new AgentTaskServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const files = dependencies.agenticFileStorage === undefined || dependencies.agenticFileScanner === undefined || dependencies.agenticFileParser === undefined
    ? undefined
    : new AgenticFileServiceImpl(repository, dependencies.agenticFileStorage, dependencies.agenticFileScanner, dependencies.agenticFileParser, dependencies.transactions, dependencies.generateId, dependencies.now);
  const fileRetention = dependencies.agenticFileStorage === undefined ? undefined : new AgenticFileRetentionService(repository, dependencies.agenticFileStorage, dependencies.transactions, dependencies.generateId, dependencies.now);
  const fileLifecycleWorker = files === undefined || fileRetention === undefined ? undefined : new AgenticFileLifecycleWorker({ claimPending: (limit) => files.claimPending(limit), processClaimed: (fileId) => files.processClaimed(fileId), claimExpired: async () => [], deleteClaimed: async () => undefined, deleteExpired: (limit) => fileRetention.deleteExpired(limit) }, dependencies.fileLifecycleIntervalMs ?? 30_000, dependencies.fileLifecycleBatchSize ?? 20);
  const approvals = new ApprovalServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now, dispatcher, onDispatcherError);
  const configurations = new ConfigurationServiceImpl(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const revocations = new EmergencyRevocationService(repository, dependencies.transactions, dependencies.generateId, dependencies.now);
  const queries = new AgenticQueryServiceImpl(repository, dependencies.transactions);
  const tools = new ToolRegistryService(
    repository,
    policy,
    dependencies.transactions,
    dependencies.toolAdapters,
    new ZodDepartmentToolSchemaRegistry(dependencies.now),
    dependencies.generateId,
    dependencies.now,
    dependencies.logger === undefined
      ? undefined
      : {
          logger: dependencies.logger,
          ...(dependencies.metrics === undefined ? {} : { metrics: dependencies.metrics }),
          monotonicNow: dependencies.monotonicNow ?? performance.now.bind(performance),
        },
  );
  const controller = new AgenticController(tasks, approvals, configurations, revocations, queries, files);
  const workflowController = new AgenticWorkflowController(workflows);
  const workloadController = new AgenticWorkloadController(workflows, modelRuns);
  const toolController = new AgenticToolController(tools);
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
  const toolRouter = createAgenticToolRouter(
    toolController,
    authenticateAgentService(dependencies.staffTokenVerifier, {
      resolve: (clientId) => dependencies.transactions.runReadOnly(async (session) => {
        const agent = await repository.findAgentByClientId(session, clientId);
        return agent === undefined
          ? undefined
          : { agentKind: agent.kind, active: agent.active };
      }),
    }),
  );
  toolRouter.use(agenticErrorMiddleware);
  return {
    adminRouter,
    internalRouter,
    toolRouter,
    dispatcher,
    tasks,
    ...(files === undefined ? {} : { files }),
    ...(fileLifecycleWorker === undefined ? {} : { fileLifecycleWorker }),
    approvals,
    configurations,
    workflows,
    modelRuns,
    tools,
    ...(dependencies.executionEnabled === true
      ? { readiness: () => dependencies.workflowGateway.probe() }
      : {}),
  };
}
