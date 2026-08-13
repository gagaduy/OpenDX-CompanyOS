<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agent Governance Foundation Design

## Status

Approved in collaborative design on 2026-08-14. Written-spec review is the
remaining gate before the file-level implementation plan may be created.

## Purpose

Phase A creates the trusted control plane for the Post-Commerce Agentic
Workforce. It establishes human and Digital Employee identities, non-executing
tasks, deterministic policy, versioned governance configuration, typed tool
registration, budget accounting, bound approvals, audit, and provenance.

This phase deliberately does not execute Temporal workflows, call OpenRouter,
read commerce data, parse uploaded files, or mutate any commerce state.

## Architecture and Ownership

Phase A adds one feature-first module:

```text
apps/api/src/modules/agentic/
  presentation -> application -> domain
       infrastructure -> application/domain contracts
```

The single module keeps closely coupled governance invariants and transactions
together while their runtime consumers do not yet exist. Internally, focused
files and services separate task, identity, policy, tool, budget, approval,
configuration, audit, and provenance responsibilities. A later phase may split
a boundary only when demonstrated ownership or deployment needs justify it.

PostgreSQL is authoritative. TypeScript application/domain code owns policy and
authorization. The Python AI Runtime receives no governance authority in this
phase. The module imports other features only through public APIs and does not
import commerce entities, repositories, migrations, or infrastructure.

## Human Roles

Phase A adds four Keycloak-backed staff roles:

| Role | Authority |
| --- | --- |
| `agentic_operator` | Create and inspect permitted tasks; edit own drafts; ready or cancel own eligible tasks |
| `agentic_approver` | Inspect and decide approval requests within assigned scope, except self-created requests |
| `agentic_governance_admin` | Draft and submit Agent, policy, tool, model, and budget configuration; request emergency revocation |
| `agentic_auditor` | Read filtered audit and provenance without secrets or unauthorized sensitive content |

`administrator` retains full human authority and is the only role allowed to
activate an emergency revocation immediately. Holding multiple roles never
allows a person to approve their own request or configuration revision.

Backend authorization is authoritative. Console route visibility in later
phases is only a usability control.

## Digital Employee Identity

The initial workforce contains exactly seven fixed identities:

```text
agent-ai-ceo
agent-catalog
agent-inventory
agent-order
agent-finance
agent-crm
agent-support
```

Each identity is a separate Keycloak confidential client and service account
using client credentials. The backend validates issuer, audience, subject, and
authorized party/client identifier, then maps the token to one active immutable
Agent profile. A payload-provided `agentId` never grants authority.

Staff identities and Agent service identities are separate security domains.
Agents cannot use staff roles, share client secrets, impersonate another Agent,
or modify their own identity, grants, model, budget, or policy.

Phase A provisions and validates the identity mapping but does not expose an AI
Runtime service API or execute an Agent.

## Governance Data Model

The focused implementation plan must define normalized migrations for these
concepts and their necessary supporting records:

### Agents

`agentic_agents` stores the seven immutable Agent kinds, Keycloak client
identity, active/revoked state, version, and timestamps. Secrets are never
stored in PostgreSQL.

### Tasks and subtasks

`agentic_tasks`, `agentic_subtasks`, and
`agentic_subtask_dependencies` store human intake provenance, ownership,
optimistic version, plan structure, and pinned configuration references.
Dependencies must remain within one task, cannot self-reference, and cannot
form a cycle.

Phase A task state is intentionally limited to:

```text
draft -> ready
draft | ready -> canceled
```

`ready` is a terminal Phase A state meaning governance input is frozen and
ready for a future workflow. Phase A does not claim `running` or `completed`.
Those transitions belong to the Temporal phase.

### Configuration revisions

`agentic_configuration_revisions` binds a consistent set of policy, tool grant,
model configuration, and budget records. Its lifecycle is:

```text
draft -> pending_approval -> active -> superseded
                          \-> rejected
```

Only drafts may be edited. Submitted, active, rejected, and superseded
revisions are immutable. Exactly one revision may be active. Activating a valid
revision supersedes the old active revision atomically.

### Policies

`agentic_policies` stores versioned deterministic rules over actor, Agent,
department, resource, action, purpose, and data classification. Conditions use
a bounded validated schema, not executable expressions or code.

### Tool descriptors and grants

`agentic_tools` stores immutable name/version descriptors and input/output
schema digests. `agentic_tool_grants` binds a revision, Agent, tool version,
purpose, data scope, and invocation bounds. Phase A contains no operational
commerce tool adapter and no generic query or SQL descriptor.

### Model configuration

`agentic_model_configs` stores a human-approved primary OpenRouter model,
ordered approved fallbacks, input/output token caps, task cost limit, daily and
monthly limits, timeout, and retry maximum per Agent. Phase A validates and
versions these values but does not invoke a provider.

### Budget ledger

Budget records use integer configured cost subunits, never floating point.
Reservations and settlements use unique idempotency keys. PostgreSQL locking
and constraints prevent concurrent reservations from exceeding task, daily, or
monthly limits. A settlement cannot exceed or be detached from its reservation.

### Approvals

`agentic_approval_requests` binds the requester, approver scope, task when
applicable, actor, resource, action, normalized-parameters digest, policy and
workflow/configuration versions, expiry, decision, and optimistic version.
Approval is single-purpose and single-decision. Changed input, changed bound
version, or expiry invalidates it.

### Audit and provenance

`agentic_audit_events` and `agentic_provenance_records` are append-only.
Required audit fields include actor/service identity, task where applicable,
action, resource, outcome, relevant policy/model/tool version, correlation ID,
causation ID, and timestamp. Provenance identifies a source and digest without
placing secrets or sensitive payload bodies into logs.

Database constraints enforce immutable identity, lifecycle, ownership,
versioning, uniqueness, append-only history, approval binding, and monetary
invariants. Required mutations and their audit event occur in one transaction;
audit failure rolls back the mutation.

## Configuration Governance

Configuration follows a two-person rule:

1. A Governance Admin creates and edits a draft revision.
2. The backend validates every referenced Agent, policy, tool, model, and
   budget rule.
3. The creator submits the immutable revision for approval.
4. A different Governance Admin or an `administrator` reviews the exact diff.
5. The reviewer activates or rejects the revision with a reason.
6. Activation atomically supersedes the previous active revision.

The creator cannot approve the revision even when they also hold the approver
or administrator role. Optimistic concurrency permits only one decision and one
active winner.

When a task becomes `ready`, it pins the active configuration revision and its
policy, tool, model, and budget versions. Later activation affects only new
tasks. Historical snapshots remain immutable.

## Emergency Revocation

Emergency revocation is distinct from normal revision activation:

- only an `administrator` can activate it immediately;
- a Governance Admin can submit a revocation request for a different authorized
  human to approve;
- it may revoke an Agent identity, tool grant, or model;
- every future authorization use checks current revocation state, including
  tasks pinned to an older revision;
- it records a separate append-only revocation and audit event rather than
  rewriting historical configuration;
- affected future workflows will pause or fail explicitly and cannot silently
  replace the revoked authority.

## Task Behavior

An Operator creates a draft with a goal, bounded instructions, optional
deadline, and intake provenance. Only the creator may edit or ready the draft.
The creator may cancel their own eligible task. A Governance Admin or
`administrator` may cancel any eligible task. A canceled task cannot return to
draft or ready.

Before `ready`, the service validates the task and active configuration, pins
the exact revision, and records the mutation with audit atomically. With no
active configuration, the transition fails with
`NO_ACTIVE_CONFIGURATION`.

Task list/detail authorization is owner- and role-scoped in the backend.
Auditors receive only purpose-specific audit views, not task contents by
default.

## Policy Evaluation

Every decision follows this fixed order:

1. Check current emergency revocation.
2. Match bounded rules by actor, Agent, department, resource, action, purpose,
   and data classification.
3. Any matching `DENY` wins.
4. Otherwise, any matching `REQUIRE_APPROVAL` wins.
5. Otherwise, an explicit matching `ALLOW` permits the request.
6. No match is `DENY`.

The result is stable and explainable:

```ts
interface PolicyDecision {
  readonly effect: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  readonly policyVersion: number;
  readonly reasonCode: string;
  readonly matchedRuleIds: readonly string[];
  readonly evaluatedAt: string;
}
```

Models never define, override, or expand this result.

## Tool Registry Boundary

Phase A registers immutable tool descriptors and authorizes proposed
invocations. Authorization checks service identity, active task and purpose,
pinned revision, current revocation, tool grant/version, data classification,
validated parameter schema, invocation bounds, and available budget.

There is no commerce tool implementation in this phase. An authorized tool
without an adapter returns `TOOL_UNAVAILABLE` and records a safe audit event. It
never fabricates output. Unknown tools, versions, parameters, grants, or scopes
are denied before an adapter boundary.

## Approval Behavior

Approval Requests start `pending` and transition exactly once to `approved`,
`rejected`, or `revision_requested`. A pending request whose expiry is reached
is treated as `expired` and cannot be decided. The requester and decider must be
different subjects. Decisions check current optimistic version, expiry, scope,
bound payload digest, and configuration/policy version inside one transaction.

Only the exact approved action may proceed. Approval is not a bearer token,
cannot be replayed, and cannot grant a new permission.

## Staff API

Phase A mounts staff endpoints under:

```text
/v1/admin/agentic/tasks
/v1/admin/agentic/approvals
/v1/admin/agentic/employees
/v1/admin/agentic/configuration-revisions
/v1/admin/agentic/audit
```

The focused plan defines the minimal route set for create, list, detail, draft
update, ready, cancel, submit, diff, decide, and filtered audit behavior. It
must not add speculative runtime endpoints.

All input uses strict Zod schemas with unknown-field rejection, bounded string
lengths, UUID validation, valid timestamps, constrained pagination, and
normalized policy/tool/model configuration. API responses retain the existing
success/error envelope.

Stable Phase A error codes include:

- `FORBIDDEN`
- `AGENT_NOT_ACTIVE`
- `TASK_NOT_FOUND`
- `TASK_STATE_INVALID`
- `STALE_VERSION`
- `NO_ACTIVE_CONFIGURATION`
- `SELF_APPROVAL_FORBIDDEN`
- `APPROVAL_EXPIRED`
- `APPROVAL_ALREADY_DECIDED`
- `CONFIGURATION_INVALID`
- `POLICY_DENIED`
- `TOOL_UNAVAILABLE`
- `BUDGET_EXCEEDED`

Error messages and audit metadata do not reveal secrets, tokens, sensitive task
content, policy internals outside the viewer's scope, or PII.

## Failure and Concurrency

- Concurrent task updates use expected versions; exactly one stale competitor
  is rejected.
- Concurrent revision decisions permit exactly one result and one active
  configuration.
- Concurrent approval decisions permit exactly one result.
- Concurrent budget reservations cannot exceed any configured limit.
- An audit write failure rolls back its required business mutation.
- Database or Keycloak dependency failure is explicit and fail-closed.
- Phase A readiness checks PostgreSQL and the Agentic migration, but does not
  depend on Temporal or OpenRouter.
- No in-memory production fallback is introduced.

## Validation Strategy

Implementation uses RED-GREEN-REFACTOR for:

1. domain lifecycles and invariants;
2. PostgreSQL migration and constraints;
3. repository concurrency;
4. deterministic policy precedence;
5. Tool Registry authorization;
6. idempotent budget reservation and settlement;
7. two-person configuration activation and approvals;
8. staff and service identity authentication/authorization;
9. audit/provenance atomicity and redaction;
10. API composition and stable errors.

Mandatory tests prove:

- exactly seven unique Agent-to-Keycloak-client mappings;
- staff tokens cannot impersonate Agents and Agent tokens cannot use staff
  roles;
- deny precedence and deny-by-default behavior;
- configuration pinning and emergency revocation behavior;
- self-approval prevention even with overlapping roles;
- one winner for concurrent task, configuration, approval, and budget writes;
- expired, changed, stale, and replayed approvals fail closed;
- required audit failure rolls back the mutation;
- zero token, secret, sensitive payload, or unauthorized record leakage;
- owner-scoped task visibility and cancellation;
- Auditor read-only filtered access;
- no private commerce imports, model calls, Temporal workers, generic SQL tools,
  or commerce mutations.

Agentic migrations must pass `up -> down -> up` within the established chain
after Support. Final validation includes:

```bash
pnpm --filter @opendx/api test
pnpm --filter @opendx/api test:integration
pnpm --filter @opendx/api typecheck
pnpm audit:repo
pnpm check
git diff --check
```

## Out of Scope

- Temporal server, SDK, workflow, activity, or worker.
- OpenRouter calls or any other model provider invocation.
- Commerce read tools, analytics views, free-form SQL, or direct database
  access by Agents.
- File upload, MinIO Agentic buckets, ClamAV Agentic scanning, or parsing.
- AI CEO planning, collaboration, synthesis, Quality Gate, or memory.
- Console Digital Workforce pages.
- Scheduled Agentic task execution.
- Commerce mutation or customer communication.
- Generic workflow or policy-expression builders.

## Exit Criteria

Phase A exits only when:

- four human roles and seven distinct Agent service identities are enforced;
- a human can create, inspect, ready, and appropriately cancel a non-executing
  task;
- versioned governance configuration follows the two-person rule;
- policy is deterministic, deny-first, explainable, and deny-by-default;
- tool descriptors/grants authorize safely without an operational adapter;
- model and budget configuration is validated without calling a provider;
- approval binding, expiry, non-replay, and self-approval prevention hold;
- emergency revocation applies immediately to subsequent authorization checks;
- PostgreSQL constraints, concurrency, audit, and provenance pass focused tests;
- the migration chain passes `up -> down -> up`;
- repository-wide validation and independent review have no unresolved
  Critical or Important findings; and
- no runtime Agent, Temporal workflow, model call, commerce data access, or
  commerce mutation exists.
