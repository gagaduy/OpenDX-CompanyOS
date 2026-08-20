<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Post-Commerce Agentic Workforce Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a governed Digital Workforce in which a human assigns work to
an AI CEO, six department-specific Digital Employees perform bounded read-only
analysis, and the system returns one auditable Store Health Review with policy,
quality, approval, cost, and provenance evidence.

**Architecture:** Extend the existing feature-first modular monolith with an
`agentic` control-plane module in `apps/api`, durable workflow and model
execution in the existing `services/ai-runtime`, and a role-aware Digital
Workforce feature in `apps/console`. PostgreSQL remains authoritative for task,
policy, approval, audit, configuration, and memory records; Temporal owns
durable execution; commerce data is exposed only through module-owned typed
read ports or purpose-limited read-only analytics views; OpenRouter is isolated
behind a provider-neutral model gateway.

**Tech Stack:** Node.js 22+, strict TypeScript, Express 5, React 19, Vite,
React Router 6, Zod 4, PostgreSQL 18, `pg`, `node-pg-migrate`, Python 3.13,
FastAPI, `httpx`, Temporal, OpenRouter, MinIO, ClamAV, Vitest, Pytest, Testing
Library, Supertest, Keycloak, Docker Compose, and pnpm 11.

## Global Constraints

- Follow
  `docs/superpowers/specs/2026-08-14-post-commerce-agentic-workforce-design.md`
  exactly; weakening its authority, privacy, approval, or provenance rules
  requires a re-approved design.
- Keep NovaCommerce single-company, B2C, single-store, one inventory location,
  physical-goods, and VND-only.
- Company remains the center of the product. The AI CEO is a governed
  orchestrator, not an autonomous executive or an `administrator` substitute.
- The initial Digital Workforce is exactly AI CEO, Catalog, Inventory, Order,
  Finance, CRM, and Support. Agents cannot create agents, skills, tools,
  permissions, models, or budgets.
- The first workflow is the fixed, versioned Store Health Review & Action Plan;
  do not add a generic workflow builder.
- The initial milestone is read, analyze, coordinate, and draft only. No Agent
  may mutate catalog, price, promotion, publication, inventory, order, payment,
  customer, CRM, or support state or contact a customer.
- Policy is deterministic and deny-by-default. Model output can rank only the
  agents, tools, data classes, and models already allowed by policy.
- Every Digital Employee uses a distinct service identity and separate tool,
  data, model, budget, memory, and audit scope. Credentials are never shared.
- Models never receive PostgreSQL credentials and cannot submit free-form SQL.
  All operational access is a typed, versioned Tool Registry invocation.
- Commerce modules publish focused public read contracts. Agentic code never
  imports another module's private entity, repository, migration, or adapter.
- Department analytics use purpose-specific read-only PostgreSQL views with
  bounded filters and columns; they are not a generic query surface.
- PostgreSQL is authoritative for tasks, policies, approvals, Agent profiles,
  tool grants, budgets, results, audit, provenance, and memory.
- Temporal owns orchestration state, retries, timers, fan-out/fan-in, signals,
  and restart recovery. Workflow payloads carry bounded identifiers and
  immutable inputs, never credentials or unrestricted documents.
- OpenRouter is accessed only through a provider-neutral gateway with a
  human-configured primary model, ordered allow-listed fallbacks, timeout,
  retry, token, task-cost, daily, and monthly limits per Agent.
- Budget exhaustion pauses affected work and notifies a human. It does not
  silently select an arbitrary model or expand authority.
- Direct task text, uploaded content, parser output, tool results, and Agent
  messages are untrusted input and cannot override policy or system prompts.
- Initial file formats are DOCX, XLSX, PDF, CSV, and TXT. Files remain private
  in MinIO, pass fail-closed ClamAV scanning, and are safely parsed with bounded
  size, pages, sheets, rows, cells, expansion, and time.
- XLSX/CSV bulk plans require a version-bound preview approval before task or
  subtask creation. Changed input or preview invalidates approval.
- Risky financial, legal, production, publishing, permission-changing, or
  externally visible actions require human approval and remain out of the
  initial automatic action set.
- The Quality Gate checks schema, provenance, tool/data scope, freshness,
  backend arithmetic, leakage, and conflict; it permits at most two correction
  attempts before partial result or human escalation.
- Company Memory is reviewed, versioned, permission-scoped, provenance-backed,
  and revocable. GraphRAG, vector search, and graph projection remain deferred.
- Do not log secrets, tokens, customer/payment PII, uploaded content, prompt
  bodies, model response bodies, attachment bytes, or unrestricted tool data.
- Add dependencies only in the focused phase that first consumes them, pin
  their versions, update the lockfile and `docs/dependencies.md`, and record
  license and source-build impact.
- Add directories only with their first approved source or test file. Keep
  business policy out of routes, controllers, repositories, React
  presentational components, workflow definitions, and provider adapters.
- Add Apache-2.0 SPDX headers to every new license-capable source, test, script,
  migration, and documentation file.
- Every observable change follows RED-GREEN-REFACTOR, updates `CHANGELOG.md`
  under `[Unreleased]`, uses an atomic Conventional Commit, and passes the
  focused gate plus root `pnpm check` before phase completion.

---

## How To Execute This Master Plan

This document is the dependency map for the complete Agentic milestone. It
does not replace the focused design and file-level TDD plan required for each
phase. No runtime task below is authorized merely because this master plan is
approved.

For each phase:

- [ ] Start from the latest `develop` or an approved feature branch based on
  `develop`; never modify `main` directly.
- [ ] Run `superpowers:brainstorming` and write the focused design under
  `docs/superpowers/specs/`.
- [ ] Obtain user review of the committed focused design.
- [ ] Run `superpowers:writing-plans` and write exact file-level TDD steps under
  `docs/superpowers/plans/`.
- [ ] Execute using `superpowers:subagent-driven-development` or
  `superpowers:executing-plans` from an isolated worktree when appropriate.
- [ ] Observe each relevant failing test before implementing production code.
- [ ] Run the focused unit, PostgreSQL, API, Python, authorization, security,
  Compose, and browser gates specified by that phase.
- [ ] Update affected API, architecture, dependency, environment, build,
  Docker, roadmap, and changelog documentation in the same unit.
- [ ] Run `git diff --check`, `pnpm audit:repo`, and root `pnpm check`.
- [ ] Request independent review and resolve Critical and Important findings.
- [ ] Mark the phase complete only with fresh evidence from the committed tree.

## Dependency Order

```text
Phase A: Agent Governance Foundation
  -> Phase B: Durable Store Health Workflow
    -> Phase C: Read-only Department Tools
      -> Phase D: OpenRouter Agent Runtime and Quality Gate
        -> Phase E: File Intake and Bulk Preview
          -> Phase F: AI CEO Coordination and Memory
            -> Phase G: Console Digital Workforce
              -> Phase H: Cross-department Acceptance and Hardening
```

No later phase starts while an earlier phase has unresolved identity, policy,
data-contract, migration, security, or recovery failures. Phase G may prototype
against deterministic fakes after its API contracts are fixed, but its exit
gate depends on Phases A-F.

## Stable Cross-Phase Contracts

| Boundary | Contract |
| --- | --- |
| Staff Agentic API | `/v1/admin/agentic/*` behind Keycloak and backend role checks |
| Service API | `/v1/internal/agentic/*` behind distinct workload identity; never browser-accessible |
| Policy decision | `ALLOW`, `REQUIRE_APPROVAL`, or `DENY`, with policy version and reason |
| Workflow | Versioned `StoreHealthReviewWorkflow`; published versions are immutable |
| Agent identity | One immutable service identity per Digital Employee; no shared credential |
| Tool invocation | Typed tool name/version/input; task, actor, purpose, scope, budget, and policy checked before execution |
| Model invocation | Agent-configured primary plus ordered approved fallbacks; bounded tokens, cost, retries, and timeout |
| Approval | Bound to actor, resource, action, parameters, task, payload digest, policy/workflow version, and expiry |
| Result | Purpose-specific schema with source provenance, retrieval time, freshness, cost, and Quality Gate evidence |
| Collaboration | Structured request routed through AI CEO and Policy Engine; no direct Agent-to-Agent channel |
| Memory | Task, bounded working, or reviewed Company Memory; no unreviewed durable promotion |
| Persistence | PostgreSQL transactions and ordered reversible migrations |
| File storage | Private MinIO quarantine; ClamAV fail-closed; no public object URL |
| Audit | Actor, service identity, task, action, resource, outcome, policy/model/tool version, correlation, causation, and timestamp |

---

### Task 1: Phase A — Agent Governance Foundation

**Purpose:** Establish authoritative identities, tasks, subtasks, deterministic
policy, tool registration, grants, budgets, approvals, audit, and provenance
without executing a model or workflow.

**Focused planning gate:** Create and approve a dated focused design and plan
using the topic slug `agent-governance-foundation` before runtime changes.

**Primary implementation areas:**

- Create: `apps/api/src/modules/agentic/` with domain, application,
  infrastructure, presentation, tests, and a public `index.ts`.
- Create: Agentic migrations under
  `apps/api/src/modules/agentic/infrastructure/database/migrations/`.
- Create: a PostgreSQL repository adapter and migration lifecycle tests.
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, and API migration
  scripts only where the focused plan demonstrates the composition need.
- Modify: `infra/keycloak/realm-export.json` with least-privilege human roles
  for task submission, approval, governance administration, and read-only
  audit; do not encode Agent service identities as staff users.
- Modify: `.env.example`, API documentation, architecture documentation,
  dependency documentation, roadmap, and `CHANGELOG.md` as required.

**Interfaces produced:**

```ts
export type AgentKind =
  | "ai_ceo" | "catalog" | "inventory" | "order"
  | "finance" | "crm" | "support";

export type PolicyEffect = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

export interface AgentTaskService {
  create(input: CreateAgentTaskInput, principal: StaffPrincipal): Promise<AgentTask>;
  get(taskId: string, principal: StaffPrincipal): Promise<AgentTaskDetail>;
  list(query: AgentTaskQuery, principal: StaffPrincipal): Promise<AgentTaskPage>;
  cancel(taskId: string, expectedVersion: number, principal: StaffPrincipal): Promise<AgentTask>;
}

export interface PolicyEvaluator {
  evaluate(request: PolicyRequest): Promise<PolicyDecision>;
}

export interface ToolRegistry {
  register(descriptor: ToolDescriptor): void;
  authorize(request: ToolAuthorizationRequest): Promise<PolicyDecision>;
  invoke<TInput, TOutput>(request: ToolInvocation<TInput>): Promise<ToolResult<TOutput>>;
}

export interface ApprovalService {
  request(input: ApprovalRequestInput): Promise<ApprovalRequest>;
  decide(input: ApprovalDecisionInput, principal: StaffPrincipal): Promise<ApprovalRequest>;
}
```

The focused plan must define complete immutable DTOs, version fields, state
transitions, error codes, role matrix, indexes, uniqueness, foreign keys, and
retention semantics before implementation.

**Checklist:**

- [ ] Model seven fixed Digital Employee profiles, distinct service identities,
  human-owned configuration, and deny-by-default status.
- [ ] Model task, subtask, dependency, plan revision, run, result, policy,
  registered tool, tool grant, model configuration, budget ledger, approval,
  audit, and provenance records without generic JSON replacing required
  relational invariants.
- [ ] Define valid task/subtask/approval transitions and optimistic concurrency
  in domain tests before migrations.
- [ ] Implement reversible migrations with database constraints that reject
  invalid identity, state, version, ownership, approval replay, and budget
  ledger data.
- [ ] Implement deterministic policy evaluation with explicit deny precedence
  and exact decision evidence.
- [ ] Implement typed Tool Registry authorization without a working commerce
  tool or generic SQL executor.
- [ ] Implement approval binding to immutable payload digest and expiry.
- [ ] Implement append-only important-operation audit and provenance records
  without sensitive payload logging.
- [ ] Expose only the minimal authorized task, profile, policy-decision,
  approval, and audit APIs required by later phases.
- [ ] Prove concurrent task version updates, approval decisions, and budget
  reservations have one authoritative winner.

**Exit gate:** A human can create and inspect a non-executing Agentic task;
seven separate Digital Employee identities exist; policy, tool grants, model
configuration, budgets, approval binding, audit, and provenance are enforced in
TypeScript and PostgreSQL; no model, Temporal worker, commerce mutation, direct
database Agent access, or cross-scope record is available.

---

### Task 2: Phase B — Durable Store Health Workflow

**Purpose:** Add deterministic Temporal orchestration for the fixed Store
Health Review lifecycle, including parallel branches, dependencies, bounded
retry, cancellation, approval signals, and restart recovery.

**Focused planning gate:** Create and approve a dated focused design and plan
using the topic slug `store-health-temporal-workflow`. The focused design must
pin Temporal SDK/server versions and document their licenses and source-build
impact before dependencies or Compose services are added.

**Primary implementation areas:**

- Create workflow/application code under `services/ai-runtime/app/agentic/`.
- Create deterministic workflow and activity tests under
  `services/ai-runtime/tests/agentic/`.
- Extend the Agentic API with authenticated internal command/query contracts
  needed by activities; keep service credentials at the HTTP boundary.
- Modify `infra/docker/docker-compose.yml`, production Compose as separately
  approved, `.env.example`, health/readiness checks, and Docker documentation.
- Add Temporal migration/startup/health behavior only through supported
  official infrastructure; do not make Temporal the business source of truth.

**Interfaces produced:**

```py
@dataclass(frozen=True)
class StoreHealthReviewInput:
    task_id: str
    workflow_version: int
    plan_revision: int

@dataclass(frozen=True)
class ApprovalSignal:
    approval_id: str
    payload_digest: str
    decision: Literal["approved", "rejected"]

@workflow.defn(name="StoreHealthReviewWorkflowV1")
class StoreHealthReviewWorkflow:
    @workflow.run
    async def run(self, value: StoreHealthReviewInput) -> WorkflowOutcome: ...

    @workflow.signal
    async def apply_approval(self, signal: ApprovalSignal) -> None: ...

    @workflow.signal
    async def cancel(self, reason_code: str) -> None: ...
```

**Checklist:**

- [ ] Implement the exact happy states `received`, `planning`, optional
  `awaiting_plan_approval`, `dispatching`, `department_analysis`,
  `quality_review`, optional `collaboration`, `executive_synthesis`, and
  `completed`.
- [ ] Implement `awaiting_human_approval`, `retrying`,
  `partially_completed`, `failed`, and `canceled` as explicit observable
  outcomes rather than hidden exceptions.
- [ ] Keep workflow code deterministic; move network, clock, random identifier,
  storage, database, and model activity behind activities.
- [ ] Make every activity idempotent against an application-level invocation
  key and persist its outcome before acknowledging success.
- [ ] Implement dependency-aware fan-out/fan-in and isolate branch failure when
  downstream dependencies permit partial completion.
- [ ] Authenticate approval/cancel API calls in the application before sending
  a Temporal signal; reject direct signal knowledge as authorization proof.
- [ ] Test duplicate delivery, retry, timeout, worker death, API restart,
  Temporal restart, stale approval, duplicate signal, cancellation propagation,
  and immutable workflow-version replay.
- [ ] Expose liveness separately from dependency-aware readiness for the API,
  AI runtime, Temporal client, and worker.

**Exit gate:** A deterministic fake Store Health Review survives worker and
service restart, executes independent branches in parallel and dependencies in
order, resumes only from a valid bound approval, converges under duplicate
delivery, and exposes honest partial/failed/canceled states with no model calls.

---

### Task 3: Phase C — Read-only Department Tools

**Purpose:** Give each Department Agent the minimum authoritative commerce
context required for Store Health Review without direct database access,
cross-module private imports, free-form SQL, or mutation paths.

**Focused planning gate:** Create and approve a dated focused design and plan
using the topic slug `agentic-department-read-tools`. It must enumerate each
tool's input, output, owner, fields, classification, filters, limits, freshness,
sharing scope, and query plan.

**Primary implementation areas:**

- Extend public ports in `catalog`, `inventory`, `order`, `payment`, `crm`,
  `support`, and `reporting` only where existing contracts cannot provide the
  approved facts.
- Add purpose-specific analytics views and indexes through the owning module's
  ordered reversible migration, never an Agentic migration that silently owns
  commerce tables.
- Add Tool Registry adapters under the Agentic infrastructure boundary.
- Add PostgreSQL authorization, leakage, query-bound, explain-plan, and
  concurrent-read integration tests.
- Update module public `index.ts` files and architecture/API documentation.

**Tools produced for the first workflow:**

| Agent | Initial typed tools |
| --- | --- |
| Catalog | product completeness, publication readiness, missing price/media, merchandising summary |
| Inventory | low stock, sales velocity, slow stock, reservation anomaly, replenishment evidence |
| Order | stalled order aggregate, invalid-state evidence, expiry risk, operations summary |
| Finance | pending payment aggregate, reconciliation discrepancy, provider-evidence status |
| CRM | deterministic customer segment aggregate and follow-up opportunity summary |
| Support | SLA risk, ticket classification aggregate, and authorized related-order context |

Every output returns `source`, `sourceVersion`, `retrievedAt`, `window`,
`freshness`, `classification`, and `provenanceId`; record-level output is
included only where the focused design proves it necessary.

**Checklist:**

- [x] Write an authorization/leakage test for every tool before exposing its
  data path.
- [x] Keep financial totals and state interpretation in authoritative backend
  services or validated SQL, never in prompts.
- [x] Enforce bounded date range, pagination, result count, and execution time
  at the tool adapter and database role/view boundary.
- [x] Use a runtime database role that can select only approved views when an
  analytics view is used; it cannot select base tables or mutate any relation.
- [x] Reject unknown parameters, unknown tool versions, unsupported scopes,
  stale grants, and over-budget invocations before data retrieval.
- [x] Minimize CRM, Support, customer, and payment data before returning a tool
  result or allowing cross-department sharing.
- [x] Audit allowed and denied invocations without logging result bodies or PII.
- [x] Prove AI CEO receives only explicitly shareable summaries, not the union
  of Department Agent data.
- [x] Prove no Agentic package imports a private commerce repository or exposes
  a general SQL/query tool.

**Exit gate:** Each of the six Department Agents can invoke only its approved
typed read tools with bounded, provenance-backed output; forbidden tools,
columns, records, SQL, base tables, and all mutations are denied at runtime and
covered by zero-leakage integration tests.

---

### Task 4: Phase D — OpenRouter Agent Runtime and Quality Gate

**Purpose:** Execute structured Department Agent analyses through OpenRouter
with configured models, redaction, budgets, deterministic fallbacks, and a
backend-verifiable Quality Gate.

**Focused planning gate:** Create and approve a dated focused design and plan
using the topic slug `openrouter-agent-runtime`. The focused design must pin the
provider contract and any new dependencies, define the exact structured result
schema for all seven Agents, and define which data classifications may leave
the local system.

Approved focused design:
`docs/superpowers/specs/2026-08-19-openrouter-agent-runtime-design.md`.

Approved focused implementation plan:
`docs/superpowers/plans/2026-08-19-openrouter-agent-runtime.md`.

**Primary implementation areas:**

- Create provider-neutral model ports and OpenRouter adapters under
  `services/ai-runtime/app/agentic/`.
- Create Agent executors, prompt construction, result schema validation,
  redaction, cost accounting, fallback, and retry logic.
- Extend the API internal boundary for atomic budget reservation/settlement,
  run/result persistence, and Quality Gate evidence.
- Add deterministic fake-provider tests and credential-owned acceptance scripts
  that never write secrets or payloads to repository evidence.
- Modify `.env.example`, Compose secrets/environment, dependency docs, build
  docs, API docs, and `CHANGELOG.md`.

**Interfaces produced:**

```py
class ModelGateway(Protocol):
    async def generate(self, request: ModelRequest) -> ModelResult: ...

@dataclass(frozen=True)
class ModelRequest:
    task_id: str
    agent_id: str
    model_config_version: int
    input_schema: str
    output_schema: str
    redacted_context: dict[str, object]
    max_output_tokens: int
    idempotency_key: str

@dataclass(frozen=True)
class QualityDecision:
    outcome: Literal["accepted", "correct", "escalate"]
    reasons: tuple[str, ...]
    evidence_ids: tuple[str, ...]
```

**Checklist:**

- [ ] Construct prompts from trusted system instructions plus explicitly
  labeled untrusted task/tool content; never concatenate untrusted content into
  policy or tool definitions.
- [ ] Validate the configured primary and ordered fallbacks against the Agent's
  allow-list before every provider call.
- [ ] Reserve maximum estimated cost atomically before a call and settle actual
  token/cost usage afterward; converge safely on retry and provider timeout.
- [ ] Enforce per-call tokens, per-task cost, daily budget, monthly budget,
  timeout, and maximum retry without relying on provider cooperation.
- [ ] Redact or block restricted fields before context construction and again
  before cross-Agent or final sharing.
- [ ] Validate provider output against the purpose-specific schema before
  storing a result or calling another tool.
- [ ] Implement deterministic Quality Gate checks for schema, provenance,
  scope, freshness, arithmetic, leakage, and conflicts.
- [ ] Permit at most two correction attempts; then emit explicit partial result
  or human escalation without AI CEO fabrication.
- [ ] Record model name, configured fallback position, token usage, estimated
  cost, latency, status, policy version, and provenance without prompt/response
  bodies or secrets in normal logs.
- [ ] Test prompt injection, malformed output, unknown model, fallback order,
  timeout, retry, rate limit, budget race, provider outage, redaction, arithmetic
  mismatch, stale data, conflict, and correction exhaustion.

**Exit gate:** Deterministic fake-provider runs prove separate Agent model and
budget scopes, approved fallback order, prompt-injection containment, atomic
cost accounting, structured output, and the two-attempt Quality Gate. An
mandatory credential-owned OpenRouter check succeeds without exposing a key,
prompt, customer data, or provider payload.

---

### Task 5: Phase E — File Intake and Bulk Preview

**Purpose:** Accept DOCX, XLSX, PDF, CSV, and TXT as private untrusted task
sources, safely extract bounded content, generate a source-linked preview, and
require human approval before bulk task creation.

**Focused planning gate:** Create and approve a dated focused design and plan
using the topic slug `agentic-file-intake`. It must pin parser dependencies,
define MIME/signature rules, exact resource limits, quarantine/retention,
formula/macro/link behavior, and the preview schema before implementation.

**Primary implementation areas:**

- Extend the Agentic API with multipart upload, attachment metadata, preview,
  approval, rejection, and deletion endpoints.
- Add private MinIO storage and ClamAV adapters behind inward-facing ports,
  reusing established Support patterns without importing Support internals.
- Add safe parser adapters under `services/ai-runtime/app/agentic/files/`.
- Add file lifecycle workers and migration fields only when the focused design
  assigns their ownership.
- Add fixture files containing valid data, malformed structures, formulas,
  macros, links, oversize content, parser bombs, and prompt injection.

**Interfaces produced:**

```ts
export interface AgenticFileService {
  upload(input: FileUploadInput, principal: StaffPrincipal): Promise<FileRecord>;
  getPreview(fileId: string, principal: StaffPrincipal): Promise<BulkPlanPreview>;
  approvePreview(input: PreviewApprovalInput, principal: StaffPrincipal): Promise<AgentTask>;
  rejectPreview(input: PreviewRejectionInput, principal: StaffPrincipal): Promise<FileRecord>;
}

export interface BulkPlanPreview {
  readonly version: number;
  readonly payloadDigest: string;
  readonly validRows: number;
  readonly invalidRows: readonly PreviewRowError[];
  readonly proposedSubtasks: readonly ProposedSubtask[];
  readonly dependencyGroups: readonly DependencyGroup[];
  readonly approvalPoints: readonly ProposedApprovalPoint[];
  readonly sourceReferences: readonly SourceReference[];
}
```

**Checklist:**

- [ ] Store uploads in a private quarantine bucket with opaque keys and no
  browser-visible credentials or public URL.
- [ ] Detect supported types from signature and bounded content, not filename
  alone; reject type disagreement, encryption, corruption, and unsupported
  archives.
- [ ] Fail closed when ClamAV is unavailable, uncertain, infected, or times out.
- [ ] Never execute macros, scripts, formulas, embedded executables, or external
  links; spreadsheet formulas are inert data or rejected according to the
  focused design.
- [ ] Enforce exact file, page, sheet, row, column, cell, archive expansion,
  parser memory, and processing-time bounds before model context construction.
- [ ] Preserve file/sheet/row/cell or file/page/section provenance for extracted
  values and validation errors.
- [ ] Generate XLSX/CSV grouping candidates and dependency groups, but create no
  tasks until a human approves the exact preview digest and version.
- [ ] Invalidate approval after file, parser version, policy version, grouping,
  or preview changes.
- [ ] Retain or delete quarantine objects according to explicit state and
  retention rules while preserving append-only audit tombstones.
- [ ] Test cross-user ownership, duplicate upload, scanner races, parser timeout,
  hostile document content, approval replay, concurrent preview decisions, and
  storage/database compensation.

**Exit gate:** A human can upload each supported type, see a bounded
source-linked preview, approve an unchanged preview into exactly one task plan,
and observe deterministic rejection for infected, unsupported, hostile,
oversized, stale, duplicate, or changed inputs.

---

### Task 6: Phase F — AI CEO Coordination and Company Memory

**Purpose:** Implement policy-constrained task decomposition, department
assignment, mediated collaboration, executive synthesis, and reviewed durable
Company Memory for Store Health Review.

**Focused planning gate:** Create and approve a dated focused design and plan
using the topic slug `ai-ceo-coordination-memory`. It must define exact planning,
collaboration, executive-report, memory-candidate, conflict, and partial-result
schemas before implementation.

**Primary implementation areas:**

- Add AI CEO planner, dispatcher, collaboration mediator, and synthesizer to
  the AI runtime behind structured ports.
- Add human-managed Store Health Review schedule configuration and an
  idempotent scheduler entry point; schedules create the same governed task
  contract as direct intake and never call Agents directly.
- Extend Agentic domain/application persistence for plan revisions,
  collaboration requests, result dependencies, memory candidates, memory
  versions, staleness, revocation, and approval.
- Expose only the authenticated internal commands needed by Temporal activities
  and the authorized staff queries needed by Console.
- Add deterministic end-to-end tests using fake models and typed fake tools.

**Interfaces produced:**

```ts
export interface CollaborationRequest {
  readonly id: string;
  readonly taskId: string;
  readonly requester: AgentKind;
  readonly requestedDepartment: AgentKind;
  readonly question: string;
  readonly purpose: string;
  readonly dataClass: string;
  readonly evidenceIds: readonly string[];
  readonly version: number;
}

export interface MemoryCandidate {
  readonly taskId: string;
  readonly proposedBy: AgentKind;
  readonly contentDigest: string;
  readonly sourceIds: readonly string[];
  readonly scope: string;
  readonly classification: string;
  readonly reviewDueAt: string;
}
```

**Checklist:**

- [ ] Build the Task Brief from goal, instructions, deadline, approved file
  sources, constraints, expected output, and risk signals.
- [ ] Allow an authorized human to enable, disable, and version one Store Health
  Review schedule with an explicit timezone; derive a unique scheduled
  occurrence key so retry or restart cannot create duplicate tasks.
- [ ] Route every scheduled occurrence through normal intake, policy, model,
  tool, budget, Quality Gate, and approval rules; missed or invalid occurrences
  remain visible and are never silently backfilled into duplicate work.
- [ ] Evaluate policy before planning, assignment, collaboration forwarding,
  every tool call, every model call, and final sharing.
- [ ] Let the model rank only policy-eligible assignments; ambiguous,
  unsupported, or unmatched work pauses for the human.
- [ ] Create an acyclic dependency plan with one owning Agent, expected result
  schema, tool/data scope, freshness, timeout, and budget per subtask.
- [ ] Route all Agent-to-Agent needs as Collaboration Requests through AI CEO
  and Policy Engine; minimize/redact context before forwarding.
- [ ] Pause only the affected branch for approval when dependencies allow other
  branches to proceed.
- [ ] Synthesize only Quality-Gate-accepted results and explicitly preserve
  unresolved conflicts, unavailable data, failed branches, and uncertainty.
- [ ] Produce one executive report with conclusions, actions proposed,
  department evidence, provenance, cost, approval history, conflicts, and
  partial-result disclosure.
- [ ] Separate Task Memory, expiring Agent Working Memory, and reviewed Company
  Memory in both access policy and persistence.
- [ ] Prevent Agents from promoting their own Memory Candidates; bind approval,
  version, scope, classification, sources, reviewer, review date, staleness, and
  revocation.
- [ ] Mark dependent Company Memory stale when authoritative source/version
  signals change; do not implement vector search or GraphRAG.
- [ ] Test cyclic plan rejection, unauthorized delegation, cross-department
  leakage, conflicting results, two failed corrections, partial completion,
  memory self-approval, stale/revoked memory, and deterministic rerun.

**Exit gate:** A direct-entry Store Health Review is decomposed into a valid
parallel/dependency plan, executed by the six scoped Agents, mediated through AI
CEO, checked by Quality Gate, and returned as an honest provenance-backed
executive report; an enabled schedule creates exactly one equivalent governed
task per occurrence across retry/restart; no direct Agent conversation,
permission inheritance, unreviewed Company Memory, or commerce mutation is
possible.

---

### Task 7: Phase G — Console Digital Workforce

**Purpose:** Add an operational Console workspace for task intake, file
preview, execution timeline, approvals, Agent governance visibility, memory,
audit, cost, and final reports.

**Focused planning gate:** Create and approve a dated focused design and plan
using the topic slug `console-digital-workforce`. It must include desktop and
responsive states, keyboard flows, role matrix, loading/empty/error/denial/
waiting/partial/success states, and Stitch-compatible visual references before
frontend changes.

**Primary implementation areas:**

- Create: `apps/console/src/features/agentic/` with `api`, `schemas`, `types`,
  `mappers`, `hooks`, `components`, `pages`, `tests`, and public `index.ts` only
  as each file gains its first approved responsibility.
- Modify: `apps/console/src/app/app-router.tsx` and
  `apps/console/src/app/console-shell.tsx` for role-aware navigation/routes.
- Reuse shared page header, system state, form, dialog, table, timeline, and
  Obsidian Flux tokens rather than creating a second design system.
- Add browser acceptance scripts for task, preview, approval, restart, partial,
  and report flows.

**Required routes:**

- `/agentic/tasks`
- `/agentic/tasks/new`
- `/agentic/tasks/:taskId`
- `/agentic/approvals`
- `/agentic/employees`
- `/agentic/employees/:agentId`
- `/agentic/memory`
- `/agentic/audit`

**Checklist:**

- [ ] Add a **Digital Workforce** navigation group visible only to authorized
  staff, while retaining backend authorization as the security boundary.
- [ ] Build direct task intake and private file upload with safe progress,
  validation, cancel, retry, and no accidental duplicate submission.
- [ ] Render bulk preview counts, invalid rows, proposed Agents, dependency
  groups, tools, data classes, sources, risks, and approval version before the
  approve action.
- [ ] Render task detail as an operational timeline/dependency view, not a
  multi-persona chat.
- [ ] Show task state, branch state, owner, dependencies, tools, freshness,
  model/cost summary, Quality Gate evidence, collaboration, approvals,
  conflicts, provenance, and final report.
- [ ] Build Approval Inbox approve/reject/revise flows that show exact actor,
  resource, action, parameters, payload digest, versions, risk, sources, effect,
  and expiry.
- [ ] Build Employee detail visibility for identity, department, status, model,
  fallbacks, tools, data scope, budgets, health, and run history; configuration
  mutations remain limited to approved governance roles and focused scope.
- [ ] Build reviewed memory and audit surfaces with filters that never reveal
  content beyond the viewer's backend-authorized scope.
- [ ] Add Agentic dashboard summary for running, waiting, failed, completed,
  approvals, and cost without replacing authoritative Commerce metrics.
- [ ] Provide responsive, keyboard-accessible, focus-visible, reduced-motion,
  loading, empty, denied, expired, retrying, canceled, partial, failed, and
  completed states.
- [ ] Prove route deep-linking, refresh, role denial, stale version, duplicate
  click, lost network, and safe recovery through component and browser tests.

**Exit gate:** An authorized operator can submit and follow Store Health Review,
approve a file preview, decide Approval Inbox items, inspect each Agent and
provenance chain, and read the final report from the Console; unauthorized roles
receive no data and every required system state is usable and accessible.

---

### Task 8: Phase H — Cross-department Acceptance and Hardening

**Purpose:** Prove the complete Agentic milestone is deterministic,
least-privilege, recoverable, observable, source-buildable, and safe under
realistic failure and attack conditions.

**Focused planning gate:** Create and approve a dated focused acceptance plan
using the topic slug `agentic-workforce-acceptance`. It must define the exact
fixture ownership, reset behavior, evidence redaction, local Compose topology,
optional credential-owned OpenRouter test, and pass/fail rubric.

**Primary implementation areas:**

- Create deterministic Agentic acceptance fixtures and ownership-scoped cleanup
  without replacing contributor commerce data.
- Add root scripts for Agentic lifecycle, authorization/leakage, workflow
  recovery, file security, browser, and exit checks.
- Extend local Compose, health checks, persistent volumes, resource limits,
  environment validation, Make targets, build docs, deployment docs, API docs,
  dependency docs, roadmap, and `CHANGELOG.md`.
- Keep production enablement separate from local acceptance until a human has
  supplied provider credentials, secret storage, budgets, retention, monitoring,
  and a go-live decision.

**Checklist:**

- [ ] Seed a deterministic Store Health Review window containing catalog gaps,
  low and slow stock, order/payment risks, CRM opportunities, and Support SLA
  risks with exact expected authoritative aggregates.
- [ ] Prove one run produces the expected six department outputs and one
  executive report with source-level provenance, cost, conflicts, and no
  fabricated values.
- [ ] Prove reset and rerun produce the same logical result without duplicate
  tasks, tool effects, budget charges, approvals, audit events, or memory.
- [ ] Prove a scheduled occurrence and its retry/restart path create one task,
  while disabled, expired, or invalid schedules create none and expose an
  auditable state.
- [ ] Kill and restart API, AI runtime, worker, Temporal, PostgreSQL, MinIO, and
  ClamAV at defined checkpoints and verify safe recovery or explicit failure.
- [ ] Run the complete role/Agent/tool/data-class authorization matrix and
  assert zero unauthorized records or model context.
- [ ] Attack task text, every supported file type, tool results, collaboration,
  and memory with prompt injection and verify no policy/tool/secret escape.
- [ ] Test provider outage, fallback exhaustion, budget exhaustion, stale data,
  malformed output, conflicting departments, expired approval, and scanner or
  parser outage.
- [ ] Verify audit/provenance completeness and explicitly scan logs/evidence for
  secrets, PII, uploaded content, prompts, responses, object keys, and payloads.
- [ ] Verify migration up/down/up, backup/restore, health/readiness, clean
  shutdown, persistent restart, bounded resource use, and build from source.
- [ ] Run focused tests, API/Python/Console suites, integration suites, browser
  acceptance, Compose acceptance, `git diff --check`, `pnpm audit:repo`, and
  root `pnpm check` from the committed tree.
- [ ] Run mandatory real OpenRouter acceptance only with owner-supplied
  credentials and redact all external evidence; deterministic fakes remain the
  required normal gate.
- [ ] Record the human production decision. Do not claim production readiness
  when keys, budgets, retention, monitoring, or provider acceptance are absent.

**Exit gate:** From a clean checkout, the documented local stack builds and
runs; deterministic Store Health Review passes happy, partial, denied,
approval, budget, provider, file-security, restart, and rerun scenarios; no
Agent can mutate commerce state, access direct database credentials, leak
cross-scope data, or bypass human approval; the human records an explicit
production enablement decision.

---

## Master Milestone Exit

The Post-Commerce Agentic Workforce milestone is complete only after all eight
focused phases pass their own review and exit gates and the roadmap records the
fresh verification evidence. Completion requires:

- direct and file-backed Store Health Review intake;
- idempotent human-configured scheduled Store Health Review intake;
- an approved file preview before bulk task creation;
- rule-first AI CEO planning and mediated collaboration;
- six separate Department Agent identities, models, tools, scopes, and budgets;
- deterministic Temporal recovery and Quality Gate behavior;
- provenance-backed, honest executive reports and reviewed Company Memory;
- a complete, role-aware Console operational surface;
- zero unauthorized database, tool, model-context, or cross-department data;
- no automatic commerce mutation or customer communication; and
- passing full-source, migration, security, recovery, Compose, and browser
  acceptance from the committed tree.
