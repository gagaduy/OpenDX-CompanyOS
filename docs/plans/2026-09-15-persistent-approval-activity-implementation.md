<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Persistent Approval Activity Implementation Plan

**Goal:** Persist approved and canceled department decisions and display them immediately and after refresh in the AI Command Center live activity feed.

**Architecture:** Add an append-only Agentic Command Center activity record with an authenticated application service and PostgreSQL repository. Expose bounded create/list endpoints, validate all transport input, and let the Console merge server-authored decision events with its existing live feed. Existing department APIs remain authoritative for business mutations; activity is recorded only after those calls succeed.

**Tech Stack:** TypeScript, Express, PostgreSQL/node-pg-migrate, Zod, React, Vitest, Testing Library.

---

### Task 1: Append-only activity persistence

**Files:**
- Create: `apps/api/src/modules/agentic/domain/entities/command-activity-event.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202609150011_create_agentic_command_activity_events.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Test: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`

**Step 1:** Add a failing repository integration test that appends an approved Support event, lists it newest-first, retries the same idempotency key without duplication, and rejects update/delete.

**Step 2:** Run the focused integration test and confirm the table or methods are missing.

**Step 3:** Add the immutable table and typed repository methods `appendCommandActivity` and `listCommandActivity`. On unique idempotency conflict, load and return the existing row.

**Step 4:** Run the focused integration test and agentic migration tests.

### Task 2: Authenticated activity application/API

**Files:**
- Create: `apps/api/src/modules/agentic/application/services/interfaces/command-activity.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/command-activity.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/command-activity.service.test.ts`
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Modify: `apps/api/src/modules/agentic/agentic.module.ts`
- Test: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`

**Step 1:** Add failing service and route tests for server-owned actor/time, enum and summary validation, idempotency, administrator/approver create access, and authenticated list access.

**Step 2:** Run the focused tests and confirm failure at the missing service/routes.

**Step 3:** Implement the service using `TransactionRunner`, inject the server ID/clock, add Zod parsers, controller handlers, route guards, and module wiring.

**Step 4:** Run service, API, and Agentic unit suites.

### Task 3: Typed Console transport and hydration

**Files:**
- Modify: `apps/console/src/features/agentic/types/agentic.types.ts`
- Modify: `apps/console/src/features/agentic/schemas/agentic-task-api.schema.ts`
- Modify: `apps/console/src/features/agentic/api/agentic-api.ts`
- Test: `apps/console/src/features/agentic/tests/agentic-api.test.ts`
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`
- Test: `apps/console/src/features/agentic/tests/agentic-department-queue.test.tsx`

**Step 1:** Add failing API client tests for POST create and GET recent event parsing.

**Step 2:** Add failing Command Center tests showing hydrated approved/canceled events after mount and no duplicate after immediate insertion plus refresh.

**Step 3:** Implement types, Zod schemas, client methods, mount/refresh loading, deterministic enum-to-view mapping, timestamp ordering, and backend-ID deduplication.

**Step 4:** Run the focused Console API and component tests.

### Task 4: Record all four department decisions

**Files:**
- Modify: `apps/console/src/features/agentic/components/agentic-command-center.tsx`
- Test: `apps/console/src/features/agentic/tests/agentic-department-queue.test.tsx`

**Step 1:** Add failing interaction tests for approved and canceled decisions from Marketing, Merchandising, Operations, and Support approval cards.

**Step 2:** Add one helper that submits a bounded activity command only after a successful domain action and inserts the returned event into the live feed.

**Step 3:** Replace local-only cancellation handlers with async handlers that persist the decision before removing the approval card; retain the card and show an error if persistence fails.

**Step 4:** Run all Agentic Console tests.

### Task 5: Documentation and verification

**Files:**
- Modify: `CHANGELOG.md`

**Step 1:** Document persistent approval/cancellation activity under `[Unreleased]`.

**Step 2:** Run `git diff --check`, API/Console tests and typechecks, migration integration tests, and `pnpm audit:repo`.

**Step 3:** Run `pnpm check:full`; report any environment-owned Python dependency failure separately from the TypeScript change.

**Step 4:** Commit the implementation atomically with `feat(agentic): persist approval activity events`.

