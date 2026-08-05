// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ActorType, ApprovalDecision, ApprovalRequest, ApprovalStatus, AuditEvent,
  BusinessEvent, Company, CompanyOperatingCoreSnapshot, Decision, Department,
  Goal, HumanEmployee, Kpi, Position, RiskLevel, SensitivityLevel, Task,
  TaskPriority, TaskStatus,
} from "../../domain/entities/company-operating-core";
import type {
  ApprovalRequestRow, AuditEventRow, BusinessEventRow, CompanyOperatingCoreRows,
  CompanyProfileRow, DatabaseTimestamp, DecisionRow, DepartmentRow, GoalRow,
  HumanEmployeeRow, KpiRow, OperatingTaskRow, PositionRow,
} from "./company-operating-core.rows";

function enumValue<const T extends readonly string[]>(field: string, value: string, allowed: T): T[number] {
  if (!allowed.includes(value)) throw new Error(`Invalid ${field}: ${value}`);
  return value as T[number];
}

function iso(field: string, value: DatabaseTimestamp): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${field}`);
  return date.toISOString();
}

function finite(field: string, value: number | string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid ${field}`);
  return number;
}

const actorTypes = ["user", "agent", "workflow", "service_account", "connector"] as const;

export const mapCompanyProfileRow = (row: CompanyProfileRow): Company => ({ name: row.name, industry: row.industry, size: row.size, createdAt: iso("created_at", row.created_at) });
export const mapDepartmentRow = (row: DepartmentRow): Department => ({ id: row.id, name: row.name, slug: row.slug, ...(row.head_employee_id === null ? {} : { headEmployeeId: row.head_employee_id }), createdAt: iso("created_at", row.created_at) });
export const mapPositionRow = (row: PositionRow): Position => ({ id: row.id, departmentId: row.department_id, title: row.title, level: row.level, createdAt: iso("created_at", row.created_at) });
export const mapHumanEmployeeRow = (row: HumanEmployeeRow): HumanEmployee => ({ id: row.id, departmentId: row.department_id, positionId: row.position_id, displayName: row.display_name, workEmail: row.work_email, ...(row.reports_to_employee_id === null ? {} : { reportsToEmployeeId: row.reports_to_employee_id }), status: enumValue("status", row.status, ["active", "invited", "archived"] as const), createdAt: iso("created_at", row.created_at) });
export const mapGoalRow = (row: GoalRow): Goal => ({ id: row.id, ownerType: enumValue("owner_type", row.owner_type, ["company", "department"] as const), ...(row.owner_department_id === null ? {} : { ownerId: row.owner_department_id }), title: row.title, status: enumValue("status", row.status, ["active", "at_risk", "complete", "paused"] as const), createdAt: iso("created_at", row.created_at) });
export const mapKpiRow = (row: KpiRow): Kpi => ({ id: row.id, goalId: row.goal_id, name: row.name, unit: row.unit, target: finite("target", row.target), current: finite("current", row.current), direction: enumValue("direction", row.direction, ["increase", "decrease", "maintain"] as const), updatedAt: iso("updated_at", row.updated_at) });
export const mapOperatingTaskRow = (row: OperatingTaskRow): Task => ({ id: row.id, title: row.title, status: enumValue("status", row.status, ["todo", "in_progress", "waiting_approval", "done", "canceled"] as const) as TaskStatus, priority: enumValue("priority", row.priority, ["low", "medium", "high", "urgent"] as const) as TaskPriority, assigneeType: enumValue("assignee_type", row.assignee_type, ["human_employee", "department", "digital_employee"] as const), assigneeId: row.assignee_id, ...(row.related_event_id === null ? {} : { relatedEventId: row.related_event_id }), createdAt: iso("created_at", row.created_at), ...(row.due_at === null ? {} : { dueAt: iso("due_at", row.due_at) }) });
export const mapBusinessEventRow = (row: BusinessEventRow): BusinessEvent => ({ id: row.id, type: row.type, source: row.source, actor: { type: enumValue("actor_type", row.actor_type, actorTypes) as ActorType, id: row.actor_id }, occurredAt: iso("occurred_at", row.occurred_at), correlationId: row.correlation_id, ...(row.causation_id === null ? {} : { causationId: row.causation_id }), sensitivity: enumValue("sensitivity", row.sensitivity, ["public", "internal", "confidential", "restricted"] as const) as SensitivityLevel });
export const mapDecisionRow = (row: DecisionRow): Decision => ({ id: row.id, title: row.title, decidedBy: { type: enumValue("decided_by_type", row.decided_by_type, actorTypes) as ActorType, id: row.decided_by_id }, outcome: row.outcome, ...(row.related_task_id === null ? {} : { relatedTaskId: row.related_task_id }), correlationId: row.correlation_id, decidedAt: iso("decided_at", row.decided_at) });
export const mapApprovalRequestRow = (row: ApprovalRequestRow): ApprovalRequest => ({ id: row.id, requestedAction: row.requested_action, requestedBy: { type: enumValue("requested_by_type", row.requested_by_type, actorTypes) as ActorType, id: row.requested_by_id }, approverRole: row.approver_role, status: enumValue("status", row.status, ["pending", "approved", "rejected", "changes_requested", "canceled"] as const) as ApprovalStatus, riskLevel: enumValue("risk_level", row.risk_level, ["low", "medium", "high", "critical"] as const) as RiskLevel, decision: enumValue("decision", row.decision, ["allow", "require_approval", "deny"] as const) as ApprovalDecision, correlationId: row.correlation_id, createdAt: iso("created_at", row.created_at), ...(row.resolved_at === null ? {} : { resolvedAt: iso("resolved_at", row.resolved_at) }) });
export const mapAuditEventRow = (row: AuditEventRow): AuditEvent => ({ id: row.id, actor: { type: enumValue("actor_type", row.actor_type, actorTypes) as ActorType, id: row.actor_id }, action: row.action, resourceType: row.resource_type, resourceId: row.resource_id, outcome: enumValue("outcome", row.outcome, ["success", "failure", "denied", "approval_required"] as const), correlationId: row.correlation_id, occurredAt: iso("occurred_at", row.occurred_at) });

export function mapCompanyOperatingCoreRows(rows: CompanyOperatingCoreRows): CompanyOperatingCoreSnapshot {
  return {
    company: mapCompanyProfileRow(rows.company),
    departments: rows.departments.map(mapDepartmentRow),
    positions: rows.positions.map(mapPositionRow),
    humanEmployees: rows.humanEmployees.map(mapHumanEmployeeRow),
    goals: rows.goals.map(mapGoalRow),
    kpis: rows.kpis.map(mapKpiRow),
    tasks: rows.tasks.map(mapOperatingTaskRow),
    events: rows.events.map(mapBusinessEventRow),
    decisions: rows.decisions.map(mapDecisionRow),
    approvals: rows.approvals.map(mapApprovalRequestRow),
    auditEvents: rows.auditEvents.map(mapAuditEventRow),
  };
}
