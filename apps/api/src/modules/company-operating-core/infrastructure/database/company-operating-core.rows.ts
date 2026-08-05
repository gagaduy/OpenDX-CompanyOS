// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

export type DatabaseTimestamp = Date | string;

export interface CompanyProfileRow { name: string; industry: string; size: string; created_at: DatabaseTimestamp }
export interface DepartmentRow { id: string; name: string; slug: string; head_employee_id: string | null; created_at: DatabaseTimestamp }
export interface PositionRow { id: string; department_id: string; title: string; level: string; created_at: DatabaseTimestamp }
export interface HumanEmployeeRow { id: string; department_id: string; position_id: string; display_name: string; work_email: string; reports_to_employee_id: string | null; status: string; created_at: DatabaseTimestamp }
export interface GoalRow { id: string; owner_type: string; owner_department_id: string | null; title: string; status: string; created_at: DatabaseTimestamp }
export interface KpiRow { id: string; goal_id: string; name: string; unit: string; target: number | string; current: number | string; direction: string; updated_at: DatabaseTimestamp }
export interface OperatingTaskRow { id: string; title: string; status: string; priority: string; assignee_type: string; assignee_id: string; related_event_id: string | null; created_at: DatabaseTimestamp; due_at: DatabaseTimestamp | null }
export interface BusinessEventRow { id: string; type: string; source: string; actor_type: string; actor_id: string; occurred_at: DatabaseTimestamp; correlation_id: string; causation_id: string | null; sensitivity: string }
export interface DecisionRow { id: string; title: string; decided_by_type: string; decided_by_id: string; outcome: string; related_task_id: string | null; correlation_id: string; decided_at: DatabaseTimestamp }
export interface ApprovalRequestRow { id: string; requested_action: string; requested_by_type: string; requested_by_id: string; approver_role: string; status: string; risk_level: string; decision: string; correlation_id: string; created_at: DatabaseTimestamp; resolved_at: DatabaseTimestamp | null }
export interface AuditEventRow { id: string; actor_type: string; actor_id: string; action: string; resource_type: string; resource_id: string; outcome: string; correlation_id: string; occurred_at: DatabaseTimestamp }

export interface CompanyOperatingCoreRows {
  company: CompanyProfileRow;
  departments: readonly DepartmentRow[];
  positions: readonly PositionRow[];
  humanEmployees: readonly HumanEmployeeRow[];
  goals: readonly GoalRow[];
  kpis: readonly KpiRow[];
  tasks: readonly OperatingTaskRow[];
  events: readonly BusinessEventRow[];
  decisions: readonly DecisionRow[];
  approvals: readonly ApprovalRequestRow[];
  auditEvents: readonly AuditEventRow[];
}
