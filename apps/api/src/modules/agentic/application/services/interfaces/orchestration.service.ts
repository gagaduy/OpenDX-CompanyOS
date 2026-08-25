// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { AgentServicePrincipal } from "../../identity/agent-service-principal";
import type {
  AcceptedOrchestrationResultAppendInput,
  CollaborationRequestAppendInput,
  ExecutiveReportAppendInput,
  OrchestrationDispatchPlanRecord,
  OrchestrationPlanAppendInput,
} from "../../repositories/interfaces/agentic.repository";
import type {
  DepartmentAgentKind, ExecutionDescriptor, ExecutionDescriptorPayload,
} from "../../../domain/entities/orchestration-execution-descriptor";
import type {
  AiCeoExecutionAuthority,
  AiCeoExecutionPayload,
} from "../../../domain/entities/ai-ceo-execution-authority";
import type { CompleteModelRunCommand } from "./model-run.service";

export interface TaskBriefView {
  readonly taskId: string;
  readonly goal: string;
  readonly instructions: string;
  readonly deadline?: string;
  readonly configurationRevisionId: string;
  readonly policyVersion: number;
  readonly provenance: readonly {
    readonly id: string;
    readonly sourceType: string;
    readonly sourceDigest: string;
    readonly classification: string;
  }[];
  readonly eligibleAssignments: readonly {
    readonly agentKind: DepartmentAgentKind;
    readonly resultSchemaName: string;
    readonly resultSchemaDigest: string;
    readonly allowedToolsDigest: string;
    readonly dataScope: string;
    readonly freshnessSeconds: number;
    readonly timeoutSeconds: number;
    readonly budgetMicros: number;
  }[];
  readonly digest: string;
  readonly planningAuthority: AuthorityReference;
}

export interface AuthorityReference {
  readonly authorityId: string;
  readonly authorityDigest: string;
}

export interface OrchestrationPlanSubmission extends OrchestrationPlanAppendInput {
  readonly planningAuthorityId: string;
  readonly planningAuthorityDigest: string;
  readonly modelSettlement: CompleteModelRunCommand;
}

export interface AcceptedOrchestrationResultSubmission extends AcceptedOrchestrationResultAppendInput {
  readonly descriptorId: string;
  readonly descriptorDigest: string;
  readonly result: Readonly<Record<string, unknown>>;
  readonly modelSettlement: CompleteModelRunCommand;
}

export interface ExecutiveReportSubmission extends Omit<ExecutiveReportAppendInput, "costMicros"> {
  readonly authorityId: string;
  readonly authorityDigest: string;
  readonly report: Readonly<Record<string, unknown>>;
  readonly synthesisBranches: SynthesisContextRequest["branches"];
  readonly modelSettlement: CompleteModelRunCommand;
}

export interface SynthesisContextRequest {
  readonly taskId: string;
  readonly planVersion: number;
  readonly branches: readonly ({
    readonly subtaskId: string;
    readonly status: "usable" | "partial";
    readonly resultId: string;
    readonly resultDigest: string;
    readonly provenanceIds: readonly string[];
  } | {
    readonly subtaskId: string;
    readonly status: "unavailable";
    readonly resultDigest: string;
    readonly provenanceIds: readonly string[];
  })[];
}

export interface SynthesisContextView {
  readonly authority: AuthorityReference;
  readonly acceptedResults: readonly {
    readonly subtaskId: string;
    readonly status: "usable" | "partial";
    readonly resultId: string;
    readonly resultDigest: string;
    readonly provenanceIds: readonly string[];
    readonly result: Readonly<Record<string, unknown>>;
  }[];
  readonly unavailableBranches: readonly {
    readonly subtaskId: string;
    readonly resultDigest: string;
    readonly provenanceIds: readonly string[];
  }[];
  readonly costMicros: number;
  readonly approvalHistoryDigest: string;
}

export interface OrchestrationDispatchPlanView extends OrchestrationDispatchPlanRecord {
  readonly synthesisAuthority: AuthorityReference;
}

export interface OrchestrationService {
  loadSettlementReference(
    kind: "plan" | "result" | "report", id: string, principal: WorkloadPrincipal,
  ): Promise<Readonly<Record<string, unknown>>>;
  acceptPlan(plan: OrchestrationPlanSubmission, principal: AgentServicePrincipal): Promise<void>;
  loadTaskBrief(taskId: string, principal: WorkloadPrincipal): Promise<TaskBriefView>;
  loadDispatchPlan(runId: string, principal: WorkloadPrincipal): Promise<OrchestrationDispatchPlanView>;
  loadExecutionDescriptor(id: string, digest: string, principal: WorkloadPrincipal): Promise<{
    readonly descriptor: ExecutionDescriptor;
    readonly payload: ExecutionDescriptorPayload;
  }>;
  loadAiCeoExecutionAuthority(id: string, digest: string, principal: WorkloadPrincipal): Promise<{
    readonly authority: AiCeoExecutionAuthority;
    readonly payload: AiCeoExecutionPayload;
  }>;
  loadSynthesisContext(input: SynthesisContextRequest, principal: WorkloadPrincipal): Promise<SynthesisContextView>;
  acceptResult(input: AcceptedOrchestrationResultSubmission, principal: WorkloadPrincipal): Promise<DigestAcknowledgement>;
  mediateCollaboration(input: CollaborationRequestAppendInput, principal: WorkloadPrincipal): Promise<DigestAcknowledgement>;
  acceptExecutiveReport(input: ExecutiveReportSubmission, principal: WorkloadPrincipal): Promise<DigestAcknowledgement>;
}

export interface DigestAcknowledgement { readonly digest: string }
