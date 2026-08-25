// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgenticConsoleTaskRecord } from "../../repositories/interfaces/agentic.repository";
import type { AgentTaskDetail } from "../../services/interfaces/agent-task.service";

export interface AgenticTaskOverviewDto {
  readonly counts: Readonly<Record<"running" | "waiting" | "failed" | "completed" | "canceled", number>>;
  readonly pendingApprovals: number;
  readonly settledCostMicros: number;
  readonly refreshedAt: string;
}

export interface AgenticTaskPageDto {
  readonly items: readonly AgenticConsoleTaskRecord[];
  readonly totalItems: number;
  readonly refreshedAt: string;
}

export interface AgenticTaskIntakeResultDto {
  readonly disposition: "created" | "replayed";
  readonly detail: AgentTaskDetail;
}

export interface AgenticFileGovernancePreviewDto {
  readonly coordinator: "ai_ceo";
  readonly eligibleDepartments: readonly ("catalog" | "inventory" | "order" | "finance" | "crm" | "support")[];
  readonly allowedTools: readonly string[];
  readonly dataClasses: readonly string[];
  readonly riskSignals: readonly string[];
  readonly dependencyStatus: "planned_after_task_start";
  readonly configurationRevisionId: string;
  readonly configurationVersion: number;
}

export interface AgenticTaskOperationsDto {
  readonly task: { readonly id: string; readonly goal: string; readonly state: string; readonly version: number };
  readonly workflow?: { readonly id: string; readonly state: string; readonly stage: string; readonly version: number; readonly updatedAt: string };
  readonly timeline: readonly { readonly id: string; readonly kind: string; readonly state: string; readonly occurredAt: string; readonly branchId?: string; readonly reasonCode?: string }[];
  readonly branches: readonly { readonly id: string; readonly owner: string; readonly state: string; readonly dependencies: readonly string[]; readonly toolNames: readonly string[]; readonly dataClasses: readonly string[] }[];
  readonly costs: { readonly reservedMicros: number; readonly settledMicros: number };
  readonly approvals: readonly { readonly id: string; readonly state: string; readonly expiresAt: string; readonly version: number }[];
  readonly provenance: readonly { readonly id: string; readonly sourceType: string; readonly sourceId: string; readonly classification: string }[];
  readonly report?: {
    readonly completionState: "complete" | "partial" | "quality_escalated" | "canceled";
    readonly summary: string;
    readonly conclusions: readonly { readonly code: string; readonly statement: string; readonly provenanceIds: readonly string[] }[];
    readonly risks: readonly { readonly code: string; readonly statement: string; readonly severity: "low" | "medium" | "high"; readonly provenanceIds: readonly string[] }[];
    readonly recommendedActions: readonly { readonly code: string; readonly statement: string; readonly requiresHumanApproval: boolean; readonly provenanceIds: readonly string[] }[];
    readonly conflicts: readonly { readonly code: string; readonly statement: string; readonly provenanceIds: readonly string[] }[];
    readonly unavailableBranches: readonly { readonly subtaskId: string; readonly reasonCode: string }[];
  };
  readonly refreshedAt: string;
}

export interface AgenticApprovalDetailDto {
  readonly approval: {
    readonly id: string; readonly state: "pending" | "approved" | "rejected" | "revision_requested";
    readonly requesterId: string; readonly approverScope: "tool_invocation" | "emergency_revocation" | "governance_configuration" | "workflow_execution";
    readonly action: string; readonly resourceType: string; readonly resourceId: string;
    readonly parametersDigest: string; readonly policyVersion: number; readonly workflowVersion?: number;
    readonly configurationRevisionId: string; readonly expiresAt: string; readonly version: number; readonly createdAt: string;
  };
  readonly payloadDigest?: string;
  readonly risk: { readonly level: "low" | "medium" | "high"; readonly basis: string };
  readonly expectedEffect: string;
  readonly sources: readonly { readonly sourceType: string; readonly sourceId: string; readonly sourceDigest: string }[];
  readonly refreshedAt: string;
}
