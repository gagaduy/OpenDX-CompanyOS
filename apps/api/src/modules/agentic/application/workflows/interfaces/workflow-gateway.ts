// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export interface StartWorkflowCommand {
  readonly workflowRunId: string;
  readonly temporalWorkflowId: string;
  readonly taskId: string;
  readonly workflowVersion: 1;
  readonly planRevision: number;
}

export interface WorkflowGatewayStartResult {
  readonly temporalRunId: string;
  readonly duplicate: boolean;
}

export interface ApprovalWorkflowSignal {
  readonly temporalWorkflowId: string;
  readonly idempotencyKey: string;
  readonly approvalId: string;
  readonly payloadDigest: string;
  readonly decision: "approved" | "rejected";
  readonly applicationDecisionVersion: number;
}

export interface CancellationWorkflowSignal {
  readonly temporalWorkflowId: string;
  readonly idempotencyKey: string;
  readonly payloadDigest: string;
  readonly reasonCode: string;
}

export interface WorkflowGatewayDescription {
  readonly status: "running" | "completed" | "failed" | "canceled";
  readonly temporalRunId?: string;
}

export interface WorkflowGateway {
  start(input: StartWorkflowCommand): Promise<WorkflowGatewayStartResult>;
  signalApproval(input: ApprovalWorkflowSignal): Promise<void>;
  signalCancellation(input: CancellationWorkflowSignal): Promise<void>;
  describe(temporalWorkflowId: string): Promise<WorkflowGatewayDescription>;
}
