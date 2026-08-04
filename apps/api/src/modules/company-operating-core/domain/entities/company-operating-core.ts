// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

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

export interface ActorRef {
  type: ActorType;
  id: EntityId;
}

export interface Company {
  name: string;
  industry: string;
  size: string;
  createdAt: IsoTimestamp;
}

export interface Department {
  id: EntityId;
  name: string;
  slug: string;
  headEmployeeId?: EntityId;
  createdAt: IsoTimestamp;
}

export interface Position {
  id: EntityId;
  departmentId: EntityId;
  title: string;
  level: string;
  createdAt: IsoTimestamp;
}

export interface HumanEmployee {
  id: EntityId;
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
  ownerType: "company" | "department";
  ownerId?: EntityId;
  title: string;
  status: "active" | "at_risk" | "complete" | "paused";
  createdAt: IsoTimestamp;
}

export interface Kpi {
  id: EntityId;
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
  title: string;
  decidedBy: ActorRef;
  outcome: string;
  relatedTaskId?: EntityId;
  correlationId: string;
  decidedAt: IsoTimestamp;
}

export interface ApprovalRequest {
  id: EntityId;
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
