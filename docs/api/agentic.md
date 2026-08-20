<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agentic API

Phase A exposes governance, Phase B adds one durable
`StoreHealthReviewWorkflowV1`, and Phase C adds 17 governed read-only Commerce
tools. Staff routes are below `/v1/admin/agentic` and
require a Keycloak staff bearer token. Workload callbacks are below
`/v1/internal/agentic` and accept only the dedicated AI worker service account.
Caddy returns `404` for the complete internal prefix.

## State Ownership

An Agentic task is the staff-authored, versioned intent. Its `draft`, `ready`,
or `canceled` state is not a workflow execution state. A workflow run is a
separate immutable identity for one ready task, workflow version, and pinned
configuration revision.

PostgreSQL projection is the authoritative application read model used by the
staff API. Temporal history is the durable orchestration log used for timers,
retries, signals, replay, and worker recovery. Clients must not infer Temporal
history from the PostgreSQL projection or query Temporal directly.

All staff success responses use `{ "success": true, "message": "...", "data":
... }`. Errors use `{ "success": false, "message": "...", "errorCode":
"CODE", "errors": [] }`.

## Department Tool Invocation

`POST /v1/internal/agentic/tools/invoke` accepts only a confidential
client-credentials token for one of `agent-catalog`, `agent-inventory`,
`agent-order`, `agent-finance`, `agent-crm`, or `agent-support`. The AI CEO,
staff, browser, worker, control, inactive, unknown, or cross-department identity
cannot use this route. The body limit is 16 KiB.

Every request contains `taskId`, exact `toolName`, `toolVersion: 1`,
`purpose: "store_health_review"`, the descriptor's `dataScope` and
`dataClassification`, an approved `modelId`, strict `parameters`, and bounded
`idempotencyKey`, `correlationId`, and `causationId`. An `approvalId` is present
only when the pinned policy requires it. Unknown fields are rejected.

| Tool | Input parameters | Result `summary` fields | Evidence fields | Class / share |
| --- | --- | --- | --- | --- |
| `catalog.product_completeness` | none | `totalProducts`, `draftProducts`, `publishedProducts`, `missingBrand`, `emptyAttributes`, `withoutActiveVariant`, `withoutCurrentPrice`, `withoutMedia`, `withoutPrimaryMedia`, `completenessBasisPoints` | none | internal / executive |
| `catalog.publication_readiness` | evidence window | `draftReviewed`, `readyCount`, `blockedCount`, `reasonCounts` | `productId`, `updatedAt`, `reasonCodes` | internal / executive |
| `catalog.merchandising_summary` | none | `activeCategories`, `publishedProducts`, `activeVariants`, `currentlyPricedVariants`, `mediaCoverageBasisPoints`, `minimumPriceVnd`, `maximumPriceVnd`, `categoryDistribution`, `otherCategoryProductCount` | none | internal / executive |
| `inventory.stock_risk` | evidence window, `lowStockThreshold` | `trackedVariants`, `lowStockCount`, `soldOutCount`, `unitsOnHand`, `unitsReserved`, `unitsAvailable` | `variantId`, stock quantities, velocity, cover, `riskCode` | internal / executive |
| `inventory.slow_stock` | evidence window, `minimumOnHand` | `candidateCount`, `candidateUnits`, `candidateValueVnd` | `variantId`, availability, sales, price, value, `reasonCode` | internal / executive |
| `inventory.reservation_anomalies` | evidence window | anomaly counts and `affectedUnits` | reservation/variant IDs, quantity, state, expiry, detection, reason | confidential / department |
| `order.stalled_summary` | evidence window, `minimumAgeMinutes` | `stalledCount`, `stalledTotalVnd`, `countsByStatus` | order ID, state, timestamps, age, total, reason | confidential / executive |
| `order.invalid_state_evidence` | evidence window | `invalidCount`, `reasonCounts` | order ID, state, version, detection, reasons | confidential / department |
| `order.expiry_risk` | evidence window, `horizonMinutes` | `atRiskCount`, `atRiskTotalVnd`, `earliestExpiryAt` | order ID, state, total, expiry, minutes remaining | confidential / executive |
| `finance.pending_payments` | aggregate window | counts, expected amount, oldest timestamp, status counts, age buckets | none | confidential / executive |
| `finance.reconciliation_discrepancies` | evidence window | reconciliation/mismatch/provider counts and amount difference | reconciliation/payment IDs, result classes, safe states/amounts, timestamp | restricted / department |
| `finance.provider_evidence_status` | aggregate window | authenticated/rejected/applied/review counts, unmatched count, coverage, normalized states | none | restricted / department |
| `crm.segment_summary` | aggregate window | registered/new/repeat counts, lifetime-value and recency buckets, paid revenue | none | confidential / executive |
| `crm.followup_opportunities` | aggregate window | open/overdue/unassigned counts, segment gaps, reason counts | none | restricted / department |
| `support.sla_risk` | evidence window, `horizonMinutes` | open/at-risk/breached counts and priorities | ticket ID, priority, state, SLA time, minutes, risk | restricted / executive |
| `support.classification_summary` | aggregate window | priority/status/class counts, unassigned and escalated counts | none | confidential / executive |
| `support.related_order_context` | `ticketId` | ticket binding and optional safe order state/times/total/payment confirmation | none | restricted / department |

An aggregate window is `{ start, end, timezone: "Asia/Ho_Chi_Minh" }`. An
evidence window additionally accepts `limit` from 1 to 100 and an opaque
`cursor`. Windows are at most 90 days. Tool-specific thresholds use the exact
bounds enforced by the runtime schema, and `end` cannot exceed server time by
more than one minute. Cursors are server-signed, expire after five minutes, and
are bound to the task, tool/version, normalized non-cursor parameters, and the
owner reader's stable keyset. Tampered, expired, or cross-context cursors fail
with `TOOL_INPUT_INVALID`.

Successful `data` is `{ output, provenanceIds }`. Every output contains
`source`, `sourceVersion: 1`, `retrievedAt`, `window`, freshness with a 60-second
maximum age, `classification`, `shareability`, `provenanceId`, and `summary`.
Evidence is bounded to 100 records and receipts to 256 KiB. Executive sharing
copies only the common envelope and `summary`; it rejects `department_only`
results and never copies evidence or cursors.

Stable tool errors include `TOOL_INPUT_INVALID`, `TOOL_NOT_FOUND`,
`TOOL_GRANT_MISSING`, `TOOL_SCOPE_DENIED`, `TOOL_GRANT_EXHAUSTED`,
`TOOL_INVOCATION_IN_PROGRESS`, `TOOL_RESULT_STALE`, `TOOL_RESULT_TOO_LARGE`,
`TOOL_QUERY_TIMEOUT`, `TOOL_SOURCE_UNAVAILABLE`, and `TOOL_OUTPUT_INVALID`, in
addition to governance, approval, and budget errors. Only bounded query timeout,
lock contention, and source unavailability are retryable. Internal SQL,
relation names, request parameters, result bodies, credentials, and provider or
customer data are never returned or logged.

Tool invocation idempotency is scoped to Agent and task. A reserved invocation
holds a 60-second execution lease; a stale lease is reclaimed with the next
bounded attempt, and exhaustion becomes the stable
`TOOL_INVOCATION_TIMEOUT` terminal error. Allowed, denied, failed, completed,
and replayed attempts persist the Agent subject/client, task, tool/version,
parameter digest, policy version, correlation, causation, attempt, duration,
safe error code, and completed result digest. Provenance persists only the
approved source/version, normalized window, source snapshot time, and digest.

## Staff Workflow Routes

### Start

`POST /v1/admin/agentic/tasks/:taskId/start`

```json
{ "expectedVersion": 2, "workflowVersion": 1 }
```

The task must be `ready`, owned or overseen by the caller, and pinned to an
active configuration. The first accepted command returns `202`; an idempotent
duplicate returns `200`. `data` is the complete workflow-run projection:

```json
{
  "id": "8f2b89bb-2405-4978-8163-47c46409c6d0",
  "taskId": "51c3758b-975a-47ce-a0cf-a8a45280be40",
  "workflowName": "StoreHealthReviewWorkflowV1",
  "workflowVersion": 1,
  "planRevision": 1,
  "temporalWorkflowId": "store-health-v1:8f2b89bb-2405-4978-8163-47c46409c6d0",
  "state": "received",
  "projectionSequence": 0,
  "version": 1,
  "createdAt": "2026-08-15T09:00:00.000Z",
  "updatedAt": "2026-08-15T09:00:00.000Z"
}
```

### Read A Run

`GET /v1/admin/agentic/workflow-runs/:runId` returns `200` with the same
projection. `state` may be `received`, `planning`, `awaiting_plan_approval`,
`dispatching`, `department_analysis`, `quality_review`, `collaboration`,
`executive_synthesis`, `awaiting_human_approval`, `retrying`,
`partially_completed`, `failed`, `canceled`, or `completed`. Terminal
projections include an `outcomeCode` and `completedAt`.

### Cancel A Run

`POST /v1/admin/agentic/workflow-runs/:runId/cancel`

```json
{ "expectedVersion": 7, "reasonCode": "CANCELED_BY_STAFF" }
```

The first accepted signal returns `202`; a matching duplicate returns `200`.
The response data is the current run projection. The API persists a receipt
before delivery, binds it to run/payload digest, and retries pending delivery.

### Decide Approval

`POST /v1/admin/agentic/approvals/:approvalId/decision`

```json
{
  "expectedVersion": 1,
  "decision": "approved",
  "reason": "Reviewed the fixed synthesis output"
}
```

`decision` is `approved`, `rejected`, or `revision_requested`. The caller must
be a different authorized human in the recorded scope. A workflow approval is
bound to its approval ID, run, payload digest, and application decision version;
the API returns `202` while delivery is pending or `200` for an already handled
decision.

## Internal Workload Routes

These routes require `Authorization: Bearer <worker-token>` and
`x-correlation-id`. They are not public API.

| Method and path | Request / response |
| --- | --- |
| `GET /v1/internal/agentic/workflow-runs/:runId/plan` | Returns the frozen task graph, plan revision, and approval requirement. |
| `POST /v1/internal/agentic/workflow-runs/:runId/state` | `{ "projectionSequence": 4, "state": "department_analysis" }`; terminal calls also include `outcomeCode`. Returns the converged projection. |
| `POST /v1/internal/agentic/activity-invocations/reserve` | `{ "invocationKey": "...", "runId": "uuid", "activityKind": "execute_fake_analysis", "branchId": "uuid", "inputDigest": "64-lowercase-hex" }`; returns the stable reservation and duplicate status. |
| `POST /v1/internal/agentic/activity-invocations/:invocationKey/complete` | `{ "expectedVersion": 1, "outcomeCode": "ANALYSIS_COMPLETED", "safeResult": {} }`; returns the stored invocation. |
| `POST /v1/internal/agentic/activity-invocations/:invocationKey/fail` | `{ "expectedVersion": 1, "outcomeCode": "ACTIVITY_FAILED" }`; returns the stored invocation. |

For example, frozen-plan `data` is purpose-specific and contains no task body
or credentials:

```json
{
  "taskId": "51c3758b-975a-47ce-a0cf-a8a45280be40",
  "workflowRunId": "8f2b89bb-2405-4978-8163-47c46409c6d0",
  "workflowVersion": 1,
  "planRevision": 1,
  "configurationRevisionId": "88de7f1b-837c-43cd-8a2f-50b204297937",
  "subtasks": [{ "id": "5cc02771-a1fd-4e9e-a737-e1b47c654619", "agentKind": "catalog", "version": 1 }],
  "dependencies": [],
  "partialCompletionAllowed": true
}
```

A reservation response uses the normal success envelope and returns
`data.status` as `reserved` or `duplicate`, plus the stable invocation record.
Completion/failure responses return that record with `state`, `outcomeCode`,
`version`, timestamps, and only a bounded `safeResult` when completed.

The Express API calls the AI Runtime gateway at
`POST /internal/agentic/workflow-runs/start`,
`GET /internal/agentic/workflow-runs/:temporalWorkflowId`, and the approval and
cancellation signal subroutes. Requests require the API workload token,
`x-correlation-id`, and matching `idempotency-key` header/body values for
signals. Start returns `{ "temporalRunId": "...", "duplicate": false }`;
describe returns `{ "status": "running", "temporalRunId": "..." }`; accepted
signals return `204`.

```json
{
  "workflowRunId": "8f2b89bb-2405-4978-8163-47c46409c6d0",
  "temporalWorkflowId": "store-health-v1:8f2b89bb-2405-4978-8163-47c46409c6d0",
  "taskId": "51c3758b-975a-47ce-a0cf-a8a45280be40",
  "workflowVersion": 1,
  "planRevision": 1
}
```

Approval signals carry `{ "idempotencyKey": "receipt-id", "approvalId":
"approval-id", "payloadDigest": "64-lowercase-hex", "decision": "approved",
"applicationDecisionVersion": 2 }`. Cancellation signals carry `idempotencyKey`,
`payloadDigest`, and `reasonCode`. The `idempotency-key` header must equal the
body value.

## Error Codes

Common transport codes are `VALIDATION_ERROR` (`400`), authentication errors
(`401`), `FORBIDDEN`/`WORKFLOW_POLICY_DENIED` (`403`), `*_NOT_FOUND` (`404`),
`STALE_VERSION`, state/terminal conflicts, `WORKFLOW_SIGNAL_CONFLICT`, and
`ACTIVITY_INVOCATION_CONFLICT` (`409`). Binding/schema failures such as
`APPROVAL_BINDING_INVALID`, `INVALID_FROZEN_PLAN`,
`ACTIVITY_INPUT_INVALID`, `ACTIVITY_OUTCOME_INVALID`, and
`WORKFLOW_VERSION_UNSUPPORTED` return `422`. Dependency loss returns `503` or
remains a retryable internal delivery failure; unknown server failures return
`500` without credentials or sensitive payloads.

## Governance Scope

Phase A task, employee, configuration, revocation, audit, and approval list/read
routes remain available as previously documented. Phase D adds an internal
`execute_model_analysis_v1` Temporal activity. It accepts only an authorized
Agent command, reserves and settles model runs through the API, and returns only
`status`, `outputDigest`, and `qualityReasonCodes`; prompt and response bodies
never leave the activity result. It does not add generic SQL, file intake,
Agentic Console UI, AI CEO delegation, or production SePay activation.
