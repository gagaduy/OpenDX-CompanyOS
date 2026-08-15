<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agentic Department Read Tools Design

## Status

Approved by the user on 2026-08-16. The file-level implementation plan is
`docs/superpowers/plans/2026-08-16-agentic-department-read-tools.md`.

## Purpose

Phase C gives the six Department Agents the minimum authoritative Commerce
context needed by Store Health Review. It adds versioned, typed, read-only
tools behind the existing Tool Registry. It does not call OpenRouter, accept
files, add AI CEO synthesis or memory, render an Agentic Console page, or
mutate Catalog, Inventory, Order, Payment, CRM, or Support state.

The phase closes the gap left intentionally by Phases A and B: Tool Registry
authorization currently terminates with `TOOL_UNAVAILABLE`, while the durable
workflow uses bounded fake activity results. Phase C replaces only the missing
Commerce read boundary. Phase D remains responsible for model execution and
for consuming these results in real Department Agent analyses.

## Decisions

The approved design uses a hybrid data path:

- authoritative state and record evidence use focused public application
  ports owned by the relevant Commerce module;
- cross-module aggregates use purpose-specific PostgreSQL views owned by the
  Reporting module and a separate read-only database role;
- Agentic code imports Commerce contracts only through module `index.ts`
  files and never imports a private repository or entity;
- outputs contain aggregates and opaque internal identifiers only where an
  investigation requires them; they contain no customer name, email, phone,
  address, note body, ticket text, provider payload, or provider identifier;
- every tool is independently versioned and granted. There is no department
  super-tool, generic query endpoint, selectable column list, or SQL surface.

The rejected alternatives are an all-service design, which makes bounded
cross-module analytics unnecessarily expensive, and an all-view design,
which duplicates authoritative business interpretation in SQL and broadens
the persistence boundary.

## Architecture

```text
Department Agent service identity
             |
             v
POST /v1/internal/agentic/tools/invoke
 strict transport schema + workload authentication
             |
             v
Tool Registry application service
 task + revision + grant + policy + revocation + quota
             |
             v
Versioned DepartmentToolAdapter
       |                         |
       v                         v
module public read port    Reporting analytics port
application role          opendx_agentic_reader role
       |                         |
       +--------- PostgreSQL ----+
             |
             v
bounded result + audit + provenance + idempotent receipt
```

The AI Runtime and models receive no PostgreSQL credential. Phase C exposes an
internal workload endpoint only. Caddy must continue to deny the complete
`/v1/internal/agentic` prefix. Staff and browser tokens are invalid at this
boundary.

The Agentic composition root constructs a fixed `(toolName, toolVersion)`
adapter map. Adapters depend on purpose-specific public application contracts.
Only the Reporting analytics adapter owns the separate analytics pool. A tool
name that has no exact adapter mapping remains `TOOL_UNAVAILABLE` even when a
descriptor exists.

## Invocation Lifecycle

The transport accepts these fields and rejects unknown fields:

```ts
interface DepartmentToolInvocationRequest {
  readonly taskId: string;
  readonly toolName: DepartmentToolName;
  readonly toolVersion: 1;
  readonly purpose: "store_health_review";
  readonly dataScope: string;
  readonly dataClassification: "internal" | "confidential" | "restricted";
  readonly modelId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly approvalId?: string;
}
```

`modelId` remains in the Phase A authorization contract and must match the
pinned configuration, but Phase C never calls that model. The server
canonicalizes `parameters`, computes its digest, selects the registered schema
digest, and derives execution cost from the immutable tool descriptor. It does
not trust a client-provided digest or cost.

Authorization and reservation run in a short transaction. Data retrieval runs
outside that transaction in a read-only transaction with bounded statement
and lock timeouts. Completion stores one bounded safe result, result digest,
source provenance, outcome, and version in a second short transaction. Audit
failure rolls back the corresponding reservation or completion transition.

`agentic_tool_invocations` provides one row per Agent, task, and idempotency
key. A duplicate completed call returns the stored result without querying
Commerce again. A concurrent reserved call returns
`TOOL_INVOCATION_IN_PROGRESS`. A retryable failure may be claimed again with
compare-and-swap up to the descriptor's attempt limit; a nonretryable failure
replays its stable error. Safe result JSON is limited to 256 KiB and contains
only the approved output schema.

## Common Input Rules

All list and aggregate tools use this closed input unless their contract below
narrows it:

```ts
interface WindowInput {
  readonly start: string; // RFC 3339 instant, inclusive
  readonly end: string;   // RFC 3339 instant, exclusive
  readonly timezone: "Asia/Ho_Chi_Minh";
  readonly limit?: number;  // 1..100, default 25, evidence tools only
  readonly cursor?: string; // opaque signed cursor, evidence tools only
}
```

`end` must be later than `start`, no later than the server time plus one
minute, and at most 90 days after `start`. Snapshot tools use an empty object.
Tool-specific integer thresholds are server-bounded as listed below. Callers
cannot provide relation names, columns, sort expressions, classification,
sharing scope, or arbitrary filters inside `parameters`.

Cursors bind tool name/version, task, normalized parameters, last stable sort
keys, and a five-minute expiry. A cursor from another tool, task, or parameter
set is rejected.

## Common Output Envelope

Every successful output uses this envelope:

```ts
interface DepartmentToolResult<TSummary, TEvidence = never> {
  readonly source: string;
  readonly sourceVersion: 1;
  readonly retrievedAt: string;
  readonly window: {
    readonly start: string;
    readonly end: string;
    readonly timezone: "Asia/Ho_Chi_Minh";
  } | null;
  readonly freshness: {
    readonly asOf: string;
    readonly maxAgeSeconds: 60;
    readonly status: "fresh";
  };
  readonly classification: "internal" | "confidential" | "restricted";
  readonly shareability: "executive_summary" | "department_only";
  readonly provenanceId: string;
  readonly summary: TSummary;
  readonly evidence?: readonly TEvidence[];
  readonly nextCursor?: string;
}
```

Phase C uses ordinary views and transaction snapshots, not asynchronously
refreshed materialized views. `asOf` is the database transaction timestamp. A
result older than 60 seconds before delivery fails closed as
`TOOL_RESULT_STALE`; the server never relabels stale data as fresh.

All counts and VND amounts are non-negative safe integers. Ratios are integer
basis points from 0 to 10,000. Durations are integer minutes or days. Stable
ordering is required before applying a result limit.

## Tool Catalog

All tools are version `1`, have purpose `store_health_review`, and have a
server-owned invocation cost of one quota unit. Aggregate tools allow ten
invocations per task; evidence tools allow five. The exact configuration
revision may reduce these bounds but cannot expand them.

### Catalog Agent

| Tool | Input | Summary and evidence fields | Classification and sharing |
| --- | --- | --- | --- |
| `catalog.product_completeness` | `{}` | Summary: `totalProducts`, `draftProducts`, `publishedProducts`, `missingBrand`, `emptyAttributes`, `withoutActiveVariant`, `withoutCurrentPrice`, `withoutMedia`, `withoutPrimaryMedia`, `completenessBasisPoints`. No evidence. | `internal`, `executive_summary` |
| `catalog.publication_readiness` | `WindowInput` without arbitrary thresholds | Summary: `draftReviewed`, `readyCount`, `blockedCount`, `reasonCounts`. Evidence, ordered by `updatedAt, productId`: `productId`, `updatedAt`, `reasonCodes`. Product name, slug, description, media object key, and price are excluded. | `internal`, summary is executive-shareable; evidence is department-only |
| `catalog.merchandising_summary` | `{}` | Summary: `activeCategories`, `publishedProducts`, `activeVariants`, `currentlyPricedVariants`, `mediaCoverageBasisPoints`, `minimumPriceVnd`, `maximumPriceVnd`, `categoryDistribution[{categoryId, productCount}]` limited to the top 25 categories plus `otherCategoryProductCount`. No product rows. | `internal`, `executive_summary` |

Catalog owns completeness and publication interpretation. A product is ready
only when it has a nonblank brand, nonempty attributes, at least one active
variant, a current VND price for every active variant, at least one media item,
and exactly one primary media item. Phase C does not change publication rules
or publish a product.

### Inventory Agent

| Tool | Input | Summary and evidence fields | Classification and sharing |
| --- | --- | --- | --- |
| `inventory.stock_risk` | `WindowInput` plus `lowStockThreshold` in `0..100`, default `5` | Summary: `trackedVariants`, `lowStockCount`, `soldOutCount`, `unitsOnHand`, `unitsReserved`, `unitsAvailable`. Evidence ordered by `daysCover, variantId`: `variantId`, `onHand`, `reserved`, `available`, `quantitySold`, `dailyVelocityMilliunits`, `daysCover` or `null`, `riskCode`. | `internal`, summary executive-shareable; evidence department-only |
| `inventory.slow_stock` | `WindowInput` plus `minimumOnHand` in `1..10000`, default `1` | Summary: `candidateCount`, `candidateUnits`, `candidateValueVnd`. Evidence ordered by `quantitySold, available DESC, variantId`: `variantId`, `available`, `quantitySold`, `currentUnitPriceVnd`, `stockValueVnd`, `reasonCode`. | `internal`, summary executive-shareable; evidence department-only |
| `inventory.reservation_anomalies` | `WindowInput` | Summary: `expiredActiveCount`, `finalizedWithoutTimestampCount`, `stalePendingCount`, `affectedUnits`. Evidence ordered by `detectedAt, reservationId`: `reservationId`, `variantId`, `quantity`, `status`, `expiresAt`, `detectedAt`, `reasonCode`. Reference IDs and customer/order data are excluded. | `confidential`, `department_only` |

Velocity uses only paid orders in `paid`, `processing`,
`ready_for_fulfillment`, or `completed`. `dailyVelocityMilliunits` is
`quantitySold * 1000 / windowDays`, rounded down by backend code. Replenishment
evidence is analysis only and cannot create a purchase or stock movement.

### Order Agent

| Tool | Input | Summary and evidence fields | Classification and sharing |
| --- | --- | --- | --- |
| `order.stalled_summary` | `WindowInput` plus `minimumAgeMinutes` in `15..10080`, default `120` | Summary: `stalledCount`, `stalledTotalVnd`, `countsByStatus`. Evidence ordered by `updatedAt, orderId`: `orderId`, `status`, `createdAt`, `updatedAt`, `ageMinutes`, `totalVnd`, `reasonCode`. | `confidential`, summary executive-shareable; evidence department-only |
| `order.invalid_state_evidence` | `WindowInput` | Summary: `invalidCount`, `reasonCounts`. Evidence ordered by `detectedAt, orderId`: `orderId`, `status`, `version`, `detectedAt`, `reasonCodes`. No contact, address, customer ID, public order number, line content, or history actor is returned. | `confidential`, `department_only` |
| `order.expiry_risk` | `WindowInput` plus `horizonMinutes` in `15..1440`, default `120` | Summary: `atRiskCount`, `atRiskTotalVnd`, `earliestExpiryAt`. Evidence ordered by `reservationExpiresAt, orderId`: `orderId`, `status`, `totalVnd`, `reservationExpiresAt`, `minutesRemaining`. | `confidential`, summary executive-shareable; evidence department-only |

Stalled states are `paid`, `processing`, and `ready_for_fulfillment`; pending
payment expiry is covered separately. Invalid-state checks are deterministic
invariants such as a paid-or-later state without `paidAt`, a completed state
without `completedAt`, or an illegal transition in ordered status history.

### Finance Agent

| Tool | Input | Summary and evidence fields | Classification and sharing |
| --- | --- | --- | --- |
| `finance.pending_payments` | `WindowInput` | Summary: `pendingCount`, `pendingExpectedAmountVnd`, `oldestCreatedAt`, `countsByStatus`, `ageBuckets[{bucket,count,amountVnd}]`. No payment rows. | `confidential`, `executive_summary` |
| `finance.reconciliation_discrepancies` | `WindowInput` | Summary: `reconciliationCount`, `mismatchCount`, `providerErrorCount`, `unsupportedCount`, `amountDifferenceVnd`. Evidence ordered by `createdAt, reconciliationId`: `reconciliationId`, `paymentId`, `comparisonResult`, `internalStatus`, `providerStatusClass`, `internalAmountVnd`, `providerAmountVnd`, `differenceVnd`, `createdAt`. Provider order IDs and responses are excluded. | `restricted`, `department_only` |
| `finance.provider_evidence_status` | `WindowInput` | Summary: `authenticatedEvents`, `rejectedEvents`, `appliedEvents`, `reviewRequiredEvents`, `unmatchedPayments`, `coverageBasisPoints`, `countsByNormalizedState`. No event rows, payload hash, invoice, transaction, or provider identifier. | `restricted`, `department_only` |

Payment status interpretation, amount comparison, and totals remain in Payment
application code or validated SQL. A model cannot recalculate or override them.

### CRM Agent

| Tool | Input | Summary and evidence fields | Classification and sharing |
| --- | --- | --- | --- |
| `crm.segment_summary` | `WindowInput` | Summary: `registeredCustomers`, `newCustomers`, `repeatCustomers`, `customersByLifetimeValueBucket[{bucket,count}]`, `customersByRecencyBucket[{bucket,count}]`, `paidRevenueVnd`. No customer rows or identifiers. | `confidential`, `executive_summary` |
| `crm.followup_opportunities` | `WindowInput` | Summary: `openFollowups`, `overdueFollowups`, `unassignedFollowups`, `customersWithoutOpenFollowupBySegment[{segment,count}]`, `reasonCounts`. No follow-up description, assignee, note, customer, or order row. | `restricted`, `department_only` |

Segments are fixed backend rules over paid-order count, lifetime paid value,
and last paid date. They are not model-generated labels. The version-one
lifetime buckets are `zero`, `low` below 5,000,000 VND, `mid` below
50,000,000 VND, and `high`; recency buckets are `0_30_days`, `31_90_days`,
`over_90_days`, and `never`.

### Support Agent

| Tool | Input | Summary and evidence fields | Classification and sharing |
| --- | --- | --- | --- |
| `support.sla_risk` | `WindowInput` plus `horizonMinutes` in `15..1440`, default `240` | Summary: `openTickets`, `atRiskCount`, `breachedCount`, `countsByPriority`. Evidence ordered by `slaDueAt, ticketId`: `ticketId`, `priority`, `status`, `slaDueAt`, `minutesRemaining`, `riskCode`. Subject, description, messages, customer, and assignee are excluded. | `restricted`, summary executive-shareable; evidence department-only |
| `support.classification_summary` | `WindowInput` | Summary: `countsByPriority`, `countsByStatus`, `operationalClasses[{class,count}]`, `unassignedCount`, `escalatedCount`. Version-one operational classes are deterministic lifecycle classes, not topic classification from ticket text. | `confidential`, `executive_summary` |
| `support.related_order_context` | `{ ticketId: uuid }` | Summary: `ticketId`, `hasRelatedOrder`; when related: `orderId`, `orderStatus`, `orderCreatedAt`, `reservationExpiresAt`, `totalVnd`, `paymentConfirmed`. No customer/contact/address, order lines, ticket text, or payment/provider detail. No list evidence. | `restricted`, `department_only` |

`support.related_order_context` first uses the Support public port to prove the
ticket owns the related order reference, then uses the Order public port for
the approved purpose-limited projection. A caller cannot submit an arbitrary
order ID.

## Public Module Ports

Each owning module adds one focused public interface and exports only that
interface and its purpose-specific DTOs from `index.ts`:

- Catalog: `CatalogHealthReader`;
- Inventory: `InventoryHealthReader`;
- Order: `OrderHealthReader` and `SupportOrderContextReader`;
- Payment: `PaymentHealthReader`;
- CRM: `CrmHealthReader`;
- Support: `SupportHealthReader` and `SupportOrderReferenceReader`;
- Reporting: `AgenticAnalyticsReader` for approved cross-module views.

These are application contracts, not repository exports. Implementations own
SQL and mapping. The Agentic adapters may compose multiple ports but may not
reinterpret monetary or lifecycle truth.

## Analytics Views and Database Role

Only these cross-module views are approved:

| View | Owner | Used by | Columns exposed |
| --- | --- | --- | --- |
| `reporting_agentic_variant_sales_v1` | Reporting migration | Catalog merchandising and Inventory stock tools | `variant_id`, `window_date`, `paid_quantity`, `paid_revenue_vnd`, validated `current_unit_price_vnd`; no order/customer fields |
| `reporting_agentic_customer_segment_snapshot_v1` | Reporting migration | CRM segment and follow-up summary | irreversible `segment_key`, `recency_bucket`, aggregate customer/repeat/follow-up counts, `lifetime_paid_revenue_vnd`, `as_of_date`; no customer ID |
| `reporting_agentic_customer_activity_daily_v1` | Reporting migration | CRM segment summary | `activity_date`, aggregate `new_customer_count`, `paid_customer_count`, `paid_revenue_vnd`; no customer or order ID |

Views use `security_barrier` and have explicit column lists. Their owner is a
non-login migration owner. `opendx_agentic_reader` receives `CONNECT`, schema
`USAGE`, and `SELECT` only on these exact views. `PUBLIC` receives no grant.
The role receives no base-table, sequence, function-execution, DDL, temporary
table, or mutation privilege. Default privileges do not grant future views.

Local and production setup create or reconcile the role idempotently. The
analytics password is distinct from the API application and PostgreSQL admin
passwords, is never placed in a workflow payload or log, and is injected only
into the API process that constructs the analytics pool.

## Query Plans and Bounds

Every adapter uses `READ ONLY`, `statement_timeout = 750ms`,
`lock_timeout = 100ms`, and at most four SQL statements. Evidence queries
fetch `limit + 1` rows to derive a cursor and never use unbounded offset.

The focused implementation plan may refine index names but must preserve these
query shapes:

| Owner | Required bounded access path |
| --- | --- |
| Catalog | Product status/update index; existing product-to-variant, variant-to-price, and product-to-media indexes; partial current-price and primary-media indexes if `EXPLAIN` proves they are required. |
| Inventory | Partial available-stock expression index; reservation status/expiry index; existing movement item/time index; variant sales view keyed by date and variant. |
| Order | Status/update index for stalled work, pending-payment reservation-expiry index, paid-at index for sales windows, and order-history order/time index. |
| Payment | Status/create index, reconciliation result/create index, and event authentication/processing/received index. |
| CRM | Existing follow-up status/due index plus customer-segment aggregate view. CRM notes and note bodies are never read. |
| Support | Existing queue indexes plus a bounded SLA due expression or equivalent indexed claim path. Ticket message and attachment bodies are never read. |
| Reporting | View definitions start from the time-bounded order indexes; no view exposes or scans unrestricted text or JSON payload columns. |

Integration fixtures must be large enough for PostgreSQL to choose meaningful
plans. `EXPLAIN (FORMAT JSON)` tests reject an unbounded sequential scan on
orders, order lines, payments, events, reconciliations, reservations, history,
or support queues. A sequential scan is allowed only for a deliberately small
dimension or a complete aggregate whose fixture and measured bound prove it is
safe.

## Exact Filters and Code Sets

The normalized data scope is fixed by the descriptor: `catalog:health:read`,
`inventory:health:read`, `order:health:read`, `finance:health:read`,
`crm:health:read`, or `support:health:read`. A tool accepts only its owning
scope.

Window predicates are fixed as follows:

| Tool | Fixed filter semantics |
| --- | --- |
| `catalog.product_completeness` | Current non-archived product snapshot at `asOf`. |
| `catalog.publication_readiness` | Draft products whose `updatedAt` is in `[start,end)`. |
| `catalog.merchandising_summary` | Current active/published Catalog snapshot at `asOf`; current price means `validFrom <= asOf < validTo` or no `validTo`. |
| `inventory.stock_risk` | Current inventory snapshot joined only to paid order lines whose `paidAt` is in `[start,end)`. |
| `inventory.slow_stock` | Current available quantity at least `minimumOnHand` and paid quantity in `[start,end)` equal to zero. |
| `inventory.reservation_anomalies` | Active reservation expiry, inconsistent finalization timestamp, or stale-pending detection instant in `[start,end)`. |
| `order.stalled_summary` | Current stalled states created before `end`, not terminal, and unchanged for at least `minimumAgeMinutes`; `start` is the oldest allowed creation time. |
| `order.invalid_state_evidence` | Current invariant failure or illegal transition detected in `[start,end)`. |
| `order.expiry_risk` | Pending-payment orders whose reservation expiry is in `[max(start,asOf),min(end,asOf+horizonMinutes))`. |
| `finance.pending_payments` | Payments created in `[start,end)` whose current state is `created` or `pending_provider`. |
| `finance.reconciliation_discrepancies` | Reconciliations created in `[start,end)` with result `mismatch`, `provider_error`, or `unsupported`. |
| `finance.provider_evidence_status` | Payment events received in `[start,end)`; coverage denominator is payments created in the same window. |
| `crm.segment_summary` | Current deterministic segment snapshot plus customer registrations and paid activity in `[start,end)`. |
| `crm.followup_opportunities` | Current open follow-ups due before `end` plus current segment counts without an open follow-up; no historical closed-row export. |
| `support.sla_risk` | Nonterminal tickets created before `end` whose calculated SLA due time is before `min(end,asOf+horizonMinutes)`. |
| `support.classification_summary` | Tickets created in `[start,end)`, grouped only by stored lifecycle fields. |
| `support.related_order_context` | Exact ticket ID authorized by the task; no caller-provided order filter. |

Reason and bucket values are closed enums:

- Catalog readiness: `MISSING_BRAND`, `EMPTY_ATTRIBUTES`,
  `NO_ACTIVE_VARIANT`, `MISSING_CURRENT_PRICE`, `NO_MEDIA`, and
  `PRIMARY_MEDIA_INVALID`.
- Inventory stock risk: `SOLD_OUT`, `LOW_STOCK`, `NO_SALES_VELOCITY`, and
  `BELOW_14_DAY_COVER`. Reservation anomaly: `EXPIRED_ACTIVE`,
  `FINALIZED_TIMESTAMP_MISSING`, and `STALE_PENDING`.
- Order evidence: `PAID_TIMESTAMP_MISSING`,
  `COMPLETED_TIMESTAMP_MISSING`, `TERMINAL_TIMESTAMP_CONFLICT`, and
  `ILLEGAL_STATUS_TRANSITION`. Stalled reasons are `PAID_NOT_PROCESSING`,
  `PROCESSING_NOT_READY`, and `READY_NOT_COMPLETED`.
- Finance age buckets are `under_15_minutes`, `15_to_60_minutes`,
  `1_to_24_hours`, and `over_24_hours`. `providerStatusClass` is one of
  `paid`, `pending`, `failed`, `unsupported`, `provider_error`, or `unknown`;
  it is not a raw provider value.
- CRM segment keys are `new`, `repeat`, `high_value`, and `inactive`; the
  lifetime and recency buckets are defined above. Opportunity reasons are
  `OVERDUE_FOLLOWUP`, `UNASSIGNED_FOLLOWUP`, and
  `SEGMENT_WITHOUT_OPEN_FOLLOWUP`.
- Support operational classes are `unassigned`, `active_work`,
  `waiting_customer`, `waiting_internal`, `escalated`, and `terminal`.
  SLA risk codes are `BREACHED` and `DUE_WITHIN_HORIZON`.

Arrays of enum counts include only nonzero values and use enum declaration
order. Nullable timestamps and amounts are represented as `null`, never an
empty string or sentinel number. These rules are part of each version-one
output schema digest.

## Identity, Grants, and Sharing

The existing clients `agent-catalog`, `agent-inventory`, `agent-order`,
`agent-finance`, `agent-crm`, and `agent-support` remain distinct confidential
service accounts. Local bootstrap and production reconciliation assign each a
separate required secret. No Agent secret is reused as the AI worker, Agentic
control, API, or another Agent secret.

The Phase C configuration revision registers all 17 immutable descriptors and
grants each only to its owning Agent. Policy uses exact tool name, purpose,
scope, and classification. The AI CEO receives no tool grant in Phase C.

An output marked `executive_summary` may later be shared only as its `summary`
object. Evidence, `department_only` results, and Finance/CRM/Support restricted
data cannot be added to AI CEO context. Phase C adds a deterministic sharing
filter and tests it without implementing AI CEO synthesis.

## Errors

Stable Phase C codes extend the existing Agentic envelope:

- `TOOL_INPUT_INVALID`
- `TOOL_NOT_FOUND`
- `TOOL_GRANT_MISSING`
- `TOOL_SCOPE_DENIED`
- `TOOL_GRANT_EXHAUSTED`
- `TOOL_INVOCATION_IN_PROGRESS`
- `TOOL_RESULT_STALE`
- `TOOL_RESULT_TOO_LARGE`
- `TOOL_QUERY_TIMEOUT`
- `TOOL_SOURCE_UNAVAILABLE`
- `TOOL_OUTPUT_INVALID`
- existing `AGENT_NOT_ACTIVE`, `TASK_AGENT_MISMATCH`,
  `CONFIGURATION_INVALID`, `POLICY_DENIED`, `APPROVAL_REQUIRED`, and
  `BUDGET_EXCEEDED`.

Validation, authorization, revocation, quota, and deterministic no-result
conditions are nonretryable. Lock contention, a bounded statement timeout, or
source unavailability is retryable within the invocation attempt bound.
Unknown errors map to `TOOL_SOURCE_UNAVAILABLE`; internal SQL, relation names,
and exception bodies are not returned.

## Audit, Provenance, and Observability

Allowed and denied attempts record Agent subject/client, task, tool/version,
parameter digest, policy version, outcome, correlation, causation, attempt,
duration, result digest when completed, and safe error code. Logs and audit do
not include parameters or result bodies.

Provenance records the module port or view, source version, normalized window,
source snapshot time, and result digest. It does not store SQL text, customer
data, raw provider evidence, or credentials.

Metrics use bounded labels for tool name/version, owning department, outcome,
and error code. Required measures are invocation count, duration, rows
returned, result bytes, query timeout count, denied count, and active
invocations. IDs and user-controlled values are not metric labels.

## Migrations and Rollback

Commerce indexes and views are introduced through the ordered reversible
migration of their owning module. Agentic owns only descriptor cost/attempt
metadata, invocation receipts, and governance configuration. It does not own
Commerce tables or views.

Rollback order is: stop Agentic tool execution, deactivate the Phase C
configuration revision, remove Agentic invocation schema, revoke analytics
grants and role access, drop Reporting views, then drop owner-specific indexes.
No rollback deletes Commerce records.

Backup and restore continue to use the existing three-database recovery set.
The new role, grants, migrations, descriptors, receipts, and views are covered
by the existing application database dump and migration compatibility checks.

## Testing and Exit Gate

Implementation follows test-driven development. Required evidence is:

1. strict schema and bounds tests for all 17 inputs and outputs;
2. an authorization and zero-leakage case for every tool, including wrong
   Agent, task, revision, tool version, purpose, scope, classification, grant,
   stale grant, revocation, budget, and unknown parameter;
3. public-port unit tests proving business interpretation remains in the owner;
4. PostgreSQL integration tests for views, role privileges, row/result bounds,
   cursor stability, statement timeout, concurrent reads, and required
   `EXPLAIN (FORMAT JSON)` plans;
5. idempotency tests for duplicate completion, concurrent reservation,
   retryable reclaim, and nonretryable replay;
6. leakage fixtures containing names, emails, phones, addresses, note bodies,
   ticket text, provider identifiers, and provider payloads, with byte-for-byte
   assertions that none appear in any unauthorized output, audit, log, error,
   Temporal payload, or executive-shareable summary;
7. architecture tests rejecting private Commerce imports, direct base-table
   access from Agentic, generic SQL/query tools, public internal routes, and
   mutation methods;
8. a six-identity acceptance check that invokes each Agent's allowed tools,
   denies cross-department tools, and proves the AI CEO can receive only
   explicitly shareable summary objects;
9. migration up/down/up, source build, lint, typecheck, unit, integration,
   repository audit, production Compose preflight, backup/restore, and Phase C
   exit-gate checks.

The Phase C exit gate passes only when each Department Agent can invoke only
its approved versioned read tools with bounded, provenance-backed output and
all forbidden tools, fields, records, SQL, base tables, mutations, and sharing
paths are denied at runtime. OpenRouter calls and Commerce mutations must
remain absent.

## Documentation Impact

Implementation updates:

- `docs/api/agentic.md` with the internal invocation and result contracts;
- `docs/architecture/agentic-workflow-runtime.md` and the system baseline with
  tool and analytics boundaries;
- `docs/project-structure.md` for the first real adapter files;
- `docs/dependencies.md` only if implementation proves a new dependency is
  unavoidable;
- `docs/build-from-source.md`, production/local environment examples, backup
  and deployment instructions for the analytics role and six Agent secrets;
- `docs/roadmap/mvp-status.md` only after every Phase C exit gate passes;
- `CHANGELOG.md` in the same implementation units.

## Out of Scope

- OpenRouter, prompts, model output, Quality Gate, or model budget settlement;
- AI CEO planning, collaboration, synthesis, or Company Memory;
- file intake, MinIO Agentic storage, ClamAV parsing, or bulk preview;
- Agentic Console pages or Temporal UI;
- free-form SQL, arbitrary filters, customer-level CRM exports, ticket text,
  payment/provider payloads, or unrestricted order detail;
- price, publication, inventory, reservation, order, payment, CRM, support, or
  customer communication mutation;
- production SePay activation or payment behavior changes.
