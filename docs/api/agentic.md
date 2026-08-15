<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Agentic API

Phase A exposes governance and Phase B adds one durable
`StoreHealthReviewWorkflowV1`. Staff routes are below `/v1/admin/agentic` and
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
routes remain available as previously documented. Phase B uses fake bounded
activities only. It does not call OpenRouter, expose generic SQL or Commerce
tools, ingest files, provide an Agentic Console page, or activate production
SePay behavior.
