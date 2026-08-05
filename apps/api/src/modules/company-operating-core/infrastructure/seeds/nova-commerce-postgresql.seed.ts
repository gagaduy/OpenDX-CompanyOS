// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type { DatabaseSession, TransactionRunner } from "../../../../shared/database/transaction";
import type { CompanyOperatingCoreSnapshot } from "../../domain/entities/company-operating-core";
import { createNovaCommerceSnapshot } from "./nova-commerce.seed";

export async function seedNovaCommercePostgresql(
  transactions: TransactionRunner,
  snapshot: CompanyOperatingCoreSnapshot = createNovaCommerceSnapshot(),
): Promise<void> {
  await transactions.run(async (session) => {
    await session.query(
      `INSERT INTO company_profile (singleton_key, name, industry, size, created_at)
       VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (singleton_key) DO UPDATE SET
         name = EXCLUDED.name, industry = EXCLUDED.industry,
         size = EXCLUDED.size, created_at = EXCLUDED.created_at`,
      [snapshot.company.name, snapshot.company.industry, snapshot.company.size, snapshot.company.createdAt],
    );

    for (const department of snapshot.departments) {
      await session.query(
        `INSERT INTO departments (id, name, slug, head_employee_id, created_at)
         VALUES ($1, $2, $3, NULL, $4)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, slug = EXCLUDED.slug, created_at = EXCLUDED.created_at`,
        [department.id, department.name, department.slug, department.createdAt],
      );
    }

    for (const position of snapshot.positions) {
      await session.query(
        `INSERT INTO positions (id, department_id, title, level, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           department_id = EXCLUDED.department_id, title = EXCLUDED.title,
           level = EXCLUDED.level, created_at = EXCLUDED.created_at`,
        [position.id, position.departmentId, position.title, position.level, position.createdAt],
      );
    }

    for (const employee of snapshot.humanEmployees) {
      await session.query(
        `INSERT INTO human_employees
          (id, department_id, position_id, display_name, work_email,
           reports_to_employee_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           department_id = EXCLUDED.department_id, position_id = EXCLUDED.position_id,
           display_name = EXCLUDED.display_name, work_email = EXCLUDED.work_email,
           reports_to_employee_id = EXCLUDED.reports_to_employee_id,
           status = EXCLUDED.status, created_at = EXCLUDED.created_at`,
        [
          employee.id,
          employee.departmentId,
          employee.positionId,
          employee.displayName,
          employee.workEmail,
          employee.reportsToEmployeeId ?? null,
          employee.status,
          employee.createdAt,
        ],
      );
    }

    await updateDepartmentHeads(session, snapshot);

    for (const goal of snapshot.goals) {
      await session.query(
        `INSERT INTO goals (id, owner_type, owner_department_id, title, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           owner_type = EXCLUDED.owner_type,
           owner_department_id = EXCLUDED.owner_department_id,
           title = EXCLUDED.title, status = EXCLUDED.status,
           created_at = EXCLUDED.created_at`,
        [goal.id, goal.ownerType, goal.ownerId ?? null, goal.title, goal.status, goal.createdAt],
      );
    }

    for (const kpi of snapshot.kpis) {
      await session.query(
        `INSERT INTO kpis (id, goal_id, name, unit, target, current, direction, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           goal_id = EXCLUDED.goal_id, name = EXCLUDED.name, unit = EXCLUDED.unit,
           target = EXCLUDED.target, current = EXCLUDED.current,
           direction = EXCLUDED.direction, updated_at = EXCLUDED.updated_at`,
        [kpi.id, kpi.goalId, kpi.name, kpi.unit, kpi.target, kpi.current, kpi.direction, kpi.updatedAt],
      );
    }

    for (const event of snapshot.events) {
      await session.query(
        `INSERT INTO business_events
          (id, type, source, actor_type, actor_id, occurred_at,
           correlation_id, causation_id, sensitivity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type, source = EXCLUDED.source,
           actor_type = EXCLUDED.actor_type, actor_id = EXCLUDED.actor_id,
           occurred_at = EXCLUDED.occurred_at,
           correlation_id = EXCLUDED.correlation_id,
           causation_id = EXCLUDED.causation_id,
           sensitivity = EXCLUDED.sensitivity`,
        [event.id, event.type, event.source, event.actor.type, event.actor.id, event.occurredAt, event.correlationId, event.causationId ?? null, event.sensitivity],
      );
    }

    for (const task of snapshot.tasks) {
      await session.query(
        `INSERT INTO operating_tasks
          (id, title, status, priority, assignee_type, assignee_id,
           related_event_id, created_at, due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, status = EXCLUDED.status,
           priority = EXCLUDED.priority, assignee_type = EXCLUDED.assignee_type,
           assignee_id = EXCLUDED.assignee_id,
           related_event_id = EXCLUDED.related_event_id,
           created_at = EXCLUDED.created_at, due_at = EXCLUDED.due_at`,
        [task.id, task.title, task.status, task.priority, task.assigneeType, task.assigneeId, task.relatedEventId ?? null, task.createdAt, task.dueAt ?? null],
      );
    }

    for (const decision of snapshot.decisions) {
      await session.query(
        `INSERT INTO decisions
          (id, title, decided_by_type, decided_by_id, outcome,
           related_task_id, correlation_id, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, decided_by_type = EXCLUDED.decided_by_type,
           decided_by_id = EXCLUDED.decided_by_id, outcome = EXCLUDED.outcome,
           related_task_id = EXCLUDED.related_task_id,
           correlation_id = EXCLUDED.correlation_id,
           decided_at = EXCLUDED.decided_at`,
        [decision.id, decision.title, decision.decidedBy.type, decision.decidedBy.id, decision.outcome, decision.relatedTaskId ?? null, decision.correlationId, decision.decidedAt],
      );
    }

    for (const approval of snapshot.approvals) {
      await session.query(
        `INSERT INTO approval_requests
          (id, requested_action, requested_by_type, requested_by_id,
           approver_role, status, risk_level, decision, correlation_id,
           created_at, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           requested_action = EXCLUDED.requested_action,
           requested_by_type = EXCLUDED.requested_by_type,
           requested_by_id = EXCLUDED.requested_by_id,
           approver_role = EXCLUDED.approver_role, status = EXCLUDED.status,
           risk_level = EXCLUDED.risk_level, decision = EXCLUDED.decision,
           correlation_id = EXCLUDED.correlation_id,
           created_at = EXCLUDED.created_at, resolved_at = EXCLUDED.resolved_at`,
        [approval.id, approval.requestedAction, approval.requestedBy.type, approval.requestedBy.id, approval.approverRole, approval.status, approval.riskLevel, approval.decision, approval.correlationId, approval.createdAt, approval.resolvedAt ?? null],
      );
    }

    for (const audit of snapshot.auditEvents) {
      await session.query(
        `INSERT INTO audit_events
          (id, actor_type, actor_id, action, resource_type, resource_id,
           outcome, correlation_id, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           actor_type = EXCLUDED.actor_type, actor_id = EXCLUDED.actor_id,
           action = EXCLUDED.action, resource_type = EXCLUDED.resource_type,
           resource_id = EXCLUDED.resource_id, outcome = EXCLUDED.outcome,
           correlation_id = EXCLUDED.correlation_id,
           occurred_at = EXCLUDED.occurred_at`,
        [audit.id, audit.actor.type, audit.actor.id, audit.action, audit.resourceType, audit.resourceId, audit.outcome, audit.correlationId, audit.occurredAt],
      );
    }
  });
}

async function updateDepartmentHeads(
  session: DatabaseSession,
  snapshot: CompanyOperatingCoreSnapshot,
): Promise<void> {
  for (const department of snapshot.departments) {
    await session.query(
      "UPDATE departments SET head_employee_id = $2 WHERE id = $1",
      [department.id, department.headEmployeeId ?? null],
    );
  }
}
