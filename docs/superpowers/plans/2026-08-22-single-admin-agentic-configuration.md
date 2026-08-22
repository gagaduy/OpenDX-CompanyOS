<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Single-Admin Agentic Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one authorized Agentic Administrator directly activate their own valid configuration revision in local and production deployments, without weakening audit, revocation, or task-pinning controls.

**Architecture:** Keep configuration lifecycle and authorization in the existing Agentic domain/application boundary. Replace the submitted-reviewer transition with a direct owner activation transition, retain immutable historical records, and adapt the PostgreSQL constraint/repository transaction so it atomically supersedes the active revision and records the activation audit event.

**Tech Stack:** TypeScript, Express, Zod, PostgreSQL 18 migrations, Vitest, Supertest, Docker Compose.

---

## File Structure

- Modify: `apps/api/src/modules/agentic/domain/services/agent-governance-rules.ts` — direct-activation state transition; retain workflow approval rules unchanged.
- Modify: `apps/api/src/modules/agentic/domain/services/agent-governance-rules.test.ts` — direct configuration lifecycle tests and historical-state rejection coverage.
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/configuration.service.ts` — replace new-flow submit/decision inputs with an explicit activation input.
- Modify: `apps/api/src/modules/agentic/application/services/implementations/configuration.service.ts` — enforce role, draft ownership, revalidation, transactional direct activation, and audit.
- Modify: `apps/api/src/modules/agentic/application/services/implementations/configuration.service.test.ts` — self-activation, authorization, stale-version, and atomic audit tests.
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts` — make the revision activation contract owner-aware rather than reviewer-aware.
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts` — activate an owned draft atomically and preserve one active revision.
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts` — concurrent owner activation and invalid activation persistence tests.
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608220001_single_admin_configuration_activation.ts` — relax the legacy cross-subject revision check while preserving immutable history and one-active protection.
- Modify: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts` — migrate an existing two-person history and prove direct owner activation is valid afterward.
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts` — add strict `{ expectedVersion }` parsing for direct activation; retain legacy payload parsing only to return a bounded lifecycle error.
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts` — expose `activateRevision` and route retired submit/decision requests to the explicit configuration-lifecycle error.
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts` — add `POST /configuration-revisions/:revisionId/activate` behind the existing backend governance guard.
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.test.ts` and `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts` — direct-owner API acceptance, denied access, stale request, legacy endpoint, audit, and task-pinning coverage.
- Modify: `docs/api/agentic.md`, `docs/architecture/agentic-workflow-runtime.md`, `docs/roadmap/mvp-status.md`, and `CHANGELOG.md` — document the single-admin lifecycle and its retained safeguards.

### Task 1: Define direct activation at the domain and application boundary

**Files:**
- Modify: `apps/api/src/modules/agentic/domain/services/agent-governance-rules.ts`
- Test: `apps/api/src/modules/agentic/domain/services/agent-governance-rules.test.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/configuration.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/configuration.service.ts`
- Test: `apps/api/src/modules/agentic/application/services/implementations/configuration.service.test.ts`

- [ ] **Step 1: Write failing domain tests for direct owner activation.**

Add tests that call `transitionRevision` with an owned draft and `{ type: "activate", activatedBy: "admin-1" }`, then expect `state: "active"`, `decidedBy: "admin-1"`, incremented version, and no rejection reason. Add assertions that activating `pending_approval`, `active`, or `superseded` revisions throws `CONFIGURATION_STATE_INVALID`. Keep the existing `decideApproval` self-approval tests unchanged.

- [ ] **Step 2: Run the domain test to verify it fails.**

Run: `pnpm --filter @opendx/api test -- agent-governance-rules.test.ts`

Expected: FAIL because the current transition only accepts `submit`, a different-person `activate`, or `reject` from `pending_approval`.

- [ ] **Step 3: Implement the smallest direct activation transition.**

Change the configuration branch of `transitionRevision` to accept:

```ts
command: { readonly type: "submit" }
  | { readonly type: "activate"; readonly activatedBy: string }
  | { readonly type: "reject"; readonly decidedBy: string; readonly reason: string }
```

For `activate`, require `revision.state === "draft"`, set `state: "active"`, `decidedBy: command.activatedBy`, `decidedAt: at`, and increment the version through `nextRevision`. Do not apply this rule to `decideApproval`; risky workflow approvals keep their existing requester/decider separation.

- [ ] **Step 4: Replace the new-flow application contract and add failing service tests.**

In `configuration.service.ts`, replace `SubmitConfigurationInput` and `DecideConfigurationInput` in the public service contract with:

```ts
export interface ActivateConfigurationInput {
  readonly revisionId: string;
  readonly expectedVersion: number;
}
```

Add service tests proving the draft creator with `agentic_governance_admin` can activate, an unrelated Administrator cannot activate another user's draft, and stale activation leaves `activateRevision` and `appendAudit` uncalled.

- [ ] **Step 5: Implement `activate` in `ConfigurationServiceImpl`.**

Add `activate(input, principal)` which:

1. requires `agentic_governance_admin` or `administrator`;
2. loads the revision in `transactions.run`;
3. rejects anything but an owned draft with `FORBIDDEN` and a mismatched version with `STALE_VERSION`;
4. reloads `getRevisionChildren`, calls `validateChildren`, then uses `transitionRevision(current, { type: "activate", activatedBy: principal.subject }, at)`;
5. invokes the repository activation method with the actor subject and appends `configuration.activate` audit in the same transaction.

Keep `submit` and `decide` as compatibility methods that fail with
`CONFIGURATION_LIFECYCLE_RETIRED`; do not call their repository mutations.

- [ ] **Step 6: Run focused service and domain tests.**

Run: `pnpm --filter @opendx/api test -- agent-governance-rules.test.ts configuration.service.test.ts`

Expected: PASS; direct activation is allowed only for the draft owner, while action approvals retain self-decision denial.

- [ ] **Step 7: Commit the domain/application unit.**

```bash
git add apps/api/src/modules/agentic/domain/services/agent-governance-rules.ts \
  apps/api/src/modules/agentic/domain/services/agent-governance-rules.test.ts \
  apps/api/src/modules/agentic/application/services/interfaces/configuration.service.ts \
  apps/api/src/modules/agentic/application/services/implementations/configuration.service.ts \
  apps/api/src/modules/agentic/application/services/implementations/configuration.service.test.ts
git commit -m "feat(agentic): allow owner configuration activation"
```

### Task 2: Preserve database integrity for self-activation

**Files:**
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608220001_single_admin_configuration_activation.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Test: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Test: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`

- [ ] **Step 1: Write failing migration and repository integration tests.**

Seed a legacy `pending_approval` revision with a different historical `decided_by` record, then run migrations and assert the record is unchanged. Create a new draft whose `created_by` is `admin-1`; assert an activation by `admin-1` produces one active row with `decided_by='admin-1'`. Race two activation transactions and assert exactly one succeeds, one revision is active, and the previous active revision is superseded.

- [ ] **Step 2: Run the focused PostgreSQL tests to verify failure.**

Run: `pnpm --filter @opendx/api test:integration -- agentic-migration.integration.test.ts postgresql-agentic.repository.integration.test.ts`

Expected: FAIL because the legacy check constraint requires `decided_by <> created_by` and the repository only selects `pending_approval` candidates.

- [ ] **Step 3: Add the forward-only migration.**

Create a migration that replaces only the configuration-revision decision check. Preserve allowed states and all historical rows, but allow an `active` revision to have `decided_by = created_by`. Retain `decided_by`/`decided_at` as mandatory for `active`, `rejected`, and `superseded`; retain the partial unique index that allows one active revision. The down migration restores the old constraint only after rejecting any self-activated active history with a clear migration error.

- [ ] **Step 4: Make repository activation owner-aware.**

Rename the method parameter from `decidedBy` to `activatedBy` in `AgenticRepository` and its implementation. In `activateRevision`, lock the same advisory key, select only `state='draft'`, `version=$2`, and `created_by=$3`, supersede the previous active revision, then update the selected draft to `active` with `decided_by=$3` and `decided_at=$4`. Return false for every stale, non-owned, or non-draft request.

- [ ] **Step 5: Run the database and repository suite.**

Run: `pnpm --filter @opendx/api test:integration -- agentic-migration.integration.test.ts postgresql-agentic.repository.integration.test.ts`

Expected: PASS; historical two-person data remains queryable, a direct owner activation succeeds, and concurrent activation yields one active winner.

- [ ] **Step 6: Commit the persistence unit.**

```bash
git add apps/api/src/modules/agentic/infrastructure/database/migrations/202608220001_single_admin_configuration_activation.ts \
  apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts \
  apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts \
  apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts \
  apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts
git commit -m "feat(agentic): persist direct configuration activation"
```

### Task 3: Expose the guarded direct-activation API

**Files:**
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Test: `apps/api/src/modules/agentic/tests/agentic.api.test.ts`
- Test: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`

- [ ] **Step 1: Write failing route tests.**

Add API integration coverage for:

```text
POST /v1/admin/agentic/configuration-revisions/:revisionId/activate
Authorization: Bearer agentic_governance_admin:creator
{ "expectedVersion": 1 }
```

Expect `200`, state `active`, and `decidedBy: "creator"`. Verify an
`agentic_operator` receives `403`, a different Governance Admin receives
`403`, and a repeated stale request returns the bounded stale error. Verify
`/submit` and `/decision` return the explicit
`CONFIGURATION_LIFECYCLE_RETIRED` error and do not change a draft.

- [ ] **Step 2: Run API tests to verify failure.**

Run: `pnpm --filter @opendx/api test -- agentic.api.test.ts agentic.api.integration.test.ts`

Expected: FAIL because no `activate` route exists and legacy routes still use submit/reviewer decision.

- [ ] **Step 3: Implement parsing, controller, and routing.**

Reuse `parseExpectedVersion` for the new body. Add:

```ts
router.post(
  "/configuration-revisions/:revisionId/activate",
  authenticate,
  guard("agentic.configuration.activate.denied", governance),
  controller.activateRevision,
);
```

Implement `activateRevision` using `parseUuid`, `parseExpectedVersion`, and
`configurations.activate`. Keep `/submit` and `/decision` routed only long
enough to return the service's bounded retirement error; do not remove route
authorization or expose an unauthenticated compatibility path.

- [ ] **Step 4: Run focused API tests.**

Run: `pnpm --filter @opendx/api test -- agentic.api.test.ts agentic.api.integration.test.ts`

Expected: PASS; direct activation is backend-authorized, self-owned, audited,
and old review endpoints cannot mutate new revisions.

- [ ] **Step 5: Commit the transport unit.**

```bash
git add apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts \
  apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts \
  apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts \
  apps/api/src/modules/agentic/tests/agentic.api.test.ts \
  apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts
git commit -m "feat(agentic): expose direct configuration activation"
```

### Task 4: Verify task pinning, revocation, and audit remain intact

**Files:**
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `scripts/dev/agentic-workflow-lifecycle-check.mjs`
- Test: `scripts/dev/agentic-workflow-lifecycle-check.test.mjs`

- [ ] **Step 1: Write failing regression tests.**

Create revision A, make a task ready, directly activate revision B as the same
Administrator, and assert the ready task retains revision A while a new ready
task pins B. Create an emergency revocation after B activates and assert model
reservation/authorization still denies the revoked target. Assert audit has one
`configuration.activate` event for B and no `configuration.submit` or
`configuration.activate` event for rejected legacy endpoint calls.

- [ ] **Step 2: Run focused regression checks to verify failure.**

Run: `pnpm --filter @opendx/api test:integration -- agentic.api.integration.test.ts postgresql-agentic.repository.integration.test.ts && node --test scripts/dev/agentic-workflow-lifecycle-check.test.mjs`

Expected: FAIL until lifecycle fixtures and static acceptance expectations use the direct activation endpoint.

- [ ] **Step 3: Update lifecycle fixtures and static gate.**

Replace only configuration-fixture submit/reviewer-decision calls in
`agentic-workflow-lifecycle-check.mjs` with one owner direct-activation call.
Do not alter the separate workflow approval fixtures, their different-person
decision checks, or revocation assertions.

- [ ] **Step 4: Run focused regression checks.**

Run: `pnpm --filter @opendx/api test:integration -- agentic.api.integration.test.ts postgresql-agentic.repository.integration.test.ts && node --test scripts/dev/agentic-workflow-lifecycle-check.test.mjs`

Expected: PASS; only configuration approval changed, while task pinning,
emergency revocation, and risky-action approval protections remain in force.

- [ ] **Step 5: Commit the regression unit.**

```bash
git add apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts \
  apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts \
  scripts/dev/agentic-workflow-lifecycle-check.mjs \
  scripts/dev/agentic-workflow-lifecycle-check.test.mjs
git commit -m "test(agentic): preserve safeguards after direct activation"
```

### Task 5: Update operator documentation and run phase-relevant validation

**Files:**
- Modify: `docs/api/agentic.md`
- Modify: `docs/architecture/agentic-workflow-runtime.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document the new lifecycle and retired endpoints.**

Document the `POST .../activate` request/response, the single-admin ownership
rule, atomic supersession, audit fields, and the fact that submit/decision are
historical-only. State clearly that emergency revocation and human approval for
risky workflow actions are unchanged.

- [ ] **Step 2: Update roadmap and changelog.**

Reference [the approved focused design](../specs/2026-08-22-single-admin-agentic-configuration-design.md) from the Agentic delivery status. Replace the existing changelog design-only entry with implementation-facing text that accurately states direct activation and retained safeguards.

- [ ] **Step 3: Run focused and repository checks.**

Run:

```bash
pnpm --filter @opendx/api test -- agent-governance-rules.test.ts configuration.service.test.ts agentic.api.test.ts agentic.api.integration.test.ts
pnpm --filter @opendx/api test:integration -- agentic-migration.integration.test.ts postgresql-agentic.repository.integration.test.ts
pnpm check:agentic-workflow
pnpm check:agentic-phase-d-exit
git diff --check
pnpm audit:repo
```

Expected: all commands exit `0`; Phase D remains correctly marked incomplete until its credential-owned OpenRouter acceptance has passed.

- [ ] **Step 4: Commit documentation and validation changes.**

```bash
git add docs/api/agentic.md docs/architecture/agentic-workflow-runtime.md \
  docs/roadmap/mvp-status.md CHANGELOG.md
git commit -m "docs(agentic): document direct configuration activation"
```

## Plan Self-Review

- Spec coverage: Tasks 1–3 implement single-admin direct activation, owner
  authorization, API compatibility, and transactional audit. Task 2 covers the
  required PostgreSQL compatibility and one-active invariant. Task 4 covers
  task pinning, revocation, and unchanged risky-action approvals. Task 5 covers
  operator docs and phase-relevant gates.
- Placeholder scan: no unfinished requirements, vague error handling, or
  unassigned files remain.
- Type consistency: `ActivateConfigurationInput`, `activate`, `activatedBy`,
  `configuration.activate`, and `/activate` are used consistently throughout.
