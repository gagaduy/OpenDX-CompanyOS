// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { AgentServicePrincipal } from "../../identity/agent-service-principal";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type {
  AcceptedOrchestrationResultAppendInput, AgenticRepository, CollaborationRequestAppendInput,
  ExecutiveReportAppendInput, OrchestrationDispatchPlanRecord, OrchestrationPlanAppendInput,
} from "../../repositories/interfaces/agentic.repository";
import type { ExecutionDescriptor } from "../../../domain/entities/orchestration-execution-descriptor";
import { canonicalDigest, createExecutionDescriptor, validateExecutionDescriptor } from "../../../domain/entities/orchestration-execution-descriptor";
import { validateOrchestrationPlan } from "../../../domain/services/ai-ceo-orchestration-rules";
import { resolveStoreHealthExecution, STORE_HEALTH_EXECUTION_CATALOG } from "../../orchestration/store-health-execution-catalog";
import { AgenticApplicationError } from "../agentic-application.error";
import type { OrchestrationService, TaskBriefView } from "../interfaces/orchestration.service";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";

type Repository = Pick<AgenticRepository,
  "findAgentByClientId" | "appendOrchestrationPlan" | "appendAudit" | "appendProvenance"
  | "findTaskById" | "findRevision" | "listProvenance" | "findModelConfiguration"
  | "findBudgetLimit" | "findTool" | "findToolGrant" | "appendExecutionDescriptor"
  | "findExecutionDescriptor" | "findExecutionDescriptorForSubtask" | "findOrchestrationDispatchPlan"
  | "orchestrationPlanExists" | "orchestrationPlanHasAgent" | "findAgentByKind" | "findActiveRevocation"
  | "appendAcceptedOrchestrationResult" | "appendCollaborationRequest" | "appendExecutiveReport">;

export class OrchestrationServiceImpl implements OrchestrationService {
  constructor(private readonly repository: Repository, private readonly transactions: TransactionRunner,
    private readonly policy: PolicyEvaluator, private readonly generateId: () => string,
    private readonly now: () => string = () => new Date().toISOString()) {}

  async loadTaskBrief(taskId: string, principal: WorkloadPrincipal): Promise<TaskBriefView> {
    requireWorker(principal);
    return this.transactions.runReadOnly((session) => this.buildTaskBrief(session, taskId));
  }

  async loadDispatchPlan(runId: string, principal: WorkloadPrincipal): Promise<OrchestrationDispatchPlanRecord> {
    requireWorker(principal);
    return this.transactions.runReadOnly(async (session) => {
      const plan = await this.repository.findOrchestrationDispatchPlan(session, runId);
      if (plan === undefined) fail("DISPATCH_PLAN_NOT_FOUND", "Orchestration dispatch plan was not found");
      return plan;
    });
  }

  async loadExecutionDescriptor(id: string, digest: string, principal: WorkloadPrincipal) {
    requireWorker(principal);
    return this.transactions.runReadOnly(async (session) => {
      const found = await this.repository.findExecutionDescriptor(session, id);
      if (found === undefined || found.descriptor.descriptorDigest !== digest) {
        fail("DESCRIPTOR_BINDING_INVALID", "Execution descriptor binding is invalid");
      }
      this.requireUnexpired(found.descriptor);
      validateExecutionDescriptor(found.descriptor, found.payload);
      await this.requireCurrentAuthority(session, found.descriptor);
      return found;
    });
  }

  async acceptResult(input: AcceptedOrchestrationResultAppendInput, principal: WorkloadPrincipal) {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      const descriptor = await this.repository.findExecutionDescriptorForSubtask(
        session, input.taskId, input.planVersion, input.subtaskId,
      );
      if (descriptor === undefined) fail("DESCRIPTOR_BINDING_INVALID", "Result is not bound to an execution descriptor");
      this.requireUnexpired(descriptor);
      const status = await this.repository.appendAcceptedOrchestrationResult(session, input);
      if (status === "conflict") fail("SETTLEMENT_CONFLICT", "Result settlement conflicts with an accepted result");
      if (status === "created") {
        await this.appendWorkerAudit(session, "agentic.orchestration.result.accept", input.taskId,
          input.subtaskId, input.resultDigest, principal);
      }
      return Object.freeze({ digest: input.resultDigest });
    });
  }

  async mediateCollaboration(input: CollaborationRequestAppendInput, principal: WorkloadPrincipal) {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      if (!await this.repository.orchestrationPlanExists(session, input.taskId, input.planVersion)) {
        fail("PLAN_BINDING_INVALID", "Collaboration request is not bound to an accepted plan");
      }
      const [hasRequester, hasRequested] = await Promise.all([
        this.repository.orchestrationPlanHasAgent(session, input.taskId, input.planVersion, input.requester),
        this.repository.orchestrationPlanHasAgent(session, input.taskId, input.planVersion, input.requested),
      ]);
      if (!hasRequester || !hasRequested) {
        fail("PLAN_BINDING_INVALID", "Collaboration participants are not bound to the accepted plan");
      }
      const decision = await this.policy.evaluateInSession(session, {
        revisionId: (await this.requireTaskRevision(session, input.taskId)).id,
        policyVersion: input.policyVersion, actorType: "agent", agentKind: input.requester,
        department: input.requested, resource: "agentic_collaboration", action: "request",
        purpose: input.purpose, dataClassification: input.requestedDataClassification,
      });
      if (decision.effect === "DENY") fail("POLICY_DENIED", "Policy denied Department collaboration");
      if (decision.effect === "REQUIRE_APPROVAL") fail("POLICY_APPROVAL_REQUIRED", "Collaboration requires human approval");
      if (input.policyDecision !== "ALLOW" || decision.policyVersion !== input.policyVersion) {
        fail("STALE_INPUT", "Collaboration policy binding is stale");
      }
      const status = await this.repository.appendCollaborationRequest(session, input);
      if (status === "conflict") fail("SETTLEMENT_CONFLICT", "Collaboration replay conflicts with the accepted request");
      if (status === "created") {
        await this.appendWorkerAudit(session, "agentic.orchestration.collaboration.mediate", input.taskId,
          input.id, input.redactedPayloadDigest, principal);
      }
      return Object.freeze({ digest: input.redactedPayloadDigest });
    });
  }

  async acceptExecutiveReport(input: ExecutiveReportAppendInput, principal: WorkloadPrincipal) {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      if (!await this.repository.orchestrationPlanExists(session, input.taskId, input.planVersion)) {
        fail("PLAN_BINDING_INVALID", "Executive report is not bound to an accepted plan");
      }
      const status = await this.repository.appendExecutiveReport(session, input);
      if (status === "conflict") fail("SETTLEMENT_CONFLICT", "Executive report conflicts with the accepted report");
      if (status === "created") {
        await this.appendWorkerAudit(session, "agentic.orchestration.report.accept", input.taskId,
          input.id, input.reportDigest, principal);
      }
      return Object.freeze({ digest: input.reportDigest });
    });
  }

  async acceptPlan(plan: OrchestrationPlanAppendInput, principal: AgentServicePrincipal): Promise<void> {
    await this.transactions.run(async (session) => {
      const agent = await this.repository.findAgentByClientId(session, principal.clientId);
      if (principal.agentKind !== "ai_ceo" || agent?.kind !== "ai_ceo" || !agent.active
        || plan.createdBy !== principal.clientId) fail("FORBIDDEN", "AI CEO workload identity is required");
      const eligible = new Set<string>();
      for (const subtask of plan.subtasks) {
        const decision = await this.policy.evaluateInSession(session, {
          revisionId: plan.configurationRevisionId, policyVersion: plan.policyVersion,
          actorType: "agent", agentKind: "ai_ceo", department: subtask.owner,
          resource: "agentic_orchestration_plan", action: "assign",
          purpose: "store_health_review", dataClassification: "internal",
        });
        if (decision.effect === "DENY") fail("POLICY_DENIED", "Policy denied the assignment");
        if (decision.effect === "REQUIRE_APPROVAL") fail("POLICY_APPROVAL_REQUIRED", "Assignment requires human approval");
        eligible.add(subtask.owner);
      }
      validateOrchestrationPlan(plan, eligible);
      const brief = await this.buildTaskBrief(session, plan.taskId);
      if (brief.digest !== plan.taskBriefDigest
        || brief.configurationRevisionId !== plan.configurationRevisionId
        || brief.policyVersion !== plan.policyVersion) {
        fail("STALE_INPUT", "Orchestration plan is not bound to the current Task Brief");
      }
      const acceptedAt = this.now();
      await this.repository.appendOrchestrationPlan(session, plan);
      for (const subtask of plan.subtasks) {
        const catalog = resolveStoreHealthExecution(
          subtask.owner as Exclude<typeof subtask.owner, "ai_ceo">,
          subtask.expectedResultSchemaDigest,
          subtask.allowedToolsDigest,
        );
        if (catalog === undefined || subtask.dataScope !== `${subtask.owner}:health:read`) {
          fail("INVALID_PLAN", "Subtask schema or tool authority is unsupported");
        }
        const model = await this.repository.findModelConfiguration(
          session, plan.configurationRevisionId, subtask.owner,
        );
        const budget = await this.repository.findBudgetLimit(
          session, plan.configurationRevisionId, subtask.owner,
        );
        if (model === undefined || model.fallbackModels[0] === undefined
          || budget === undefined || subtask.budgetMicros > budget.taskCostMicros
          || subtask.timeoutSeconds * 1_000 > model.timeoutMs) {
          fail("INVALID_PLAN", "Subtask model, budget, or timeout authority is unavailable");
        }
        const [primaryRevocation, fallbackRevocation] = await Promise.all([
          this.repository.findActiveRevocation(session, "model", model.primaryModel),
          this.repository.findActiveRevocation(session, "model", model.fallbackModels[0]),
        ]);
        if (primaryRevocation !== undefined || fallbackRevocation !== undefined) {
          fail("POLICY_DENIED", "Configured model authority is revoked");
        }
        for (const tool of catalog.toolGrants) {
          const [registered, grant] = await Promise.all([
            this.repository.findTool(session, tool.name, tool.version),
            this.repository.findToolGrant(session, plan.configurationRevisionId,
              subtask.owner, tool.name, tool.version),
          ]);
          if (registered?.active !== true || grant === undefined
            || grant.purpose !== tool.purpose || grant.dataScope !== tool.dataScope
            || grant.maxInvocations < tool.maximumInvocations) {
            fail("POLICY_DENIED", "Configured tool authority does not match the execution catalog");
          }
          if (await this.repository.findActiveRevocation(session, "tool_grant", grant.id) !== undefined) {
            fail("POLICY_DENIED", "Configured tool authority is revoked");
          }
          const decision = await this.policy.evaluateInSession(session, {
            revisionId: plan.configurationRevisionId, policyVersion: plan.policyVersion,
            actorType: "agent", agentKind: subtask.owner, department: subtask.owner,
            resource: tool.name, action: "invoke", purpose: tool.purpose,
            dataClassification: tool.dataClassification,
          });
          if (decision.effect !== "ALLOW") fail("POLICY_DENIED", "Policy denied descriptor tool authority");
        }
        const authorizedContext: readonly Readonly<Record<string, unknown>>[] = brief.provenance
          .map((reference) => ({ ...reference }));
        if (subtask.sourceProvenanceDigest !== canonicalDigest(authorizedContext)) {
          fail("STALE_INPUT", "Subtask provenance binding is stale");
        }
        const taskBrief: Readonly<Record<string, unknown>> = { ...brief };
        const payload = { taskBrief, resultSchema: catalog.resultSchema,
          authorizedContext, toolGrants: catalog.toolGrants };
        const createdAt = Date.parse(acceptedAt);
        const expiresAt = new Date(createdAt + Math.min(subtask.freshnessSeconds, 600) * 1_000).toISOString();
        const descriptor = createExecutionDescriptor({
          id: this.generateId(), version: 1, taskId: plan.taskId, planVersion: plan.version,
          subtaskId: subtask.id, agentKind: catalog.agentKind,
          configurationRevisionId: plan.configurationRevisionId, policyVersion: plan.policyVersion,
          primaryModel: model.primaryModel, fallbackModel: model.fallbackModels[0],
          resultSchemaName: catalog.resultSchemaName, resultSchemaDigest: catalog.resultSchemaDigest,
          authorizedContextDigest: canonicalDigest(authorizedContext),
          allowedToolsDigest: catalog.allowedToolsDigest,
          budgetAuthorizationMicros: subtask.budgetMicros, timeoutSeconds: subtask.timeoutSeconds,
          freshnessSeconds: subtask.freshnessSeconds, expiresAt, createdAt: acceptedAt,
        }, payload);
        await this.repository.appendExecutionDescriptor(session, descriptor, payload);
      }
      await this.repository.appendProvenance(session, { id: this.generateId(), taskId: plan.taskId,
        sourceType: "agentic_orchestration_plan", sourceId: plan.id, sourceDigest: plan.digest,
        sourceVersion: plan.version, classification: "internal", recordedBy: principal.clientId, recordedAt: acceptedAt });
      await this.repository.appendAudit(session, { id: this.generateId(), actorId: principal.subject,
        clientId: principal.clientId, actorType: "agent", taskId: plan.taskId, action: "agentic.orchestration.plan.accept",
        resourceType: "agentic_orchestration_plan", resourceId: plan.id, outcome: "allowed",
        policyVersion: plan.policyVersion, correlationId: plan.taskId, resultDigest: plan.digest, occurredAt: acceptedAt });
    });
  }

  private requireUnexpired(descriptor: Pick<ExecutionDescriptor, "expiresAt">): void {
    if (Date.parse(this.now()) >= Date.parse(descriptor.expiresAt)) {
      fail("DESCRIPTOR_EXPIRED", "Execution descriptor authority has expired");
    }
  }

  private async requireCurrentAuthority(
    session: Parameters<Repository["findTaskById"]>[0], descriptor: ExecutionDescriptor,
  ): Promise<void> {
    const [revision, agent, agentRevocation, primaryRevocation, fallbackRevocation, model, budget] = await Promise.all([
      this.repository.findRevision(session, descriptor.configurationRevisionId),
      this.repository.findAgentByKind(session, descriptor.agentKind),
      this.repository.findActiveRevocation(session, "agent", descriptor.agentKind),
      this.repository.findActiveRevocation(session, "model", descriptor.primaryModel),
      this.repository.findActiveRevocation(session, "model", descriptor.fallbackModel),
      this.repository.findModelConfiguration(session, descriptor.configurationRevisionId, descriptor.agentKind),
      this.repository.findBudgetLimit(session, descriptor.configurationRevisionId, descriptor.agentKind),
    ]);
    if (revision?.state !== "active" || revision.version !== descriptor.policyVersion
      || agent?.active !== true || agentRevocation !== undefined || primaryRevocation !== undefined
      || fallbackRevocation !== undefined || model?.primaryModel !== descriptor.primaryModel
      || !model.fallbackModels.includes(descriptor.fallbackModel)
      || budget === undefined || budget.taskCostMicros < descriptor.budgetAuthorizationMicros) {
      fail("DESCRIPTOR_REVOKED", "Execution descriptor authority is no longer active");
    }
    const found = await this.repository.findExecutionDescriptor(session, descriptor.id);
    if (found === undefined) fail("DESCRIPTOR_BINDING_INVALID", "Execution descriptor was not found");
    const catalog = resolveStoreHealthExecution(
      descriptor.agentKind, descriptor.resultSchemaDigest, descriptor.allowedToolsDigest,
    );
    if (catalog === undefined || canonicalDigest(found.payload.authorizedContext) !== descriptor.authorizedContextDigest
      || canonicalDigest(found.payload.resultSchema) !== descriptor.resultSchemaDigest
      || canonicalDigest(found.payload.toolGrants) !== descriptor.allowedToolsDigest) {
      fail("DESCRIPTOR_BINDING_INVALID", "Execution descriptor payload authority is invalid");
    }
    for (const tool of catalog.toolGrants) {
      const [registered, grant] = await Promise.all([
        this.repository.findTool(session, tool.name, tool.version),
        this.repository.findToolGrant(session, descriptor.configurationRevisionId,
          descriptor.agentKind, tool.name, tool.version),
      ]);
      if (registered?.active !== true || grant === undefined
        || grant.purpose !== tool.purpose || grant.dataScope !== tool.dataScope
        || grant.maxInvocations < tool.maximumInvocations
        || await this.repository.findActiveRevocation(session, "tool_grant", grant.id) !== undefined) {
        fail("DESCRIPTOR_REVOKED", "Execution descriptor tool authority is no longer active");
      }
      const decision = await this.policy.evaluateInSession(session, {
        revisionId: descriptor.configurationRevisionId, policyVersion: descriptor.policyVersion,
        actorType: "agent", agentKind: descriptor.agentKind, department: descriptor.agentKind,
        resource: tool.name, action: "invoke", purpose: tool.purpose,
        dataClassification: tool.dataClassification,
      });
      if (decision.effect !== "ALLOW") fail("DESCRIPTOR_REVOKED", "Execution descriptor policy is no longer active");
    }
  }

  private async requireTaskRevision(
    session: Parameters<Repository["findTaskById"]>[0], taskId: string,
  ) {
    const task = await this.repository.findTaskById(session, taskId);
    if (task?.configurationRevisionId === undefined) fail("PLAN_BINDING_INVALID", "Task configuration is unavailable");
    const revision = await this.repository.findRevision(session, task.configurationRevisionId);
    if (revision?.state !== "active") fail("CONFIGURATION_INACTIVE", "Task configuration is not active");
    return revision;
  }

  private async appendWorkerAudit(
    session: Parameters<Repository["appendAudit"]>[0], action: string, taskId: string,
    resourceId: string, digest: string, principal: WorkloadPrincipal,
  ): Promise<void> {
    await this.repository.appendAudit(session, { id: this.generateId(), actorId: principal.subject,
      clientId: principal.clientId, actorType: "system", taskId, action,
      resourceType: "agentic_orchestration", resourceId, outcome: "allowed",
      correlationId: taskId, resultDigest: digest, occurredAt: this.now() });
  }

  private async buildTaskBrief(session: Parameters<Repository["findTaskById"]>[0], taskId: string): Promise<TaskBriefView> {
    const task = await this.repository.findTaskById(session, taskId);
    if (task?.state !== "ready" || task.configurationRevisionId === undefined) {
      fail("TASK_NOT_READY", "Task is not ready for orchestration planning");
    }
    const revision = await this.repository.findRevision(session, task.configurationRevisionId);
    if (revision?.state !== "active") fail("CONFIGURATION_INACTIVE", "Task configuration is not active");
    const eligibleAssignments = [];
    for (const entry of STORE_HEALTH_EXECUTION_CATALOG) {
      const decision = await this.policy.evaluateInSession(session, {
        revisionId: revision.id, policyVersion: revision.version,
        actorType: "agent", agentKind: "ai_ceo", department: entry.agentKind,
        resource: "agentic_orchestration_plan", action: "assign",
        purpose: "store_health_review", dataClassification: "internal",
      });
      if (decision.effect === "ALLOW") eligibleAssignments.push(Object.freeze({
        agentKind: entry.agentKind, resultSchemaName: entry.resultSchemaName,
        resultSchemaDigest: entry.resultSchemaDigest, allowedToolsDigest: entry.allowedToolsDigest,
      }));
    }
    if (eligibleAssignments.length === 0) fail("POLICY_DENIED", "No Department assignment is eligible");
    const provenance = (await this.repository.listProvenance(session, task.id))
      .filter(({ classification }) => classification === "internal")
      .map((record) => Object.freeze({ id: record.id, sourceType: record.sourceType,
        sourceDigest: record.sourceDigest, classification: record.classification }));
    const content = { taskId: task.id, goal: task.goal, instructions: task.instructions,
      ...(task.deadline === undefined ? {} : { deadline: task.deadline }),
      configurationRevisionId: revision.id, policyVersion: revision.version,
      provenance: Object.freeze(provenance), eligibleAssignments: Object.freeze(eligibleAssignments) };
    return Object.freeze({ ...content, digest: canonicalDigest(content) });
  }
}

function requireWorker(principal: WorkloadPrincipal): void {
  if (principal.workload !== "agentic_worker" || principal.clientId !== "opendx-agentic-worker") {
    fail("FORBIDDEN", "Agentic worker identity is required");
  }
}

function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
