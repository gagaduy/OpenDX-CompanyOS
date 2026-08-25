<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Console Digital Workforce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the governed Phase G Digital Workforce Console for task
intake, file preview, durable execution timelines, approvals, Digital Employee
visibility, audit, and provenance-backed reports.

**Architecture:** Implement end-to-end vertical slices through the existing
Agentic module and a new feature-owned Console area. Express staff routes call
purpose-specific application services and PostgreSQL projections; React
validates every response before mapping it to view state. Temporal workers,
private workload APIs, Commerce truth, and Agent execution remain unchanged.

**Tech Stack:** TypeScript 7, Express 5, PostgreSQL 18, node-pg-migrate, React
19, React Router 6, Zod 4, Vitest, Testing Library, Chrome DevTools
Protocol acceptance scripts, pnpm 11, and Docker Compose.

---

## Preconditions

- Phase F commit `0013417` must be reachable from `develop` before Task 1
  implementation begins.
- Work on `feat/console-digital-workforce`; do not add Phase G code to
  `feat/ai-ceo-coordination`.
- Keep Company Memory, schedules, GraphRAG, chat, configuration mutation, and
  Commerce mutation outside this plan.
- Do not add a frontend or backend dependency.

- [ ] **Step 1: Confirm Phase F has been integrated**

Run:

```bash
git fetch origin
git rebase develop
git merge-base --is-ancestor 0013417 HEAD
git status --short --branch
```

Expected: the ancestry command exits `0`, and the Phase G worktree is clean. If
it exits non-zero, stop implementation; preparing this plan does not authorize
merging Phase F.

- [ ] **Step 2: Record the clean baseline**

Run:

```bash
pnpm --filter @opendx/api exec vitest run src/modules/agentic/tests/agentic.api.test.ts
pnpm --filter @opendx/console test
git diff --check
```

Expected: all baseline suites pass and the diff check has no output.

## File Map

Backend files changed across the vertical slices:

- `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts`
  — purpose-specific task overview, task operations, employee, and audit DTOs.
- `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
  — persistence records and focused query/idempotency methods.
- `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts`
  — staff query and guided-intake use cases.
- `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts`
  — authorization, mapping, freshness, and read-model coordination.
- `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`
  — application policy and mapping tests with a fake repository.
- `apps/api/src/modules/agentic/application/services/interfaces/agentic-file.service.ts`
  and `implementations/agentic-file.service.ts` — idempotent upload input and
  replay behavior.
- `apps/api/src/modules/agentic/infrastructure/database/migrations/202608250009_create_agentic_staff_intake_idempotency.ts`
  — immutable actor/request/resource bindings.
- `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
  — migration, constraints, rollback, and immutability evidence.
- `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
  and its integration test — authoritative staff projections and idempotency.
- `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`,
  `controllers/agentic.controller.ts`, and `routes/agentic.routes.ts` — strict
  query/header/body parsing and thin HTTP delegation.
- `apps/api/src/modules/agentic/agentic.module.ts` — explicit composition.
- `apps/api/src/modules/agentic/tests/agentic.api.test.ts` and
  `agentic.api.integration.test.ts` — transport and real PostgreSQL behavior.

Frontend files are added under `apps/console/src/features/agentic/` only when
their slice is implemented:

- `api/agentic-api.ts` — authenticated transport and safe error taxonomy.
- `schemas/agentic-task-api.schema.ts`, `agentic-approval-api.schema.ts`, and
  `agentic-workforce-api.schema.ts` — runtime response validation.
- `types/agentic.types.ts` — UI-facing types and role policy.
- `mappers/agentic.mapper.ts` — transport-to-view normalization.
- `hooks/use-agentic-tasks.ts`, `use-agentic-intake.ts`,
  `use-agentic-operations.ts`, `use-agentic-approvals.ts`,
  `use-agentic-employees.ts`, and `use-agentic-audit.ts` — request lifecycle.
- focused components for metrics, filters, intake, preview, timeline,
  dependencies, approvals, employee governance, reports, and audit detail.
- `pages/agentic-tasks-page.tsx`, `agentic-task-intake-page.tsx`,
  `agentic-task-detail-page.tsx`, `agentic-approvals-page.tsx`,
  `agentic-employees-page.tsx`, `agentic-employee-detail-page.tsx`, and
  `agentic-audit-page.tsx` — route composition.
- `tests/*.test.tsx` — visible behavior, role, recovery, and keyboard evidence.
- `index.ts` — the only public feature entry point.

Application composition and acceptance files:

- `apps/console/src/app/app-router.tsx`, `console-shell.tsx`, and their tests.
- `apps/console/src/shared/styles/globals.css` for feature selectors built from
  existing semantic tokens.
- `scripts/dev/agentic-console-browser-check.mjs` and its Node test.
- `scripts/dev/agentic-phase-g-exit-check.mjs` and its Node test.
- `package.json`, `docs/api/agentic.md`, `docs/build-from-source.md`,
  `docs/roadmap/mvp-status.md`, `README.md`, and `CHANGELOG.md`.

### Task 1: Idempotent staff intake boundary

**Files:**

- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608250009_create_agentic_staff_intake_idempotency.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agentic-file.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-file.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-file.service.test.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Test: `apps/api/src/modules/agentic/tests/agentic.api.test.ts`

- [ ] **Step 1: Write failing migration and repository tests**

Add assertions for exact replay, changed-payload conflict, cross-actor key
isolation, immutable bindings, and complete rollback. Use this contract in the
repository test:

```ts
const first = await repository.bindStaffIntake(session, {
  kind: "file_upload",
  actorId: "governance-a",
  idempotencyKey: "console:file:1",
  requestDigest: "a".repeat(64),
  resourceId: fileId,
  createdAt: at,
});
expect(first).toBe("created");
await expect(repository.bindStaffIntake(session, {
  kind: "file_upload",
  actorId: "governance-a",
  idempotencyKey: "console:file:1",
  requestDigest: "b".repeat(64),
  resourceId: randomUUID(),
  createdAt: at,
})).resolves.toBe("conflict");
```

- [ ] **Step 2: Run the tests to verify the boundary is missing**

Run:

```bash
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts \
  src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts
```

Expected: FAIL because the migration and `bindStaffIntake` contract do not
exist.

- [ ] **Step 3: Add the immutable idempotency migration and repository port**

Create the table and public application record with this exact shape:

```sql
CREATE TABLE agentic_staff_intake_idempotency (
  kind text NOT NULL CHECK(kind IN ('task_intake','file_upload')),
  actor_id text NOT NULL CHECK(length(btrim(actor_id)) BETWEEN 1 AND 255),
  idempotency_key text NOT NULL
    CHECK(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$'),
  request_digest text NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
  PRIMARY KEY(kind,actor_id,idempotency_key)
);
CREATE TRIGGER agentic_staff_intake_idempotency_immutable
  BEFORE UPDATE OR DELETE ON agentic_staff_intake_idempotency
  FOR EACH ROW EXECUTE FUNCTION agentic_prevent_mutation();
```

Expose only these focused methods:

```ts
export interface StaffIntakeBinding {
  readonly kind: "task_intake" | "file_upload";
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly requestDigest: string;
  readonly resourceId: string;
  readonly createdAt: string;
}

findStaffIntakeBinding(
  session: DatabaseSession,
  kind: StaffIntakeBinding["kind"],
  actorId: string,
  idempotencyKey: string,
): Promise<StaffIntakeBinding | undefined>;
bindStaffIntake(
  session: DatabaseSession,
  binding: StaffIntakeBinding,
): Promise<"created" | "duplicate" | "conflict">;
```

The repository must take a transaction-scoped advisory lock on
`kind:actorId:idempotencyKey`, compare both digest and resource ID, and never
update a stored binding.

- [ ] **Step 4: Write failing file-upload replay tests**

Add service and HTTP assertions that the same actor/key/body returns the same
file, changed content returns `IDEMPOTENCY_CONFLICT`, another actor can use the
same key independently, and a missing key returns `400 VALIDATION_ERROR`:

```ts
await expect(service.upload({
  idempotencyKey: "console:file:1",
  originalFilename: "health.csv",
  mediaType: "text/csv",
  content: Buffer.from("sku,stock\nA,1"),
}, governance)).resolves.toMatchObject({ disposition: "created" });

await expect(service.upload({
  idempotencyKey: "console:file:1",
  originalFilename: "health.csv",
  mediaType: "text/csv",
  content: Buffer.from("sku,stock\nA,2"),
}, governance)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
```

- [ ] **Step 5: Implement file-upload replay and header parsing**

Extend the application contract without leaking HTTP types:

```ts
export interface AgenticFileUploadRequest {
  readonly idempotencyKey: string;
  readonly originalFilename: string;
  readonly mediaType: "text/csv" | "text/plain";
  readonly content: Buffer;
}

export interface AgenticFileUploadResult {
  readonly disposition: "created" | "replayed";
  readonly file: AgenticIntakeFile;
}
```

The controller parses `Idempotency-Key` with `parseIdempotencyKey`. The service
hashes canonical filename, media type, byte size, and payload digest; exact
replay loads the original owner-scoped file without another MinIO write or
audit event. Changed replay fails closed.

- [ ] **Step 6: Run focused API and migration tests**

Run:

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agentic-file.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts \
  src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts
```

Expected: PASS with exact replay and changed-payload conflict evidence.

- [ ] **Step 7: Commit the intake boundary**

```bash
git add apps/api/src/modules/agentic
git commit -m "feat(agentic): make staff intake idempotent"
```

### Task 2: Task overview and guided direct intake

**Files:**

- Create: `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts`
- Create: `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agent-task.service.ts`
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Modify: `apps/api/src/modules/agentic/agentic.module.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.test.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Create: `apps/console/src/features/agentic/api/agentic-api.ts`
- Create: `apps/console/src/features/agentic/schemas/agentic-task-api.schema.ts`
- Create: `apps/console/src/features/agentic/types/agentic.types.ts`
- Create: `apps/console/src/features/agentic/mappers/agentic.mapper.ts`
- Create: `apps/console/src/features/agentic/hooks/use-agentic-tasks.ts`
- Create: `apps/console/src/features/agentic/hooks/use-agentic-intake.ts`
- Create: `apps/console/src/features/agentic/components/agentic-metrics.tsx`
- Create: `apps/console/src/features/agentic/components/task-filter-bar.tsx`
- Create: `apps/console/src/features/agentic/components/task-table.tsx`
- Create: `apps/console/src/features/agentic/components/task-intake-form.tsx`
- Create: `apps/console/src/features/agentic/pages/agentic-tasks-page.tsx`
- Create: `apps/console/src/features/agentic/pages/agentic-task-intake-page.tsx`
- Create: `apps/console/src/features/agentic/tests/agentic-tasks-page.test.tsx`
- Create: `apps/console/src/features/agentic/tests/agentic-task-intake-page.test.tsx`
- Create: `apps/console/src/features/agentic/index.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/features/authentication/api/oidc-manager.ts`
- Modify: `apps/console/src/features/authentication/tests/authentication.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`

- [ ] **Step 1: Write failing backend overview and guided-intake tests**

Assert role-scoped counts, filters, stable ordering, strict query rejection,
one AI CEO bootstrap subtask, backend-generated provenance digest, and exact
task replay:

```ts
const created = await consoleService.createTaskIntake({
  mode: "store_health_review",
  goal: "Review Store Health",
  instructions: "Use approved aggregate evidence only.",
  reviewWindow: { start: "2026-08-18", end: "2026-08-25" },
  idempotencyKey: "console:task:1",
}, operator);

expect(created).toMatchObject({
  disposition: "created",
  detail: { subtasks: [{ agentKind: "ai_ceo", title: "Coordinate Store Health Review" }], dependencies: [] },
});
```

The HTTP test must prove `agentic_approver` and governance staff can read but
not create, auditors receive no task data, and operators see only owned tasks.

- [ ] **Step 2: Run the backend tests and observe the missing service**

Run:

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agentic-console.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
```

Expected: FAIL because `AgenticConsoleService` and the new routes are absent.

- [ ] **Step 3: Implement the task staff contracts**

Define strict application inputs and DTOs:

```ts
export interface AgenticTaskFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly state?: "draft" | "ready" | "received" | "planning" |
    "awaiting_plan_approval" | "dispatching" | "department_analysis" |
    "quality_review" | "collaboration" | "executive_synthesis" |
    "awaiting_human_approval" | "retrying" | "partially_completed" |
    "failed" | "canceled" | "completed";
  readonly createdBy?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
}

export interface CreateTaskIntakeInput {
  readonly mode: "store_health_review" | "advanced";
  readonly goal: string;
  readonly instructions: string;
  readonly deadline?: string;
  readonly reviewWindow?: { readonly start: string; readonly end: string };
  readonly idempotencyKey: string;
}

export interface AgenticTaskOverviewDto {
  readonly counts: Readonly<Record<"running" | "waiting" | "failed" | "completed" | "canceled", number>>;
  readonly pendingApprovals: number;
  readonly settledCostMicros: number;
  readonly refreshedAt: string;
}
```

Add `POST /tasks/intake` and `GET /tasks/overview` before `/tasks/:taskId`.
`POST /tasks/intake` computes canonical provenance and creates exactly one
`ai_ceo` bootstrap subtask; the browser never submits a Department DAG. Reuse
Task 1 idempotency in the same PostgreSQL transaction as task, graph,
provenance, and audit creation. Operator list/overview queries include only
owned tasks, approver queries include only tasks with an approval in the
actor's scope, governance admins receive oversight projections, administrators
receive the full staff projection, and auditors receive no task records.

- [ ] **Step 4: Write failing Console transport, route, and page tests**

Use malformed-response, URL-filter, role, empty, retry, and duplicate-submit
fixtures:

```tsx
render(<MemoryRouter initialEntries={["/agentic/tasks?state=ready"]}>
  <AgenticTasksPage api={api} roles={["agentic_operator"]} />
</MemoryRouter>);

expect(await screen.findByRole("heading", { name: "Digital Workforce" })).toBeVisible();
expect(api.listTasks).toHaveBeenCalledWith(expect.objectContaining({ state: "ready" }), expect.any(AbortSignal));
expect(screen.getByText("Waiting approvals")).toBeVisible();
```

The intake test selects Store Health by default, submits twice rapidly, and
expects one API call with the same idempotency key for an ambiguous retry.

- [ ] **Step 5: Implement the Console task foundation**

Expose one validated API factory:

```ts
export interface AgenticApi {
  overview(signal?: AbortSignal): Promise<AgenticTaskOverview>;
  listTasks(filter: AgenticTaskFilter, signal?: AbortSignal): Promise<AgenticTaskPage>;
  createTask(input: AgenticTaskIntake, idempotencyKey: string): Promise<AgenticTaskDetail>;
}

export class AgenticApiError extends Error {
  constructor(
    readonly code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "STALE_VERSION" |
      "IDEMPOTENCY_CONFLICT" | "VALIDATION_ERROR" | "UNAVAILABLE" | "INVALID_RESPONSE",
    message: string,
  ) { super(message); this.name = "AgenticApiError"; }
}
```

Add the Digital Workforce navigation group and task routes with
`StaffRoleRoute`. Reuse `PageHeader` and `SystemState`; keep filters in
`URLSearchParams`; add no new library and no Memory link. Extend `StaffRole`
and `isStaffRole` with `agentic_operator`, `agentic_approver`,
`agentic_governance_admin`, and `agentic_auditor`, and prove unknown roles are
still discarded. Add only the Tasks navigation item in this slice; later items
arrive with their implemented pages.

- [ ] **Step 6: Run the vertical-slice tests**

Run:

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agentic-console.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
pnpm --filter @opendx/console exec vitest run \
  src/features/agentic/tests/agentic-tasks-page.test.tsx \
  src/features/agentic/tests/agentic-task-intake-page.test.tsx \
  src/app/console-shell.test.tsx
```

Expected: PASS for overview, filtering, guided intake, role navigation, and
duplicate prevention.

- [ ] **Step 7: Commit the task workspace**

```bash
git add apps/api/src/modules/agentic apps/console/src
git commit -m "feat(console): add governed agentic task intake"
```

### Task 3: Private file preview journey

**Files:**

- Modify: `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Modify: `apps/console/src/features/agentic/api/agentic-api.ts`
- Modify: `apps/console/src/features/agentic/schemas/agentic-task-api.schema.ts`
- Modify: `apps/console/src/features/agentic/types/agentic.types.ts`
- Modify: `apps/console/src/features/agentic/hooks/use-agentic-intake.ts`
- Create: `apps/console/src/features/agentic/components/file-intake-panel.tsx`
- Create: `apps/console/src/features/agentic/components/file-preview-panel.tsx`
- Modify: `apps/console/src/features/agentic/pages/agentic-task-intake-page.tsx`
- Create: `apps/console/src/features/agentic/tests/agentic-file-intake.test.tsx`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `scripts/dev/agentic-phase-e-exit-check.mjs`

- [ ] **Step 1: Write failing file journey tests**

Cover role-gated mode visibility, one-file constraints, cancel, progress,
infected/oversized/unsupported errors, scanner outage, immutable preview,
backend-projected coordinator/eligible Departments/tools/data classes/risk,
version conflict, exact approval replay, and navigation to the created task:

```tsx
await user.upload(screen.getByLabelText("CSV or TXT file"), file);
await user.click(screen.getByRole("button", { name: "Upload and scan" }));
expect(await screen.findByText("24 rows ready for review")).toBeVisible();
expect(screen.getByText("Preview digest")).toBeVisible();
expect(screen.getByText("AI CEO coordinator")).toBeVisible();
expect(screen.getByText("Department dependencies are planned after task start.")).toBeVisible();
await user.click(screen.getByRole("button", { name: "Approve preview" }));
expect(api.approveFile).toHaveBeenCalledWith(fileId, expect.objectContaining({
  previewVersion: 1,
  expectedFileVersion: 4,
}), expect.any(String));
```

- [ ] **Step 2: Run the Console test and verify it fails**

Run:

```bash
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-file-intake.test.tsx
```

Expected: FAIL because the file intake and preview components do not exist.

- [ ] **Step 3: Implement the validated file journey**

First extend the staff preview response with a deterministic governance
projection from the active configuration:

```ts
export interface AgenticFileGovernancePreviewDto {
  readonly coordinator: "ai_ceo";
  readonly eligibleDepartments: readonly ("catalog" | "inventory" | "order" | "finance" | "crm" | "support")[];
  readonly allowedTools: readonly string[];
  readonly dataClasses: readonly string[];
  readonly riskSignals: readonly string[];
  readonly dependencyStatus: "planned_after_task_start";
  readonly configurationRevisionId: string;
  readonly configurationVersion: number;
}
```

The backend derives these fields from the approved Store Health execution
catalog and active configuration. It does not run a model, invent a Department
DAG, or expose configuration secrets before file approval.

Extend `AgenticApi` with:

```ts
uploadFile(file: File, idempotencyKey: string, signal?: AbortSignal): Promise<AgenticFile>;
loadFile(fileId: string, signal?: AbortSignal): Promise<AgenticFile>;
previewFile(fileId: string, signal?: AbortSignal): Promise<AgenticFilePreview>;
approveFile(fileId: string, input: AgenticFileApproval, idempotencyKey: string): Promise<AgenticTaskDetail>;
rejectFile(fileId: string, expectedFileVersion: number): Promise<AgenticFile>;
```

Keep the idempotency key stable for identical file bytes and rotate it after
file selection changes. Never retain file bytes outside the active component
state. Show counts, invalid rows, proposed sources, digest, version, and safe
errors; never show MinIO object keys.

- [ ] **Step 4: Preserve Phase E compatibility**

Update Phase E HTTP fixtures to send a unique `Idempotency-Key` on every new
upload and the same key on exact replay. Add an API integration assertion that
Task 1 replay creates one file record and one upload audit event.

- [ ] **Step 5: Run file and Phase E regression tests**

Run:

```bash
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-file-intake.test.tsx
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agentic-console.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
pnpm test:agentic-phase-e-exit
```

Expected: PASS without requiring live ClamAV for the static Phase E test.

- [ ] **Step 6: Commit the file journey**

```bash
git add apps/console/src/features/agentic apps/api/src/modules/agentic scripts/dev/agentic-phase-e-exit-check.mjs
git commit -m "feat(console): add agentic file preview intake"
```

### Task 4: Timeline-first task operations

**Files:**

- Modify: `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `apps/console/src/features/agentic/api/agentic-api.ts`
- Modify: `apps/console/src/features/agentic/schemas/agentic-task-api.schema.ts`
- Modify: `apps/console/src/features/agentic/types/agentic.types.ts`
- Create: `apps/console/src/features/agentic/hooks/use-agentic-operations.ts`
- Create: `apps/console/src/features/agentic/components/task-timeline.tsx`
- Create: `apps/console/src/features/agentic/components/dependency-panel.tsx`
- Create: `apps/console/src/features/agentic/components/execution-summary.tsx`
- Create: `apps/console/src/features/agentic/components/executive-report.tsx`
- Create: `apps/console/src/features/agentic/pages/agentic-task-detail-page.tsx`
- Create: `apps/console/src/features/agentic/tests/agentic-task-detail-page.test.tsx`
- Modify: `apps/console/src/features/agentic/index.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`

- [ ] **Step 1: Write failing authoritative-projection tests**

Seed one six-branch task with dependency edges, retry, Quality Gate,
collaboration, approval, costs, provenance, and partial executive report. Assert
that operator ownership and oversight rules apply before projection and that
the DTO contains no raw model result, prompt, object key, or restricted branch
payload.

Use this public shape:

```ts
export interface AgenticTaskOperationsDto {
  readonly task: { readonly id: string; readonly goal: string; readonly state: string; readonly version: number };
  readonly workflow?: { readonly id: string; readonly state: string; readonly stage: string; readonly version: number; readonly updatedAt: string };
  readonly timeline: readonly { readonly id: string; readonly kind: string; readonly state: string; readonly occurredAt: string; readonly branchId?: string; readonly reasonCode?: string }[];
  readonly branches: readonly { readonly id: string; readonly owner: string; readonly state: string; readonly dependencies: readonly string[]; readonly toolNames: readonly string[]; readonly dataClasses: readonly string[] }[];
  readonly costs: { readonly reservedMicros: number; readonly settledMicros: number };
  readonly approvals: readonly { readonly id: string; readonly state: string; readonly expiresAt: string; readonly version: number }[];
  readonly provenance: readonly { readonly id: string; readonly sourceType: string; readonly sourceId: string; readonly classification: string }[];
  readonly report?: {
    readonly completionState: "complete" | "partial" | "quality_escalated" | "canceled";
    readonly summary: string;
    readonly conclusions: readonly { readonly code: string; readonly statement: string; readonly provenanceIds: readonly string[] }[];
    readonly risks: readonly { readonly code: string; readonly statement: string; readonly severity: "low" | "medium" | "high"; readonly provenanceIds: readonly string[] }[];
    readonly recommendedActions: readonly { readonly code: string; readonly statement: string; readonly requiresHumanApproval: boolean; readonly provenanceIds: readonly string[] }[];
    readonly conflicts: readonly { readonly code: string; readonly statement: string; readonly provenanceIds: readonly string[] }[];
    readonly unavailableBranches: readonly { readonly subtaskId: string; readonly reasonCode: string }[];
  };
  readonly refreshedAt: string;
}
```

- [ ] **Step 2: Run projection tests and verify failure**

Run:

```bash
pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/agentic-console.service.test.ts
```

Expected: FAIL because `getTaskOperations` is not implemented.

- [ ] **Step 3: Implement the backend operations read model**

Add `GET /tasks/:taskId/operations` before the generic task detail route. Query
existing immutable records in one read-only transaction, use safe integer cost
aggregation, sort timeline by timestamp then stable ID, and validate report
conclusion provenance before mapping. Return no report field until immutable
settlement and payload digests agree.

The application boundary is:

```ts
export interface AgenticConsoleService {
  createTaskIntake(input: CreateTaskIntakeInput, principal: StaffPrincipal): Promise<CreateTaskIntakeResult>;
  getTaskOverview(principal: StaffPrincipal): Promise<AgenticTaskOverviewDto>;
  listTasks(filter: AgenticTaskFilter, principal: StaffPrincipal): Promise<AgenticConsoleTaskPageDto>;
  getTaskOperations(taskId: string, principal: StaffPrincipal): Promise<AgenticTaskOperationsDto>;
}
```

- [ ] **Step 4: Write failing task-detail and polling tests**

Use fake timers to prove five-second active polling, hidden/offline pause,
fifteen-second failure backoff, immediate resume, terminal stop, request abort,
stale timestamp, partial branch disclosure, and authoritative cancel refresh:

```tsx
vi.useFakeTimers({ shouldAdvanceTime: true });
render(<AgenticTaskDetailPage api={api} taskId={taskId} roles={["agentic_operator"]} />);
expect(await screen.findByRole("list", { name: "Execution timeline" })).toBeVisible();
await vi.advanceTimersByTimeAsync(5_000);
expect(api.loadOperations).toHaveBeenCalledTimes(2);
api.loadOperations.mockResolvedValueOnce(completedOperations);
await vi.advanceTimersByTimeAsync(5_000);
expect(api.loadOperations).toHaveBeenCalledTimes(3);
await vi.advanceTimersByTimeAsync(10_000);
expect(api.loadOperations).toHaveBeenCalledTimes(3);
```

- [ ] **Step 5: Implement timeline, dependencies, cost, and report UI**

Render the timeline as the primary semantic list; render dependencies as a
compact desktop rail and ordered mobile relationship list. Map
`partially_completed`, `failed`, `canceled`, and `completed` separately. A
partial report lists unavailable branches; absence renders an honest waiting
state. Cancel uses the workflow version and refetches after any ambiguous
response.

Keep presentation props explicit:

```ts
export interface TaskTimelineProps {
  readonly events: readonly AgenticTimelineEvent[];
  readonly selectedEventId?: string;
  onSelect(eventId: string): void;
}

export interface ExecutiveReportProps {
  readonly report?: AgenticExecutiveReport;
  readonly workflowState: AgenticWorkflowState;
}
```

- [ ] **Step 6: Run backend, Console, and Phase F regressions**

Run:

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agentic-console.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-task-detail-page.test.tsx
pnpm test:agentic-phase-f-orchestration
```

Expected: PASS; the UI projection does not alter replay-safe Phase F behavior.

- [ ] **Step 7: Commit task operations**

```bash
git add apps/api/src/modules/agentic apps/console/src/features/agentic apps/console/src/app apps/console/src/shared/styles/globals.css
git commit -m "feat(console): show agentic execution timeline"
```

### Task 5: Approval Inbox

**Files:**

- Modify: `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Modify: `apps/console/src/features/agentic/api/agentic-api.ts`
- Create: `apps/console/src/features/agentic/schemas/agentic-approval-api.schema.ts`
- Modify: `apps/console/src/features/agentic/types/agentic.types.ts`
- Create: `apps/console/src/features/agentic/hooks/use-agentic-approvals.ts`
- Create: `apps/console/src/features/agentic/components/approval-list.tsx`
- Create: `apps/console/src/features/agentic/components/approval-detail.tsx`
- Create: `apps/console/src/features/agentic/components/approval-decision-dialog.tsx`
- Create: `apps/console/src/features/agentic/pages/agentic-approvals-page.tsx`
- Create: `apps/console/src/features/agentic/tests/agentic-approvals-page.test.tsx`
- Modify: `apps/console/src/features/agentic/index.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`

- [ ] **Step 1: Write failing Approval Inbox tests**

Test loading, empty, master-detail selection, exact actor/resource/action/
digests/versions/effect/expiry, read-only roles, focus return, required reasons,
stale conflict, expired state, and duplicate decision:

```tsx
expect(await screen.findByRole("heading", { name: "Approval Inbox" })).toBeVisible();
await user.click(screen.getByRole("button", { name: /workflow execution/i }));
expect(screen.getByText("Parameters digest")).toBeVisible();
await user.click(screen.getByRole("button", { name: "Request revision" }));
await user.type(screen.getByLabelText("Decision reason"), "Clarify the inventory window.");
await user.click(screen.getByRole("button", { name: "Confirm request revision" }));
expect(api.decideApproval).toHaveBeenCalledWith(approvalId, {
  expectedVersion: 1,
  decision: "revision_requested",
  reason: "Clarify the inventory window.",
});
```

Add an application test for a purpose-specific approval detail containing the
persisted request, workflow payload digest when present, deterministic risk
basis, expected effect, source references, and expiry. Assert the service does
not fabricate a payload digest when no stored signal evidence exists.

- [ ] **Step 2: Verify the test fails**

Run:

```bash
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-approvals-page.test.tsx
pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/agentic-console.service.test.ts
```

Expected: FAIL because the Approval Inbox and approval-detail read model are
absent.

- [ ] **Step 3: Implement the approval detail read model**

Add `GET /approvals/:approvalId/detail` before the generic approval route and
return this bounded DTO:

```ts
export interface AgenticApprovalDetailDto {
  readonly approval: {
    readonly id: string;
    readonly state: "pending" | "approved" | "rejected" | "revision_requested";
    readonly requesterId: string;
    readonly approverScope: "tool_invocation" | "emergency_revocation" | "governance_configuration" | "workflow_execution";
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly parametersDigest: string;
    readonly policyVersion: number;
    readonly workflowVersion?: number;
    readonly configurationRevisionId: string;
    readonly expiresAt: string;
    readonly version: number;
    readonly createdAt: string;
  };
  readonly payloadDigest?: string;
  readonly risk: { readonly level: "low" | "medium" | "high"; readonly basis: string };
  readonly expectedEffect: string;
  readonly sources: readonly { readonly sourceType: string; readonly sourceId: string; readonly sourceDigest: string }[];
  readonly refreshedAt: string;
}
```

Build it in a read-only transaction after the existing approval authorization
check. Risk and expected effect use an exhaustive rule-first mapping by
`approverScope` and `action`; the frontend never computes them. Payload digest
comes only from stored workflow signal evidence.

- [ ] **Step 4: Implement the validated approval journey**

Add API methods for paginated list, detail, and versioned decision. Use
`DialogShell`; require a bounded reason for every decision to match the current
backend validator. Disable controls for operator/governance readers, refetch on
`STALE_VERSION`, and never optimistic-update approval state. Add the Approvals
navigation item only for roles that may read the inbox.

```ts
listApprovals(page: number, pageSize: number, signal?: AbortSignal): Promise<AgenticApprovalPage>;
loadApproval(approvalId: string, signal?: AbortSignal): Promise<AgenticApprovalDetail>;
decideApproval(approvalId: string, input: {
  readonly expectedVersion: number;
  readonly decision: "approved" | "rejected" | "revision_requested";
  readonly reason: string;
}): Promise<AgenticApproval>;
```

- [ ] **Step 5: Add backend leakage and decision regression assertions**

Extend the integration suite to prove role reads, approver/admin decisions,
self-decision denial, expiry, revision request, one signal receipt, and no
approval detail for the auditor role.

- [ ] **Step 6: Run the slice tests**

```bash
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-approvals-page.test.tsx
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agentic-console.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Approval Inbox**

```bash
git add apps/console/src apps/api/src/modules/agentic
git commit -m "feat(console): add agentic approval inbox"
```

### Task 6: Read-only Digital Employee visibility

**Files:**

- Modify: `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Create: `apps/console/src/features/agentic/schemas/agentic-workforce-api.schema.ts`
- Modify: `apps/console/src/features/agentic/api/agentic-api.ts`
- Modify: `apps/console/src/features/agentic/types/agentic.types.ts`
- Create: `apps/console/src/features/agentic/hooks/use-agentic-employees.ts`
- Create: `apps/console/src/features/agentic/components/employee-table.tsx`
- Create: `apps/console/src/features/agentic/components/employee-governance-panel.tsx`
- Create: `apps/console/src/features/agentic/pages/agentic-employees-page.tsx`
- Create: `apps/console/src/features/agentic/pages/agentic-employee-detail-page.tsx`
- Create: `apps/console/src/features/agentic/tests/agentic-employees-page.test.tsx`
- Modify: `apps/console/src/features/agentic/index.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`

- [ ] **Step 1: Write failing employee projection tests**

Assert exactly AI CEO plus six Department profiles, configuration and
revocation status, models, tools, data scope, budgets, bounded recent run
summary, evidence timestamp, and no secret or mutation field:

```ts
expect(await service.getEmployee("inventory", auditor)).toMatchObject({
  kind: "inventory",
  governance: { active: true, revoked: false },
  executionHealth: { basis: "recent_runs", freshness: expect.any(String) },
});
expect(JSON.stringify(await service.getEmployee("inventory", auditor)))
  .not.toMatch(/secret|credential|clientSecret|prompt/i);
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/agentic-console.service.test.ts
```

Expected: FAIL because governance detail and recent-run projection are absent.

- [ ] **Step 3: Implement employee read models**

Extend `GET /employees/:agentKind` with a purpose-specific DTO. Derive
`executionHealth` from configuration, active revocation, and recent terminal
run evidence; include its basis and refreshed time, and never label it a worker
heartbeat. Keep every employee route read-only.

```ts
export interface AgenticEmployeeDetailDto {
  readonly kind: AgentKind;
  readonly department: string;
  readonly governance: { readonly active: boolean; readonly revoked: boolean; readonly configurationVersion: number };
  readonly models: { readonly primary: string; readonly fallbacks: readonly string[] };
  readonly tools: readonly { readonly name: string; readonly version: number; readonly dataScope: string }[];
  readonly budgets: { readonly taskCostMicros: number; readonly dailyCostMicros: number; readonly monthlyCostMicros: number };
  readonly executionHealth: { readonly state: "available" | "revoked" | "degraded" | "unknown"; readonly basis: string; readonly freshness: string };
  readonly recentRuns: readonly { readonly taskId: string; readonly state: string; readonly settledCostMicros: number; readonly completedAt?: string }[];
}
```

- [ ] **Step 4: Write the failing Console employee test**

The component test must prove role access for all five Agentic staff roles,
deep link refresh, seven profiles, mobile record layout, no chat affordance,
and no edit/model/tool/budget controls.

- [ ] **Step 5: Run the Console test and verify failure**

```bash
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-employees-page.test.tsx
```

Expected: FAIL because the employee pages are absent.

- [ ] **Step 6: Implement the Console employee pages**

Implement list and detail through the feature public API. Add the Employees
navigation item for the complete workforce-reader role set.

```ts
listEmployees(signal?: AbortSignal): Promise<readonly AgenticEmployeeSummary[]>;
loadEmployee(agentKind: AgentKind, signal?: AbortSignal): Promise<AgenticEmployeeDetail>;
```

- [ ] **Step 7: Run the slice tests**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/agentic-console.service.test.ts
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-employees-page.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit employee visibility**

```bash
git add apps/api/src/modules/agentic apps/console/src
git commit -m "feat(console): show digital employee governance"
```

### Task 7: Backend-filtered Agentic audit explorer

**Files:**

- Modify: `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `apps/console/src/features/agentic/schemas/agentic-workforce-api.schema.ts`
- Modify: `apps/console/src/features/agentic/api/agentic-api.ts`
- Modify: `apps/console/src/features/agentic/types/agentic.types.ts`
- Create: `apps/console/src/features/agentic/hooks/use-agentic-audit.ts`
- Create: `apps/console/src/features/agentic/components/audit-filter-bar.tsx`
- Create: `apps/console/src/features/agentic/components/audit-table.tsx`
- Create: `apps/console/src/features/agentic/components/audit-detail.tsx`
- Create: `apps/console/src/features/agentic/pages/agentic-audit-page.tsx`
- Create: `apps/console/src/features/agentic/tests/agentic-audit-page.test.tsx`
- Modify: `apps/console/src/features/agentic/index.ts`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`

- [ ] **Step 1: Write failing backend pagination and isolation tests**

Replace the unpaginated audit response with a purpose-specific page and strict
filters:

```ts
export interface AgenticAuditFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly actorId?: string;
  readonly action?: string;
  readonly outcome?: "allowed" | "denied" | "failed";
  readonly resourceType?: string;
  readonly occurredFrom?: string;
  readonly occurredTo?: string;
}

export interface AgenticAuditPageDto {
  readonly items: readonly AgenticAuditEventDto[];
  readonly totalItems: number;
  readonly refreshedAt: string;
}
```

Prove governance admins receive only governance resource types, auditors
receive their broader approved set, administrators receive all, operators and
approvers receive zero data, and date boundaries use stable `(occurred_at,id)`
ordering.

- [ ] **Step 2: Run the backend tests and verify failure**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agentic-console.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
```

Expected: FAIL because audit pagination and filters are absent.

- [ ] **Step 3: Implement backend-filtered audit pagination**

Validate all filters with Zod, apply role resource scopes before the repository
query, return total count from the same read-only transaction, and map only
safe metadata. Do not fetch a broad result and redact it in the browser.

```ts
listConsoleAudit(
  session: DatabaseSession,
  filter: AgenticAuditRepositoryFilter,
): Promise<{ readonly items: readonly AuditEventRecord[]; readonly totalItems: number }>;
```

- [ ] **Step 4: Write the failing Console audit test**

Test URL-backed filters, refresh, back/forward navigation, empty/denied/error
states, metadata drawer focus, absence of sensitive bodies, and desktop/mobile
expectations against a fake `AgenticApi`.

- [ ] **Step 5: Run the Console test and verify failure**

```bash
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-audit-page.test.tsx
```

Expected: FAIL because the audit explorer is absent.

- [ ] **Step 6: Implement the Console audit explorer**

Implement desktop table and mobile record list from one mapped view model. Add
the Audit navigation item only for administrator, governance-admin, and auditor
roles.

```ts
listAudit(filter: AgenticAuditFilter, signal?: AbortSignal): Promise<AgenticAuditPage>;
```

- [ ] **Step 7: Run the slice tests**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/agentic-console.service.test.ts
pnpm --filter @opendx/console exec vitest run src/features/agentic/tests/agentic-audit-page.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the audit explorer**

```bash
git add apps/api/src/modules/agentic apps/console/src
git commit -m "feat(console): add agentic audit explorer"
```

### Task 8: Responsive browser acceptance and Phase G exit gate

**Files:**

- Create: `scripts/dev/agentic-console-browser-check.mjs`
- Create: `scripts/dev/agentic-console-browser-check.test.mjs`
- Create: `scripts/dev/agentic-phase-g-exit-check.mjs`
- Create: `scripts/dev/agentic-phase-g-exit-check.test.mjs`
- Modify: `package.json`
- Modify: `apps/console/src/shared/styles/globals.css`
- Modify: `docs/api/agentic.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing static exit-gate tests**

Require the exact routes, role guards, runtime schemas, no Memory route,
idempotency migration, operations projection, browser script, API docs, build
command, and roadmap entry:

```js
test("Phase G owns the approved Console boundary", () => {
  const snapshot = collectAgenticPhaseG();
  assert.match(snapshot.router, /agentic\/tasks/);
  assert.match(snapshot.shell, /Digital Workforce/);
  assert.doesNotMatch(snapshot.router, /agentic\/memory/);
  assert.match(snapshot.apiRoutes, /tasks\/overview/);
  assert.match(snapshot.apiRoutes, /tasks\/:taskId\/operations/);
  assert.match(snapshot.buildDocs, /check:agentic-phase-g-exit/);
});
```

- [ ] **Step 2: Run the static gate and verify failure**

```bash
node --test scripts/dev/agentic-phase-g-exit-check.test.mjs
```

Expected: FAIL because the Phase G scripts and commands do not exist.

- [ ] **Step 3: Implement deterministic browser acceptance**

Use the local Compose Console/API/Keycloak/Temporal topology and deterministic
fake model/tool path. The browser runner must:

1. sign in as operator, governance admin, approver, auditor, and unauthorized
   Commerce-only staff using environment-provided development credentials;
2. create one Store Health task and replay the request with one resulting ID;
3. upload one safe CSV/TXT file, preview it, replay approval, and observe one
   draft task;
4. start and follow six branches, approval wait, worker restart, partial result,
   and settled report;
5. verify deep-link refresh, stale-version recovery, simulated lost response,
   duplicate click protection, and role denial;
6. verify keyboard focus and no document overflow at 390x844, 768x1024, and
   1440x900;
7. verify there is no Memory link, chat affordance, raw prompt/provider body,
   or Commerce mutation control.

Write redacted evidence only to an ignored `/tmp/opendx-agentic-phase-g-*`
directory. Never persist access tokens, task bodies, report bodies, or uploaded
content.

The runner's bounded route probe follows the existing CDP pattern:

```js
for (const viewport of viewports) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 1,
    mobile: viewport.width < 700,
  });
  for (const route of approvedAgenticRoutes) {
    await client.send("Page.navigate", { url: `${consoleUrl}${route.path}` });
    await waitForHeading(client, route.heading);
    await assertNoOverflowOrHiddenFocus(client, viewport);
  }
}
```

- [ ] **Step 4: Add package commands and composed exit gate**

Add:

```json
{
  "test:agentic-console-browser": "node --test scripts/dev/agentic-console-browser-check.test.mjs",
  "check:agentic-console-browser": "pnpm test:agentic-console-browser && node scripts/dev/agentic-console-browser-check.mjs",
  "test:agentic-phase-g-exit": "node --test scripts/dev/agentic-phase-g-exit-check.test.mjs",
  "check:agentic-phase-g-exit": "pnpm test:agentic-phase-g-exit && node scripts/dev/agentic-phase-g-exit-check.mjs"
}
```

The Phase G exit runner composes focused API/Console tests, migration lifecycle,
Phase F deterministic acceptance, Console browser acceptance, repository audit,
and `git diff --check`. It must fail closed when required services are absent.

- [ ] **Step 5: Update public and contributor documentation**

Document every staff route, request header, role, safe response field,
pagination rule, error code, idempotency replay, polling behavior, and exact
commands in `docs/api/agentic.md` and `docs/build-from-source.md`. Update README
to remove “Agentic Console remains later,” update roadmap only after evidence,
and add a concise `[Unreleased]` changelog entry. Keep Phase G status “In
progress” until all gates pass.

- [ ] **Step 6: Run focused and broad validation**

Run:

```bash
pnpm test:agentic-phase-g-exit
pnpm --filter @opendx/api test
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api test:integration
VITEST_MAX_WORKERS=1 pnpm --filter @opendx/console test
pnpm --filter @opendx/console build
pnpm check:agentic-phase-g-exit
VITEST_MAX_WORKERS=1 pnpm check:full
git diff --check
pnpm audit:repo
```

Expected: every command passes. If the host cannot run the full gate, record
the exact skipped command and do not mark Phase G complete.

- [ ] **Step 7: Mark Phase G complete only from fresh evidence**

Update the design status, roadmap exit decision, and changelog with the actual
test counts, browser dimensions, restart evidence, and commit range. Do not
copy counts from an earlier phase.

- [ ] **Step 8: Commit the acceptance closure**

```bash
git add scripts/dev package.json docs README.md CHANGELOG.md apps/console/src/shared/styles/globals.css
git commit -m "feat(agentic): close phase g console delivery"
```

## Final Review Checklist

- Every Console payload is runtime-validated before mapping.
- Every role and resource boundary is enforced before backend data access.
- Task/file intake replay is exact and changed-input reuse fails closed.
- Timeline, branch, cost, approval, provenance, and report state come from one
  authoritative staff projection.
- Polling pauses, aborts, backs off, and terminates deterministically.
- Approval and cancel controls refetch after ambiguous responses.
- Employee pages are read-only and do not imply a worker heartbeat.
- Audit filtering occurs in the backend, never through browser redaction.
- Mobile, tablet, desktop, keyboard, focus, reduced-motion, and denial states
  pass acceptance.
- Company Memory, schedules, GraphRAG, chat, Commerce mutation, and new
  dependencies remain absent.
