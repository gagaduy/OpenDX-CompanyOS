// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ApprovalStatus,
  CompanyOperatingCoreSnapshot,
  TaskStatus,
} from "../entities/company-operating-core";

export interface ValidationIssue {
  path: string;
  message: string;
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

export function validateCompanyOperatingCoreSnapshot(
  snapshot: CompanyOperatingCoreSnapshot,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

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
