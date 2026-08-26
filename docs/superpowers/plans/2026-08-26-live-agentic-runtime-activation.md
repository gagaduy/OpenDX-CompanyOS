<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Live Agentic Runtime Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a started Advanced task use the real Phase F AI CEO and Department execution path or fail visibly; it must never complete through the Phase B fake-activity path.

**Architecture:** Preserve the versioned Temporal workflow and its existing descriptor activities. Add a persisted task execution profile, bind it into workflow start and the task brief, and make the worker configuration reject inconsistent live settings before polling. Compose exposes one explicit opt-in live profile, while the Console explains blocked and live execution states from backend projections.

**Tech Stack:** TypeScript, Express, Zod, PostgreSQL 18 migrations, React, Python 3.13, Temporal, OpenRouter, Docker Compose, Vitest, Pytest, Supertest.

---

## File Structure

- Create: `apps/api/src/modules/agentic/domain/entities/task-execution-profile.ts` — immutable `store_health_review` and `advanced_live` profile contract.
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608260001_add_agentic_task_execution_profile.ts` — forward-only task-profile persistence with a safe legacy default.
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts` — expose the accepted profile in direct intake.
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts` — persist profile and create the profile-owned bootstrap graph.
- Modify: `apps/api/src/modules/agentic/application/services/implementations/workflow-run.service.ts` — admit only an active live profile to descriptor execution and bind the profile to the start audit.
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts` and `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts` — store/load the task profile without leaking it through unrelated contracts.
- Modify: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.ts` — load the profile into the private Task Brief and restrict eligible assignments to the configured profile.
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts` and `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts` — strict intake and response DTOs.
- Modify: `apps/console/src/features/agentic/{types,schemas,api,components,pages,tests}/` — profile selection, no-fallback blocked state, and persisted live execution status.
- Modify: `services/ai-runtime/app/shared/config.py` and `services/ai-runtime/tests/shared/test_config.py` — paired live-runtime validation.
- Modify: `services/ai-runtime/app/agentic/worker.py`, `services/ai-runtime/tests/agentic/test_worker.py`, and `services/ai-runtime/app/agentic/workflows/store_health_review_v1.py` — register descriptor execution only for valid live config and reject a live-profile run when the worker cannot provide it.
- Modify: `infra/docker/docker-compose.yml`, `.env.example`, `infra/docker/README.md`, `docs/build-from-source.md`, `docs/api/agentic.md`, `docs/architecture/agentic-workflow-runtime.md`, `docs/roadmap/mvp-status.md`, and `CHANGELOG.md` — document the opt-in local live profile and owner-credential acceptance.
- Create: `scripts/dev/live-agentic-workforce-acceptance.mjs` and `scripts/dev/live-agentic-workforce-acceptance.test.mjs` — redacted owner-credential live acceptance.

### Task 1: Make the execution profile an immutable Agentic task property

**Files:**
- Create: `apps/api/src/modules/agentic/domain/entities/task-execution-profile.ts`
- Test: `apps/api/src/modules/agentic/domain/entities/task-execution-profile.test.ts`
- Modify: `apps/api/src/modules/agentic/domain/entities/agent-task.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts`
- Test: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`

- [ ] **Step 1: Write failing domain and service tests.**

  Assert that `advanced` intake normalizes to `advanced_live`, creates an `ai_ceo` bootstrap subtask, and returns the profile. Assert Store Health intake normalizes to `store_health_review`. Assert neither profile can be supplied by a client as an arbitrary string.

- [ ] **Step 2: Run the focused tests and confirm they fail because `AgentTask` has no execution profile.**

  Run: `pnpm --filter @opendx/api test -- task-execution-profile.test.ts agentic-console.service.test.ts`

- [ ] **Step 3: Add the smallest domain contract.**

  Define the closed union and normalizer:

  ```ts
  export type TaskExecutionProfile = "store_health_review" | "advanced_live";
  export function taskExecutionProfile(mode: "store_health_review" | "advanced"): TaskExecutionProfile {
    return mode === "advanced" ? "advanced_live" : "store_health_review";
  }
  ```

  Add `executionProfile: TaskExecutionProfile` to `AgentTask`; set it only inside `AgenticConsoleServiceImpl.createTaskIntake`.

- [ ] **Step 4: Re-run focused tests.**

  Expected: both profile variants are deterministic and no caller-controlled profile reaches the entity.

- [ ] **Step 5: Commit the domain/application unit.**

  ```bash
  git add apps/api/src/modules/agentic/domain/entities apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts
  git commit -m "feat(agentic): bind intake to execution profiles"
  ```

### Task 2: Persist the profile and preserve legacy task history

**Files:**
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608260001_add_agentic_task_execution_profile.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Test: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Test: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`

- [ ] **Step 1: Write failing migration/repository tests.**

  Migrate a pre-profile task and assert its profile becomes `store_health_review`. Persist an `advanced_live` task and reload it through normal task/detail/console queries. Assert any SQL value outside the two-value check constraint is rejected.

- [ ] **Step 2: Run the focused PostgreSQL tests and confirm failure.**

  Run: `pnpm --filter @opendx/api test:integration -- agentic-migration.integration.test.ts postgresql-agentic.repository.integration.test.ts`

- [ ] **Step 3: Add a forward-only migration and map it.**

  Add a non-null `execution_profile text NOT NULL DEFAULT 'store_health_review'` column with a check constraint. Update insert, row mapper, update/select projection, and Console detail queries; do not rewrite existing task rows or history.

- [ ] **Step 4: Re-run the focused PostgreSQL tests.**

  Expected: up/down/up works, legacy tasks are unchanged semantically, and profile values round-trip exactly.

- [ ] **Step 5: Commit persistence.**

  ```bash
  git add apps/api/src/modules/agentic/infrastructure/database/migrations/202608260001_add_agentic_task_execution_profile.ts apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts
  git commit -m "feat(agentic): persist live execution profiles"
  ```

### Task 3: Bind Advanced starts to the descriptor workflow path

**Files:**
- Modify: `apps/api/src/modules/agentic/application/services/implementations/workflow-run.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.ts`
- Test: `apps/api/src/modules/agentic/application/services/implementations/workflow-run.service.test.ts`
- Test: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.test.ts`
- Test: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`

- [ ] **Step 1: Write failing start and Task Brief tests.**

  For an `advanced_live` task, assert start emits an audit tagged `advanced_live`, the immutable Temporal input and internal Task Brief contain the profile, and the planning authority only accepts the six configured Department kinds. Assert legacy Store Health tasks retain their versioned historical workflow behavior.

- [ ] **Step 2: Run focused tests and confirm failure.**

  Run: `pnpm --filter @opendx/api test -- workflow-run.service.test.ts orchestration.service.test.ts agentic.api.integration.test.ts`

- [ ] **Step 3: Implement profile-aware start and private brief binding.**

  Extend the immutable Temporal input and private Task Brief with `executionProfile`, and validate it in the AI CEO plan acceptance path. The API starts a valid ready task normally; the worker is the sole authority that verifies live OpenRouter/identity capability and projects `LIVE_EXECUTION_UNAVAILABLE` when it cannot provide descriptor execution. Do not expose raw instructions, prompts, credentials, or provider payloads.

- [ ] **Step 4: Re-run focused tests.**

  Expected: Advanced starts as a descriptor-bound run; the worker later projects a bounded live-capability failure rather than entering a fake success path.

- [ ] **Step 5: Commit workflow binding.**

  ```bash
  git add apps/api/src/modules/agentic/application/services/implementations/workflow-run.service.ts apps/api/src/modules/agentic/application/services/implementations/orchestration.service.ts apps/api/src/modules/agentic/application/services/implementations/*.test.ts apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts
  git commit -m "feat(agentic): require live descriptors for advanced tasks"
  ```

### Task 4: Fail closed in worker configuration and workflow execution

**Files:**
- Modify: `services/ai-runtime/app/shared/config.py`
- Test: `services/ai-runtime/tests/shared/test_config.py`
- Modify: `services/ai-runtime/app/agentic/worker.py`
- Test: `services/ai-runtime/tests/agentic/test_worker.py`
- Modify: `services/ai-runtime/app/agentic/workflows/store_health_review_v1.py`
- Test: `services/ai-runtime/tests/agentic/workflows/test_store_health_orchestration.py`

- [ ] **Step 1: Write failing Python tests.**

  Assert configuration rejects descriptor execution with OpenRouter disabled, OpenRouter enabled without a key, and a missing AI CEO/Department credential. Assert a live-profile workflow does not call `execute_fake_analysis`, `execute_fake_quality_review`, `execute_fake_collaboration`, or `execute_fake_synthesis` when descriptor activities are unavailable; it ends `failed` with `LIVE_EXECUTION_UNAVAILABLE`.

- [ ] **Step 2: Run focused Python tests and confirm failure.**

  Run: `cd services/ai-runtime && python3 -m pytest tests/shared/test_config.py tests/agentic/test_worker.py tests/agentic/workflows/test_store_health_orchestration.py -q`

- [ ] **Step 3: Implement paired capability validation.**

  In `RuntimeSettings.from_environment`, require `OPENROUTER_EXECUTION_ENABLED=true` whenever descriptor execution is enabled. Add `live_execution_enabled` to the frozen workflow input produced by the API/runtime gateway. Route that input exclusively through `_run_descriptor_orchestration`; if required descriptor activities are absent, project a failed state and return `LIVE_EXECUTION_UNAVAILABLE`.

- [ ] **Step 4: Re-run focused Python tests.**

  Expected: invalid process configuration refuses startup and a live run cannot fall back to a fake terminal completion.

- [ ] **Step 5: Commit runtime hardening.**

  ```bash
  git add services/ai-runtime/app/shared/config.py services/ai-runtime/app/agentic/worker.py services/ai-runtime/app/agentic/workflows/store_health_review_v1.py services/ai-runtime/tests/shared/test_config.py services/ai-runtime/tests/agentic/test_worker.py services/ai-runtime/tests/agentic/workflows/test_store_health_orchestration.py
  git commit -m "fix(ai-runtime): fail closed for live advanced runs"
  ```

### Task 5: Make Console Advanced status and runtime setup truthful

**Files:**
- Modify: `apps/console/src/features/agentic/types/agentic.types.ts`
- Modify: `apps/console/src/features/agentic/schemas/agentic-task-api.schema.ts`
- Modify: `apps/console/src/features/agentic/api/agentic-api.ts`
- Modify: `apps/console/src/features/agentic/components/task-intake-form.tsx`
- Modify: `apps/console/src/features/agentic/pages/agentic-task-detail-page.tsx`
- Modify: `apps/console/src/features/agentic/components/task-timeline.tsx`
- Test: `apps/console/src/features/agentic/tests/agentic-task-intake-page.test.tsx`
- Test: `apps/console/src/features/agentic/tests/agentic-task-detail-page.test.tsx`
- Modify: `infra/docker/docker-compose.yml`, `.env.example`, `infra/docker/README.md`

- [ ] **Step 1: Write failing Console and Compose contract tests.**

  Assert Advanced displays “Live CEO delegation”, renders a server-returned blocked reason rather than “Task created”, and task detail distinguishes `planning`, `dispatching`, `department_analysis`, and `executive_synthesis`. Assert Compose passes both live flags only from ignored environment input and never supplies an OpenRouter key to Console/API containers.

- [ ] **Step 2: Run focused tests and confirm failure.**

  Run: `pnpm --filter @opendx/console test -- agentic-task-intake-page.test.tsx agentic-task-detail-page.test.tsx && node --test scripts/dev/agentic-production-compose-check.test.mjs`

- [ ] **Step 3: Implement purpose-specific presentation.**

  Add profile and bounded availability fields to intake/detail DTOs. The form must explain that Start runs CEO delegation, not perform an implicit approval. The timeline must render the server-owned profile and stage. Add Compose variables for descriptor execution and preserve false defaults in `.env.example`; the live acceptance command requires explicit operator opt-in.

- [ ] **Step 4: Re-run focused tests.**

  Expected: the UI cannot present a fake completion as live execution, and Compose keeps secrets restricted to AI Runtime/worker.

- [ ] **Step 5: Commit presentation/topology.**

  ```bash
  git add apps/console/src/features/agentic infra/docker/docker-compose.yml .env.example infra/docker/README.md scripts/dev/agentic-production-compose-check.test.mjs
  git commit -m "feat(console): expose live agentic execution state"
  ```

### Task 6: Add a redacted real OpenRouter acceptance and handoff evidence

**Files:**
- Create: `scripts/dev/live-agentic-workforce-acceptance.mjs`
- Test: `scripts/dev/live-agentic-workforce-acceptance.test.mjs`
- Modify: `package.json`, `docs/build-from-source.md`, `docs/api/agentic.md`, `docs/architecture/agentic-workflow-runtime.md`, `docs/roadmap/mvp-status.md`, `CHANGELOG.md`

- [ ] **Step 1: Write failing static acceptance tests.**

  Assert the command requires `OPENROUTER_LIVE_ACCEPTANCE_CONFIRM=I_OWN_THIS_KEY`, never reads or prints `OPENROUTER_API_KEY`, requires an Advanced operator token, polls only non-secret task/run states, and fails unless it observes a CEO plan, at least one Department descriptor, model/tool/cost records, and a persisted executive report.

- [ ] **Step 2: Run static acceptance tests and confirm failure.**

  Run: `node --test scripts/dev/live-agentic-workforce-acceptance.test.mjs`

- [ ] **Step 3: Implement the bounded acceptance command.**

  Create one Advanced task through the staff API, mark it ready, start it, poll its operations projection using condition-based waiting, and emit a redacted JSON summary containing IDs/digests/counts/states only. Fail on fake activity names, disabled configuration, missing expected persisted evidence, terminal failure, timeout, or any Commerce mutation audit. Do not make any model/provider request from test code; the running worker owns it.

- [ ] **Step 4: Run source and owner-credential live checks.**

  Run:

  ```bash
  pnpm test:agentic-phase-f-orchestration
  pnpm --filter @opendx/api test -- agentic.api.integration.test.ts workflow-run.service.test.ts orchestration.service.test.ts
  pnpm --filter @opendx/api test:integration -- agentic-migration.integration.test.ts postgresql-agentic.repository.integration.test.ts
  pnpm --filter @opendx/console test -- agentic-task-intake-page.test.tsx agentic-task-detail-page.test.tsx
  pnpm test:py -- tests/shared/test_config.py tests/agentic/test_worker.py tests/agentic/workflows/test_store_health_orchestration.py
  OPENROUTER_LIVE_ACCEPTANCE_CONFIRM=I_OWN_THIS_KEY pnpm run:live-agentic-workforce-acceptance
  git diff --check
  pnpm audit:repo
  ```

  Expected: source checks pass; the owner-credential check produces one redacted evidence file with a real terminal report and no fake activity invocation.

- [ ] **Step 5: Update docs and commit handoff.**

  Document required ignored `.env` flags, key rotation, service restart, failure meanings, the acceptance opt-in, and the fact that mutation adapters are separate approved slices. Mark this slice accurately in the roadmap.

  ```bash
  git add scripts/dev/live-agentic-workforce-acceptance.mjs scripts/dev/live-agentic-workforce-acceptance.test.mjs package.json docs/build-from-source.md docs/api/agentic.md docs/architecture/agentic-workflow-runtime.md docs/roadmap/mvp-status.md CHANGELOG.md
  git commit -m "feat(agentic): verify live workforce execution"
  ```

## Plan Self-Review

- Spec coverage: Tasks 1–3 bind Advanced to a persisted, policy-governed live path; Task 4 prevents fake fallback; Task 5 makes the operator experience and Compose topology truthful; Task 6 supplies source and credential-owned live evidence.
- Scope: owning-module mutations are deliberately excluded from this plan and remain separate vertical slices, as required by the approved design.
- Placeholder scan: no unfinished requirements or implicit fallback behavior remain.
- Type consistency: `advanced_live`, `LIVE_EXECUTION_UNAVAILABLE`, `LiveExecutionAvailability`, and `live_execution_enabled` are used only for the same live-path responsibility.
