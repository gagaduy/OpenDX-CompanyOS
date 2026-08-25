<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Console Task Ready And Start Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized Agentic Operator move an owned Console task from `draft` to `ready`, then start its version-1 durable workflow from the task detail page.

**Architecture:** Reuse the existing backend `ready` and `start` staff commands. Extend the validated Console transport and the existing operations hook, then render state- and role-aware controls beside Refresh. Every mutation uses the authoritative task version and reloads the operations projection after success or uncertain failure.

**Tech Stack:** React 19, TypeScript, Zod, Vitest, Testing Library, existing Express Agentic staff API.

---

### Task 1: Specify the task transition controls

**Files:**
- Modify: `apps/console/src/features/agentic/tests/agentic-task-detail-page.test.tsx`

- [ ] **Step 1: Write a failing component test**

Add a test that renders `draft` operations as an `agentic_operator`, expects `Mark ready`, clicks it, and verifies `api.readyTask(taskId, 1)` followed by an authoritative reload returning `ready`. Then click `Start task` and verify `api.startTask(taskId, 2, 1)` followed by a reload returning `received`.

- [ ] **Step 2: Cover role and in-flight behavior**

Assert that an approver sees neither action, that only the action valid for the current state is rendered, and that controls are disabled while the matching mutation is pending.

- [ ] **Step 3: Run the focused test and confirm RED**

```bash
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-task-detail-page.test.tsx
```

Expected: FAIL because `AgenticApi` and `AgenticTaskDetailPage` do not expose ready/start behavior.

### Task 2: Add validated transport commands

**Files:**
- Modify: `apps/console/src/features/agentic/api/agentic-api.ts`
- Modify: `apps/console/src/features/agentic/schemas/agentic-task-api.schema.ts`

- [ ] **Step 1: Extend the API contract**

Add:

```ts
readyTask(taskId: string, expectedVersion: number): Promise<AgenticTaskDetail>;
startTask(taskId: string, expectedVersion: number, workflowVersion: 1): Promise<AgenticWorkflowRun>;
```

- [ ] **Step 2: Validate both success envelopes**

`readyTask` posts `{ expectedVersion }` to `/v1/admin/agentic/tasks/:taskId/ready` and parses `agenticTaskDetailEnvelopeSchema`. `startTask` posts `{ expectedVersion, workflowVersion }` to `/v1/admin/agentic/tasks/:taskId/start` and parses a strict workflow-run envelope containing stable id, task binding, workflow identity/version, state, projection sequence, optimistic version, and timestamps.

### Task 3: Implement authoritative transition state

**Files:**
- Modify: `apps/console/src/features/agentic/types/agentic.types.ts`
- Modify: `apps/console/src/features/agentic/hooks/use-agentic-operations.ts`
- Modify: `apps/console/src/features/agentic/pages/agentic-task-detail-page.tsx`

- [ ] **Step 1: Add the workflow result type**

Define the bounded `AgenticWorkflowRun` fields returned by the staff start route.

- [ ] **Step 2: Add hook mutations**

Expose separate `readying` and `starting` flags plus `markReady` and `start` callbacks. Bind commands to `operations.task.version`; use workflow version `1`; ignore duplicate clicks; refresh in `finally`; and surface a safe message explaining that authoritative state was refreshed when an outcome is uncertain.

- [ ] **Step 3: Render the action bar**

For `administrator` or `agentic_operator`, show primary `Mark ready` only in `draft`, primary `Start task` only in `ready`, existing `Cancel workflow` only for a nonterminal active workflow, and always show `Refresh`. Disable transition controls while either transition is pending.

- [ ] **Step 4: Run the focused test and confirm GREEN**

```bash
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-task-detail-page.test.tsx
```

Expected: PASS.

### Task 4: Document and verify the fix

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update Unreleased**

Document the role/state-aware Ready and Start controls, optimistic version binding, duplicate suppression, and authoritative refresh.

- [ ] **Step 2: Run Console validation**

```bash
pnpm --filter @opendx/console test
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console build
```

Expected: all pass.

- [ ] **Step 3: Run repository handoff gates**

```bash
git diff --check
pnpm audit:repo
```

Expected: both pass.

- [ ] **Step 4: Rebuild the running Console and verify manually**

Rebuild/recreate only the Console service, open an owned draft task, verify `Mark ready`, transition to `Ready`, verify `Start task`, and observe the first workflow projection. Do not reset databases or remove volumes.
