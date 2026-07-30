// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { CompanyId } from "./ids";

export type EntityId = string;
export type IsoTimestamp = string;

export type ActorType =
  | "user"
  | "agent"
  | "workflow"
  | "service_account"
  | "connector";
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "waiting_approval"
  | "done"
  | "canceled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "canceled";
export type ApprovalDecision = "allow" | "require_approval" | "deny";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type SensitivityLevel =
  | "public"
  | "internal"
  | "confidential"
  | "restricted";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ActorRef {
  type: ActorType;
  id: EntityId;
}

export interface Company {
  id: CompanyId;
  name: string;
  industry: string;
  size: string;
  createdAt: IsoTimestamp;
}

export interface Department {
  id: EntityId;
  companyId: CompanyId;
  name: string;
  slug: string;
  headEmployeeId?: EntityId;
  createdAt: IsoTimestamp;
}

export interface Position {
  id: EntityId;
  companyId: CompanyId;
  departmentId: EntityId;
  title: string;
  level: string;
  createdAt: IsoTimestamp;
}

export interface HumanEmployee {
  id: EntityId;
  companyId: CompanyId;
  departmentId: EntityId;
  positionId: EntityId;
  displayName: string;
  workEmail: string;
  reportsToEmployeeId?: EntityId;
  status: "active" | "invited" | "archived";
  createdAt: IsoTimestamp;
}

export interface Goal {
  id: EntityId;
  companyId: CompanyId;
  ownerType: "company" | "department";
  ownerId: EntityId;
  title: string;
  status: "active" | "at_risk" | "complete" | "paused";
  createdAt: IsoTimestamp;
}

export interface Kpi {
  id: EntityId;
  companyId: CompanyId;
  goalId: EntityId;
  name: string;
  unit: string;
  target: number;
  current: number;
  direction: "increase" | "decrease" | "maintain";
  updatedAt: IsoTimestamp;
}

export interface Task {
  id: EntityId;
  companyId: CompanyId;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeType: "human_employee" | "department" | "digital_employee";
  assigneeId: EntityId;
  relatedEventId?: EntityId;
  createdAt: IsoTimestamp;
  dueAt?: IsoTimestamp;
}

export interface BusinessEvent {
  id: EntityId;
  companyId: CompanyId;
  type: string;
  source: string;
  actor: ActorRef;
  occurredAt: IsoTimestamp;
  correlationId: string;
  causationId?: string;
  sensitivity: SensitivityLevel;
}

export interface Decision {
  id: EntityId;
  companyId: CompanyId;
  title: string;
  decidedBy: ActorRef;
  outcome: string;
  relatedTaskId?: EntityId;
  correlationId: string;
  decidedAt: IsoTimestamp;
}

export interface ApprovalRequest {
  id: EntityId;
  companyId: CompanyId;
  requestedAction: string;
  requestedBy: ActorRef;
  approverRole: string;
  status: ApprovalStatus;
  riskLevel: RiskLevel;
  decision: ApprovalDecision;
  correlationId: string;
  createdAt: IsoTimestamp;
  resolvedAt?: IsoTimestamp;
}

export interface AuditEvent {
  id: EntityId;
  companyId: CompanyId;
  actor: ActorRef;
  action: string;
  resourceType: string;
  resourceId: EntityId;
  outcome: "success" | "failure" | "denied" | "approval_required";
  correlationId: string;
  occurredAt: IsoTimestamp;
}

export interface CompanyOperatingCoreSnapshot {
  company: Company;
  departments: Department[];
  positions: Position[];
  humanEmployees: HumanEmployee[];
  goals: Goal[];
  kpis: Kpi[];
  tasks: Task[];
  events: BusinessEvent[];
  decisions: Decision[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
}

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "waiting_approval",
  "done",
  "canceled",
] as const;

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  "pending",
  "approved",
  "rejected",
  "changes_requested",
  "canceled",
] as const;

export const CORE_ENTITY_KINDS = [
  "company",
  "department",
  "position",
  "human_employee",
  "goal",
  "kpi",
  "task",
  "business_event",
  "decision",
  "approval_request",
  "audit_event",
] as const;

export function assertValidCompanyScope(
  snapshot: CompanyOperatingCoreSnapshot,
  companyId: CompanyId,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (snapshot.company.id !== companyId) {
    issues.push({
      path: "company.id",
      message: `Expected ${companyId} but received ${snapshot.company.id}`,
    });
  }

  const collections = [
    ["departments", snapshot.departments],
    ["positions", snapshot.positions],
    ["humanEmployees", snapshot.humanEmployees],
    ["goals", snapshot.goals],
    ["kpis", snapshot.kpis],
    ["tasks", snapshot.tasks],
    ["events", snapshot.events],
    ["decisions", snapshot.decisions],
    ["approvals", snapshot.approvals],
    ["auditEvents", snapshot.auditEvents],
  ] as const;

  for (const [collectionName, records] of collections) {
    records.forEach((record, index) => {
      if (record.companyId !== companyId) {
        issues.push({
          path: `${collectionName}[${index}].companyId`,
          message: `Expected ${companyId} but received ${record.companyId}`,
        });
      }
    });
  }

  return issues;
}

export function validateCompanyOperatingCoreSnapshot(
  snapshot: CompanyOperatingCoreSnapshot,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!snapshot.company.id) {
    issues.push({ path: "company.id", message: "Company id is required" });
  }

  snapshot.tasks.forEach((task, index) => {
    if (!TASK_STATUSES.includes(task.status)) {
      issues.push({
        path: `tasks[${index}].status`,
        message: `Unknown task status: ${task.status}`,
      });
    }
  });

  snapshot.approvals.forEach((approval, index) => {
    if (!APPROVAL_STATUSES.includes(approval.status)) {
      issues.push({
        path: `approvals[${index}].status`,
        message: `Unknown approval status: ${approval.status}`,
      });
    }
  });

  snapshot.events.forEach((event, index) => {
    if (!event.type) {
      issues.push({
        path: `events[${index}].type`,
        message: "Business event type is required",
      });
    }
    if (!event.actor.id) {
      issues.push({
        path: `events[${index}].actor.id`,
        message: "Business event actor id is required",
      });
    }
    if (!event.occurredAt) {
      issues.push({
        path: `events[${index}].occurredAt`,
        message: "Business event timestamp is required",
      });
    }
    if (!event.correlationId) {
      issues.push({
        path: `events[${index}].correlationId`,
        message: "Business event correlationId is required",
      });
    }
  });

  return issues;
}
