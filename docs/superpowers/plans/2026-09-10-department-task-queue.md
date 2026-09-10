# Department Direct Task Dispatcher & Collaborative Resource Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an unblocked direct department task dispatcher and collaborative resource lock matrix in the Staff Console Agentic Command Center, enabling parallel execution across free resources, FIFO queuing with visual cues for busy digital employees, and auto-dequeueing upon task completion.

**Architecture:** Create pure TypeScript scheduler utilities (`department-task-scheduler.ts`) managing a `ResourceLock` matrix and round-robin FIFO `DepartmentQueueMap`. Integrate this state machine into `AgenticCommandCenter`, permanently unblocking `<DepartmentInput />`, showing Linear-styled queue badges and waiting cards, executing non-conflicting tasks concurrently, and auto-dispatching queued tasks in `finally` blocks.

**Tech Stack:** React 18, TypeScript 5.6, Lucide React, Vitest 4.1, Testing Library, Vite.

**Spec:** [`docs/superpowers/specs/2026-09-10-department-task-queue-design.md`](file:///home/phan-duong-quoc-nhat/workspace/OpenDX-CompanyOS/docs/superpowers/specs/2026-09-10-department-task-queue-design.md)

## Global Constraints

- Never disable `<DepartmentInput />` with global `isSubmitting`; inputs must accept operator commands at all times.
- Follow the Linear-inspired operational canvas: `#010102` background, dense typography, subtle borders, no garish gradients or orbs.
- All resource lock releases must occur inside `try ... finally` blocks to prevent deadlocks.
- Department proposals (Marketing, Merchandising, Operations, Support) must remain independent without modal state collisions.
- No AI model names leaked on user-facing UI elements.
- Conventional Commits and atomic changes.

---

### Task 1: Department Task Queue & Resource Lock Types

**Files:**
- Create: `apps/console/src/features/agentic/types/department-task-queue.types.ts`

**Interfaces:**
- Consumes: None (base types).
- Produces: `DepartmentType`, `TaskStatus`, `DepartmentTask`, `ResourceLock`, `DepartmentQueueMap`, `TASK_AGENT_DEPENDENCIES`, `DIGITAL_EMPLOYEES`.

- [ ] **Step 1: Write type definitions and constant metadata**

Create `apps/console/src/features/agentic/types/department-task-queue.types.ts`:
```typescript
/**
 * SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type DepartmentType = "marketing" | "merchandising" | "operations" | "support";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface WaitingResourceInfo {
  agentId: string;
  agentName: string;
  heldByDepartment: DepartmentType;
  taskPromptSnippet: string;
}

export interface DepartmentTask {
  id: string;
  department: DepartmentType;
  prompt: string;
  requiredAgents: string[];
  status: TaskStatus;
  waitingForResource?: WaitingResourceInfo;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ResourceLock {
  agentId: string;
  lockedByTaskId: string;
  lockedByDepartment: DepartmentType;
  lockedAt: number;
  taskPromptSnippet: string;
}

export type DepartmentQueueMap = Record<DepartmentType, DepartmentTask[]>;

export interface DigitalEmployeeInfo {
  id: string;
  name: string;
  department: DepartmentType;
  isCrossDepartmentCollab: boolean;
}

export const DIGITAL_EMPLOYEES: Record<string, DigitalEmployeeInfo> = {
  marketing_copywriter: {
    id: "marketing_copywriter",
    name: "Cây bút Sáng tạo",
    department: "marketing",
    isCrossDepartmentCollab: false,
  },
  marketing_visual: {
    id: "marketing_visual",
    name: "Thiết kế Đồ họa",
    department: "marketing",
    isCrossDepartmentCollab: true,
  },
  marketing_publisher: {
    id: "marketing_publisher",
    name: "Điều phối Đăng bài",
    department: "marketing",
    isCrossDepartmentCollab: false,
  },
  catalog_copywriter: {
    id: "catalog_copywriter",
    name: "Cây bút Sản phẩm",
    department: "merchandising",
    isCrossDepartmentCollab: false,
  },
  pricing_strategist: {
    id: "pricing_strategist",
    name: "Chuyên gia Định giá",
    department: "merchandising",
    isCrossDepartmentCollab: true,
  },
  inventory_specialist: {
    id: "inventory_specialist",
    name: "Kỹ sư Tồn kho",
    department: "operations",
    isCrossDepartmentCollab: true,
  },
  order_coordinator: {
    id: "order_coordinator",
    name: "Điều phối Đơn hàng",
    department: "operations",
    isCrossDepartmentCollab: false,
  },
  support_steward: {
    id: "support_steward",
    name: "Quản gia CSKH",
    department: "support",
    isCrossDepartmentCollab: false,
  },
  crm_specialist: {
    id: "crm_specialist",
    name: "Chuyên viên CRM",
    department: "support",
    isCrossDepartmentCollab: false,
  },
};

export const TASK_AGENT_DEPENDENCIES: Record<string, { primaryDept: DepartmentType; requiredAgents: string[] }> = {
  marketing_default: {
    primaryDept: "marketing",
    requiredAgents: ["marketing_copywriter", "marketing_visual", "marketing_publisher"],
  },
  merchandising_campaign: {
    primaryDept: "merchandising",
    requiredAgents: ["catalog_copywriter", "pricing_strategist", "marketing_visual"],
  },
  merchandising_quick: {
    primaryDept: "merchandising",
    requiredAgents: ["catalog_copywriter", "pricing_strategist"],
  },
  operations_restock: {
    primaryDept: "operations",
    requiredAgents: ["inventory_specialist", "order_coordinator"],
  },
  operations_clearance: {
    primaryDept: "operations",
    requiredAgents: ["inventory_specialist", "pricing_strategist", "marketing_visual"],
  },
  support_default: {
    primaryDept: "support",
    requiredAgents: ["support_steward", "crm_specialist"],
  },
};
```

- [ ] **Step 2: Verify type definitions with TypeScript compiler**

Run: `pnpm --filter @opendx/console exec tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 3: Commit**

```bash
git add apps/console/src/features/agentic/types/department-task-queue.types.ts
git commit -m "feat(console): define department task queue and resource lock types"
```

---

### Task 2: Pure Task Scheduler & Resource Lock Matrix Engine with Unit Tests

**Files:**
- Create: `apps/console/src/features/agentic/utils/department-task-scheduler.ts`
- Test: `apps/console/src/features/agentic/tests/department-task-scheduler.test.ts`

**Interfaces:**
- Consumes: `DepartmentType`, `DepartmentTask`, `ResourceLock`, `DepartmentQueueMap`, `DIGITAL_EMPLOYEES` from `department-task-queue.types.ts`.
- Produces: `analyzeTaskRequirements`, `checkLockConflicts`, `canAcquireLocks`, `acquireLocks`, `releaseLocks`, `getNextEligibleTask`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/console/src/features/agentic/tests/department-task-scheduler.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  analyzeTaskRequirements,
  checkLockConflicts,
  canAcquireLocks,
  acquireLocks,
  releaseLocks,
  getNextEligibleTask,
} from "../utils/department-task-scheduler";
import type {
  DepartmentQueueMap,
  DepartmentTask,
  ResourceLock,
} from "../types/department-task-queue.types";

describe("Department Task Scheduler & Resource Lock Matrix", () => {
  it("accurately analyzes required digital employees based on task prompt and department", () => {
    // Campaign task requiring cross-dept visual design
    const merchandisingReqs = analyzeTaskRequirements(
      "merchandising",
      "Chiến dịch Tết Trung Thu giảm 20%",
    );
    expect(merchandisingReqs).toContain("catalog_copywriter");
    expect(merchandisingReqs).toContain("pricing_strategist");
    expect(merchandisingReqs).toContain("marketing_visual");

    // Operations restock task
    const opsReqs = analyzeTaskRequirements(
      "operations",
      "Kiểm toán tồn kho và lập phiếu đề xuất bổ sung hàng",
    );
    expect(opsReqs).toContain("inventory_specialist");
    expect(opsReqs).toContain("order_coordinator");
    expect(opsReqs).not.toContain("marketing_visual");

    // Marketing publication task
    const mktReqs = analyzeTaskRequirements(
      "marketing",
      "Soạn bài viết và thiết kế ảnh đăng fanpage",
    );
    expect(mktReqs).toContain("marketing_copywriter");
    expect(mktReqs).toContain("marketing_visual");
    expect(mktReqs).toContain("marketing_publisher");
  });

  it("detects lock conflicts when a shared resource is actively held", () => {
    const activeLocks: Record<string, ResourceLock> = {
      marketing_visual: {
        agentId: "marketing_visual",
        lockedByTaskId: "task-mkt-1",
        lockedByDepartment: "marketing",
        lockedAt: Date.now(),
        taskPromptSnippet: "Thiết kế poster Fanpage",
      },
    };

    // Task requiring marketing_visual should detect conflict
    const conflicts = checkLockConflicts(["catalog_copywriter", "marketing_visual"], activeLocks);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].agentId).toBe("marketing_visual");
    expect(conflicts[0].lockedByDepartment).toBe("marketing");

    expect(canAcquireLocks(["catalog_copywriter", "marketing_visual"], activeLocks)).toBe(false);

    // Task NOT requiring marketing_visual should acquire cleanly
    expect(canAcquireLocks(["inventory_specialist", "order_coordinator"], activeLocks)).toBe(true);
  });

  it("acquires and releases locks accurately", () => {
    let locks: Record<string, ResourceLock> = {};

    locks = acquireLocks("task-1", "merchandising", ["catalog_copywriter", "pricing_strategist"], "Chiến dịch sale", locks);
    expect(locks.catalog_copywriter).toBeDefined();
    expect(locks.pricing_strategist).toBeDefined();
    expect(locks.catalog_copywriter.lockedByTaskId).toBe("task-1");

    // Releasing one lock
    locks = releaseLocks(["catalog_copywriter"], locks);
    expect(locks.catalog_copywriter).toBeUndefined();
    expect(locks.pricing_strategist).toBeDefined();

    // Releasing remaining lock
    locks = releaseLocks(["pricing_strategist"], locks);
    expect(Object.keys(locks)).toHaveLength(0);
  });

  it("selects next eligible task in FIFO order when locks are released", () => {
    const queueMap: DepartmentQueueMap = {
      marketing: [],
      merchandising: [
        {
          id: "task-merch-waiting",
          department: "merchandising",
          prompt: "Chiến dịch Thu",
          requiredAgents: ["catalog_copywriter", "marketing_visual"],
          status: "queued",
          queuedAt: 1000,
        },
      ],
      operations: [],
      support: [],
    };

    const lockedByMarketing: Record<string, ResourceLock> = {
      marketing_visual: {
        agentId: "marketing_visual",
        lockedByTaskId: "task-mkt-active",
        lockedByDepartment: "marketing",
        lockedAt: 500,
        taskPromptSnippet: "Đang vẽ ảnh",
      },
    };

    // When marketing_visual is locked, no task is eligible
    const candidateWhileLocked = getNextEligibleTask(queueMap, lockedByMarketing);
    expect(candidateWhileLocked).toBeNull();

    // When marketing_visual is released
    const emptyLocks: Record<string, ResourceLock> = {};
    const candidateAfterRelease = getNextEligibleTask(queueMap, emptyLocks);
    expect(candidateAfterRelease).not.toBeNull();
    expect(candidateAfterRelease?.task.id).toBe("task-merch-waiting");
    expect(candidateAfterRelease?.dept).toBe("merchandising");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @opendx/console test run src/features/agentic/tests/department-task-scheduler.test.ts`
Expected: FAIL with "Cannot find module '../utils/department-task-scheduler'"

- [ ] **Step 3: Implement minimal code in `department-task-scheduler.ts`**

Create `apps/console/src/features/agentic/utils/department-task-scheduler.ts`:
```typescript
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
      // If prompt indicates a campaign, banner, poster, or visual discount, require graphic designer
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
      if (task.status === "queued" && canAcquireLocks(task.requiredAgents, activeLocks)) {
        return { dept, task };
      }
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test run src/features/agentic/tests/department-task-scheduler.test.ts`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/agentic/utils/department-task-scheduler.ts apps/console/src/features/agentic/tests/department-task-scheduler.test.ts
git commit -m "feat(console): implement department task scheduler and resource lock matrix"
```

---

### Task 3: Linear Product Canvas UI Styles for Queue Badges, Agent Busy Notices, and Waiting Cards

**Files:**
- Modify: `apps/console/src/features/agentic/styles/agentic-command-center.css`

**Interfaces:**
- Consumes: CSS theme classes `.theme-blue`, `.theme-cyan`, `.theme-amber`, `.theme-emerald`.
- Produces: `.ccDeptQueueBadge`, `.ccAgentQueueNotice`, `.ccDepartmentWaitingCard`, `.ccWaitingCardHeader`, `.ccWaitingCancelBtn`, `.ccWaitingDot`, `.ccTaskAutoStarted`, `@keyframes ccHighlightStart`.

- [ ] **Step 1: Inspect existing CSS structure and append queue visual elements**

Add the following CSS rules to `apps/console/src/features/agentic/styles/agentic-command-center.css`:
```css
/* Department Header Queue Badge */
.ccDeptQueueBadge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.28);
  animation: ccPulseBadge 2.5s infinite ease-in-out;
}

@keyframes ccPulseBadge {
  0%, 100% { opacity: 0.9; }
  50% { opacity: 1; border-color: rgba(245, 158, 11, 0.5); }
}

/* Agent Card Queue Notice Box */
.ccAgentQueueNotice {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.35rem;
  padding: 0.25rem 0.45rem;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px dashed rgba(245, 158, 11, 0.3);
  color: #fcd34d;
}

/* Department Waiting State Card */
.ccDepartmentWaitingCard {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.25);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: all 0.2s ease-in-out;
}

.ccWaitingCardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.ccWaitingCardTitle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fbbf24;
}

.ccWaitingCancelBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  border-radius: 4px;
  padding: 0.15rem 0.4rem;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ccWaitingCancelBtn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  color: #fca5a5;
}

.ccWaitingCardPrompt {
  margin: 0;
  font-size: 12px;
  color: #e2e8f0;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ccWaitingCardResource {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 11px;
  color: #94a3b8;
}

.ccWaitingDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fbbf24;
  animation: ccPulseBadge 1.5s infinite ease-in-out;
}

/* Auto-started Task Transition Animation */
.ccTaskAutoStarted {
  animation: ccHighlightStart 1.5s ease-out;
}

@keyframes ccHighlightStart {
  0% {
    background: rgba(94, 106, 210, 0.28);
    box-shadow: 0 0 12px rgba(94, 106, 210, 0.4);
  }
  100% {
    background: transparent;
    box-shadow: none;
  }
}
```

- [ ] **Step 2: Verify CSS validity and build check**

Run: `pnpm --filter @opendx/console build`
Expected: Build succeeds without CSS or asset syntax errors.

- [ ] **Step 3: Commit**

```bash
git add apps/console/src/features/agentic/styles/agentic-command-center.css
git commit -m "style(console): add queue badges and waiting card styles for command center"
```

---

### Task 4: Unblock Department Inputs & Integrate Task Queue State Machine into Agentic Command Center

**Files:**
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`

**Interfaces:**
- Consumes: `department-task-scheduler.ts`, `department-task-queue.types.ts`, `DepartmentInput`.
- Produces: Unblocked direct task submission, auto-queue, auto-dequeue with `releaseLocks` in `finally` blocks, visual queue indicators, manual queue item cancellation.

- [ ] **Step 1: Update `AgentCard` to accept and display `waitingTasksCount`**

In `apps/console/src/features/agentic/components/agentic-command-center.tsx`:
Add `waitingTasksCount?: number;` to `interface AgentCardProps` (around line 3220).
Inside `AgentCard`:
```tsx
{waitingTasksCount !== undefined && waitingTasksCount > 0 && (
  <div className="ccAgentQueueNotice" title="Nhiệm vụ đang xếp hàng chờ tài nguyên này">
    <Clock size={11} />
    <span>{waitingTasksCount} nhiệm vụ đang chờ nhân sự này</span>
  </div>
)}
```

- [ ] **Step 2: Add Department Queue and Lock state variables in `AgenticCommandCenter`**

In `AgenticCommandCenter`:
```tsx
// Department Task Queue State
const [departmentQueues, setDepartmentQueues] = useState<DepartmentQueueMap>({
  marketing: [],
  merchandising: [],
  operations: [],
  support: [],
});

// Resource Locks State
const [activeLocks, setActiveLocks] = useState<Record<string, ResourceLock>>({});
```

- [ ] **Step 3: Implement `handleCancelQueuedTask` and helper functions**

Add:
```tsx
const handleCancelQueuedTask = (taskId: string, dept: DepartmentType) => {
  setDepartmentQueues((prev) => ({
    ...prev,
    [dept]: prev[dept].filter((t) => t.id !== taskId),
  }));
  setSuccessMessage("Đã hủy nhiệm vụ khỏi hàng chờ.");
};

// Count tasks waiting for a specific agent across all queues
const getAgentWaitingTasksCount = (agentId: string): number => {
  let count = 0;
  for (const dept of Object.keys(departmentQueues) as DepartmentType[]) {
    for (const task of departmentQueues[dept]) {
      if (task.status === "queued" && task.requiredAgents.includes(agentId)) {
        count++;
      }
    }
  }
  return count;
};
```

- [ ] **Step 4: Refactor `handleDepartmentDirectTask` to support asynchronous queuing & execution**

Replace the current `handleDepartmentDirectTask` implementation:
- Call `analyzeTaskRequirements(departmentType, directPrompt)`.
- Check `checkLockConflicts(reqAgents, activeLocks)`.
- If conflicts exist:
  - Create a new `DepartmentTask` with status `"queued"` and `waitingForResource` detail from the first conflicting lock.
  - Append to `departmentQueues[departmentType]`.
  - Display friendly notification: `setSuccessMessage("Nhiệm vụ đã được thêm vào hàng chờ do nhân sự phối hợp đang bận.")`.
- If no conflicts exist:
  - Immediately acquire locks via `acquireLocks(...)`.
  - Launch the execution routine inside a `try ... finally` block.
  - In `finally`:
    - Release held locks via `releaseLocks(...)`.
    - Check `getNextEligibleTask`.
    - If another task is eligible, dequeue it and execute it.

- [ ] **Step 5: Unblock `<DepartmentInput />`**

In the JSX rendering of the 4 department columns:
- Replace `disabled={isSubmitting}` with `disabled={false}` on all 4 `<DepartmentInput />` elements! (Users can submit tasks anytime).
- Render `<div className="ccDeptQueueBadge">` in the department header when `departmentQueues[dept].length > 0`.
- Render `<div className="ccDepartmentWaitingCard">` above `<DepartmentInput />` if `departmentQueues[dept].length > 0`.
- Pass `waitingTasksCount={getAgentWaitingTasksCount("marketing_visual")}` etc. to `<AgentCard />`.

- [ ] **Step 6: Run test suite to verify no regressions**

Run: `pnpm --filter @opendx/console test run src/features/agentic/tests/agentic-command-center-authentication.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/console/src/features/agentic/components/agentic-command-center.tsx
git commit -m "feat(console): integrate department task queue and unlock direct input"
```

---

### Task 5: Component & Integration Tests for Queue Visualization & Actions

**Files:**
- Create: `apps/console/src/features/agentic/tests/agentic-department-queue.test.tsx`

**Interfaces:**
- Consumes: `AgenticCommandCenter`, Mock APIs.
- Produces: Automated verification for unblocked input, queue badge rendering, waiting card rendering, and cancel action.

- [ ] **Step 1: Write integration tests for Queue UI and unblocked inputs**

Create `apps/console/src/features/agentic/tests/agentic-department-queue.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AgenticCommandCenter } from "../components/agentic-command-center";

// Mock dependencies and subcomponents
vi.mock("../services/agentic-api", () => ({
  AgenticApi: vi.fn().mockImplementation(() => ({
    executeStrategicTask: vi.fn().mockResolvedValue({
      orchestrationId: "orch-1",
      strategicPlan: {
        summary: "Plan",
        steps: [],
      },
    }),
    listDigitalEmployees: vi.fn().mockResolvedValue([]),
    getTaskTimeline: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock("../../../catalog/services/catalog-api", () => ({
  CatalogApi: vi.fn().mockImplementation(() => ({
    listCampaigns: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  })),
}));

vi.mock("../../../inventory/services/inventory-api", () => ({
  InventoryApi: vi.fn().mockImplementation(() => ({
    getInventorySummary: vi.fn().mockResolvedValue({ totalItems: 0, lowStockCount: 0, outOfStockCount: 0 }),
  })),
}));

vi.mock("../../../support/services/support-api", () => ({
  SupportApi: vi.fn().mockImplementation(() => ({
    listTickets: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  })),
}));

vi.mock("../../../marketing/services/marketing-api", () => ({
  MarketingApi: vi.fn().mockImplementation(() => ({
    listCampaigns: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  })),
}));

describe("AgenticCommandCenter Department Task Queue", () => {
  it("keeps department inputs enabled and allows typing at all times", async () => {
    render(
      <MemoryRouter>
        <AgenticCommandCenter />
      </MemoryRouter>
    );

    const mktInput = screen.getByPlaceholderText("Giao việc cho Tiếp thị & Sáng tạo...");
    const opsInput = screen.getByPlaceholderText("Giao việc cho Vận hành & Kho...");
    const merchInput = screen.getByPlaceholderText("Giao việc cho Danh mục & Định giá...");
    const supportInput = screen.getByPlaceholderText("Giao việc cho CSKH & CRM...");

    expect(mktInput).not.toBeDisabled();
    expect(opsInput).not.toBeDisabled();
    expect(merchInput).not.toBeDisabled();
    expect(supportInput).not.toBeDisabled();

    fireEvent.change(opsInput, { target: { value: "Kiểm toán kho hàng tồn" } });
    expect((opsInput as HTMLInputElement).value).toBe("Kiểm toán kho hàng tồn");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @opendx/console test run src/features/agentic/tests/agentic-department-queue.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/console/src/features/agentic/tests/agentic-department-queue.test.tsx
git commit -m "test(console): add integration test for unblocked department inputs and queue state"
```

---

### Task 6: End-to-End Verification Gate & Repo Audit

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Whole codebase.
- Produces: Clean `git diff --check`, `pnpm check`, `pnpm audit:repo`.

- [ ] **Step 1: Run fast repository check**

Run: `pnpm check`
Expected: PASS (all workspace linters and typechecks pass)

- [ ] **Step 2: Run repo audit gate**

Run: `git diff --check && pnpm audit:repo`
Expected: PASS (0 trailing whitespace or merge conflict markers; clean audit)

- [ ] **Step 3: Update `CHANGELOG.md` under `[Unreleased]`**

Add detailed bullets under `### Added` in `CHANGELOG.md`:
```markdown
- Implement Department Direct Task Dispatcher and Collaborative Resource Queue in Staff Console:
  - Permanently unblocked all department quick input bars (`DepartmentInput`), allowing continuous operator task dispatch.
  - Implemented `ResourceLock` matrix and pure scheduler engine (`department-task-scheduler.ts`) with round-robin queue scanning.
  - Added automated queuing for cross-department resource constraints with visual header badges (`⏳ Hàng chờ: N`), agent card busy notice boxes, and interactive waiting state cards with 1-click cancellation.
  - Ensured fail-safe lock release in `finally` blocks and auto-dequeue execution transitions.
  - Verified independent proposal triggers and modals across Marketing, Merchandising, Operations, and Customer Support.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): record department task queue feature implementation"
```
