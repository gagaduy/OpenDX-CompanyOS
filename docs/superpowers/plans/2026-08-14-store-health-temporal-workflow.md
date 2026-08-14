<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Store Health Temporal Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase B's production-candidate, restart-safe
`StoreHealthReviewWorkflowV1` with explicit human start, durable Temporal
orchestration, deterministic fake activities, approval and cancellation
signals, PostgreSQL projections, workload authentication, and complete
single-VPS backup/restore coverage.

**Architecture:** PostgreSQL remains authoritative for Agentic tasks,
approvals, workflow-run projections, activity outcomes, signal receipts,
audit, and provenance. Express owns authorization and those mutations behind
application services; its inward-facing `WorkflowGateway` uses an
authenticated HTTP adapter to the Python AI Runtime. The AI Runtime owns the
Temporal client, immutable workflow definition, activity worker, and
authenticated callback client. Temporal Server owns durable history, timers,
retry, task queues, fan-out/fan-in, and signals in separate `temporal` and
`temporal_visibility` databases.

**Tech Stack:** Node.js 22, strict TypeScript, Express 5, Zod 4, PostgreSQL 18,
`pg`, `node-pg-migrate`, Vitest, Supertest, Python 3.13, FastAPI, `httpx`,
`temporalio==1.30.0`, `PyJWT[crypto]==2.13.0`, Pytest, Temporal Server 1.31.2,
Keycloak, Docker Compose, and pnpm 11.

**Approved design:**
`docs/superpowers/specs/2026-08-14-store-health-temporal-workflow-design.md`

## Implementation Rules

- [ ] Work in the current approved feature branch based on `develop`; do not
  edit `main`.
- [ ] Follow RED-GREEN-REFACTOR in every task: add the named test, run it and
  observe the intended failure, implement only the required behavior, then run
  the focused passing gate.
- [ ] Keep Phase B deterministic. Do not add OpenRouter, Commerce read tools,
  file parsing, Company Memory, Console UI, Agent execution, or Commerce writes.
- [ ] Keep workflow payloads to IDs, digests, enum values, and immutable version
  numbers. Never put credentials, task bodies, prompts, customer/payment PII,
  or unrestricted activity results in Temporal history.
- [ ] Published workflow type `StoreHealthReviewWorkflowV1`, workflow version
  `1`, and task queue `store-health-v1` are immutable after release.
- [ ] Use stable IDs and PostgreSQL uniqueness for start commands, activity
  invocations, and signals. Network retries must return the existing result.
- [ ] Add an SPDX header to every new source, test, script, migration, and
  documentation file.
- [ ] Update `CHANGELOG.md` under `[Unreleased]` in the same commit as the
  observable change. Do not defer all changelog work to the last task.
- [ ] Use the exact pinned Temporal image indexes:
  `temporalio/server:1.31.2@sha256:b5ecdb8282bededae2a10c36e8d862e27d0bc2d247fc73c5416025997ab4a1da`
  and
  `temporalio/admin-tools:1.31.2@sha256:dbc5fcd6ee8f0f4d808bf765af9a87dea9d8a283abfdcfbd2fc148496ba66107`.
- [ ] Never use `temporalio/auto-setup`, `temporal server start-dev`, a public
  Temporal port, committed private keys, or placeholder production secrets.

## Stable Contracts

Create `apps/api/src/modules/agentic/domain/entities/workflow-run.ts` with the
following public domain vocabulary:

```ts
export const WORKFLOW_NAME = "StoreHealthReviewWorkflowV1" as const;
export const WORKFLOW_VERSION = 1 as const;

export type WorkflowRunState =
  | "received"
  | "planning"
  | "awaiting_plan_approval"
  | "dispatching"
  | "department_analysis"
  | "quality_review"
  | "collaboration"
  | "executive_synthesis"
  | "awaiting_human_approval"
  | "retrying"
  | "partially_completed"
  | "failed"
  | "canceled"
  | "completed";

export type WorkflowOutcomeCode =
  | "COMPLETED"
  | "PARTIAL_ACTIVITY_FAILURE"
  | "APPROVAL_REJECTED"
  | "APPROVAL_EXPIRED"
  | "CANCELED_BY_STAFF"
  | "RETRY_EXHAUSTED"
  | "INVALID_FROZEN_PLAN";

export interface WorkflowRun {
  readonly id: string;
  readonly taskId: string;
  readonly workflowName: typeof WORKFLOW_NAME;
  readonly workflowVersion: typeof WORKFLOW_VERSION;
  readonly planRevision: number;
  readonly temporalWorkflowId: string;
  readonly temporalRunId?: string;
  readonly state: WorkflowRunState;
  readonly projectionSequence: number;
  readonly outcomeCode?: WorkflowOutcomeCode;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export type ActivityInvocationState = "reserved" | "completed" | "failed";
export type WorkflowSignalKind = "approval" | "cancellation";
export type CommandDeliveryState = "pending" | "delivered" | "rejected";
```

The Express application port in
`application/workflows/interfaces/workflow-gateway.ts` is fixed as:

```ts
export interface WorkflowGateway {
  start(input: StartWorkflowCommand): Promise<WorkflowGatewayStartResult>;
  signalApproval(input: ApprovalWorkflowSignal): Promise<void>;
  signalCancellation(input: CancellationWorkflowSignal): Promise<void>;
  describe(temporalWorkflowId: string): Promise<WorkflowGatewayDescription>;
}
```

The staff API surface is:

```text
POST /v1/admin/agentic/tasks/:taskId/start
GET  /v1/admin/agentic/workflow-runs/:runId
POST /v1/admin/agentic/workflow-runs/:runId/cancel
POST /v1/admin/agentic/approvals/:approvalId/decision  (existing, extended)
```

The workload-only Express surface is:

```text
GET  /v1/internal/agentic/workflow-runs/:runId/plan
POST /v1/internal/agentic/workflow-runs/:runId/state
POST /v1/internal/agentic/activity-invocations/reserve
POST /v1/internal/agentic/activity-invocations/:invocationKey/complete
POST /v1/internal/agentic/activity-invocations/:invocationKey/fail
```

The workload-only AI Runtime surface is:

```text
POST /internal/agentic/workflow-runs/start
POST /internal/agentic/workflow-runs/:workflowId/signals/approval
POST /internal/agentic/workflow-runs/:workflowId/signals/cancellation
GET  /internal/agentic/workflow-runs/:workflowId
```

## Task 1: Pin Runtime Dependencies and Parse AI Runtime Configuration

**Files:**

- Modify: `services/ai-runtime/pyproject.toml`
- Create: `services/ai-runtime/app/shared/config.py`
- Create: `services/ai-runtime/tests/shared/test_config.py`
- Modify: `docs/dependencies.md`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

- [x] Write configuration tests first. Cover local plaintext configuration,
  production TLS configuration, missing client credentials, invalid URL,
  invalid duration, and production rejection of plaintext Temporal transport.

```py
def test_production_requires_temporal_tls_material(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("TEMPORAL_ADDRESS", "temporal:7233")
    monkeypatch.setenv("TEMPORAL_TLS_ENABLED", "false")

    with pytest.raises(ConfigurationError, match="TEMPORAL_TLS_ENABLED"):
        RuntimeSettings.from_environment()
```

- [x] Run `cd services/ai-runtime && python3 -m pytest
  tests/shared/test_config.py -q` and confirm it fails because the parser does
  not exist.
- [x] Add exact direct dependencies `temporalio==1.30.0` and
  `PyJWT[crypto]==2.13.0`. Verify the repository's editable install and Docker
  build both resolve those exact pins; do not add a second dependency file or
  `pytest-asyncio`.
- [x] Implement immutable settings for `APP_ENV`, bind host/port, Keycloak
  issuer/JWKS/audiences/client credentials, API base URL, Temporal address,
  namespace, task queue, TLS CA/cert/key/server name, activity timeouts,
  shutdown grace, and command retry interval. Reject unknown environments,
  empty secrets, unsafe production HTTP URLs, and incomplete TLS triplets.
- [x] Document MIT licenses, PyJWT's MIT license, published-wheel source-build
  boundary, and the fact that Temporal Server is consumed as a pinned upstream
  image.
- [x] Run the focused test, then `pnpm test:py`, `git diff --check`, and
  `pnpm audit:repo`.
- [x] Commit: `feat(ai-runtime): add temporal runtime configuration`

## Task 2: Define Workflow Domain State and Persist It Transactionally

**Files:**

- Create: `apps/api/src/modules/agentic/domain/entities/workflow-run.ts`
- Create: `apps/api/src/modules/agentic/domain/services/workflow-run-rules.ts`
- Create: `apps/api/src/modules/agentic/domain/services/workflow-run-rules.test.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608140017_create_agent_workflow_control.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

- [x] Write domain tests for the exact allowed state graph. Terminal states are
  immutable. A transition to `completed`, `partially_completed`, `failed`, or
  `canceled` requires its matching safe outcome code and `completedAt`.
  `retrying` must return only to the state recorded as `resumeState`.
- [x] Run the new domain test and observe failure.
- [x] Implement pure transition functions with no database, clock, HTTP, or
  Temporal imports.
- [x] Extend the migration test first, including an `up -> constraints -> down
  -> up` cycle and direct SQL rejection cases.
- [x] Create these tables with explicit relational constraints:

```text
agentic_workflow_runs
  id uuid primary key
  task_id uuid not null references agent_tasks(id)
  workflow_name text check (= 'StoreHealthReviewWorkflowV1')
  workflow_version integer check (= 1)
  plan_revision integer check (> 0)
  temporal_workflow_id text unique not null
  temporal_run_id text unique null
  state text check (allowed state union)
  projection_sequence integer check (>= 0)
  resume_state text null check (nonterminal non-retrying state)
  outcome_code text null check (allowed outcome union)
  version integer check (> 0)
  created_at/updated_at timestamptz not null
  completed_at timestamptz null
  unique (task_id, workflow_name, workflow_version, plan_revision)

agentic_activity_invocations
  invocation_key text primary key
  workflow_run_id uuid references agentic_workflow_runs(id)
  activity_kind text check (approved Phase B activity names)
  branch_id uuid null references agentic_subtasks(id)
  input_digest text check (64 lowercase hex characters)
  state text check (reserved/completed/failed)
  outcome_code text null
  safe_result jsonb null check (object and <= 16384 bytes)
  version integer check (> 0)
  created_at/updated_at/completed_at timestamptz

agentic_workflow_signal_receipts
  id uuid primary key
  workflow_run_id uuid references agentic_workflow_runs(id)
  signal_kind text check (approval/cancellation)
  idempotency_key text unique not null
  approval_id uuid null references agentic_approval_requests(id)
  payload_digest text check (64 lowercase hex characters)
  decision text null check (approved/rejected)
  application_decision_version integer null
  delivery_state text check (pending/delivered/rejected)
  accepted boolean null
  reason_code text null
  created_at/delivered_at timestamptz
```

- [x] Add a partial unique index permitting only one nonterminal run per task,
  indexes for pending signal delivery and run state, and check constraints that
  require approval fields only for approval signals. Keep audit and provenance
  in the existing append-only tables.
- [x] Set `plan_revision` to the task version produced by the successful
  `ready` transition. Use `ON DELETE RESTRICT` from runs to tasks and from
  signal receipts to approvals; no Phase B API deletes workflow records.
  Retain runs, invocation outcomes, receipts, audit, and provenance for the
  life of the owning task until a separately approved retention/deletion
  policy exists.
- [x] Add repository transaction methods to create/get/list runs, compare-and-
  swap state, attach Temporal run ID, reserve/complete/fail an invocation,
  create/deliver/reject signal receipts, list pending commands, and load the
  immutable task/subtask dependency snapshot.
- [x] State projection accepts a monotonic `projectionSequence`. An equivalent
  repeated sequence is an idempotent read, a conflicting repeated sequence is
  rejected, and a lower sequence can never overwrite a newer or terminal
  projection.
- [x] Repository tests must prove duplicate start convergence, stable
  invocation replay, conflicting digest rejection, stale version rejection,
  duplicate signal convergence, rollback of mutation plus audit, and terminal
  immutability.
- [x] Raise the Agentic readiness migration minimum from `2` to `3`.
- [x] Run `pnpm --filter @opendx/api test -- workflow-run-rules`, then the two
  focused integration test files against the test database, then API lint and
  typecheck.
- [x] Commit: `feat(agentic): persist durable workflow control state`

## Task 3: Add the Express Workflow Application Boundary

**Files:**

- Create: `apps/api/src/modules/agentic/application/workflows/interfaces/workflow-gateway.ts`
- Create: `apps/api/src/modules/agentic/application/services/interfaces/workflow-run.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/workflow-run.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/workflow-run.service.test.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/workflow-command-dispatcher.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/workflow-command-dispatcher.test.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/approval.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/approval.service.test.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agent-task.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agent-task.service.test.ts`
- Modify: `CHANGELOG.md`

- [x] Create failing service tests with in-memory fakes for repositories,
  transactions, clocks, IDs, and `WorkflowGateway`.
- [x] Cover start validation: staff authority, `ready` state, expected version,
  pinned active configuration, no emergency revocation, frozen graph,
  supported version, and one active run. The stable Temporal workflow ID is
  `store-health-v1:<runId>`.
- [x] At start, evaluate the fixed `agentic.workflow.complete` action with the
  existing deterministic Phase A policy service. Freeze `ALLOW` or
  `REQUIRE_APPROVAL` plus policy version into the plan snapshot; for
  `REQUIRE_APPROVAL`, create the version/digest-bound approval request in the
  same transaction as the run. A policy `DENY` rejects start. Tests configure
  this policy through the existing governance service, never through a hidden
  scenario flag or direct production SQL.
- [x] Cover the acknowledgement-loss sequence: transaction creates `received`
  run plus `agentic.workflow.start.accepted` audit; gateway starts it; attach
  Temporal run ID. When the gateway times out, return an accepted run with
  pending dispatch and let the dispatcher retry the identical workflow ID.
- [x] Implement `WorkflowRunService` with these methods:

```ts
export interface WorkflowRunService {
  start(input: StartWorkflowInput, principal: StaffPrincipal): Promise<WorkflowRun>;
  get(runId: string, principal: StaffPrincipal): Promise<WorkflowRun>;
  cancel(input: CancelWorkflowInput, principal: StaffPrincipal): Promise<WorkflowRun>;
  projectState(input: ProjectWorkflowStateInput, principal: WorkloadPrincipal): Promise<WorkflowRun>;
  loadPlan(runId: string, principal: WorkloadPrincipal): Promise<FrozenWorkflowPlan>;
  reserveActivity(input: ReserveActivityInput, principal: WorkloadPrincipal): Promise<ActivityReservation>;
  completeActivity(input: CompleteActivityInput, principal: WorkloadPrincipal): Promise<ActivityInvocation>;
  failActivity(input: FailActivityInput, principal: WorkloadPrincipal): Promise<ActivityInvocation>;
}
```

- [x] `cancel` creates a stable cancellation receipt and audit in one
  transaction, rejects terminal runs, and dispatches after commit. Keep the
  existing task cancel operation for draft/ready tasks only; make it reject a
  task that already has a nonterminal workflow run.
- [x] Extend approval decision transactionally: only an approval bound to the
  run, workflow version, plan revision, payload digest, policy version, and
  unexpired state creates a pending signal receipt. Replays with the same
  decision converge; conflicting decisions fail. Deliver only after commit.
- [x] Both signal DTOs carry the PostgreSQL receipt ID as `idempotencyKey`.
  Workflow state retains a bounded set of handled receipt IDs so delivery after
  an acknowledgement loss is a deterministic no-op, while a conflicting
  payload digest under the same ID terminates with a safe mismatch outcome.
- [x] Add a bounded dispatcher with constructor-injected interval, maximum
  batch size, logger callback, `start()`, and `stop()`. It retries pending start
  and signal records; Temporal's stable workflow/signal IDs supply remote
  idempotency. It never changes a business decision because of network failure.
- [x] Run the new service tests, all existing Agentic service tests, API lint,
  and API typecheck.
- [ ] Commit: `feat(agentic): add workflow orchestration services`

## Task 4: Secure and Expose Staff and Workload Express APIs

**Files:**

- Create: `apps/api/src/shared/auth/workload-principal.ts`
- Create: `apps/api/src/shared/auth/workload-auth.middleware.ts`
- Create: `apps/api/src/shared/auth/workload-auth.middleware.test.ts`
- Create: `apps/api/src/modules/agentic/presentation/controllers/agentic-workflow.controller.ts`
- Create: `apps/api/src/modules/agentic/presentation/controllers/agentic-workload.controller.ts`
- Create: `apps/api/src/modules/agentic/presentation/routes/agentic-workload.routes.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.test.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/agentic.module.ts`
- Modify: `apps/api/src/modules/agentic/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `infra/keycloak/realm-export.json`
- Modify: `.env.example`
- Modify: `CHANGELOG.md`

- [x] First write middleware tests verifying signature, issuer, audience,
  expiry, subject, and `azp`/client ID. Accept only
  `opendx-agentic-worker` on Express workload routes. Reject all seven Digital
  Employee clients and every staff token even if it contains an Agentic role.
- [x] Implement a generic workload verifier on top of the existing `jose`
  dependency. It returns a `WorkloadPrincipal`; it must not reuse
  `AgentServicePrincipal` or `StaffPrincipal`.
- [x] Add failing API tests for every staff and workload route, invalid UUIDs,
  unknown fields, body limits, optimistic conflicts, cross-boundary tokens,
  duplicate start, duplicate completion, invalid digest, and safe error
  responses. Assert denied requests append the existing audit shape without
  token or request-body content.
- [x] Add Zod schemas with `.strict()` and bounded strings/arrays. The start
  request is exactly `{ expectedVersion: positiveInteger, workflowVersion: 1
  }`; cancellation includes `expectedVersion` and a bounded reason code, not
  free-form notes.
- [x] Extend the existing approval decision controller to call the workflow-
  aware approval service; do not add a second public approval decision route.
- [x] Return `202` for accepted start/cancel/signal delivery, `200` for reads
  and idempotent replays, `409` for stale/conflicting versions, `422` for valid
  syntax with invalid binding, and the existing API error envelope.
- [x] Mount the staff router under the existing
  `/v1/admin/agentic` path and a separate router under
  `/v1/internal/agentic`. Do not apply browser CORS to the internal router.
- [x] Add confidential Keycloak clients `opendx-agentic-control` and
  `opendx-agentic-worker`, service accounts, fixed audiences, and no staff or
  Digital Employee roles. Keep client secrets environment-supplied; the realm
  export must contain no production secret.
- [x] Compose `WorkflowRunService`, the dispatcher, workload verifier, and
  routers in `agentic.module.ts`/`server.ts`; stop the dispatcher during normal
  server shutdown.
- [x] Extend API readiness with a bounded workflow-gateway probe only when
  Agentic execution is enabled. Gateway failure closes readiness but leaves
  process liveness healthy.
- [x] Run middleware tests, Agentic API tests, Agentic integration tests,
  `pnpm --filter @opendx/api lint`, and `pnpm --filter @opendx/api typecheck`.
- [ ] Commit: `feat(api): expose authenticated workflow control endpoints`

## Task 5: Implement the Authenticated Express-to-AI Runtime Gateway

**Files:**

- Create: `apps/api/src/shared/auth/client-credentials-token-provider.ts`
- Create: `apps/api/src/shared/auth/client-credentials-token-provider.test.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/workflows/http-workflow.gateway.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/workflows/http-workflow.gateway.test.ts`
- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `apps/api/src/modules/agentic/agentic.module.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `CHANGELOG.md`

- [x] Write token-provider tests for short-lived token acquisition, audience,
  URL-encoded client-credentials form, expiration-aware cache, concurrent
  refresh coalescing, non-2xx response, malformed response, and redacted error.
- [x] Write gateway tests using a local fake HTTP server. Assert bearer token,
  correlation/idempotency headers, exact DTO mapping, request timeout, bounded
  response size, retryable transport classification, non-retryable 4xx, and no
  secret/body leakage in errors.
- [x] Implement `ClientCredentialsTokenProvider` with injected `fetch`, clock,
  and skew. Implement `HttpWorkflowGateway` with injected token provider,
  timeout, base URL, and logger.
- [x] Extend API environment parsing with control client ID/secret/audience,
  token URL, AI Runtime internal URL, timeout, dispatcher interval, and batch
  size. Production rejects HTTP except for a Docker-network hostname explicitly
  selected by the production Compose contract; external/public URLs require
  HTTPS.
- [x] Wire local and production environment names only. Do not start Temporal
  services yet; Compose must still validate with the new required variables.
- [x] Run the two focused tests, API config tests, API lint/typecheck, both
  Compose config commands, `pnpm audit:env`, and `pnpm audit:secrets`.
- [ ] Commit: `feat(agentic): add authenticated workflow gateway`

## Task 6: Build AI Runtime Workload Identity and Agentic Control Client

**Files:**

- Create: `services/ai-runtime/app/agentic/__init__.py`
- Create: `services/ai-runtime/app/agentic/domain/__init__.py`
- Create: `services/ai-runtime/app/agentic/domain/contracts.py`
- Create: `services/ai-runtime/app/agentic/application/__init__.py`
- Create: `services/ai-runtime/app/agentic/application/ports.py`
- Create: `services/ai-runtime/app/agentic/infrastructure/__init__.py`
- Create: `services/ai-runtime/app/agentic/infrastructure/keycloak.py`
- Create: `services/ai-runtime/app/agentic/infrastructure/agentic_control_client.py`
- Create: `services/ai-runtime/app/agentic/presentation/__init__.py`
- Create: `services/ai-runtime/app/agentic/presentation/workload_auth.py`
- Create: `services/ai-runtime/tests/agentic/infrastructure/test_keycloak.py`
- Create: `services/ai-runtime/tests/agentic/infrastructure/test_agentic_control_client.py`
- Create: `services/ai-runtime/tests/agentic/presentation/test_workload_auth.py`
- Modify: `CHANGELOG.md`

- [x] Define frozen dataclasses and enums for `StoreHealthReviewInput`,
  `ApprovalSignal`, `CancellationSignal`, `FrozenWorkflowPlan`, plan nodes,
  activity reservation/results, state projection, and safe outcome codes.
  Reject unbounded strings and unknown enum values at HTTP deserialization.
- [x] Write JWT verifier tests using an ephemeral RSA key. Check issuer,
  audience, subject, expiration, algorithm allow-list, and authorized client.
  AI Runtime control endpoints accept only `opendx-agentic-control`.
- [x] Write token-provider and callback-client tests equivalent to the
  TypeScript boundary: short-lived client-credentials tokens for
  `opendx-agentic-worker`, expiry-aware cache, exact request DTOs, stable
  invocation key headers, timeouts, bounded responses, and redacted errors.
- [x] Implement the ports first, then infrastructure adapters. HTTP adapters
  may use `httpx`; domain/application modules must not import FastAPI, JWT,
  Temporal, environment variables, or `httpx`.
- [x] Run all three focused test files, `python3 -m compileall app`, and the
  entire Python suite.
- [ ] Commit: `feat(ai-runtime): add authenticated agentic control client`

## Task 7: Implement and Replay-Test StoreHealthReviewWorkflowV1

**Files:**

- Create: `services/ai-runtime/app/agentic/workflows/__init__.py`
- Create: `services/ai-runtime/app/agentic/workflows/store_health_review_v1.py`
- Create: `services/ai-runtime/app/agentic/activities/__init__.py`
- Create: `services/ai-runtime/app/agentic/activities/store_health_activities.py`
- Create: `services/ai-runtime/tests/agentic/workflows/test_store_health_review_v1.py`
- Create: `services/ai-runtime/tests/agentic/workflows/test_store_health_replay.py`
- Create: `services/ai-runtime/tests/agentic/workflows/histories/store_health_success_v1.json`
- Create: `services/ai-runtime/tests/agentic/workflows/histories/store_health_approval_v1.json`
- Create: `services/ai-runtime/tests/agentic/workflows/histories/store_health_retry_v1.json`
- Create: `services/ai-runtime/tests/agentic/workflows/histories/store_health_partial_v1.json`
- Create: `services/ai-runtime/tests/agentic/workflows/histories/store_health_canceled_v1.json`
- Modify: `CHANGELOG.md`

- [ ] Write time-skipping workflow tests first with an injected activity set.
  Use `asyncio.run` from ordinary Pytest tests instead of adding an async test
  plugin.
- [ ] Test the exact normal path:

```text
received -> planning -> [awaiting_plan_approval] -> dispatching
-> department_analysis -> quality_review -> collaboration
-> executive_synthesis -> [awaiting_human_approval] -> completed
```

- [ ] Test dependency-aware fan-out/fan-in, unrelated branch continuation,
  partial completion, retryable failure with bounded exponential backoff,
  non-retryable business failure, timeout, retry exhaustion, approval resume,
  rejection, expiration via workflow timer, stale/duplicate signal,
  cancellation during an activity, and cancellation while awaiting approval.
- [ ] Implement workflow dataclasses and one immutable workflow class. Workflow
  code may call only Temporal workflow APIs, execute named activities, wait on
  signals/timers, and combine immutable results. It must not import `httpx`,
  JWT, settings, `os`, `uuid`, database code, or wall-clock APIs.
- [ ] Implement activities as application adapters over `AgenticControlPort`:
  `load_frozen_plan`, `project_state`, `execute_fake_analysis`,
  `execute_fake_quality_review`, `execute_fake_collaboration`, and
  `execute_fake_synthesis`. Each execution reserves a stable key
  `<runId>:<activityKind>:<branchId-or-root>` and returns a previously stored
  outcome on replay.
- [ ] The production Phase B fake adapter returns bounded structured fixtures
  only. Approval waits come from the frozen Phase A policy decision; retry,
  failure, and bounded delay fixtures exist only in injected test activity
  implementations. Do not expose a production HTTP flag that changes business
  outcomes.
- [ ] Generate the five representative JSON histories from the tests, scrub
  them to bounded identifiers, and replay them with Temporal's replayer. A
  history fixture is versioned test evidence, not a hand-written placeholder.
- [ ] Run workflow tests twice, replay tests, `python3 -m compileall app`, and
  the full Python suite.
- [ ] Commit: `feat(ai-runtime): implement store health workflow v1`

## Task 8: Add AI Runtime Control API and Independently Supervised Worker

**Files:**

- Create: `services/ai-runtime/app/agentic/application/workflow_control.py`
- Create: `services/ai-runtime/app/agentic/infrastructure/temporal_client.py`
- Create: `services/ai-runtime/app/agentic/presentation/router.py`
- Create: `services/ai-runtime/app/agentic/worker.py`
- Create: `services/ai-runtime/app/agentic/observability.py`
- Create: `services/ai-runtime/tests/agentic/application/test_workflow_control.py`
- Create: `services/ai-runtime/tests/agentic/presentation/test_router.py`
- Create: `services/ai-runtime/tests/agentic/test_worker.py`
- Create: `services/ai-runtime/tests/agentic/test_observability.py`
- Modify: `services/ai-runtime/app/create_app.py`
- Modify: `services/ai-runtime/app/main.py`
- Modify: `services/ai-runtime/tests/shared/health/test_health_api.py`
- Modify: `services/ai-runtime/Dockerfile`
- Modify: `CHANGELOG.md`

- [ ] Write application tests for start idempotency, stable workflow ID,
  already-started convergence, describe mapping, approval/cancellation signal
  IDs, Temporal unavailable classification, and response redaction.
- [ ] Implement a Temporal client adapter using namespace `opendx`, task queue
  `store-health-v1`, workflow ID reuse policy that rejects completed duplicates,
  and TLS settings supplied by `RuntimeSettings`.
- [ ] Add authenticated, strict Pydantic endpoints for the four fixed internal
  routes. Start returns the Temporal run ID and idempotent status; signals
  return only after Temporal acknowledges them. Map safe application errors to
  bounded HTTP responses.
- [ ] Split health semantics: `/health` is process liveness; `/ready` checks
  settings, Temporal connection, namespace, and task queue registration without
  starting work. Authentication failures must not affect liveness.
- [ ] Write worker tests with fake Temporal client/control client. Register
  exactly `StoreHealthReviewWorkflowV1` and the Phase B activity names. On
  SIGTERM/SIGINT, stop polling, wait up to configured grace for activities,
  then close HTTP and Temporal clients.
- [ ] Add structured logging and bounded metrics for workflow start, active and
  waiting runs, activity duration/outcome, retry exhaustion, rejected signals,
  worker polling, and terminal outcome. Tests must prove labels exclude task
  text, payloads, tokens, certificates, raw histories, customer/payment data,
  task/run IDs, and other high-cardinality values; IDs remain only in redacted
  structured logs where the approved design permits them.
- [ ] Implement `python -m app.agentic.worker` as a separate container process;
  do not start a background worker inside FastAPI.
- [ ] Ensure the production Docker stage contains the installed pinned Python
  dependencies and both process entrypoints, while the check stage still runs
  all tests.
- [ ] Run focused application/router/worker tests, health tests, full Python
  tests, and build both Docker targets.
- [ ] Commit: `feat(ai-runtime): expose temporal control and worker roles`

## Task 9: Add Real Temporal Services to Local Compose

**Files:**

- Create: `infra/temporal/dynamicconfig/development-sql.yaml`
- Create: `infra/temporal/scripts/create-databases.sh`
- Create: `infra/temporal/scripts/setup-schema.sh`
- Create: `infra/temporal/scripts/register-namespace.sh`
- Create: `scripts/dev/temporal-compose-check.test.mjs`
- Create: `scripts/dev/agentic-workflow-lifecycle-check.mjs`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `Makefile`
- Modify: `package.json`
- Modify: `scripts/dev/check.sh`
- Modify: `.env.example`
- Modify: `CHANGELOG.md`

- [ ] Write static Compose tests first. Assert exact image digests, no
  `auto-setup`, explicit one-shot database/schema/namespace jobs, private
  `7233`, separate databases/role, health-based dependency order, persistent
  state, restart policies, separate FastAPI/worker services, and no Temporal UI.
- [ ] Create idempotent scripts that:
  create the Temporal role plus `temporal` and `temporal_visibility` databases;
  run `temporal-sql-tool` `setup-schema -v 0.0` and `update-schema` against both
  PostgreSQL v12 schema paths; and register namespace `opendx` with reviewed
  retention only when absent. Administrative credentials exist only in these
  one-shot jobs.
- [ ] Add Compose services `temporal-db-init`, `temporal-schema`, `temporal`,
  `temporal-namespace`, `ai-runtime`, and `ai-worker`. Use health conditions so
  the server cannot start before schema success and the worker cannot start
  before namespace plus API/AI Runtime readiness.
- [ ] Keep `7233` exposed to the Compose network only. Add an opt-in CLI command
  such as `make temporal-cli ARGS='workflow list --namespace opendx'` using the
  pinned admin-tools image; do not add a product UI.
- [ ] Add `make check-agentic-workflow` and root
  `pnpm check:agentic-workflow`. The lifecycle script must create/ready/start a
  test task through authenticated APIs, observe state progression, restart the
  AI worker while a deterministic activity is in flight, and verify one
  terminal run plus one outcome per invocation. It must clean only its own test
  records.
- [ ] Extend the lifecycle check to exercise API, AI Runtime, worker, Temporal,
  and PostgreSQL restart separately, including a run waiting for a real bound
  approval. After every restart, assert truthful liveness/readiness and exactly
  one final run. Explicit database grants must revoke public cross-database
  access, grant the application role only `opendx`, grant the Temporal role
  only its two databases, and make both forbidden connection/read probes fail.
- [ ] Run the static test,
  `docker compose -f infra/docker/docker-compose.yml config`, the lifecycle check,
  stop/start the full local stack once, and rerun the lifecycle check.
- [ ] Add the static test to `scripts/dev/check.sh`; keep the live lifecycle
  check opt-in because it requires Docker services and Keycloak.
- [ ] Commit: `feat(infra): run temporal workflow stack locally`

## Task 10: Harden the Single-VPS Production Candidate

**Files:**

- Create: `infra/temporal/dynamicconfig/production-sql.yaml`
- Create: `scripts/dev/agentic-production-compose-check.mjs`
- Create: `scripts/dev/agentic-production-compose-check.test.mjs`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `scripts/dev/production-compose-check.mjs`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `docs/deployment/production.md`
- Modify: `infra/deploy/README.md`
- Modify: `CHANGELOG.md`

- [ ] Write tests that reject public `7233`, plaintext production Temporal
  clients, absent client-auth TLS, committed key material, writable certificate
  mounts, placeholder secrets, `latest` tags, unpinned images, missing resource
  limits, missing health checks, missing restart policies, and accidental UI or
  dev-server services.
- [ ] Add production one-shot schema/namespace jobs and long-running Temporal,
  AI Runtime, and worker roles. Mount CA/server/client material read-only from
  deployment-managed paths. Configure Temporal server TLS with required client
  authentication and configure both Python roles to validate the server name.
- [ ] Set `TEMPORAL_ALLOW_NO_AUTH=true` only inside the private mTLS network
  because mTLS authenticates Temporal clients; keep every workflow business
  action authorized at Express. Document this boundary explicitly.
- [ ] Apply bounded CPU/memory, log rotation, health checks, graceful stop,
  restart policy, read-only filesystems where supported, dropped capabilities,
  and private networks consistent with existing production services. Caddy
  must not route any Temporal or internal Agentic endpoint.
- [ ] Extend the production validator and documentation with secret/certificate
  provisioning, first boot order, schema upgrades, rollback compatibility,
  certificate rotation, worker drain, readiness inspection, and the explicit
  single-node/non-HA limitation.
- [ ] Run both new tests and validators, existing production Compose check,
  rendered production Compose config with non-secret fixtures, environment and
  secret audits, and `git diff --check`.
- [ ] Commit: `feat(deploy): harden temporal single-vps topology`

## Task 11: Back Up and Restore All Three Databases as One Recovery Set

**Files:**

- Modify: `scripts/ops/postgres-backup.sh`
- Modify: `scripts/ops/postgres-restore.sh`
- Modify: `scripts/dev/make-database-backup.test.mjs`
- Modify: `scripts/dev/backup-restore-check.mjs`
- Create: `scripts/dev/agentic-workflow-recovery-check.mjs`
- Modify: `Makefile`
- Modify: `package.json`
- Modify: `docs/operations/backup-restore.md`
- Modify: `docs/deployment/production.md`
- Modify: `infra/deploy/README.md`
- Modify: `CHANGELOG.md`

- [ ] Extend unit tests first. A backup is one timestamped directory containing
  `opendx.dump`, `temporal.dump`, `temporal_visibility.dump`, `manifest.json`,
  and SHA-256 checksums. The manifest records database names, dump format,
  PostgreSQL/Temporal versions, schema migration versions, creation time, and
  file sizes without credentials.
- [ ] Reject missing members, extra database substitutions, checksum mismatch,
  incompatible manifest versions, unsafe paths, ambiguous latest sets, and a
  restore while workflow services are still polling.
- [ ] Change `make db-backup` to stop the public Caddy/Console entry points,
  drain and stop the worker, then stop API/AI Runtime/Temporal in a bounded
  order. Production must not publish the API directly, so closing Caddy
  prevents new staff starts while the still-internal API lets in-flight
  activities drain. Dump all three
  databases from one recovery window, verify each archive with `pg_restore -l`,
  write checksums/manifest atomically, and restart in dependency order even when
  backup verification fails.
- [ ] In local Compose, require exclusive ownership of the development stack,
  stop Console/Storefront before drain, and document that callers must not use
  the published API port during the bounded backup window. Abort if the
  lifecycle/recovery checker lock is held.
- [ ] Change `make db-restore BACKUP=<set-directory>` to verify everything
  before mutation, stop the same services, restore all three databases, run
  Agentic migrations plus explicit Temporal schema compatibility checks,
  register/verify namespace, then start Temporal, API, AI Runtime, worker,
  Console, and Storefront in readiness order. This replaces the existing
  migration-container restart race with explicit waits.
- [ ] Do not silently convert the previously restored single `opendx` dump into
  a complete recovery set. Keep documented legacy restore support behind an
  explicit `ALLOW_OPENDX_ONLY_RESTORE=1` local-only flag and reject it in
  production.
- [ ] The live recovery test must start a run that is waiting for a bound human
  approval, create the recovery set, destroy only the three test databases,
  restore the set, submit the original version-bound approval, and prove one
  completed run, one accepted receipt, one result per invocation, and replayable
  Temporal history.
- [ ] Run backup unit tests, existing backup/restore check, new workflow
  recovery check, `make db-backup`, archive validation, and a real restore from
  the newly created recovery set.
- [ ] Commit: `feat(ops): back up temporal workflow recovery set`

## Task 12: Document Contracts and Close the Phase B Exit Gate

**Files:**

- Modify: `docs/api/agentic.md`
- Create: `docs/architecture/agentic-workflow-runtime.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `README.md`
- Create: `scripts/dev/agentic-phase-b-exit-check.mjs`
- Create: `scripts/dev/agentic-phase-b-exit-check.test.mjs`
- Modify: `package.json`
- Modify: `scripts/dev/check.sh`
- Modify: `CHANGELOG.md`

- [ ] First write a static exit-gate test that fails until all approved Phase B
  artifacts, routes, tables, dependencies, Compose services, security settings,
  backup members, docs, and scripts exist. It must also reject OpenRouter,
  Commerce-tool, Console page, Temporal UI, public 7233, and production SePay
  changes in the Phase B surface.
- [ ] Document request/response examples and error codes for start, run read,
  cancel, approval decision, and internal callback routes. Clearly distinguish
  task state from workflow-run state and PostgreSQL projection from Temporal
  history.
- [ ] Document module ownership, dependency direction, workload identity,
  deterministic workflow restrictions, activity idempotency, retry categories,
  approval/cancellation binding, replay policy, operational health, recovery,
  TLS, and the non-HA single-VPS boundary.
- [ ] Mark Phase B complete in `mvp-status.md` only after the live lifecycle and
  recovery gates pass. Keep Phases C-H explicitly not started.
- [ ] Run the complete fresh gate from the committed tree:

```bash
pnpm install --frozen-lockfile
pnpm audit:repo
pnpm audit:env
pnpm audit:secrets
pnpm lint
pnpm typecheck
pnpm test
pnpm test:py
pnpm check:production-compose
pnpm check:agentic-workflow
pnpm check:backup-restore
pnpm check:agentic-phase-b-exit
pnpm check
git diff --check
git status --short
```

- [ ] Capture the exact successful commands and relevant service/image versions
  in `docs/roadmap/mvp-status.md`. Do not claim completion if a live Docker,
  restart, replay, backup, or restore gate was skipped.
- [ ] Request independent code review. Resolve every Critical and Important
  finding and rerun the affected focused gates plus root `pnpm check`.
- [ ] Commit: `docs(agentic): close durable workflow phase`

## Final Self-Review Checklist

- [ ] Every requirement in the approved design maps to a task and a named test.
- [ ] All new production files and interfaces have exact paths, and every step
  contains complete implementation and validation instructions.
- [ ] TypeScript and Python names agree at both HTTP boundaries, including enum
  spelling, workflow version, task queue, digest encoding, and outcome codes.
- [ ] Start, activity, approval, cancellation, terminal projection, and audit
  are idempotent under duplicate request, lost acknowledgement, and restart.
- [ ] Temporal workflow code is deterministic and representative histories
  replay before deployment.
- [ ] Production rejects insecure Temporal transport and exposes no internal
  endpoint publicly.
- [ ] One recovery set restores `opendx`, `temporal`, and
  `temporal_visibility`, and a waiting workflow resumes exactly once.
- [ ] No Phase C-H runtime behavior or production SePay activation is present.
