<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agent Governance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the PostgreSQL-backed, deny-by-default governance control
plane for seven Digital Employees, non-executing Agentic tasks, two-person
configuration, typed tool grants, budgets, bound approvals, audit, and
provenance.

**Architecture:** Add one feature-first `agentic` module to the TypeScript API.
Domain services own lifecycles and policy; application services coordinate
transactions; a PostgreSQL repository owns persistence; Express exposes only
staff administration routes. Keycloak staff roles and seven confidential
clients remain distinct identity domains. No Python runtime, Temporal,
OpenRouter, commerce read tool, file intake, or Console feature is added.

**Tech Stack:** Node.js 22+, strict TypeScript, Express 5, Zod 4, PostgreSQL 18,
`pg`, `node-pg-migrate`, Keycloak, Vitest, Supertest, Docker Compose, and pnpm
11. No new package dependency is required.

## Global Constraints

- Follow
  `docs/superpowers/specs/2026-08-14-agent-governance-foundation-design.md`
  exactly.
- Work on `phuong`, based on `develop`; do not modify `main`.
- Keep all Phase A behavior in `apps/api/src/modules/agentic/`; split files by
  responsibility inside the feature rather than creating speculative modules.
- PostgreSQL is the only runtime repository. Do not add an in-memory production
  fallback.
- Add migration `202608140015_create_agent_governance.ts` after Support
  migration `202608100014_support_operations_hardening.ts`.
- Add exactly four staff roles: `agentic_operator`, `agentic_approver`,
  `agentic_governance_admin`, and `agentic_auditor`.
- Add exactly seven Keycloak confidential clients: `agent-ai-ceo`,
  `agent-catalog`, `agent-inventory`, `agent-order`, `agent-finance`,
  `agent-crm`, and `agent-support`.
- Do not store client secrets in PostgreSQL, tracked environment files, test
  fixtures, logs, audit metadata, or documentation.
- An Agent service token is not a staff token. Validate its issuer, audience,
  subject, and `azp`/client identity through a separate verifier.
- Policy effects are exactly `ALLOW`, `REQUIRE_APPROVAL`, and `DENY`; current
  emergency revocation wins first, then `DENY`, then `REQUIRE_APPROVAL`, then
  explicit `ALLOW`, and no match means `DENY`.
- Phase A task states are exactly `draft`, `ready`, and `canceled`. It does not
  expose `running` or `completed`.
- Configuration revision states are exactly `draft`, `pending_approval`,
  `active`, `rejected`, and `superseded`.
- Approval states are exactly `pending`, `approved`, `rejected`, and
  `revision_requested`; a pending request past expiry behaves as expired.
- The creator cannot decide their own configuration or action approval,
  regardless of overlapping roles.
- Only `administrator` can activate emergency revocation immediately.
  Governance Admin can create a revocation Approval Request for another
  authorized human.
- Ready tasks pin the active configuration revision. A later activation affects
  only new tasks; current emergency revocation still wins on every subsequent
  authorization.
- Tool descriptors are inert name/version/schema-digest records in Phase A.
  There is no commerce adapter, general query tool, or free-form SQL.
- Model configuration is inert governance data in Phase A. Do not call
  OpenRouter or another provider.
- Budget cost uses integer micros (`costMicros`) and idempotent reservation and
  settlement entries; never use floating point.
- Required audit writes occur in the same transaction as their mutation and
  are append-only. Do not log secrets, tokens, task instructions, policy
  condition bodies, or sensitive payloads.
- Use strict Zod objects and reject unknown fields. Preserve the existing API
  response envelope and correlation middleware.
- Every behavior change follows RED-GREEN-REFACTOR and every implementation
  commit updates `CHANGELOG.md` under `[Unreleased]`.
- Add SPDX headers to every new license-capable file.
- Before completion run focused tests, migration `up -> down -> up`, API unit
  and integration tests, typecheck, `git diff --check`, `pnpm audit:repo`, and
  root `pnpm check`.

## Stable Phase A Types

Use these names consistently across tasks:

```ts
export type AgentKind =
  | "ai_ceo" | "catalog" | "inventory" | "order"
  | "finance" | "crm" | "support";

export type AgenticTaskState = "draft" | "ready" | "canceled";
export type ConfigurationRevisionState =
  | "draft" | "pending_approval" | "active" | "rejected" | "superseded";
export type ApprovalState =
  | "pending" | "approved" | "rejected" | "revision_requested";
export type PolicyEffect = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

export interface PolicyDecision {
  readonly effect: PolicyEffect;
  readonly policyVersion: number;
  readonly reasonCode: string;
  readonly matchedRuleIds: readonly string[];
  readonly evaluatedAt: string;
}
```

---

### Task 1: Staff Roles and Separate Agent Service Authentication

**Files:**

- Modify: `apps/api/src/shared/auth/staff-principal.ts`
- Modify: `apps/api/src/shared/auth/staff-auth.middleware.ts`
- Modify: `apps/api/src/shared/auth/staff-auth.middleware.test.ts`
- Create: `apps/api/src/modules/agentic/application/identity/agent-service-principal.ts`
- Create: `apps/api/src/modules/agentic/presentation/middleware/agent-service-auth.middleware.ts`
- Create: `apps/api/src/modules/agentic/presentation/middleware/agent-service-auth.middleware.test.ts`
- Modify: `infra/keycloak/realm-export.json`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces:

```ts
export interface AgentServicePrincipal {
  readonly subject: string;
  readonly clientId: string;
  readonly agentKind: AgentKind;
}

export interface AgentServiceIdentityResolver {
  resolve(clientId: string): Promise<{
    readonly agentKind: AgentKind;
    readonly active: boolean;
  } | undefined>;
}

export function authenticateAgentService(
  verifier: StaffTokenVerifier,
  identities: AgentServiceIdentityResolver,
): RequestHandler;
```

- Staff authentication continues to produce only `StaffPrincipal`; it must
  ignore Agent client roles and cannot produce `AgentServicePrincipal`.

- [ ] **Step 1: Write staff-role and identity-separation RED tests**

Add the four role strings to expected staff-role parsing tests. Add middleware
tests proving a valid Agent token requires `sub`, expected audience, and
`azp`/`client_id`; the resolved client must be active; a payload `agentId` is
ignored; an inactive, unknown, or staff client receives `401 UNAUTHORIZED`.

```ts
expect(principal.roles).toEqual([
  "agentic_operator",
  "agentic_approver",
  "agentic_governance_admin",
  "agentic_auditor",
]);
expect(response.locals.agentServicePrincipal).toEqual({
  subject: "service-account-agent-catalog",
  clientId: "agent-catalog",
  agentKind: "catalog",
});
```

- [ ] **Step 2: Run RED tests**

Run:

```bash
pnpm --filter @opendx/api exec vitest run \
  src/shared/auth/staff-auth.middleware.test.ts \
  src/modules/agentic/presentation/middleware/agent-service-auth.middleware.test.ts
```

Expected: FAIL because Agentic roles and service middleware do not exist.

- [ ] **Step 3: Implement minimal role and service-principal boundary**

Extend `StaffRole` and the runtime staff-role allow-list. Implement a distinct
middleware that reuses only signature verification, extracts `azp` or
`client_id`, resolves it through `AgentServiceIdentityResolver`, rejects
inactive/unknown identities, and writes a separate
`response.locals.agentServicePrincipal`. Do not mount an internal route yet.

- [ ] **Step 4: Add seven Keycloak confidential clients**

Add seven clients with service accounts enabled, direct access grants disabled,
public client disabled, standard flow disabled, and no staff realm roles. Use
environment substitution or local-only development secrets following the
existing realm pattern; never place a production secret in the realm export.

- [ ] **Step 5: Run GREEN and Keycloak structure checks**

Run the focused Vitest command and:

```bash
node -e 'const r=require("./infra/keycloak/realm-export.json"); const ids=r.clients.filter(c=>c.clientId.startsWith("agent-")).map(c=>c.clientId); if(ids.length!==7||new Set(ids).size!==7) process.exit(1)'
pnpm --filter @opendx/api typecheck
git diff --check
```

Expected: all exit `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/auth apps/api/src/modules/agentic/application/identity \
  apps/api/src/modules/agentic/presentation/middleware infra/keycloak/realm-export.json CHANGELOG.md
git commit -m "feat(agentic): separate workforce identities"
```

---

### Task 2: Governance Domain Rules and Immutable Contracts

**Files:**

- Create: `apps/api/src/modules/agentic/domain/entities/agent-profile.ts`
- Create: `apps/api/src/modules/agentic/domain/entities/agent-task.ts`
- Create: `apps/api/src/modules/agentic/domain/entities/configuration-revision.ts`
- Create: `apps/api/src/modules/agentic/domain/entities/approval-request.ts`
- Create: `apps/api/src/modules/agentic/domain/entities/governance-records.ts`
- Create: `apps/api/src/modules/agentic/domain/services/agent-governance-rules.ts`
- Create: `apps/api/src/modules/agentic/domain/services/agent-governance-rules.test.ts`
- Create: `apps/api/src/modules/agentic/domain/exceptions/agentic-domain.error.ts`
- Create: `apps/api/src/modules/agentic/application/dtos/agentic.dto.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces immutable entity interfaces and pure functions:

```ts
export function transitionTask(
  task: AgentTask,
  command: { readonly type: "ready"; readonly revisionId: string }
    | { readonly type: "cancel" },
  at: string,
): AgentTask;

export function transitionRevision(
  revision: ConfigurationRevision,
  command: { readonly type: "submit" }
    | { readonly type: "activate"; readonly decidedBy: string }
    | { readonly type: "reject"; readonly decidedBy: string; readonly reason: string },
  at: string,
): ConfigurationRevision;

export function decideApproval(
  request: ApprovalRequest,
  input: {
    readonly decidedBy: string;
    readonly decision: "approved" | "rejected" | "revision_requested";
    readonly reason: string;
    readonly now: string;
  },
): ApprovalRequest;

export function assertAcyclicDependencies(
  subtaskIds: readonly string[],
  dependencies: readonly { readonly from: string; readonly to: string }[],
): void;
```

- [ ] **Step 1: Write exhaustive domain RED tests**

Cover exact task, revision, and approval transitions; immutable terminal
records; missing active revision; self-approval; expiry boundary where
`now >= expiresAt`; duplicate dependencies; cross-task/self edges; cycle
detection; integer non-negative budget limits; seven Agent kinds; ordered unique
fallback models; positive timeout/retry/token constraints; and stable domain
error codes.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/domain/services/agent-governance-rules.test.ts
```

Expected: FAIL because the domain files do not exist.

- [ ] **Step 3: Implement minimal pure domain behavior**

Use exhaustive switches and return new immutable objects. Reject unknown or
illegal states with `AgenticDomainError`; do not read PostgreSQL, time, random
IDs, Keycloak, or Express in domain code.

- [ ] **Step 4: Run GREEN and mutation-strength check**

Run the focused test. Temporarily invert deny/self-approval or remove cycle
detection, confirm the focused test fails, restore the implementation, and run
again to green. Record the mutation evidence in the task report.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm --filter @opendx/api typecheck
git diff --check
git add apps/api/src/modules/agentic/domain apps/api/src/modules/agentic/application/dtos CHANGELOG.md
git commit -m "feat(agentic): define governance domain rules"
```

---

### Task 3: PostgreSQL Governance Schema and Repository

**Files:**

- Create: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608140015_create_agent_governance.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/run-agentic-migrations.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `apps/api/src/shared/database/run-migrations.ts`
- Modify: `apps/api/package.json`
- Modify: `CHANGELOG.md`

**Interfaces:**

`AgenticRepository` exposes transaction-scoped methods only. Required groups
are `findAgentByClientId`, task create/find/list/update, revision
create/find/update/activate, policy/tool/model/budget child replacement for a
draft, approval create/find/decide, revocation create/findActive, budget
reserve/settle, audit append/list, and provenance append/list. Every mutating
method receives `DatabaseSession`; read-only list/detail methods can run through
`TransactionRunner.runReadOnly`.

Budget methods use:

```ts
reserveBudget(session, {
  id, agentKind, taskId, idempotencyKey, costMicros, occurredAt,
}): Promise<"reserved" | "duplicate" | "exceeded">;

settleBudget(session, {
  reservationId, idempotencyKey, actualCostMicros, occurredAt,
}): Promise<"settled" | "duplicate" | "stale">;
```

- [ ] **Step 1: Write migration lifecycle RED test**

Assert creation and rollback of normalized tables for agents, tasks, subtasks,
dependencies, revisions, policies, tools, grants, model configs and fallbacks,
budget limits/entries, approvals, revocations, audit, and provenance. Assert the
seven fixed Agent/client mappings and exactly one-active-revision partial unique
index.

Exercise database rejection for invalid enum checks, negative/non-integer cost,
duplicate client identity, cross-task dependency, self-dependency, mutation of
append-only audit/provenance, mutation of submitted configuration children,
self-decision, replayed approval, and multiple active revisions.

- [ ] **Step 2: Run migration RED**

```bash
DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts
```

Expected: FAIL because the migration and runner do not exist.

- [ ] **Step 3: Implement migration and scripts**

Create ordered enum/check-constrained tables and triggers. Use fixed AgentKind
as the Agent primary key and unique `keycloak_client_id`; use UUID primary keys
for tasks and records. Add `db:migrate:agentic`, `db:rollback:agentic`, and
`db:rollback:agentic:all`; append Agentic after Support in migrate order and
before Support in rollback order.

- [ ] **Step 4: Prove migration GREEN and full lifecycle**

Run the focused test, then:

```bash
DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
pnpm --filter @opendx/api db:migrate:all
DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
pnpm --filter @opendx/api db:rollback:all
DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
pnpm --filter @opendx/api db:migrate:all
```

Expected: all commands exit `0` and the Agentic migration count is `1`.

- [ ] **Step 5: Write repository concurrency RED tests**

Test one-winner optimistic task update, one active revision under concurrent
activation, one decision under concurrent approval, idempotent budget replay,
concurrent budget oversubscription prevention, atomic settlement, owner-scoped
list/detail, append-only audit/provenance, and emergency-revocation lookup.

- [ ] **Step 6: Implement repository GREEN**

Use owner predicates in SQL rather than fetch-then-authorize. Lock the budget
scope and current revision rows with deterministic `FOR UPDATE` order. Use
`INSERT ... ON CONFLICT` only where idempotency semantics are explicit. Map
`bigint` cost values through safe integer parsing and reject values beyond
`Number.MAX_SAFE_INTEGER`.

- [ ] **Step 7: Run focused integration, typecheck, and commit**

```bash
DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts \
  src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
git add apps/api/src/modules/agentic/application/repositories \
  apps/api/src/modules/agentic/infrastructure apps/api/src/shared/database/run-migrations.ts \
  apps/api/package.json CHANGELOG.md
git commit -m "feat(agentic): persist governance control plane"
```

---

### Task 4: Deterministic Policy, Tool Authorization, and Budgets

**Files:**

- Create: `apps/api/src/modules/agentic/application/services/interfaces/policy-evaluator.ts`
- Create: `apps/api/src/modules/agentic/application/services/interfaces/tool-registry.ts`
- Create: `apps/api/src/modules/agentic/application/services/interfaces/budget.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/policy.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/policy.service.test.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/tool-registry.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/tool-registry.service.test.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/budget.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/budget.service.test.ts`
- Create: `apps/api/src/modules/agentic/application/services/agentic-application.error.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

```ts
export interface PolicyEvaluator {
  evaluate(request: PolicyRequest): Promise<PolicyDecision>;
}

export interface ToolRegistry {
  authorize(request: ToolAuthorizationRequest): Promise<PolicyDecision>;
  invoke<TOutput>(request: ToolInvocation): Promise<ToolResult<TOutput>>;
}

export interface BudgetService {
  reserve(input: BudgetReservationInput): Promise<BudgetReservationResult>;
  settle(input: BudgetSettlementInput): Promise<BudgetSettlementResult>;
}
```

`ToolRegistry.invoke` always returns or throws `TOOL_UNAVAILABLE` after a fully
authorized Phase A request because no adapter may be registered.

- [ ] **Step 1: Write Policy Engine RED tests**

Test emergency revocation first; exact matching across actor/Agent/department/
resource/action/purpose/classification; `DENY` precedence independent of row
order; `REQUIRE_APPROVAL` precedence over `ALLOW`; explicit allow; no-match
deny; stable sorted matched rule IDs; and pinned policy version evidence.

- [ ] **Step 2: Implement Policy Engine GREEN**

Keep matching pure and bounded. Load only the task-pinned revision rules and
current revocations through the repository. Inject `now`; do not use a model,
dynamic expression evaluator, or database-side executable condition.

- [ ] **Step 3: Write Tool Registry RED tests**

Test unknown/inactive Agent, task not ready, task/Agent mismatch, revoked Agent,
unknown tool/version, missing or stale grant, purpose/data-scope mismatch,
invalid input digest/parameters, policy deny, approval required, budget exceed,
authorized unavailable adapter, and safe allowed/denied audit metadata.

- [ ] **Step 4: Implement Tool Registry GREEN**

Authorize in the documented order and stop before budget reservation on every
deny. An allowed invocation reserves budget idempotently, records provenance
and safe audit, then returns `TOOL_UNAVAILABLE` without fabricating a result.
Do not expose adapter registration in Phase A.

- [ ] **Step 5: Write and implement budget RED/GREEN tests**

Test positive safe integer costs, task/daily/monthly limits, duplicate reserve,
duplicate settle, actual cost not exceeding reservation, unknown reservation,
and rollback when mandatory audit fails. Implement each operation in one
repository transaction.

- [ ] **Step 6: Run focused tests and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/policy.service.test.ts \
  src/modules/agentic/application/services/implementations/tool-registry.service.test.ts \
  src/modules/agentic/application/services/implementations/budget.service.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
git add apps/api/src/modules/agentic/application/services CHANGELOG.md
git commit -m "feat(agentic): enforce policy tools and budgets"
```

---

### Task 5: Two-person Configuration and Bound Approvals

**Files:**

- Create: `apps/api/src/modules/agentic/application/services/interfaces/configuration.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/interfaces/approval.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/configuration.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/configuration.service.test.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/approval.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/approval.service.test.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/emergency-revocation.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/emergency-revocation.service.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

```ts
export interface ConfigurationService {
  createDraft(input: CreateConfigurationDraftInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  updateDraft(input: UpdateConfigurationDraftInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  submit(input: SubmitConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  decide(input: DecideConfigurationInput, principal: StaffPrincipal): Promise<ConfigurationRevision>;
  getDiff(revisionId: string, principal: StaffPrincipal): Promise<ConfigurationDiff>;
}

export interface ApprovalService {
  list(query: ApprovalQuery, principal: StaffPrincipal): Promise<ApprovalPage>;
  get(id: string, principal: StaffPrincipal): Promise<ApprovalDetail>;
  decide(input: ApprovalDecisionInput, principal: StaffPrincipal): Promise<ApprovalRequest>;
}
```

- [ ] **Step 1: Write configuration RED tests**

Test Governance Admin draft ownership, strict child validation, submitted
immutability, submit, diff from active revision, different-subject decision,
overlapping-role self-approval denial, rejection reason, atomic activation and
supersession, stale decision, and mandatory audit rollback.

- [ ] **Step 2: Implement configuration GREEN**

Normalize and hash the complete revision payload in application code. Update
only drafts owned by the creator. In one transaction, lock pending and active
revisions, revalidate referenced active Agents/tools/models/budgets, append the
decision and audit, supersede the previous revision, and activate the winner.

- [ ] **Step 3: Write approval RED tests**

Test role/scope filtering, requester/decider separation, `now >= expiresAt`,
payload digest mismatch, version mismatch, single decision, approve/reject/
revision-requested outcomes, replay, and rollback on audit failure.

- [ ] **Step 4: Implement approval GREEN**

Keep Approval Request immutable except its one versioned decision transition.
Return expired behavior without allowing a late mutation. Approval evidence
authorizes only the exact bound action and is not treated as a credential.

- [ ] **Step 5: Write emergency revocation RED/GREEN tests**

Test immediate Administrator activation, Governance Admin request-only path,
non-admin denial, self-approval denial, idempotent active revocation, historical
revision preservation, and current Policy Engine denial. Implement a separate
append-only revocation record and required audit transaction.

- [ ] **Step 6: Run focused tests and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/configuration.service.test.ts \
  src/modules/agentic/application/services/implementations/approval.service.test.ts \
  src/modules/agentic/application/services/implementations/emergency-revocation.service.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
git add apps/api/src/modules/agentic/application/services CHANGELOG.md
git commit -m "feat(agentic): govern configuration approvals"
```

---

### Task 6: Non-executing Task Service and Ownership

**Files:**

- Create: `apps/api/src/modules/agentic/application/services/interfaces/agent-task.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/agent-task.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/agent-task.service.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

```ts
export interface AgentTaskService {
  create(input: CreateAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  updateDraft(input: UpdateAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  ready(input: ReadyAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  cancel(input: CancelAgentTaskInput, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  get(taskId: string, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  list(query: AgentTaskQuery, principal: StaffPrincipal): Promise<AgentTaskPage>;
}
```

- [ ] **Step 1: Write task-service RED tests**

Test bounded goal/instructions/deadline, creator provenance, creator-only draft
update and ready, owner-scoped Operator reads, Approver visibility only through
assigned approval context, Auditor no task-body access, Governance Admin/admin
oversight, active revision pinning, no-active-revision error, draft/ready cancel
matrix, operator own-only cancellation, stale version, canceled immutability,
subtask same-task acyclic validation, and audit rollback.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agent-task.service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement task service GREEN**

Use constructor injection for repository, transactions, `generateId`, and
`now`. Apply ownership in repository queries, not after unrestricted reads.
Pin the complete active revision identifiers in the same transaction as the
`ready` transition and audit event.

- [ ] **Step 4: Run GREEN, typecheck, and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/agent-task.service.test.ts
pnpm --filter @opendx/api typecheck
git diff --check
git add apps/api/src/modules/agentic/application/services CHANGELOG.md
git commit -m "feat(agentic): manage governed task intake"
```

---

### Task 7: Staff Agentic API and Authorization Matrix

**Files:**

- Create: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Create: `apps/api/src/modules/agentic/presentation/controllers/agentic.controller.ts`
- Create: `apps/api/src/modules/agentic/presentation/routes/agentic.routes.ts`
- Create: `apps/api/src/modules/agentic/presentation/middleware/agentic-error.middleware.ts`
- Create: `apps/api/src/modules/agentic/tests/agentic.api.test.ts`
- Create: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Create: `apps/api/src/modules/agentic/agentic.module.ts`
- Create: `apps/api/src/modules/agentic/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `CHANGELOG.md`

**Route contract:**

```text
POST   /v1/admin/agentic/tasks
GET    /v1/admin/agentic/tasks
GET    /v1/admin/agentic/tasks/:taskId
PATCH  /v1/admin/agentic/tasks/:taskId
POST   /v1/admin/agentic/tasks/:taskId/ready
POST   /v1/admin/agentic/tasks/:taskId/cancel
GET    /v1/admin/agentic/approvals
GET    /v1/admin/agentic/approvals/:approvalId
POST   /v1/admin/agentic/approvals/:approvalId/decision
GET    /v1/admin/agentic/employees
GET    /v1/admin/agentic/employees/:agentKind
POST   /v1/admin/agentic/configuration-revisions
PATCH  /v1/admin/agentic/configuration-revisions/:revisionId
POST   /v1/admin/agentic/configuration-revisions/:revisionId/submit
GET    /v1/admin/agentic/configuration-revisions/:revisionId/diff
POST   /v1/admin/agentic/configuration-revisions/:revisionId/decision
POST   /v1/admin/agentic/revocations
GET    /v1/admin/agentic/audit
```

- [ ] **Step 1: Write strict validator and controller RED tests**

Test `.strict()` unknown-field rejection; UUIDs; goal max 500; instructions max
8,000; optional future deadline; reason max 1,000; pagination 1..100; expected
positive version; exact enum values; unique model fallback list; positive safe
integer costs; normalized SHA-256 digest format; and stable success/error
envelopes.

- [ ] **Step 2: Write role-matrix API RED tests**

For every route, test unauthenticated `401`, each of the four Agentic roles,
Administrator, an unrelated commerce role, self-approval, cross-owner task,
stale version, missing record, expired approval, and denied-audit behavior.
Static segments such as `/ready`, `/cancel`, `/decision`, and `/diff` must not be
captured as resource IDs.

- [ ] **Step 3: Implement validators, controller, routes, and error mapping**

Controllers parse and delegate only. Routes authenticate first, use the minimum
role guard per action, and let application services enforce ownership and
self-approval. Map the stable Phase A codes to `400`, `403`, `404`, `409`, or
`503` without exposing internal SQL or policy details.

- [ ] **Step 4: Compose the module without internal runtime routes**

`createAgenticModule` constructs one PostgreSQL repository and the application
services using explicit dependencies. It returns only `{ adminRouter }` plus
inward-facing services needed by tests; it does not start a worker or expose an
Agent service router.

- [ ] **Step 5: Run API unit GREEN**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/tests/agentic.api.test.ts
pnpm --filter @opendx/api typecheck
```

- [ ] **Step 6: Add PostgreSQL API integration coverage**

Use real transactions to create a draft, update, activate configuration through
two subjects, ready/cancel a task, deny a cross-owner Operator, prevent
self-approval, and query filtered audit. Assert no forbidden record fields are
returned.

- [ ] **Step 7: Run integration GREEN and commit**

```bash
DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/tests/agentic.api.integration.test.ts
git diff --check
git add apps/api/src/modules/agentic apps/api/src/app.ts CHANGELOG.md
git commit -m "feat(agentic): expose governance administration api"
```

---

### Task 8: Composition, Readiness, Documentation, and Phase Exit

**Files:**

- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/shared/config/environment.ts` only if a separate Agent
  audience is needed by the finalized identity tests
- Modify: `.env.example` only for non-secret Agent audience/config values
- Modify: `infra/docker/README.md`
- Modify: `docs/api/rest-api.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/architecture/dependency-rules.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/dependencies.md` only to state no new Phase A dependency or to
  document a reviewed dependency change
- Modify: `docs/build-from-source.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`
- Create: `.superpowers/sdd/2026-08-14-agent-governance-foundation/task-8-report.md`

**Interfaces:**

- `createApiApp` accepts `agenticAdminRouter?: Router` and mounts it at
  `/v1/admin/agentic` with Console CORS.
- Readiness migration query includes `agentic_migrations` with expected count
  `>= 1`; Phase A readiness does not include Temporal or OpenRouter.

- [ ] **Step 1: Write composition/readiness RED tests**

Extend API foundation or Agentic integration tests to prove the exact route
mount, Console CORS, missing route `404`, readiness failure when Agentic
migration is absent, and readiness success when it is present.

- [ ] **Step 2: Implement server composition GREEN**

Construct the Agentic module with `transactions`, staff verifier, `randomUUID`,
and injected clock. Mount only the admin router. Add the migration count to the
single readiness query and threshold without changing existing dependencies.

- [ ] **Step 3: Update contributor and architecture documentation**

Document role matrix, endpoints, migration/rollback commands, seven service
clients, local secret handling, task/configuration lifecycles, current
non-executing scope, build commands, and the absence of Temporal/OpenRouter/
commerce tool behavior. Update roadmap Phase A evidence honestly.

- [ ] **Step 4: Run focused Phase A unit tests**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/shared/auth/staff-auth.middleware.test.ts \
  src/modules/agentic/domain/services/agent-governance-rules.test.ts \
  src/modules/agentic/application/services/implementations/policy.service.test.ts \
  src/modules/agentic/application/services/implementations/tool-registry.service.test.ts \
  src/modules/agentic/application/services/implementations/budget.service.test.ts \
  src/modules/agentic/application/services/implementations/configuration.service.test.ts \
  src/modules/agentic/application/services/implementations/approval.service.test.ts \
  src/modules/agentic/application/services/implementations/emergency-revocation.service.test.ts \
  src/modules/agentic/application/services/implementations/agent-task.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
```

Expected: zero failures.

- [ ] **Step 5: Run Phase A PostgreSQL and migration gates**

```bash
DATABASE_URL=postgresql://opendx_local:opendx_local@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts \
  src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts \
  src/modules/agentic/tests/agentic.api.integration.test.ts
```

Then rerun the complete `db:migrate:all -> db:rollback:all -> db:migrate:all`
chain from Task 3. Expected: zero failures and clean reapplication.

- [ ] **Step 6: Run complete repository gates**

```bash
pnpm --filter @opendx/api typecheck
pnpm --filter @opendx/api test
pnpm --filter @opendx/api test:integration
pnpm audit:repo
pnpm check
git diff --check
git status --short
```

Expected: every command exits `0`; status contains only intentional report or
documentation changes before the final commit.

- [ ] **Step 7: Perform security and scope review**

Use `rg` and diff inspection to prove there is no OpenRouter call, Temporal SDK,
generic SQL tool, commerce-private import, Agent client secret, task instruction
logging, in-memory runtime repository, Console feature, file intake, or commerce
mutation. Review every role and ownership predicate against the approved matrix.

- [ ] **Step 8: Update report and commit**

Record exact commands, counts, environment, mutation evidence, migration
lifecycle, concurrency results, known limitations, and commit candidates in the
task report. Then:

```bash
git add apps/api/src apps/api/package.json infra/keycloak/realm-export.json \
  .env.example infra/docker/README.md docs CHANGELOG.md pnpm-lock.yaml
git commit -m "feat(agentic): complete governance foundation"
```

Do not stage unrelated user changes. If preceding tasks already committed all
runtime files, the final commit contains only coherent documentation and report
updates.

- [ ] **Step 9: Request independent review and resolve findings**

Review against the focused spec, then code quality. Resolve all Critical and
Important findings with new RED-GREEN tests and atomic fix commits. Rerun the
complete Phase A gates after the last fix.

## Phase A Completion Record

Only after Task 8 passes, update the roadmap status to Phase A complete and
record:

- committed revision hashes;
- focused unit/API/PostgreSQL counts;
- migration `up -> down -> up` evidence;
- role and service-identity matrix evidence;
- concurrency and zero-leakage evidence;
- full `pnpm check` and repository audit evidence;
- explicit confirmation that Temporal, OpenRouter, commerce tools, file intake,
  Console Agentic UI, scheduled execution, and commerce mutations remain absent.
