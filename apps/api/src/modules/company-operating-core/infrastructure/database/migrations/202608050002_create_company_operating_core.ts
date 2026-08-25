// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { MigrationBuilder } from "node-pg-migrate";

const timestamp = (pgm: MigrationBuilder) => ({
  type: "timestamptz",
  notNull: true,
  default: pgm.func("current_timestamp"),
});

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("company_profile", {
    singleton_key: { type: "smallint", primaryKey: true, check: "singleton_key = 1" },
    name: { type: "text", notNull: true, check: "length(trim(name)) > 0" },
    industry: { type: "text", notNull: true, check: "length(trim(industry)) > 0" },
    size: { type: "text", notNull: true, check: "length(trim(size)) > 0" },
    created_at: timestamp(pgm),
  });

  pgm.createTable("departments", {
    id: { type: "text", primaryKey: true },
    name: { type: "text", notNull: true, check: "length(trim(name)) > 0" },
    slug: { type: "text", notNull: true, unique: true },
    head_employee_id: { type: "text" },
    created_at: timestamp(pgm),
  });

  pgm.createTable("positions", {
    id: { type: "text", primaryKey: true },
    department_id: { type: "text", notNull: true, references: "departments", onDelete: "RESTRICT" },
    title: { type: "text", notNull: true, check: "length(trim(title)) > 0" },
    level: { type: "text", notNull: true, check: "length(trim(level)) > 0" },
    created_at: timestamp(pgm),
  });
  pgm.createIndex("positions", "department_id");

  pgm.createTable("human_employees", {
    id: { type: "text", primaryKey: true },
    department_id: { type: "text", notNull: true, references: "departments", onDelete: "RESTRICT" },
    position_id: { type: "text", notNull: true, references: "positions", onDelete: "RESTRICT" },
    display_name: { type: "text", notNull: true, check: "length(trim(display_name)) > 0" },
    work_email: { type: "text", notNull: true, unique: true },
    reports_to_employee_id: { type: "text", references: "human_employees", onDelete: "RESTRICT" },
    status: { type: "text", notNull: true, check: "status IN ('active', 'invited', 'archived')" },
    created_at: timestamp(pgm),
  });
  pgm.createIndex("human_employees", "department_id");
  pgm.createIndex("human_employees", "position_id");
  pgm.createIndex("human_employees", "reports_to_employee_id");
  pgm.addConstraint("departments", "departments_head_employee_fk", {
    foreignKeys: {
      columns: "head_employee_id",
      references: "human_employees(id)",
      onDelete: "RESTRICT",
    },
  });
  pgm.createIndex("departments", "head_employee_id");

  pgm.createTable("goals", {
    id: { type: "text", primaryKey: true },
    owner_type: { type: "text", notNull: true, check: "owner_type IN ('company', 'department')" },
    owner_department_id: { type: "text", references: "departments", onDelete: "RESTRICT" },
    title: { type: "text", notNull: true, check: "length(trim(title)) > 0" },
    status: { type: "text", notNull: true, check: "status IN ('active', 'at_risk', 'complete', 'paused')" },
    created_at: timestamp(pgm),
  });
  pgm.addConstraint("goals", "goals_owner_reference_check", {
    check: "(owner_type = 'company' AND owner_department_id IS NULL) OR (owner_type = 'department' AND owner_department_id IS NOT NULL)",
  });
  pgm.createIndex("goals", "owner_department_id");

  pgm.createTable("kpis", {
    id: { type: "text", primaryKey: true },
    goal_id: { type: "text", notNull: true, references: "goals", onDelete: "CASCADE" },
    name: { type: "text", notNull: true, check: "length(trim(name)) > 0" },
    unit: { type: "text", notNull: true },
    target: { type: "double precision", notNull: true },
    current: { type: "double precision", notNull: true },
    direction: { type: "text", notNull: true, check: "direction IN ('increase', 'decrease', 'maintain')" },
    updated_at: timestamp(pgm),
  });
  pgm.createIndex("kpis", "goal_id");

  pgm.createTable("business_events", {
    id: { type: "text", primaryKey: true },
    type: { type: "text", notNull: true },
    source: { type: "text", notNull: true },
    actor_type: { type: "text", notNull: true, check: "actor_type IN ('user', 'agent', 'workflow', 'service_account', 'connector')" },
    actor_id: { type: "text", notNull: true },
    occurred_at: timestamp(pgm),
    correlation_id: { type: "text", notNull: true },
    causation_id: { type: "text", references: "business_events", onDelete: "RESTRICT" },
    sensitivity: { type: "text", notNull: true, check: "sensitivity IN ('public', 'internal', 'confidential', 'restricted')" },
  });
  pgm.createIndex("business_events", "correlation_id");
  pgm.createIndex("business_events", "causation_id");

  pgm.createTable("operating_tasks", {
    id: { type: "text", primaryKey: true },
    title: { type: "text", notNull: true, check: "length(trim(title)) > 0" },
    status: { type: "text", notNull: true, check: "status IN ('todo', 'in_progress', 'waiting_approval', 'done', 'canceled')" },
    priority: { type: "text", notNull: true, check: "priority IN ('low', 'medium', 'high', 'urgent')" },
    assignee_type: { type: "text", notNull: true, check: "assignee_type IN ('human_employee', 'department', 'digital_employee')" },
    assignee_id: { type: "text", notNull: true },
    related_event_id: { type: "text", references: "business_events", onDelete: "RESTRICT" },
    created_at: timestamp(pgm),
    due_at: { type: "timestamptz" },
  });
  pgm.createIndex("operating_tasks", "related_event_id");

  pgm.createTable("decisions", {
    id: { type: "text", primaryKey: true },
    title: { type: "text", notNull: true },
    decided_by_type: { type: "text", notNull: true, check: "decided_by_type IN ('user', 'agent', 'workflow', 'service_account', 'connector')" },
    decided_by_id: { type: "text", notNull: true },
    outcome: { type: "text", notNull: true },
    related_task_id: { type: "text", references: "operating_tasks", onDelete: "RESTRICT" },
    correlation_id: { type: "text", notNull: true },
    decided_at: timestamp(pgm),
  });
  pgm.createIndex("decisions", "related_task_id");
  pgm.createIndex("decisions", "correlation_id");

  pgm.createTable("approval_requests", {
    id: { type: "text", primaryKey: true },
    requested_action: { type: "text", notNull: true },
    requested_by_type: { type: "text", notNull: true, check: "requested_by_type IN ('user', 'agent', 'workflow', 'service_account', 'connector')" },
    requested_by_id: { type: "text", notNull: true },
    approver_role: { type: "text", notNull: true },
    status: { type: "text", notNull: true, check: "status IN ('pending', 'approved', 'rejected', 'changes_requested', 'canceled')" },
    risk_level: { type: "text", notNull: true, check: "risk_level IN ('low', 'medium', 'high', 'critical')" },
    decision: { type: "text", notNull: true, check: "decision IN ('allow', 'require_approval', 'deny')" },
    correlation_id: { type: "text", notNull: true },
    created_at: timestamp(pgm),
    resolved_at: { type: "timestamptz" },
  });
  pgm.createIndex("approval_requests", "correlation_id");

  pgm.addConstraint("audit_events", "audit_events_actor_type_check", {
    check: "actor_type IN ('user', 'agent', 'workflow', 'service_account', 'connector')",
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropConstraint("audit_events", "audit_events_actor_type_check");
  pgm.dropTable("approval_requests");
  pgm.dropTable("decisions");
  pgm.dropTable("operating_tasks");
  pgm.dropTable("business_events");
  pgm.dropTable("kpis");
  pgm.dropTable("goals");
  pgm.dropConstraint("departments", "departments_head_employee_fk");
  pgm.dropTable("human_employees");
  pgm.dropTable("positions");
  pgm.dropTable("departments");
  pgm.dropTable("company_profile");
}
