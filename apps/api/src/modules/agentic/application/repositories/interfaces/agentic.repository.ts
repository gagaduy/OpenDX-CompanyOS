// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { AgentKind, AgentProfile } from "../../../domain/entities/agent-profile";
import type { AgentTask } from "../../../domain/entities/agent-task";
import type { AgenticFilePreview, AgenticIntakeFile } from "../../../domain/entities/agentic-file";
import type { ApprovalRequest, ApprovalState, ApproverScope } from "../../../domain/entities/approval-request";
import type { ConfigurationRevision } from "../../../domain/entities/configuration-revision";
import type { PolicyEffect } from "../../../domain/entities/governance-records";
import type { ModelQualityEvidence, ModelRun } from "../../../domain/entities/model-run";
import type {
  ActivityInvocation,
  WorkflowRun,
  WorkflowSignalReceipt,
} from "../../../domain/entities/workflow-run";
import type {
  DepartmentAgentKind,
  DepartmentToolName,
} from "../../tools/department-tool-contracts";

export interface PolicyRecord {
  readonly id: string;
  readonly revisionId: string;
  readonly ruleOrder: number;
  readonly effect: PolicyEffect;
  readonly actorType: string;
  readonly agentKind?: AgentKind;
  readonly department?: string;
  readonly resource: string;
  readonly action: string;
  readonly purpose: string;
  readonly dataClassification: string;
  readonly reasonCode: string;
}

export interface ToolRecord {
  readonly name: string;
  readonly version: number;
  readonly inputSchemaDigest: string;
  readonly outputSchemaDigest: string;
  readonly active: boolean;
  readonly executionCostMicros: number;
  readonly maximumAttempts: number;
}

export type ToolInvocationStatus =
  | "reserved"
  | "completed"
  | "retryable_failed"
  | "failed";

export interface ToolInvocationRecord {
  readonly id: string;
  readonly taskId: string;
  readonly agentKind: DepartmentAgentKind;
  readonly toolName: DepartmentToolName;
  readonly toolVersion: 1;
  readonly idempotencyKey: string;
  readonly parametersDigest: string;
  readonly status: ToolInvocationStatus;
  readonly attempt: number;
  readonly safeResult?: unknown;
  readonly resultDigest?: string;
  readonly errorCode?: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface ToolInvocationReservationInput {
  readonly id: string;
  readonly taskId: string;
  readonly agentKind: DepartmentAgentKind;
  readonly toolName: DepartmentToolName;
  readonly toolVersion: 1;
  readonly idempotencyKey: string;
  readonly parametersDigest: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly occurredAt: string;
}

export interface ToolInvocationCompletionInput {
  readonly invocationId: string;
  readonly attempt: number;
  readonly safeResult: unknown;
  readonly resultDigest: string;
  readonly occurredAt: string;
}

export interface ToolInvocationFailureInput {
  readonly invocationId: string;
  readonly attempt: number;
  readonly errorCode: string;
  readonly retryable: boolean;
  readonly occurredAt: string;
}

export type ToolInvocationReservationResult =
  | { readonly kind: "reserved"; readonly invocationId: string; readonly attempt: number }
  | { readonly kind: "in_progress"; readonly invocationId: string; readonly attempt: number }
  | { readonly kind: "completed"; readonly invocationId: string; readonly attempt: number; readonly result: unknown }
  | { readonly kind: "failed"; readonly invocationId: string; readonly attempt: number; readonly errorCode: string }
  | { readonly kind: "conflict"; readonly invocationId: string; readonly attempt: number };

export interface ToolGrantRecord {
  readonly id: string;
  readonly revisionId: string;
  readonly agentKind: AgentKind;
  readonly toolName: string;
  readonly toolVersion: number;
  readonly purpose: string;
  readonly dataScope: string;
  readonly maxInvocations: number;
}

export interface ModelConfigurationRecord {
  readonly revisionId: string;
  readonly agentKind: AgentKind;
  readonly primaryModel: string;
  readonly fallbackModels: readonly string[];
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly inputCostMicrosPerMillion: number;
  readonly outputCostMicrosPerMillion: number;
}

export interface BudgetLimitRecord {
  readonly revisionId: string;
  readonly agentKind: AgentKind;
  readonly taskCostMicros: number;
  readonly dailyCostMicros: number;
  readonly monthlyCostMicros: number;
}

export interface RevisionChildren {
  readonly policies: readonly PolicyRecord[];
  readonly toolGrants: readonly ToolGrantRecord[];
  readonly modelConfigurations: readonly ModelConfigurationRecord[];
  readonly budgetLimits: readonly BudgetLimitRecord[];
}

export interface RevocationRecord {
  readonly id: string;
  readonly targetType: "agent" | "tool_grant" | "model";
  readonly targetId: string;
  readonly reason: string;
  readonly activatedBy: string;
  readonly activatedAt: string;
  readonly approvalId?: string;
  readonly idempotencyKey: string;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly actorId: string;
  readonly clientId?: string;
  readonly actorType: "staff" | "agent" | "system";
  readonly taskId?: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly outcome: "allowed" | "denied" | "failed";
  readonly policyVersion?: number;
  readonly modelVersion?: number;
  readonly toolVersion?: number;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly parametersDigest?: string;
  readonly attempt?: number;
  readonly durationMs?: number;
  readonly resultDigest?: string;
  readonly errorCode?: string;
  readonly occurredAt: string;
}

export interface ProvenanceRecord {
  readonly id: string;
  readonly taskId?: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly sourceVersion?: number;
  readonly normalizedWindow?: Readonly<Record<string, unknown>>;
  readonly sourceSnapshotAt?: string;
  readonly classification: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
}

export interface AuditFilter {
  readonly limit: number;
  readonly actorId?: string;
  readonly action?: string;
  readonly outcome?: AuditEventRecord["outcome"];
  readonly resourceTypes?: readonly string[];
}

export interface ApprovalListFilter {
  readonly requesterId?: string;
  readonly approverScopes?: readonly ApproverScope[];
}

export interface BudgetReservationInput {
  readonly id: string;
  readonly revisionId: string;
  readonly agentKind: AgentKind;
  readonly taskId: string;
  readonly idempotencyKey: string;
  readonly costMicros: number;
  readonly occurredAt: string;
  readonly modelRunId?: string;
}

export interface AgentSubtaskRecord {
  readonly id: string;
  readonly taskId: string;
  readonly agentKind: AgentKind;
  readonly title: string;
  readonly version: number;
  readonly createdAt: string;
}

export interface AgentSubtaskDependencyRecord {
  readonly taskId: string;
  readonly from: string;
  readonly to: string;
}

export interface AgenticFileApprovalInput {
  readonly id: string;
  readonly fileId: string;
  readonly previewVersion: number;
  readonly previewDigest: string;
  readonly expectedFileVersion: number;
  readonly previewPayloadDigest: string;
  readonly task: AgentTask;
  readonly idempotencyKey: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export interface AgenticFileApprovalResult {
  readonly status: "created" | "duplicate";
  readonly taskId: string;
}

export interface BudgetSettlementInput {
  readonly id: string;
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly actualCostMicros: number;
  readonly occurredAt: string;
  readonly modelRunId?: string;
}

export type ModelRunReservationResult = {
  readonly status: "reserved" | "duplicate" | "conflict";
  readonly run: ModelRun;
};

export type ModelRunTerminalResult = "updated" | "duplicate" | "stale" | "conflict";
export type ModelQualityEvidenceAppendResult = "created" | "duplicate" | "conflict";

export interface ModelRunBudgetReservationRecord {
  readonly id: string;
  readonly costMicros: number;
}

export interface ModelRunBudgetSettlementRecord {
  readonly reservationId: string;
  readonly modelRunId?: string;
  readonly costMicros: number;
}

export interface WorkflowRunCreateResult {
  readonly status: "created" | "duplicate";
  readonly run: WorkflowRun;
}

export interface ActivityReservationResult {
  readonly status: "reserved" | "duplicate" | "conflict";
  readonly invocation: ActivityInvocation;
}

export interface WorkflowSignalReceiptCreateResult {
  readonly status: "created" | "duplicate" | "conflict";
  readonly receipt: WorkflowSignalReceipt;
}

export interface AgenticRepository {
  createIntakeFile(session: DatabaseSession, file: AgenticIntakeFile): Promise<void>;
  findIntakeFile(session: DatabaseSession, fileId: string): Promise<AgenticIntakeFile | undefined>;
  transitionIntakeFile(session: DatabaseSession, file: AgenticIntakeFile, expectedVersion: number): Promise<boolean>;
  appendFilePreview(session: DatabaseSession, preview: AgenticFilePreview): Promise<void>;
  findFilePreview(session: DatabaseSession, fileId: string, previewVersion: number): Promise<AgenticFilePreview | undefined>;
  findFileApprovalByIdempotency(session: DatabaseSession, idempotencyKey: string): Promise<AgenticFileApprovalResult | undefined>;
  approveFilePreview(session: DatabaseSession, input: AgenticFileApprovalInput): Promise<AgenticFileApprovalResult>;
  findAgentByClientId(session: DatabaseSession, clientId: string): Promise<AgentProfile | undefined>;
  findAgentByKind(session: DatabaseSession, agentKind: AgentKind): Promise<AgentProfile | undefined>;
  listAgents(session: DatabaseSession): Promise<readonly AgentProfile[]>;
  createTask(session: DatabaseSession, task: AgentTask): Promise<void>;
  findTask(session: DatabaseSession, taskId: string, ownerId: string): Promise<AgentTask | undefined>;
  findTaskById(session: DatabaseSession, taskId: string): Promise<AgentTask | undefined>;
  findTaskForApproval(session: DatabaseSession, taskId: string): Promise<AgentTask | undefined>;
  findTaskForAgent(session: DatabaseSession, taskId: string, agentKind: AgentKind): Promise<AgentTask | undefined>;
  listTasks(session: DatabaseSession, ownerId: string, page: number, pageSize: number): Promise<{ readonly items: readonly AgentTask[]; readonly totalItems: number }>;
  listAllTasks(session: DatabaseSession, page: number, pageSize: number): Promise<{ readonly items: readonly AgentTask[]; readonly totalItems: number }>;
  updateTask(session: DatabaseSession, task: AgentTask, expectedVersion: number): Promise<boolean>;
  replaceTaskGraph(session: DatabaseSession, taskId: string, ownerId: string, subtasks: readonly AgentSubtaskRecord[], dependencies: readonly AgentSubtaskDependencyRecord[]): Promise<boolean>;
  listTaskGraph(session: DatabaseSession, taskId: string): Promise<{ readonly subtasks: readonly AgentSubtaskRecord[]; readonly dependencies: readonly AgentSubtaskDependencyRecord[] }>;
  createRevision(session: DatabaseSession, revision: ConfigurationRevision): Promise<void>;
  findRevision(session: DatabaseSession, revisionId: string): Promise<ConfigurationRevision | undefined>;
  findActiveRevision(session: DatabaseSession): Promise<ConfigurationRevision | undefined>;
  updateRevision(session: DatabaseSession, revision: ConfigurationRevision, expectedVersion: number): Promise<boolean>;
  replaceRevisionChildren(session: DatabaseSession, revisionId: string, children: RevisionChildren): Promise<boolean>;
  getRevisionChildren(session: DatabaseSession, revisionId: string): Promise<RevisionChildren>;
  activateRevision(session: DatabaseSession, revisionId: string, expectedVersion: number, activatedBy: string, activatedAt: string): Promise<boolean>;
  rejectRevision(session: DatabaseSession, revisionId: string, expectedVersion: number, decidedBy: string, reason: string, decidedAt: string): Promise<boolean>;
  listPolicies(session: DatabaseSession, revisionId: string): Promise<readonly PolicyRecord[]>;
  registerTool(session: DatabaseSession, tool: ToolRecord): Promise<"created" | "duplicate">;
  findTool(session: DatabaseSession, name: string, version: number): Promise<ToolRecord | undefined>;
  findToolGrant(session: DatabaseSession, revisionId: string, agentKind: AgentKind, name: string, version: number): Promise<ToolGrantRecord | undefined>;
  findModelConfiguration(session: DatabaseSession, revisionId: string, agentKind: AgentKind): Promise<ModelConfigurationRecord | undefined>;
  findBudgetLimit(session: DatabaseSession, revisionId: string, agentKind: AgentKind): Promise<BudgetLimitRecord | undefined>;
  createApproval(session: DatabaseSession, approval: ApprovalRequest): Promise<void>;
  findApproval(session: DatabaseSession, approvalId: string): Promise<ApprovalRequest | undefined>;
  listApprovals(session: DatabaseSession, page: number, pageSize: number, filter?: ApprovalListFilter): Promise<{ readonly items: readonly ApprovalRequest[]; readonly totalItems: number }>;
  decideApproval(session: DatabaseSession, approvalId: string, expectedVersion: number, state: Exclude<ApprovalState, "pending">, decidedBy: string, reason: string, decidedAt: string): Promise<boolean>;
  createRevocation(session: DatabaseSession, revocation: RevocationRecord): Promise<"created" | "duplicate">;
  findActiveRevocation(session: DatabaseSession, targetType: RevocationRecord["targetType"], targetId: string): Promise<RevocationRecord | undefined>;
  reserveBudget(session: DatabaseSession, input: BudgetReservationInput): Promise<"reserved" | "duplicate" | "conflict" | "exceeded">;
  settleBudget(session: DatabaseSession, input: BudgetSettlementInput): Promise<"settled" | "duplicate" | "conflict" | "stale">;
  reserveModelRun(session: DatabaseSession, run: ModelRun): Promise<ModelRunReservationResult>;
  findModelRun(session: DatabaseSession, runId: string): Promise<ModelRun | undefined>;
  markModelRunRunning(session: DatabaseSession, run: ModelRun, expectedVersion: number): Promise<boolean>;
  settleModelRunTerminal(session: DatabaseSession, run: ModelRun, expectedVersion: number): Promise<ModelRunTerminalResult>;
  appendModelQualityEvidence(session: DatabaseSession, evidence: ModelQualityEvidence): Promise<ModelQualityEvidenceAppendResult>;
  findModelQualityEvidenceByIdempotencyKey(session: DatabaseSession, idempotencyKey: string): Promise<ModelQualityEvidence | undefined>;
  findModelRunBudgetReservation(session: DatabaseSession, modelRunId: string): Promise<ModelRunBudgetReservationRecord | undefined>;
  findModelRunBudgetSettlementByIdempotencyKey(session: DatabaseSession, idempotencyKey: string): Promise<ModelRunBudgetSettlementRecord | undefined>;
  appendAudit(session: DatabaseSession, event: AuditEventRecord): Promise<void>;
  countToolInvocations(
    session: DatabaseSession,
    taskId: string,
    agentKind: DepartmentAgentKind,
    toolName: DepartmentToolName,
    toolVersion: 1,
    excludingIdempotencyKey: string,
  ): Promise<number>;
  listAudit(session: DatabaseSession, filter: AuditFilter): Promise<readonly AuditEventRecord[]>;
  appendProvenance(session: DatabaseSession, record: ProvenanceRecord): Promise<void>;
  listProvenance(session: DatabaseSession, taskId: string): Promise<readonly ProvenanceRecord[]>;
  createWorkflowRun(session: DatabaseSession, run: WorkflowRun): Promise<WorkflowRunCreateResult>;
  findWorkflowRun(session: DatabaseSession, runId: string): Promise<WorkflowRun | undefined>;
  findActiveWorkflowRunForTask(session: DatabaseSession, taskId: string): Promise<WorkflowRun | undefined>;
  listWorkflowRunsForTask(session: DatabaseSession, taskId: string): Promise<readonly WorkflowRun[]>;
  projectWorkflowRun(session: DatabaseSession, run: WorkflowRun, expectedVersion: number, expectedProjectionSequence: number): Promise<"updated" | "duplicate" | "stale" | "conflict">;
  attachTemporalRunId(session: DatabaseSession, runId: string, temporalRunId: string, expectedVersion: number, updatedAt: string): Promise<boolean>;
  listPendingWorkflowStarts(session: DatabaseSession, limit: number): Promise<readonly WorkflowRun[]>;
  reserveActivityInvocation(session: DatabaseSession, invocation: ActivityInvocation): Promise<ActivityReservationResult>;
  findActivityInvocation(session: DatabaseSession, invocationKey: string): Promise<ActivityInvocation | undefined>;
  finishActivityInvocation(session: DatabaseSession, invocation: ActivityInvocation, expectedVersion: number): Promise<boolean>;
  createWorkflowSignalReceipt(session: DatabaseSession, receipt: WorkflowSignalReceipt): Promise<WorkflowSignalReceiptCreateResult>;
  findWorkflowSignalReceipt(session: DatabaseSession, idempotencyKey: string): Promise<WorkflowSignalReceipt | undefined>;
  findWorkflowApproval(session: DatabaseSession, runId: string): Promise<ApprovalRequest | undefined>;
  updateWorkflowSignalReceipt(session: DatabaseSession, receipt: WorkflowSignalReceipt): Promise<boolean>;
  listPendingWorkflowSignals(session: DatabaseSession, limit: number): Promise<readonly WorkflowSignalReceipt[]>;
  reserveToolInvocation(session: DatabaseSession, input: ToolInvocationReservationInput): Promise<ToolInvocationReservationResult>;
  completeToolInvocation(session: DatabaseSession, input: ToolInvocationCompletionInput): Promise<boolean>;
  failToolInvocation(session: DatabaseSession, input: ToolInvocationFailureInput): Promise<boolean>;
  findToolInvocation(session: DatabaseSession, invocationId: string): Promise<ToolInvocationRecord | undefined>;
}
