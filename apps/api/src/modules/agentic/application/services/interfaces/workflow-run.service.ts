// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { StaffPrincipal } from "../../../../../shared/auth/staff-principal";
import type { WorkloadPrincipal } from "../../../../../shared/auth/workload-principal";
import type { AgentKind } from "../../../domain/entities/agent-profile";
import type {
  ActivityInvocation,
  WorkflowOutcomeCode,
  WorkflowRun,
  WorkflowRunState,
} from "../../../domain/entities/workflow-run";

export interface StartWorkflowInput {
  readonly taskId: string;
  readonly expectedVersion: number;
  readonly workflowVersion: 1;
}

export interface CancelWorkflowInput {
  readonly runId: string;
  readonly expectedVersion: number;
  readonly reasonCode: string;
}

export interface ProjectWorkflowStateInput {
  readonly runId: string;
  readonly projectionSequence: number;
  readonly state: WorkflowRunState;
  readonly outcomeCode?: WorkflowOutcomeCode;
}

export type PhaseBActivityKind =
  | "load_frozen_plan"
  | "project_state"
  | "execute_fake_analysis"
  | "execute_fake_quality_review"
  | "execute_fake_collaboration"
  | "execute_fake_synthesis";

export interface ReserveActivityInput {
  readonly invocationKey: string;
  readonly runId: string;
  readonly activityKind: PhaseBActivityKind;
  readonly branchId?: string;
  readonly inputDigest: string;
}

export interface CompleteActivityInput {
  readonly invocationKey: string;
  readonly expectedVersion: number;
  readonly outcomeCode: string;
  readonly safeResult: Readonly<Record<string, unknown>>;
}

export interface FailActivityInput {
  readonly invocationKey: string;
  readonly expectedVersion: number;
  readonly outcomeCode: string;
}

export interface ActivityReservation {
  readonly status: "reserved" | "duplicate";
  readonly invocation: ActivityInvocation;
}

export interface WorkflowCommandResult {
  readonly disposition: "accepted" | "replayed";
  readonly run: WorkflowRun;
}

export interface FrozenWorkflowPlan {
  readonly taskId: string;
  readonly workflowRunId: string;
  readonly workflowVersion: 1;
  readonly planRevision: number;
  readonly configurationRevisionId: string;
  readonly subtasks: readonly {
    readonly id: string;
    readonly agentKind: AgentKind;
    readonly version: number;
  }[];
  readonly dependencies: readonly {
    readonly from: string;
    readonly to: string;
  }[];
  readonly approval?: {
    readonly id: string;
    readonly payloadDigest: string;
    readonly expiresAt: string;
    readonly policyVersion: number;
  };
}

export interface WorkflowRunService {
  start(input: StartWorkflowInput, principal: StaffPrincipal): Promise<WorkflowRun>;
  startCommand(input: StartWorkflowInput, principal: StaffPrincipal): Promise<WorkflowCommandResult>;
  get(runId: string, principal: StaffPrincipal): Promise<WorkflowRun>;
  cancel(input: CancelWorkflowInput, principal: StaffPrincipal): Promise<WorkflowRun>;
  cancelCommand(input: CancelWorkflowInput, principal: StaffPrincipal): Promise<WorkflowCommandResult>;
  projectState(input: ProjectWorkflowStateInput, principal: WorkloadPrincipal): Promise<WorkflowRun>;
  loadPlan(runId: string, principal: WorkloadPrincipal): Promise<FrozenWorkflowPlan>;
  reserveActivity(input: ReserveActivityInput, principal: WorkloadPrincipal): Promise<ActivityReservation>;
  completeActivity(input: CompleteActivityInput, principal: WorkloadPrincipal): Promise<ActivityInvocation>;
  failActivity(input: FailActivityInput, principal: WorkloadPrincipal): Promise<ActivityInvocation>;
}
