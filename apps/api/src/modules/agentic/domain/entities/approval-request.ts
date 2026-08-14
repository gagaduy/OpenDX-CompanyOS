// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type ApprovalState =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";
export type ApproverScope =
  | "tool_invocation"
  | "emergency_revocation"
  | "governance_configuration"
  | "workflow_execution";

export interface ApprovalRequest {
  readonly id: string;
  readonly state: ApprovalState;
  readonly requesterId: string;
  readonly approverScope: ApproverScope;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly parametersDigest: string;
  readonly taskId?: string;
  readonly policyVersion: number;
  readonly workflowVersion?: number;
  readonly configurationRevisionId: string;
  readonly expiresAt: string;
  readonly decidedBy?: string;
  readonly decisionReason?: string;
  readonly decidedAt?: string;
  readonly version: number;
  readonly createdAt: string;
}
