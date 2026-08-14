<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Store Health Temporal Workflow Design

## Status

Approved in collaborative design on 2026-08-14. Written-spec review is the
remaining gate before a file-level implementation plan may be created.

## Purpose

Phase B adds durable orchestration for the fixed Store Health Review & Action
Plan. A human readies a governed Agentic task, explicitly starts one workflow
run, and can later provide a bound approval or cancellation through the staff
API. The workflow survives worker, API, Temporal, and PostgreSQL restarts while
preserving deterministic ordering, bounded retry, idempotency, audit, and
observable partial or failed outcomes.

This phase uses deterministic fake activities. It does not call OpenRouter,
read Commerce data, execute a Department Agent, parse files, create Company
Memory, render Digital Workforce Console pages, or mutate Commerce state.

## Delivery Target

The same service topology must support local testing and a production-candidate
single Linux VPS running Docker Compose. Local development may use internal
plaintext connections and local-only credentials. Production requires
internal TLS where specified, non-placeholder secrets, persistent volumes,
restart policies, backup and restore coverage, and no public Temporal port.

This phase prepares production-capable deployment files but does not rent a
VPS, configure DNS, deploy a public environment, or activate production SePay.
SePay configuration and payment behavior are unchanged.

## Versions, Licenses, and Source-Build Impact

Phase B pins these reviewed upstream dependencies:

| Dependency | Version | License | Use |
| --- | --- | --- | --- |
| Temporal Server | `1.31.2` | MIT | Durable workflow history, timers, task queues, signals, and recovery |
| Temporal Python SDK | `1.30.0` | MIT | Workflow, activity, worker, client, replay, and time-skipping tests |
| PostgreSQL | Existing `18.3` pin | PostgreSQL License | Separate Temporal persistence and visibility databases |

The implementation plan must resolve and commit immutable multi-architecture
image digests for every new Temporal image before Compose changes are accepted.
Production uses the official `temporalio/server` image, not `start-dev` or
`temporalio/auto-setup`. Supported official schema tooling runs as explicit
one-shot jobs before the server starts.

The normal project source build installs the published `temporalio==1.30.0`
wheel. Building that SDK itself from source requires its documented Rust,
Protobuf, and `uv` toolchain, but those tools do not become repository build
dependencies. Temporal Server is consumed as a pinned upstream image rather
than vendored or rebuilt in this repository. `docs/dependencies.md` and
`docs/build-from-source.md` must record this boundary.

## Architecture

```text
Staff Console or staff API client
              |
              v
      Agentic staff API
  authorization + PostgreSQL mutation
              |
              v
       Workflow Gateway port
              |
              v
 AI Runtime internal control API
              |
              v
       Temporal Python client
              |
              v
 Temporal Server -- opendx namespace
       |                    |
       v                    v
 temporal databases   AI Runtime worker
                            |
                            v
                 Agentic internal activity API
                            |
                            v
               PostgreSQL Agentic control plane
```

PostgreSQL remains authoritative for Agentic task contents, configuration,
policy, approvals, workflow-run projection, activity invocation outcomes,
audit, and provenance. Temporal owns durable execution history, timers, retry,
task queues, signals, fan-out/fan-in, and workflow restart recovery. Neither
store replaces the other.

The Express Agentic application depends on an inward-facing `WorkflowGateway`.
Its infrastructure HTTP adapter invokes the AI Runtime control API; Express
does not import a Temporal SDK. The Python AI Runtime owns the Temporal client,
workflow definitions, activities, and worker composition. Workflow code never
calls HTTP, reads a database, generates identifiers, reads environment values,
or consults wall-clock time directly.

## Deployment Topology

### PostgreSQL isolation

The existing PostgreSQL server hosts three logical databases with separate
ownership:

- `opendx`: existing Company and Commerce source of truth;
- `temporal`: Temporal execution persistence;
- `temporal_visibility`: Temporal visibility persistence.

A dedicated Temporal database role can access only the two Temporal databases.
The Commerce API role cannot read Temporal tables, and Temporal cannot read the
`opendx` database. Database creation and Temporal schema upgrades run through
reviewed one-shot jobs with an administrative credential supplied only at the
deployment boundary.

Production startup never lets the long-running Temporal Server silently create
or upgrade its schema. Schema jobs must succeed before Temporal readiness can
succeed. Local setup is also idempotent and uses the same explicit sequence.

### Temporal services

One Temporal Server process runs all server roles for the approved single-VPS
target. This is not a high-availability cluster and must not be documented as
one. The service uses persistent PostgreSQL state, a bounded dynamic
configuration file, health checks, and a restart policy.

Temporal frontend port `7233` is available only on the internal Docker network
in production. It is not routed by Caddy. A Temporal UI is not a production
service in Phase B. Local debugging may use the CLI through a one-shot tools
container, but no additional product-facing UI is introduced.

The AI Runtime image has two independently supervised process roles:

- an internal FastAPI service for authenticated workflow control and health;
- a Temporal worker polling the versioned Store Health task queue.

The worker stops polling, drains in-flight activities for a bounded interval,
and shuts down cleanly on termination. Liveness does not depend on Temporal;
readiness does.

### Transport and workload identity

Production Temporal client connections from the AI Runtime use TLS with a
deployment-managed trust root and client certificate. Local Compose may use
plaintext on the private development network. Certificates and private keys
are mounted or injected and are never committed.

The API and AI Runtime use distinct non-Agent workload identities for their
internal HTTP calls. These identities are separate from the seven immutable
Digital Employee identities and cannot call staff routes or inherit Agent
grants. The focused implementation plan must use short-lived Keycloak client
credential tokens at both HTTP boundaries:

- API workload -> AI Runtime workflow control endpoints;
- AI Runtime worker -> Express Agentic activity endpoints.

Tokens are validated for issuer, audience, subject, and authorized client at
the receiving boundary. A task ID, workflow ID, Agent kind, or signal payload
never proves workload identity.

## Authoritative Data Model

Phase B extends the Agentic PostgreSQL schema with focused relational records.
The implementation plan must name exact columns, constraints, indexes, and
retention, but the model must cover these responsibilities:

- `WorkflowRun`: task, workflow name/version, plan revision, Temporal workflow
  ID/run ID, observable state, outcome, optimistic version, and timestamps;
- `ActivityInvocation`: stable invocation key, workflow run, activity kind,
  branch/subtask identity, attempt-independent input digest, terminal outcome,
  and safe error code;
- `WorkflowSignalReceipt`: approval or cancellation identity, payload digest,
  application decision version, accepted/rejected outcome, and deduplication;
- append-only audit and provenance records for start, state projection,
  activity outcome, signal, cancellation, and terminal convergence.

Required important mutations and their audit event occur in one PostgreSQL
transaction. Payload bodies, credentials, model prompts, future tool results,
and customer/payment PII are not stored in workflow projection or audit.

Temporal payloads carry only bounded identifiers and immutable version values:

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
```

## Start Contract

Moving a Phase A task to `ready` freezes its governed input but does not start
execution. An authorized human explicitly starts the workflow through:

```text
POST /v1/admin/agentic/tasks/:taskId/start
```

The request includes the expected task version and the supported workflow
version. Before starting, the Agentic application verifies:

1. staff authentication and task ownership or oversight authority;
2. task state is `ready` and not canceled;
3. expected version matches;
4. pinned configuration is still valid for start;
5. current emergency revocation does not forbid execution;
6. task graph and plan revision remain immutable;
7. no active or terminal run already owns the same task, workflow version, and
   plan revision.

The application creates the run projection and audit atomically, then invokes
the `WorkflowGateway` with a stable workflow ID derived from the authoritative
run identifier. Repeated equivalent starts return the existing run. A request
with a conflicting version or workflow identity fails closed. If PostgreSQL
commits but Temporal start acknowledgement is lost, retry uses the same
workflow ID and converges without a second run.

## Workflow Lifecycle

The immutable first definition is named `StoreHealthReviewWorkflowV1` and uses
a versioned task queue. Its happy path is:

```text
received
-> planning
-> awaiting_plan_approval (only when required by the frozen plan)
-> dispatching
-> department_analysis
-> quality_review
-> collaboration (only when required)
-> executive_synthesis
-> completed
```

Observable non-happy states are:

```text
awaiting_human_approval
retrying
partially_completed
failed
canceled
```

Phase B activities are deterministic fakes selected by test-safe frozen plan
metadata. They emulate success, retryable failure, non-retryable failure,
approval wait, dependency order, and bounded latency. They do not call models,
tools, Commerce APIs, or databases directly.

Independent branches execute concurrently. A branch starts only after every
declared dependency has a usable terminal result. Failure blocks dependent
branches but does not cancel unrelated branches. The workflow produces
`partially_completed` when at least one useful independent branch completes and
the fixed synthesis policy permits an honest partial outcome. It never invents
missing department results.

Retries use explicit maximum attempts, activity timeouts, and bounded backoff.
Business rejection, policy denial, stale input, invalid approval, and schema
failure are non-retryable. Workflow code maps expected terminal conditions to
observable outcomes instead of hiding them in unstructured exceptions.

## Activities and Idempotency

Every activity receives a stable application invocation key derived from the
workflow run, workflow version, activity kind, branch identity, and immutable
input digest. Before performing its fake Phase B operation, the activity calls
the authenticated internal Agentic API to reserve or recover that invocation.

An invocation has one durable terminal outcome. Duplicate Temporal delivery,
worker death after persistence, or client retry returns the stored outcome.
Conflicting input under the same invocation key is rejected. An activity does
not acknowledge success until the application result and required audit are
committed.

The internal activity API is purpose-specific. It does not expose a generic
database, policy, tool, SQL, or arbitrary state-mutation endpoint.

## Approval and Cancellation Signals

Staff never signal Temporal directly. Approval and cancellation enter through
the authenticated Express application:

```text
staff request
-> backend role/ownership check
-> approval binding, digest, expiry, policy/version, and optimistic check
-> PostgreSQL decision plus audit
-> WorkflowGateway signal using the authoritative run identity
```

The workflow accepts an approval only when the approval ID, payload digest,
decision, workflow version, and current wait point match. Duplicate equivalent
signals are no-ops with evidence. Changed, stale, expired, replayed, or
cross-task signals do not resume execution.

Cancellation is bound to an authorized task/run action and a bounded reason
code. It propagates to outstanding branches and prevents later activities from
starting. Already committed activity evidence remains immutable. A completed,
failed, partially completed, or canceled run cannot be reopened by a signal.

## Workflow Versioning and Replay

Published `StoreHealthReviewWorkflowV1` behavior is immutable. A behavior
change that could alter replay creates a new workflow definition and task queue
version. Existing histories retain their original definition until terminal.
Deployment must keep workers capable of replaying supported in-flight versions
during an upgrade or drain those versions through an explicit operator plan.

Replay tests load recorded representative histories for success, approval,
retry, partial completion, and cancellation. A deployment that cannot replay
them fails validation.

## Failure and Recovery

- Worker termination causes Temporal to redeliver unfinished activities;
  application idempotency prevents duplicate effects.
- API restart does not stop workflow timers or branch orchestration. Workflow
  control requests reconnect through the gateway after readiness returns.
- Temporal restart reloads execution history from PostgreSQL and resumes task
  queues without rebuilding state from the Agentic projection.
- PostgreSQL unavailability makes Temporal and Agentic readiness fail closed.
  Liveness remains a process-only signal.
- Lost start or signal acknowledgements converge through stable workflow IDs
  and signal receipts.
- Retry exhaustion produces an explicit branch/run outcome and safe error code.
- Invalid workflow payloads fail without leaking the rejected body into logs.
- A mismatched Agentic projection is surfaced as an operational error; neither
  Temporal history nor PostgreSQL is silently overwritten to match the other.

## Health, Readiness, and Observability

Health boundaries are separate:

- AI Runtime liveness: process and event loop respond;
- AI Runtime readiness: Temporal client connected and required namespace is
  available;
- worker readiness: worker has connected and begun polling the expected task
  queue;
- Temporal readiness: server accepts a bounded health request and persistence
  schema is compatible;
- API readiness: existing dependencies plus the configured workflow gateway
  are ready when Agentic execution is enabled.

Structured logs include correlation, causation, task, workflow run, safe
activity kind, attempt, duration, outcome, and error code. They exclude tokens,
certificates, task instructions, payload bodies, customer/payment PII, future
tool results, and Temporal raw histories. Metrics cover starts, active/waiting
runs, activity latency/outcome, retry exhaustion, signal rejection, polling
health, and terminal outcomes without high-cardinality or sensitive labels.

## Backup, Restore, and Upgrade

The local and production database operations must include `opendx`, `temporal`,
and `temporal_visibility` as one documented recovery set. MinIO remains a
separate backup boundary. A backup is not published as complete unless all
required PostgreSQL archives succeed and are non-empty.

Restore quiesces API, AI Runtime, worker, and Temporal before replacing data.
The runbook restores the three databases, applies only supported ordered schema
upgrades, starts Temporal, then worker and API, and verifies projection/history
consistency. The acceptance test must restore a workflow waiting for approval,
submit the original valid approval after restart, and observe exactly one
completion.

Temporal schema upgrades are explicit operator jobs executed before a server
version requiring them. Downgrade is not assumed safe; rollback uses the
documented compatible image/schema matrix or restores the pre-upgrade recovery
set. Production image and SDK upgrades require replay validation first.

## Local and Production Compose

Local `make up` adds the Temporal database bootstrap/schema jobs, namespace
setup, Temporal Server, AI Runtime API, and worker. The normal healthy stack
therefore exercises the real server and worker rather than an in-memory fake or
`start-dev`. Focused tests may use the SDK time-skipping test environment where
real wall-clock waiting would make unit tests impractical.

Production Compose adds the same long-running services and ordered one-shot
jobs with production environment validation, persistent PostgreSQL storage,
internal TLS, restart policies, and no public Temporal route. Placeholder
credentials or missing TLS material fail before application traffic starts.

The single-VPS topology is production-capable but not highly available. The
documentation must state that VPS or PostgreSQL loss interrupts service until
restore or restart. Multi-node Temporal, PostgreSQL HA, Kubernetes, and
automatic failover require a later approved deployment design.

## Validation Strategy

Implementation follows RED-GREEN-REFACTOR and must include:

### Python workflow and activity tests

- deterministic happy path and exact observable state order;
- independent branch concurrency and dependency ordering;
- retryable versus non-retryable failure;
- bounded retry and timeout behavior;
- honest partial completion;
- approval wait, valid resume, rejection, stale/duplicate signal, and expiry;
- cancellation propagation;
- activity invocation idempotency;
- immutable V1 history replay;
- graceful worker shutdown.

### API and PostgreSQL tests

- explicit authorized start and denied cross-owner start;
- one run under concurrent/repeated starts;
- start acknowledgement loss convergence;
- workload identity separation at both internal HTTP boundaries;
- signal binding, deduplication, expiry, and audit atomicity;
- one activity outcome under duplicate/concurrent delivery;
- zero access from the Temporal role to Commerce data;
- reversible Agentic migrations and complete migration lifecycle.

### Lifecycle and deployment tests

- local Compose schema/bootstrap idempotency;
- production Compose fail-closed configuration;
- kill/restart API, AI Runtime, worker, Temporal, and PostgreSQL;
- continue a waiting workflow after service restart;
- recovery-set backup/restore followed by exactly-once valid resume;
- dependency-aware liveness/readiness behavior;
- no public Temporal, UI, PostgreSQL, or worker port in production;
- repository audit, dependency documentation, build-from-source checks,
  `git diff --check`, and root `pnpm check`.

## Documentation Impact

The implementation unit must update:

- `docs/api/agentic.md` for start, run, signal, and internal activity contracts;
- `docs/architecture/system-baseline.md` for the active Temporal boundary;
- `docs/dependencies.md` for SDK/server versions, licenses, and image digests;
- `docs/build-from-source.md` and Docker documentation for local validation;
- `docs/deployment/production.md` and `infra/deploy/README.md` for the VPS
  topology, TLS, upgrade, and readiness contract;
- database backup/restore operations for the three-database recovery set;
- `.env.example`, `CHANGELOG.md`, and `docs/roadmap/mvp-status.md`.

## Out of Scope

- OpenRouter or any model provider call.
- Real AI CEO or Department Agent reasoning.
- Commerce tools, analytics views, or direct Commerce reads.
- File upload, parsing, MinIO Agentic buckets, or ClamAV Agentic scanning.
- Quality Gate implementation beyond deterministic fake workflow stages.
- Collaboration content, Company Memory, vector search, or GraphRAG.
- Digital Workforce Console pages or Temporal UI exposure.
- Commerce mutation, customer communication, or production SePay activation.
- Generic workflow builder, arbitrary workflow definitions, schedules, or
  event-triggered Commerce automation.
- Multi-node Temporal, Kubernetes, managed Temporal Cloud, or PostgreSQL HA.

## Exit Criteria

Phase B exits only when:

- an authorized human explicitly starts one fixed V1 workflow from a ready
  governed task;
- repeated or concurrent start converges on one workflow run;
- independent branches run concurrently and dependencies run in order;
- activities remain idempotent under duplicate delivery and worker death;
- retry, timeout, approval, cancellation, partial, failed, and completed states
  are explicit and auditable;
- only a valid version-bound application approval resumes a waiting workflow;
- representative V1 histories replay under the committed worker;
- worker, API, Temporal, and PostgreSQL restart recovery pass;
- the three-database backup/restore acceptance resumes one waiting workflow
  exactly once;
- local and production-candidate Compose use pinned supported Temporal images,
  production keeps Temporal internal, and health boundaries are truthful;
- focused Python, TypeScript, PostgreSQL, identity, Compose, lifecycle, backup,
  audit, dependency, and repository-wide gates pass;
- independent review has no unresolved Critical or Important findings; and
- no model call, Commerce data access/mutation, file intake, Agent execution,
  Agentic Console UI, or production SePay activation exists.
