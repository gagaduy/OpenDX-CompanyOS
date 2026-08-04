// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ActorType,
  ApprovalDecision,
  ApprovalStatus,
  RiskLevel,
  SensitivityLevel,
  TaskPriority,
  TaskStatus,
} from "../../../domain/entities/company-operating-core";

export interface ActorResponseDto {
  readonly type: ActorType;
  readonly id: string;
}

export interface CompanyResponseDto {
  readonly name: string;
  readonly industry: string;
  readonly size: string;
  readonly createdAt: string;
}

export interface DepartmentResponseDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly headEmployeeId?: string;
  readonly createdAt: string;
}

export interface PositionResponseDto {
  readonly id: string;
  readonly departmentId: string;
  readonly title: string;
  readonly level: string;
  readonly createdAt: string;
}

export interface HumanEmployeeResponseDto {
  readonly id: string;
  readonly departmentId: string;
  readonly positionId: string;
  readonly displayName: string;
  readonly workEmail: string;
  readonly reportsToEmployeeId?: string;
  readonly status: "active" | "invited" | "archived";
  readonly createdAt: string;
}

export interface GoalResponseDto {
  readonly id: string;
  readonly ownerType: "company" | "department";
  readonly ownerId?: string;
  readonly title: string;
  readonly status: "active" | "at_risk" | "complete" | "paused";
  readonly createdAt: string;
}

export interface KpiResponseDto {
  readonly id: string;
  readonly goalId: string;
  readonly name: string;
  readonly unit: string;
  readonly target: number;
  readonly current: number;
  readonly direction: "increase" | "decrease" | "maintain";
  readonly updatedAt: string;
}

export interface TaskResponseDto {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeType:
    | "human_employee"
    | "department"
    | "digital_employee";
  readonly assigneeId: string;
  readonly relatedEventId?: string;
  readonly createdAt: string;
  readonly dueAt?: string;
}

export interface BusinessEventResponseDto {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly actor: ActorResponseDto;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly sensitivity: SensitivityLevel;
}

export interface DecisionResponseDto {
  readonly id: string;
  readonly title: string;
  readonly decidedBy: ActorResponseDto;
  readonly outcome: string;
  readonly relatedTaskId?: string;
  readonly correlationId: string;
  readonly decidedAt: string;
}

export interface ApprovalResponseDto {
  readonly id: string;
  readonly requestedAction: string;
  readonly requestedBy: ActorResponseDto;
  readonly approverRole: string;
  readonly status: ApprovalStatus;
  readonly riskLevel: RiskLevel;
  readonly decision: ApprovalDecision;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

export interface AuditEventResponseDto {
  readonly id: string;
  readonly actor: ActorResponseDto;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly outcome:
    | "success"
    | "failure"
    | "denied"
    | "approval_required";
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface CompanyOperatingCoreResponseDto {
  readonly company: CompanyResponseDto;
  readonly departments: readonly DepartmentResponseDto[];
  readonly positions: readonly PositionResponseDto[];
  readonly humanEmployees: readonly HumanEmployeeResponseDto[];
  readonly goals: readonly GoalResponseDto[];
  readonly kpis: readonly KpiResponseDto[];
  readonly tasks: readonly TaskResponseDto[];
  readonly events: readonly BusinessEventResponseDto[];
  readonly decisions: readonly DecisionResponseDto[];
  readonly approvals: readonly ApprovalResponseDto[];
  readonly auditEvents: readonly AuditEventResponseDto[];
}
