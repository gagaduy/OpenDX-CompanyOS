// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { AgentServicePrincipal } from "../../identity/agent-service-principal";
import type { TransactionRunner } from "../../../../../shared/database/transaction";
import type {
  AgenticRepository, CollaborationRequestAppendInput, ToolInvocationRecord,
} from "../../repositories/interfaces/agentic.repository";
import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type {
  AiCeoExecutionAuthority,
  AiCeoExecutionPurpose,
} from "../../../domain/entities/ai-ceo-execution-authority";
import { createAiCeoExecutionAuthority, validateAiCeoExecutionAuthority } from "../../../domain/entities/ai-ceo-execution-authority";
import type { ExecutionDescriptor } from "../../../domain/entities/orchestration-execution-descriptor";
import { canonicalDigest, createExecutionDescriptor, validateExecutionDescriptor } from "../../../domain/entities/orchestration-execution-descriptor";
import { validateOrchestrationPlan } from "../../../domain/services/ai-ceo-orchestration-rules";
import { parseStoreHealthResult, resolveStoreHealthExecution, STORE_HEALTH_EXECUTION_CATALOG, validateStoreHealthResultBindings } from "../../orchestration/store-health-execution-catalog";
import { AI_CEO_EXECUTION_CATALOG, parseAiCeoExecutiveReport, validateAiCeoExecutiveReportBindings } from "../../orchestration/ai-ceo-execution-catalog";
import type { AiCeoExecutiveReport } from "../../orchestration/ai-ceo-execution-catalog";
import { AgenticApplicationError } from "../agentic-application.error";
import type {
  AcceptedOrchestrationResultSubmission,
  ExecutiveReportSubmission,
  OrchestrationDispatchPlanView,
  OrchestrationPlanSubmission,
  OrchestrationService,
  SynthesisContextRequest,
  TaskBriefView,
} from "../interfaces/orchestration.service";
import type { PolicyEvaluator } from "../interfaces/policy-evaluator";

type Repository = Pick<AgenticRepository,
  "findAgentByClientId" | "appendOrchestrationPlan" | "appendAudit" | "appendProvenance"
  | "findTaskById" | "findRevision" | "listProvenance" | "findModelConfiguration"
  | "findBudgetLimit" | "findTool" | "findToolGrant" | "appendExecutionDescriptor"
  | "findModelQualityEvidenceForResult"
  | "listCompletedToolInvocationsForSubtask"
  | "findExecutionDescriptor" | "findExecutionDescriptorForSubtask" | "findOrchestrationDispatchPlan"
  | "findOrchestrationSettlementFacts"
  | "orchestrationPlanExists" | "orchestrationPlanHasAgent" | "findAgentByKind" | "findActiveRevocation"
  | "appendAcceptedOrchestrationResult" | "appendAcceptedOrchestrationResultPayload"
  | "findAcceptedOrchestrationResultId" | "findExecutiveReportId"
  | "appendCollaborationRequest" | "appendExecutiveReport" | "appendExecutiveReportPayload"
  | "appendAiCeoExecutionAuthority" | "findAiCeoExecutionAuthority"
  | "lockAndFindLatestAiCeoExecutionAuthority" | "findAcceptedOrchestrationResultPayload"
  | "findAcceptedOrchestrationResultReference">;

export class OrchestrationServiceImpl implements OrchestrationService {
  constructor(private readonly repository: Repository, private readonly transactions: TransactionRunner,
    private readonly policy: PolicyEvaluator, private readonly generateId: () => string,
    private readonly now: () => string = () => new Date().toISOString()) {}

  async loadTaskBrief(taskId: string, principal: WorkloadPrincipal): Promise<TaskBriefView> {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      const brief = await this.buildTaskBrief(session, taskId);
      const authority = await this.prepareAiCeoAuthority(session, {
        purpose: "orchestration_planning", taskId,
        configurationRevisionId: brief.configurationRevisionId,
        policyVersion: brief.policyVersion,
        authorizedContext: { taskBrief: brief },
      });
      return Object.freeze({ ...brief, planningAuthority: authorityReference(authority) });
    });
  }

  async loadDispatchPlan(runId: string, principal: WorkloadPrincipal): Promise<OrchestrationDispatchPlanView> {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      const plan = await this.repository.findOrchestrationDispatchPlan(session, runId);
      if (plan === undefined) fail("DISPATCH_PLAN_NOT_FOUND", "Orchestration dispatch plan was not found");
      const found = await this.repository.lockAndFindLatestAiCeoExecutionAuthority(
        session, plan.taskId, "executive_synthesis", plan.planVersion,
      );
      if (found === undefined) fail("AI_CEO_AUTHORITY_NOT_FOUND", "Synthesis authority was not found");
      const authority = await this.prepareAiCeoAuthority(session, {
        purpose: "executive_synthesis", taskId: plan.taskId, planVersion: plan.planVersion,
        configurationRevisionId: found.authority.configurationRevisionId,
        policyVersion: found.authority.policyVersion,
        authorizedContext: found.payload.authorizedContext,
      });
      return Object.freeze({ ...plan, synthesisAuthority: authorityReference(authority) });
    });
  }

  async loadAiCeoExecutionAuthority(id: string, digest: string, principal: WorkloadPrincipal) {
    requireWorker(principal);
    return this.transactions.runReadOnly(async (session) => {
      const found = await this.repository.findAiCeoExecutionAuthority(session, id);
      if (found === undefined || found.authority.authorityDigest !== digest) {
        fail("AI_CEO_AUTHORITY_BINDING_INVALID", "AI CEO execution authority binding is invalid");
      }
      this.requireUnexpired(found.authority, "AI_CEO_AUTHORITY_EXPIRED");
      validateAiCeoExecutionAuthority(found.authority, found.payload);
      await this.requireCurrentAiCeoAuthority(session, found.authority);
      return found;
    });
  }

  async loadSynthesisContext(input: SynthesisContextRequest, principal: WorkloadPrincipal) {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      if (!await this.repository.orchestrationPlanExists(session, input.taskId, input.planVersion)) {
        fail("PLAN_BINDING_INVALID", "Synthesis context is not bound to an accepted plan");
      }
      const authority = await this.repository.lockAndFindLatestAiCeoExecutionAuthority(
        session, input.taskId, "executive_synthesis", input.planVersion,
      );
      if (authority === undefined) fail("AI_CEO_AUTHORITY_NOT_FOUND", "Synthesis authority was not found");
      const currentAuthority = await this.prepareAiCeoAuthority(session, {
        purpose: "executive_synthesis", taskId: input.taskId, planVersion: input.planVersion,
        configurationRevisionId: authority.authority.configurationRevisionId,
        policyVersion: authority.authority.policyVersion,
        authorizedContext: authority.payload.authorizedContext,
      });
      const acceptedResults = [];
      const unavailableBranches = [];
      const seen = new Set<string>();
      for (const branch of input.branches) {
        if (seen.has(branch.subtaskId)) fail("SYNTHESIS_CONTEXT_INVALID", "Synthesis branches must be unique");
        seen.add(branch.subtaskId);
        const descriptor = await this.repository.findExecutionDescriptorForSubtask(
          session, input.taskId, input.planVersion, branch.subtaskId,
        );
        if (descriptor === undefined) fail("SYNTHESIS_CONTEXT_INVALID", "Synthesis branch is not plan-bound");
        if (branch.status === "unavailable") {
          unavailableBranches.push(Object.freeze({
            subtaskId: branch.subtaskId, resultDigest: branch.resultDigest,
            provenanceIds: Object.freeze([...branch.provenanceIds]),
          }));
          continue;
        }
        const accepted = await this.repository.findAcceptedOrchestrationResultReference(
          session, branch.resultId,
        );
        if (accepted === undefined || accepted.taskId !== input.taskId
          || accepted.planVersion !== input.planVersion || accepted.subtaskId !== branch.subtaskId
          || accepted.resultDigest !== branch.resultDigest
          || accepted.payloadDigest !== branch.resultDigest
          || accepted.provenanceDigest !== canonicalDigest([...branch.provenanceIds].sort())
          || canonicalDigest(accepted.payload) !== branch.resultDigest) {
          fail("SYNTHESIS_CONTEXT_INVALID", "Accepted result reference is not exact");
        }
        const result = parseStoreHealthResult(descriptor.agentKind, accepted.payload);
        validateStoreHealthResultBindings(descriptor.agentKind, result);
        const expectedStatus = result.status === "complete" ? "usable" : "partial";
        if (branch.status !== expectedStatus) {
          fail("SYNTHESIS_CONTEXT_INVALID", "Synthesis branch status does not match accepted evidence");
        }
        acceptedResults.push(Object.freeze({
          subtaskId: branch.subtaskId, status: branch.status,
          resultId: branch.resultId, resultDigest: branch.resultDigest,
          provenanceIds: Object.freeze([...branch.provenanceIds]), result,
        }));
      }
      const authorizedBranches = authority.payload.authorizedContext.branches;
      if (!Array.isArray(authorizedBranches)
        || authorizedBranches.some((branch) => branch === null || typeof branch !== "object"
          || !("subtaskId" in branch) || typeof branch.subtaskId !== "string")
        || authorizedBranches.length !== seen.size
        || authorizedBranches.some((branch) => !seen.has(String(branch.subtaskId)))) {
        fail("SYNTHESIS_CONTEXT_INVALID", "Every authority-bound plan branch must be resolved explicitly");
      }
      const settlementFacts = await this.repository.findOrchestrationSettlementFacts(
        session, input.taskId,
      );
      return Object.freeze({ authority: authorityReference(currentAuthority),
        acceptedResults: Object.freeze(acceptedResults),
        unavailableBranches: Object.freeze(unavailableBranches),
        costMicros: settlementFacts.costMicros,
        approvalHistoryDigest: canonicalDigest(settlementFacts.approvalHistory) });
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

  async acceptResult(input: AcceptedOrchestrationResultSubmission, principal: WorkloadPrincipal) {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      const resultDigest = canonicalDigest(input.result);
      if (resultDigest !== input.resultDigest) {
        fail("RESULT_DIGEST_INVALID", "Shareable result body does not match its digest");
      }
      const descriptor = await this.repository.findExecutionDescriptorForSubtask(
        session, input.taskId, input.planVersion, input.subtaskId,
      );
      if (descriptor === undefined || descriptor.id !== input.descriptorId
        || descriptor.descriptorDigest !== input.descriptorDigest) {
        fail("DESCRIPTOR_BINDING_INVALID", "Result is not bound to its execution descriptor");
      }
      this.requireUnexpired(descriptor);
      const found = await this.repository.findExecutionDescriptor(session, descriptor.id);
      if (found === undefined) fail("DESCRIPTOR_BINDING_INVALID", "Execution descriptor was not found");
      validateExecutionDescriptor(found.descriptor, found.payload);
      await this.requireCurrentAuthority(session, found.descriptor);
      const result = parseStoreHealthResult(descriptor.agentKind, input.result);
      validateStoreHealthResultBindings(descriptor.agentKind, result);
      const toolInvocations = await this.repository.listCompletedToolInvocationsForSubtask(
        session, input.taskId, descriptor.agentKind, descriptor.subtaskId,
        descriptor.createdAt, descriptor.expiresAt,
      );
      requireExactToolSummaryReferences(result, toolInvocations);
      const provenanceIds = extractDepartmentProvenanceIds(result);
      if (canonicalDigest(provenanceIds) !== input.provenanceDigest) {
        fail("RESULT_PROVENANCE_INVALID", "Shareable result provenance does not match its digest");
      }
      const qualityEvidence = await this.repository.findModelQualityEvidenceForResult(
        session, input.taskId, descriptor.agentKind, descriptor.configurationRevisionId,
        input.resultDigest, input.qualityEvidenceDigest,
      );
      const expectedQualityOutcome = result.status === "complete" ? "accepted" : "partial";
      if (qualityEvidence?.outcome !== expectedQualityOutcome
        || canonicalDigest([...qualityEvidence.provenanceIds].sort()) !== input.provenanceDigest) {
        fail("RESULT_QUALITY_EVIDENCE_INVALID", "Shareable result lacks exact accepted Quality Gate evidence");
      }
      const shareDecision = await this.policy.evaluateInSession(session, {
        revisionId: descriptor.configurationRevisionId, policyVersion: descriptor.policyVersion,
        actorType: "agent", agentKind: descriptor.agentKind, department: "ai_ceo",
        resource: "agentic_orchestration_result", action: "share",
        purpose: "executive_synthesis", dataClassification: "internal",
      });
      if (shareDecision.effect !== "ALLOW") fail("POLICY_DENIED", "Policy denied Department result sharing");
      const { descriptorId: _descriptorId, descriptorDigest: _descriptorDigest,
        result: _result, ...metadata } = input;
      const status = await this.repository.appendAcceptedOrchestrationResult(session, metadata);
      if (status === "conflict") fail("SETTLEMENT_CONFLICT", "Result settlement conflicts with an accepted result");
      const resultId = status === "created" ? input.id
        : await this.repository.findAcceptedOrchestrationResultId(
          session, input.subtaskId, input.qualityEvidenceDigest,
        );
      if (resultId === undefined) fail("SETTLEMENT_CONFLICT", "Accepted result replay could not be resolved");
      const payloadStatus = await this.repository.appendAcceptedOrchestrationResultPayload(
        session, resultId, input.resultDigest, result,
      );
      if (payloadStatus === "conflict") fail("SETTLEMENT_CONFLICT", "Result payload conflicts with an accepted result");
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

  async acceptExecutiveReport(input: ExecutiveReportSubmission, principal: WorkloadPrincipal) {
    requireWorker(principal);
    return this.transactions.run(async (session) => {
      if (!await this.repository.orchestrationPlanExists(session, input.taskId, input.planVersion)) {
        fail("PLAN_BINDING_INVALID", "Executive report is not bound to an accepted plan");
      }
      const found = await this.repository.findAiCeoExecutionAuthority(session, input.authorityId);
      if (found === undefined || found.authority.authorityDigest !== input.authorityDigest
        || found.authority.purpose !== "executive_synthesis"
        || found.authority.taskId !== input.taskId || found.authority.planVersion !== input.planVersion) {
        fail("AI_CEO_AUTHORITY_BINDING_INVALID", "Executive report authority binding is invalid");
      }
      this.requireUnexpired(found.authority, "AI_CEO_AUTHORITY_EXPIRED");
      validateAiCeoExecutionAuthority(found.authority, found.payload);
      await this.requireCurrentAiCeoAuthority(session, found.authority);
      const report = parseAiCeoExecutiveReport(input.report);
      validateAiCeoExecutiveReportBindings(report);
      const reportDigest = canonicalDigest(report);
      if (reportDigest !== input.reportDigest || report.completionState !== input.completionState) {
        fail("REPORT_DIGEST_INVALID", "Executive report body does not match its settlement digest");
      }
      const conclusionProvenance = extractReportProvenanceIds(report);
      const unavailable = [...report.unavailableBranches]
        .sort((left, right) => left.subtaskId.localeCompare(right.subtaskId));
      if (canonicalDigest(conclusionProvenance) !== input.conclusionProvenanceDigest
        || canonicalDigest(unavailable) !== input.unavailableBranchesDigest) {
        fail("REPORT_PROVENANCE_INVALID", "Executive report provenance binding is invalid");
      }
      const acceptedProvenance = new Set<string>();
      let hasPartialAcceptedResult = false;
      const reportBranchIds = new Set([
        ...report.acceptedResultReferences.map(({ subtaskId }) => subtaskId),
        ...report.unavailableBranches.map(({ subtaskId }) => subtaskId),
      ]);
      const authorityBranches = found.payload.authorizedContext.branches;
      if (!Array.isArray(authorityBranches) || authorityBranches.length !== reportBranchIds.size
        || authorityBranches.some((branch) => branch === null || typeof branch !== "object"
          || !("subtaskId" in branch) || !reportBranchIds.has(String(branch.subtaskId)))) {
        fail("REPORT_PROVENANCE_INVALID", "Executive report must resolve every authority-bound branch");
      }
      for (const reference of report.acceptedResultReferences) {
        const accepted = await this.repository.findAcceptedOrchestrationResultReference(
          session, reference.resultId,
        );
        if (accepted === undefined || accepted.taskId !== input.taskId
          || accepted.planVersion !== input.planVersion || accepted.subtaskId !== reference.subtaskId
          || accepted.resultDigest !== reference.resultDigest) {
          fail("REPORT_PROVENANCE_INVALID", "Executive report references unaccepted evidence");
        }
        const descriptor = await this.repository.findExecutionDescriptorForSubtask(
          session, input.taskId, input.planVersion, reference.subtaskId,
        );
        if (descriptor === undefined) {
          fail("REPORT_PROVENANCE_INVALID", "Executive report result is not descriptor-bound");
        }
        const acceptedResult = parseStoreHealthResult(descriptor.agentKind, accepted.payload);
        validateStoreHealthResultBindings(descriptor.agentKind, acceptedResult);
        if (acceptedResult.status === "partial") hasPartialAcceptedResult = true;
        for (const id of extractDepartmentProvenanceIds(acceptedResult)) acceptedProvenance.add(id);
      }
      for (const reference of report.unavailableBranches) {
        if (await this.repository.findExecutionDescriptorForSubtask(
          session, input.taskId, input.planVersion, reference.subtaskId,
        ) === undefined) {
          fail("REPORT_PROVENANCE_INVALID", "Unavailable report branch is not plan-bound");
        }
      }
      if (conclusionProvenance.some((id) => !acceptedProvenance.has(id))) {
        fail("REPORT_PROVENANCE_INVALID", "Executive report conclusion lacks accepted provenance");
      }
      if (report.completionState === "complete" && hasPartialAcceptedResult) {
        fail("REPORT_PROVENANCE_INVALID", "A complete report cannot rely on partial Department evidence");
      }
      const decision = await this.policy.evaluateInSession(session, {
        revisionId: found.authority.configurationRevisionId,
        policyVersion: found.authority.policyVersion, actorType: "agent", agentKind: "ai_ceo",
        resource: "agentic_executive_report", action: "share", purpose: "store_health_review",
        dataClassification: "internal",
      });
      if (decision.effect !== "ALLOW") fail("POLICY_DENIED", "Policy denied executive report sharing");
      const settlementFacts = await this.repository.findOrchestrationSettlementFacts(session, input.taskId);
      if (input.costMicros !== settlementFacts.costMicros
        || input.approvalHistoryDigest !== canonicalDigest(settlementFacts.approvalHistory)) {
        fail("REPORT_SETTLEMENT_INVALID", "Executive report cost or approval history is not server-derived");
      }
      const { authorityId: _authorityId, authorityDigest: _authorityDigest,
        report: _report, ...metadata } = input;
      const status = await this.repository.appendExecutiveReport(session, metadata);
      if (status === "conflict") fail("SETTLEMENT_CONFLICT", "Executive report conflicts with the accepted report");
      const reportId = status === "created" ? input.id
        : await this.repository.findExecutiveReportId(session, input.taskId, input.planVersion);
      if (reportId === undefined) fail("SETTLEMENT_CONFLICT", "Executive report replay could not be resolved");
      const payloadStatus = await this.repository.appendExecutiveReportPayload(
        session, reportId, input.reportDigest, report,
      );
      if (payloadStatus === "conflict") fail("SETTLEMENT_CONFLICT", "Executive report payload conflicts with the accepted report");
      if (status === "created") {
        await this.appendWorkerAudit(session, "agentic.orchestration.report.accept", input.taskId,
          input.id, input.reportDigest, principal);
      }
      return Object.freeze({ digest: input.reportDigest });
    });
  }

  async acceptPlan(submission: OrchestrationPlanSubmission, principal: AgentServicePrincipal): Promise<void> {
    await this.transactions.run(async (session) => {
      const { planningAuthorityId, planningAuthorityDigest, ...plan } = submission;
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
      const planningAuthority = await this.repository.findAiCeoExecutionAuthority(
        session, planningAuthorityId,
      );
      const authorityTaskBrief = planningAuthority?.payload.authorizedContext.taskBrief;
      if (planningAuthority === undefined
        || planningAuthority.authority.authorityDigest !== planningAuthorityDigest
        || planningAuthority.authority.purpose !== "orchestration_planning"
        || planningAuthority.authority.taskId !== plan.taskId
        || planningAuthority.authority.configurationRevisionId !== plan.configurationRevisionId
        || planningAuthority.authority.policyVersion !== plan.policyVersion
        || authorityTaskBrief === null || typeof authorityTaskBrief !== "object"
        || !("digest" in authorityTaskBrief) || authorityTaskBrief.digest !== plan.taskBriefDigest) {
        fail("AI_CEO_AUTHORITY_BINDING_INVALID", "Plan is not bound to its planning authority");
      }
      validateAiCeoExecutionAuthority(planningAuthority.authority, planningAuthority.payload);
      const acceptedAt = this.now();
      const planStatus = await this.repository.appendOrchestrationPlan(session, plan);
      const synthesisAuthorityInput = {
        purpose: "executive_synthesis" as const, taskId: plan.taskId, planVersion: plan.version,
        configurationRevisionId: plan.configurationRevisionId, policyVersion: plan.policyVersion,
        authorizedContext: {
          taskId: plan.taskId, planVersion: plan.version, planDigest: plan.digest,
          branches: plan.subtasks.map(({ id, owner, expectedResultSchemaDigest }) => ({
            subtaskId: id, agentKind: owner, resultSchemaDigest: expectedResultSchemaDigest,
          })),
        },
      };
      if (planStatus === "duplicate") {
        await this.prepareAiCeoAuthority(session, synthesisAuthorityInput);
        return;
      }
      const brief = await this.buildTaskBrief(session, plan.taskId);
      if (brief.digest !== plan.taskBriefDigest
        || brief.configurationRevisionId !== plan.configurationRevisionId
        || brief.policyVersion !== plan.policyVersion) {
        fail("STALE_INPUT", "Orchestration plan is not bound to the current Task Brief");
      }
      if (canonicalDigest(planningAuthority.payload.authorizedContext) !== canonicalDigest({ taskBrief: brief })) {
        fail("AI_CEO_AUTHORITY_BINDING_INVALID", "Plan is not bound to its planning authority");
      }
      this.requireUnexpired(planningAuthority.authority, "AI_CEO_AUTHORITY_EXPIRED");
      await this.requireCurrentAiCeoAuthority(session, planningAuthority.authority);
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
      await this.prepareAiCeoAuthority(session, synthesisAuthorityInput);
      await this.repository.appendProvenance(session, { id: this.generateId(), taskId: plan.taskId,
        sourceType: "agentic_orchestration_plan", sourceId: plan.id, sourceDigest: plan.digest,
        sourceVersion: plan.version, classification: "internal", recordedBy: principal.clientId, recordedAt: acceptedAt });
      await this.repository.appendAudit(session, { id: this.generateId(), actorId: principal.subject,
        clientId: principal.clientId, actorType: "agent", taskId: plan.taskId, action: "agentic.orchestration.plan.accept",
        resourceType: "agentic_orchestration_plan", resourceId: plan.id, outcome: "allowed",
        policyVersion: plan.policyVersion, correlationId: plan.taskId, resultDigest: plan.digest, occurredAt: acceptedAt });
    });
  }

  private requireUnexpired(
    descriptor: { readonly expiresAt: string },
    code = "DESCRIPTOR_EXPIRED",
  ): void {
    if (Date.parse(this.now()) >= Date.parse(descriptor.expiresAt)) {
      fail(code, "Execution authority has expired");
    }
  }

  private async prepareAiCeoAuthority(
    session: DatabaseSession,
    input: {
      readonly purpose: AiCeoExecutionPurpose;
      readonly taskId: string;
      readonly planVersion?: number;
      readonly configurationRevisionId: string;
      readonly policyVersion: number;
      readonly authorizedContext: Readonly<Record<string, unknown>>;
    },
  ): Promise<AiCeoExecutionAuthority> {
    const latest = await this.repository.lockAndFindLatestAiCeoExecutionAuthority(
      session, input.taskId, input.purpose, input.planVersion,
    );
    const configuration = await this.requireAiCeoConfiguration(
      session, input.configurationRevisionId, input.policyVersion,
    );
    const catalog = input.purpose === "orchestration_planning"
      ? AI_CEO_EXECUTION_CATALOG.planning
      : AI_CEO_EXECUTION_CATALOG.synthesis;
    const payload = {
      resultSchema: catalog.resultSchema,
      authorizedContext: input.authorizedContext,
    };
    const timeoutSeconds = Math.max(1, Math.floor(configuration.model.timeoutMs / 1_000));
    const payloadDigest = canonicalDigest(payload);
    if (latest !== undefined && Date.parse(this.now()) < Date.parse(latest.authority.expiresAt)
      && latest.authority.configurationRevisionId === input.configurationRevisionId
      && latest.authority.policyVersion === input.policyVersion
      && latest.authority.primaryModel === configuration.model.primaryModel
      && latest.authority.fallbackModel === configuration.fallbackModel
      && latest.authority.resultSchemaName === catalog.resultSchemaName
      && latest.authority.resultSchemaDigest === catalog.resultSchemaDigest
      && latest.authority.authorizedContextDigest === canonicalDigest(input.authorizedContext)
      && latest.authority.budgetAuthorizationMicros === configuration.budget.taskCostMicros
      && latest.authority.timeoutSeconds === timeoutSeconds
      && latest.authority.payloadDigest === payloadDigest) {
      validateAiCeoExecutionAuthority(latest.authority, latest.payload);
      return latest.authority;
    }
    const createdAt = new Date(this.now()).toISOString();
    const authority = createAiCeoExecutionAuthority({
      id: this.generateId(), version: (latest?.authority.version ?? 0) + 1,
      purpose: input.purpose, taskId: input.taskId,
      ...(input.planVersion === undefined ? {} : { planVersion: input.planVersion }),
      configurationRevisionId: input.configurationRevisionId, policyVersion: input.policyVersion,
      primaryModel: configuration.model.primaryModel, fallbackModel: configuration.fallbackModel,
      resultSchemaName: catalog.resultSchemaName, resultSchemaDigest: catalog.resultSchemaDigest,
      authorizedContextDigest: canonicalDigest(input.authorizedContext),
      budgetAuthorizationMicros: configuration.budget.taskCostMicros, timeoutSeconds,
      createdAt, expiresAt: new Date(Date.parse(createdAt) + 600_000).toISOString(),
    }, payload);
    await this.repository.appendAiCeoExecutionAuthority(session, authority, payload);
    return authority;
  }

  private async requireCurrentAiCeoAuthority(
    session: DatabaseSession,
    authority: AiCeoExecutionAuthority,
  ): Promise<void> {
    const configuration = await this.requireAiCeoConfiguration(
      session, authority.configurationRevisionId, authority.policyVersion,
    );
    const catalog = authority.purpose === "orchestration_planning"
      ? AI_CEO_EXECUTION_CATALOG.planning
      : AI_CEO_EXECUTION_CATALOG.synthesis;
    if (authority.primaryModel !== configuration.model.primaryModel
      || authority.fallbackModel !== configuration.fallbackModel
      || authority.budgetAuthorizationMicros > configuration.budget.taskCostMicros
      || authority.timeoutSeconds * 1_000 > configuration.model.timeoutMs
      || authority.resultSchemaName !== catalog.resultSchemaName
      || authority.resultSchemaDigest !== catalog.resultSchemaDigest) {
      fail("AI_CEO_AUTHORITY_REVOKED", "AI CEO execution authority is no longer current");
    }
  }

  private async requireAiCeoConfiguration(
    session: DatabaseSession,
    revisionId: string,
    policyVersion: number,
  ) {
    const [revision, agent, agentRevocation, model, budget] = await Promise.all([
      this.repository.findRevision(session, revisionId),
      this.repository.findAgentByKind(session, "ai_ceo"),
      this.repository.findActiveRevocation(session, "agent", "ai_ceo"),
      this.repository.findModelConfiguration(session, revisionId, "ai_ceo"),
      this.repository.findBudgetLimit(session, revisionId, "ai_ceo"),
    ]);
    const fallbackModel = model?.fallbackModels[0];
    if (revision?.state !== "active" || revision.version !== policyVersion
      || agent?.active !== true || agentRevocation !== undefined
      || model === undefined || fallbackModel === undefined || budget === undefined) {
      fail("AI_CEO_AUTHORITY_UNAVAILABLE", "Active AI CEO model and budget authority is unavailable");
    }
    const [primaryRevocation, fallbackRevocation] = await Promise.all([
      this.repository.findActiveRevocation(session, "model", model.primaryModel),
      this.repository.findActiveRevocation(session, "model", fallbackModel),
    ]);
    if (primaryRevocation !== undefined || fallbackRevocation !== undefined) {
      fail("AI_CEO_AUTHORITY_REVOKED", "Configured AI CEO model authority is revoked");
    }
    return { model, budget, fallbackModel };
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

  private async buildTaskBrief(
    session: Parameters<Repository["findTaskById"]>[0],
    taskId: string,
  ): Promise<Omit<TaskBriefView, "planningAuthority">> {
    const task = await this.repository.findTaskById(session, taskId);
    if (task?.state !== "ready" || task.configurationRevisionId === undefined) {
      fail("TASK_NOT_READY", "Task is not ready for orchestration planning");
    }
    const revision = await this.repository.findRevision(session, task.configurationRevisionId);
    if (revision?.state !== "active") fail("CONFIGURATION_INACTIVE", "Task configuration is not active");
    const eligibleAssignments = [];
    for (const entry of STORE_HEALTH_EXECUTION_CATALOG) {
      const [decision, model, budget] = await Promise.all([
        this.policy.evaluateInSession(session, {
          revisionId: revision.id, policyVersion: revision.version,
          actorType: "agent", agentKind: "ai_ceo", department: entry.agentKind,
          resource: "agentic_orchestration_plan", action: "assign",
          purpose: "store_health_review", dataClassification: "internal",
        }),
        this.repository.findModelConfiguration(session, revision.id, entry.agentKind),
        this.repository.findBudgetLimit(session, revision.id, entry.agentKind),
      ]);
      const timeoutSeconds = Math.min(30, Math.floor((model?.timeoutMs ?? 0) / 1_000));
      const budgetMicros = Math.min(10_000, budget?.taskCostMicros ?? 0);
      if (decision.effect === "ALLOW" && model?.fallbackModels[0] !== undefined
        && timeoutSeconds > 0 && budgetMicros > 0) eligibleAssignments.push(Object.freeze({
        agentKind: entry.agentKind, resultSchemaName: entry.resultSchemaName,
        resultSchemaDigest: entry.resultSchemaDigest, allowedToolsDigest: entry.allowedToolsDigest,
        dataScope: `${entry.agentKind}:health:read`, freshnessSeconds: 300,
        timeoutSeconds, budgetMicros,
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

function authorityReference(authority: AiCeoExecutionAuthority) {
  return Object.freeze({
    authorityId: authority.id,
    authorityDigest: authority.authorityDigest,
  });
}

function extractDepartmentProvenanceIds(
  result: Readonly<Record<string, unknown>>,
): readonly string[] {
  const payload = result.payload as {
    readonly toolSummaries: readonly { readonly provenanceId: string }[];
  };
  return [...new Set(payload.toolSummaries.map(({ provenanceId }) => provenanceId))].sort();
}

function requireExactToolSummaryReferences(
  result: Readonly<Record<string, unknown>>,
  invocations: readonly ToolInvocationRecord[],
): void {
  const payload = result.payload as {
    readonly toolSummaries: readonly {
      readonly toolName: string;
      readonly provenanceId: string;
      readonly summaryDigest: string;
    }[];
  };
  for (const reference of payload.toolSummaries) {
    const receipt = invocations.find(({ toolName, safeResult }) => {
      if (toolName !== reference.toolName || safeResult === null
        || typeof safeResult !== "object" || Array.isArray(safeResult)) return false;
      const output = safeResult as { readonly provenanceId?: unknown; readonly summary?: unknown };
      return output.provenanceId === reference.provenanceId
        && output.summary !== undefined
        && canonicalDigest(output.summary) === reference.summaryDigest;
    });
    if (receipt === undefined) {
      fail("RESULT_PROVENANCE_INVALID", "Tool summary reference is not backed by a completed invocation");
    }
  }
}

function extractReportProvenanceIds(report: AiCeoExecutiveReport): readonly string[] {
  return [...new Set([
    ...report.conclusions.flatMap(({ provenanceIds }) => provenanceIds),
    ...report.risks.flatMap(({ provenanceIds }) => provenanceIds),
    ...report.recommendedActions.flatMap(({ provenanceIds }) => provenanceIds),
    ...report.conflicts.flatMap(({ provenanceIds }) => provenanceIds),
  ])].sort();
}

function fail(code: string, message: string): never { throw new AgenticApplicationError(code, message); }
