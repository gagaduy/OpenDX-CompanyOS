/**
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type DepartmentQueueMap,
  type DepartmentTask,
  type DepartmentType,
  DIGITAL_EMPLOYEES,
  type ResourceLock,
  TASK_AGENT_DEPENDENCIES,
} from "../types/department-task-queue.types";

/**
 * Determine required Digital Employees for a task based on department and prompt keywords.
 */
export function analyzeTaskRequirements(dept: DepartmentType, prompt: string): string[] {
  const normalized = prompt.toLowerCase();

  switch (dept) {
    case "marketing": {
      return [...TASK_AGENT_DEPENDENCIES.marketing_default.requiredAgents];
    }
    case "merchandising": {
      // If prompt indicates a campaign, banner, poster, visual discount or sale, require graphic designer
      const needsVisual =
        normalized.includes("chiến dịch") ||
        normalized.includes("poster") ||
        normalized.includes("banner") ||
        normalized.includes("giảm giá") ||
        normalized.includes("sale") ||
        normalized.includes("hình ảnh");

      return needsVisual
        ? [...TASK_AGENT_DEPENDENCIES.merchandising_campaign.requiredAgents]
        : [...TASK_AGENT_DEPENDENCIES.merchandising_quick.requiredAgents];
    }
    case "operations": {
      const isClearanceHandoff =
        normalized.includes("xả hàng") ||
        normalized.includes("clearance") ||
        normalized.includes("bàn giao sang danh mục");

      return isClearanceHandoff
        ? [...TASK_AGENT_DEPENDENCIES.operations_clearance.requiredAgents]
        : [...TASK_AGENT_DEPENDENCIES.operations_restock.requiredAgents];
    }
    case "support": {
      return [...TASK_AGENT_DEPENDENCIES.support_default.requiredAgents];
    }
    default: {
      return [];
    }
  }
}

/**
 * Returns the primary lead Digital Employee that initiates work for a department.
 */
export function getInitialAgentForDepartment(dept: DepartmentType): string {
  switch (dept) {
    case "marketing":
      return "marketing_copywriter";
    case "merchandising":
      return "catalog_copywriter";
    case "operations":
      return "inventory_specialist";
    case "support":
      return "support_steward";
    default:
      return "";
  }
}

/**
 * Find conflicting active locks for the required agents.
 */
export function checkLockConflicts(
  requiredAgents: string[],
  activeLocks: Record<string, ResourceLock>,
): ResourceLock[] {
  return requiredAgents
    .map((agentId) => activeLocks[agentId])
    .filter((lock): lock is ResourceLock => Boolean(lock));
}

/**
 * Returns true if all required agents are currently free.
 */
export function canAcquireLocks(
  requiredAgents: string[],
  activeLocks: Record<string, ResourceLock>,
): boolean {
  return checkLockConflicts(requiredAgents, activeLocks).length === 0;
}

/**
 * Acquires locks for the given agents and returns an updated lock map.
 */
export function acquireLocks(
  taskId: string,
  dept: DepartmentType,
  agents: string[],
  promptSnippet: string,
  existingLocks: Record<string, ResourceLock>,
): Record<string, ResourceLock> {
  const now = Date.now();
  const next = { ...existingLocks };

  for (const agentId of agents) {
    next[agentId] = {
      agentId,
      lockedByTaskId: taskId,
      lockedByDepartment: dept,
      lockedAt: now,
      taskPromptSnippet: promptSnippet.slice(0, 60),
    };
  }

  return next;
}

/**
 * Releases locks for the given agents and returns an updated lock map.
 */
export function releaseLocks(
  agents: string[],
  existingLocks: Record<string, ResourceLock>,
): Record<string, ResourceLock> {
  const next = { ...existingLocks };
  for (const agentId of agents) {
    delete next[agentId];
  }
  return next;
}

/**
 * Scans department queues in round-robin order to find the first FIFO task whose
 * required agents are completely free.
 */
export function getNextEligibleTask(
  queueMap: DepartmentQueueMap,
  activeLocks: Record<string, ResourceLock>,
): { dept: DepartmentType; task: DepartmentTask } | null {
  const departments: DepartmentType[] = ["merchandising", "operations", "marketing", "support"];

  for (const dept of departments) {
    const queue = queueMap[dept];
    if (!queue || queue.length === 0) continue;

    for (const task of queue) {
      if (task.status !== "queued") continue;

      if (task.waitingForResource) {
        if (!activeLocks[task.waitingForResource.agentId]) {
          return { dept, task };
        }
      } else if (canAcquireLocks(task.requiredAgents, activeLocks)) {
        return { dept, task };
      }
    }
  }

  return null;
}
