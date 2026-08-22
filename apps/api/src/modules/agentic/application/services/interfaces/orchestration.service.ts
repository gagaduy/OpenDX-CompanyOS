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
  }[];
  readonly digest: string;
}

export interface OrchestrationService {
  acceptPlan(plan: OrchestrationPlanAppendInput, principal: AgentServicePrincipal): Promise<void>;
  loadTaskBrief(taskId: string, principal: WorkloadPrincipal): Promise<TaskBriefView>;
  loadDispatchPlan(runId: string, principal: WorkloadPrincipal): Promise<OrchestrationDispatchPlanRecord>;
  loadExecutionDescriptor(id: string, digest: string, principal: WorkloadPrincipal): Promise<{
    readonly descriptor: ExecutionDescriptor;
    readonly payload: ExecutionDescriptorPayload;
  }>;
  acceptResult(input: AcceptedOrchestrationResultAppendInput, principal: WorkloadPrincipal): Promise<DigestAcknowledgement>;
  mediateCollaboration(input: CollaborationRequestAppendInput, principal: WorkloadPrincipal): Promise<DigestAcknowledgement>;
  acceptExecutiveReport(input: ExecutiveReportAppendInput, principal: WorkloadPrincipal): Promise<DigestAcknowledgement>;
}

export interface DigestAcknowledgement { readonly digest: string }
