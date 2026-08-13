// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession } from "../../../../../shared/database/transaction";
import type { AgentKind, AgentProfile } from "../../../domain/entities/agent-profile";
import type { AgentTask } from "../../../domain/entities/agent-task";
import type { ApprovalRequest, ApprovalState } from "../../../domain/entities/approval-request";
import type { ConfigurationRevision } from "../../../domain/entities/configuration-revision";
import type { PolicyEffect } from "../../../domain/entities/governance-records";

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
}

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
  readonly occurredAt: string;
}

export interface ProvenanceRecord {
  readonly id: string;
  readonly taskId?: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly classification: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
}

export interface BudgetReservationInput {
  readonly id: string;
  readonly revisionId: string;
  readonly agentKind: AgentKind;
  readonly taskId: string;
  readonly idempotencyKey: string;
  readonly costMicros: number;
  readonly occurredAt: string;
}

export interface BudgetSettlementInput {
  readonly id: string;
  readonly reservationId: string;
  readonly idempotencyKey: string;
  readonly actualCostMicros: number;
  readonly occurredAt: string;
}

export interface AgenticRepository {
  findAgentByClientId(session: DatabaseSession, clientId: string): Promise<AgentProfile | undefined>;
  createTask(session: DatabaseSession, task: AgentTask): Promise<void>;
  findTask(session: DatabaseSession, taskId: string, ownerId: string): Promise<AgentTask | undefined>;
  listTasks(session: DatabaseSession, ownerId: string, page: number, pageSize: number): Promise<{ readonly items: readonly AgentTask[]; readonly totalItems: number }>;
  updateTask(session: DatabaseSession, task: AgentTask, expectedVersion: number): Promise<boolean>;
  createRevision(session: DatabaseSession, revision: ConfigurationRevision): Promise<void>;
  findRevision(session: DatabaseSession, revisionId: string): Promise<ConfigurationRevision | undefined>;
  updateRevision(session: DatabaseSession, revision: ConfigurationRevision, expectedVersion: number): Promise<boolean>;
  replaceRevisionChildren(session: DatabaseSession, revisionId: string, children: RevisionChildren): Promise<boolean>;
  activateRevision(session: DatabaseSession, revisionId: string, expectedVersion: number, decidedBy: string, decidedAt: string): Promise<boolean>;
  listPolicies(session: DatabaseSession, revisionId: string): Promise<readonly PolicyRecord[]>;
  registerTool(session: DatabaseSession, tool: ToolRecord): Promise<"created" | "duplicate">;
  findTool(session: DatabaseSession, name: string, version: number): Promise<ToolRecord | undefined>;
  findToolGrant(session: DatabaseSession, revisionId: string, agentKind: AgentKind, name: string, version: number): Promise<ToolGrantRecord | undefined>;
  findModelConfiguration(session: DatabaseSession, revisionId: string, agentKind: AgentKind): Promise<ModelConfigurationRecord | undefined>;
  findBudgetLimit(session: DatabaseSession, revisionId: string, agentKind: AgentKind): Promise<BudgetLimitRecord | undefined>;
  createApproval(session: DatabaseSession, approval: ApprovalRequest): Promise<void>;
  findApproval(session: DatabaseSession, approvalId: string): Promise<ApprovalRequest | undefined>;
  decideApproval(session: DatabaseSession, approvalId: string, expectedVersion: number, state: Exclude<ApprovalState, "pending">, decidedBy: string, reason: string, decidedAt: string): Promise<boolean>;
  createRevocation(session: DatabaseSession, revocation: RevocationRecord): Promise<"created" | "duplicate">;
  findActiveRevocation(session: DatabaseSession, targetType: RevocationRecord["targetType"], targetId: string): Promise<RevocationRecord | undefined>;
  reserveBudget(session: DatabaseSession, input: BudgetReservationInput): Promise<"reserved" | "duplicate" | "exceeded">;
  settleBudget(session: DatabaseSession, input: BudgetSettlementInput): Promise<"settled" | "duplicate" | "stale">;
  appendAudit(session: DatabaseSession, event: AuditEventRecord): Promise<void>;
  listAudit(session: DatabaseSession, limit: number): Promise<readonly AuditEventRecord[]>;
  appendProvenance(session: DatabaseSession, record: ProvenanceRecord): Promise<void>;
  listProvenance(session: DatabaseSession, taskId: string): Promise<readonly ProvenanceRecord[]>;
}
