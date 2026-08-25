// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export const WORKFLOW_NAME = "StoreHealthReviewWorkflowV1" as const;
export const WORKFLOW_VERSION = 1 as const;

export const WORKFLOW_RUN_STATES = [
  "received",
  "planning",
  "awaiting_plan_approval",
  "dispatching",
  "department_analysis",
  "quality_review",
  "collaboration",
  "executive_synthesis",
  "awaiting_human_approval",
  "retrying",
  "partially_completed",
  "failed",
  "canceled",
  "completed",
] as const;

export type WorkflowRunState = (typeof WORKFLOW_RUN_STATES)[number];

export const WORKFLOW_OUTCOME_CODES = [
  "COMPLETED",
  "PARTIAL_ACTIVITY_FAILURE",
  "APPROVAL_REJECTED",
  "APPROVAL_EXPIRED",
  "CANCELED_BY_STAFF",
  "RETRY_EXHAUSTED",
  "ACTIVITY_REJECTED",
  "INVALID_FROZEN_PLAN",
] as const;

export type WorkflowOutcomeCode = (typeof WORKFLOW_OUTCOME_CODES)[number];

export const TERMINAL_WORKFLOW_STATES = [
  "partially_completed",
  "failed",
  "canceled",
  "completed",
] as const satisfies readonly WorkflowRunState[];

export type TerminalWorkflowRunState = (typeof TERMINAL_WORKFLOW_STATES)[number];

export interface WorkflowRun {
  readonly id: string;
  readonly taskId: string;
  readonly workflowName: typeof WORKFLOW_NAME;
  readonly workflowVersion: typeof WORKFLOW_VERSION;
  readonly planRevision: number;
  readonly temporalWorkflowId: string;
  readonly temporalRunId?: string;
  readonly state: WorkflowRunState;
  readonly projectionSequence: number;
  readonly resumeState?: Exclude<WorkflowRunState, "retrying">;
  readonly outcomeCode?: WorkflowOutcomeCode;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export type ActivityInvocationState = "reserved" | "completed" | "failed";

export interface ActivityInvocation {
  readonly invocationKey: string;
  readonly workflowRunId: string;
  readonly activityKind: string;
  readonly branchId?: string;
  readonly inputDigest: string;
  readonly state: ActivityInvocationState;
  readonly outcomeCode?: string;
  readonly safeResult?: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export type WorkflowSignalKind = "approval" | "cancellation";
export type CommandDeliveryState = "pending" | "delivered" | "rejected";

export interface WorkflowSignalReceipt {
  readonly id: string;
  readonly workflowRunId: string;
  readonly signalKind: WorkflowSignalKind;
  readonly idempotencyKey: string;
  readonly approvalId?: string;
  readonly payloadDigest: string;
  readonly decision?: "approved" | "rejected";
  readonly applicationDecisionVersion?: number;
  readonly deliveryState: CommandDeliveryState;
  readonly accepted?: boolean;
  readonly reasonCode?: string;
  readonly createdAt: string;
  readonly deliveredAt?: string;
}

export function isTerminalWorkflowState(
  state: WorkflowRunState,
): state is TerminalWorkflowRunState {
  return (TERMINAL_WORKFLOW_STATES as readonly WorkflowRunState[]).includes(state);
}
