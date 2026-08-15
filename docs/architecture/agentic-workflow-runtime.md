<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agentic Workflow Runtime

## Ownership And Dependencies

`apps/api/src/modules/agentic` owns staff authorization, task/configuration
truth, frozen plans, approvals, audit/provenance, workflow projections,
idempotency receipts, and activity reservations in PostgreSQL. Its application
layer depends on an inward-facing workflow gateway; the HTTP adapter depends on
that port, never the reverse.

`services/ai-runtime/app/agentic` owns the Temporal client, worker,
`StoreHealthReviewWorkflowV1`, bounded fake activities, and the authenticated
runtime gateway. Workflow code calls activity/application contracts only.
Concrete Temporal, Keycloak, and HTTP clients stay in infrastructure. No Python
module imports Commerce implementation code and no agent receives database
credentials.

The API and worker use distinct confidential Keycloak workload identities.
Staff tokens cannot call internal workload routes; workload tokens cannot call
staff administration routes. The public edge denies `/v1/internal/agentic*`.

## Durable Execution Contract

Temporal history owns orchestration progress, timers, retry scheduling, and
signals. PostgreSQL owns the safe application projection. Projection sequence
and optimistic version checks make repeated callbacks converge without moving
backward or changing a terminal result.

Workflow code must remain deterministic: no direct clock, randomness, network,
filesystem, environment reads, database access, or model calls. Workflow and
activity names, payload fields, enum spelling, task queue `store-health-v1`, and
workflow version `1` are compatibility contracts. Representative restored
histories must replay with the current worker before deployment.

Every activity derives a stable invocation key from the frozen run/stage/branch
identity. It reserves that key through the API before work, then completes or
fails the same record. Duplicate delivery returns the prior result; a different
digest or binding fails closed. Cancellation cleanup records a safe failure so
a committed reservation is not stranded.

Retryable failures are bounded transport/timeouts and server availability.
Authentication, authorization, malformed responses, invalid frozen plans,
schema errors, policy rejection, and binding conflicts are nonretryable.
Activity timeouts cover queue plus execution, retry transitions are projected,
and exhaustion maps to an explicit terminal outcome.

Approvals bind the persisted approval ID, workflow run, synthesis payload
digest, decision, and application decision version. Cancellation binds run,
reason, payload digest, and receipt ID. Receipts are stored before delivery;
duplicates with the same binding are safe and conflicts are rejected. Signals
received early are retained by the workflow until their matching wait point.

## Operations

Liveness proves only that the process is alive. Readiness verifies PostgreSQL,
Keycloak/runtime dependencies, Temporal connectivity, namespace, expected task
queue, and the current worker's exact poller identity. Structured logs and
Prometheus metrics carry correlation, causation, task, run, activity,
invocation, attempt, outcome, duration, and safe error-code fields.

Local Compose runs PostgreSQL, Temporal, namespace registration, AI Runtime,
and the worker with pinned images. Production is a non-HA single-VPS candidate:
Temporal and the runtime remain private, Caddy is the only public ingress, and
Temporal uses mTLS with separate server/client certificates. The topology has
restart, health, resource, read-only filesystem, capability, and graceful-drain
bounds, but one host and one Temporal frontend remain a deliberate availability
limit.

A PostgreSQL recovery set contains `opendx.dump`, `temporal.dump`,
`temporal_visibility.dump`, `manifest.json`, and `checksums.sha256`. Backup
quiesces API entry points and the worker, drains in-flight work, verifies every
archive, and restores service readiness in dependency order. Restore validates
members, checksums, database roles, application migrations, Temporal schemas,
and namespace before reopening workloads. The live recovery gate destroys only
suffixed disposable databases, restores a waiting workflow, replays its JSON
history, and proves activity invocation idempotency.

Phase B deliberately has no OpenRouter/model execution, Commerce tool adapter,
file intake, Agentic Console page, Temporal UI, public port `7233`, or
production SePay activation. Those require their own Phase C-H approvals.
