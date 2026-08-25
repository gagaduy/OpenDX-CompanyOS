<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Console Digital Workforce Design

## Status

Delivered focused design for Phase G on 2026-08-25. The implementation and
deterministic exit evidence are complete on `feat/console-digital-workforce`.

Phase F Slice 1 was integrated directly into the Phase G feature branch before
implementation. The branch remains unmerged into `develop` pending the user's
later pull-request workflow.

## Purpose and Outcome

Phase G adds a role-aware **Digital Workforce** workspace to the staff Console.
It lets authorized staff submit governed work, inspect file previews, follow
durable execution, decide approvals, inspect Digital Employees, audit important
actions, and read provenance-backed executive reports. It is an operational
workspace over the governed Agentic control plane, not a chatbot or a direct
channel to model personas.

An accepted Store Health Review demonstrates the complete Phase G outcome:

```text
operator submits a governed task or approved file preview
  -> operator starts the workflow
  -> Console follows six dependency-bound Department branches
  -> approver decides any waiting approval from exact evidence
  -> worker restart preserves one durable execution
  -> Quality Gate and AI CEO settle an honest report
  -> authorized staff read the report, cost, audit, and provenance
```

Unauthorized staff receive no Agentic data. Backend authorization remains the
security boundary even when navigation or controls are hidden in the browser.

## Scope

Phase G includes:

- a role-aware Digital Workforce navigation group;
- task overview, filters, list, guided intake, advanced intake, and private
  CSV/TXT intake;
- timeline-first task detail with dependencies, Department branches, Quality
  Gate, collaboration references, costs, approvals, provenance, and final
  report;
- a master-detail Approval Inbox with approve, reject, and request-revision
  decisions;
- read-only AI CEO and Department Agent visibility;
- a filtered Agentic audit explorer;
- the staff read models and idempotent intake contracts required by those
  surfaces;
- responsive, keyboard-accessible, failure-aware component and browser
  acceptance coverage.

Phase G excludes:

- Company Memory and the `/agentic/memory` route;
- schedules, recurring tasks, GraphRAG, graph projections, and vector search;
- direct Agent-to-Agent or human-to-Agent chat;
- Agent permission, tool, model, or budget self-management;
- a generic workflow or dependency-graph editor;
- Commerce mutation or changes to authoritative Commerce calculations;
- WebSocket or server-sent-event infrastructure;
- raw prompts, provider payloads, credentials, private object keys, or
  unfiltered worker contracts in browser responses.

Company Memory returns only through its own approved backend design. Phase G
does not show a disabled or misleading placeholder for it.

## Delivery Approach

Implementation uses end-to-end vertical slices. Each slice completes its staff
API contract, runtime validation, Console state, authorization tests, browser
behavior, documentation, and atomic commit before the next journey begins.

The intended sequence is:

```text
task overview and direct intake
  -> file preview intake
  -> task operations timeline
  -> Approval Inbox
  -> Digital Employee visibility
  -> audit and executive report
  -> deterministic Phase G acceptance
```

Building every backend read model before the UI would delay usable evidence.
Building mock UI first would hide missing authorization and recovery contracts.
Vertical slices keep the trusted boundary and its presentation testable as one
unit.

## Architecture and Ownership

```text
apps/console/src/features/agentic
  -> authenticated /v1/admin/agentic staff API
    -> Agentic presentation validators and controllers
      -> purpose-specific application query services
        -> Agentic repository projections and existing workflow records
```

The Console owns presentation only. `apps/console/src/features/agentic/` gains
`api`, `schemas`, `types`, `mappers`, `hooks`, `components`, `pages`, `tests`,
and a public `index.ts` only as the first approved responsibility requires each
file. Other features import the Agentic feature through `index.ts`.

`apps/console/src/app/app-router.tsx` owns route composition and
`apps/console/src/app/console-shell.tsx` owns role-aware navigation. Neither
contains Agentic business rules or payload filtering.

The existing `apps/api/src/modules/agentic` module owns the new staff read
models. Presentation validates input and maps application errors. Application
services define purpose-specific query results. PostgreSQL repository
implementations project existing task, workflow, plan, branch, Quality Gate,
collaboration, approval, cost, audit, provenance, and report records. No
Console endpoint proxies the private worker API.

Phase G does not change Temporal workflow decisions, Department execution,
Quality Gate rules, AI CEO authority, Commerce read tools, or report settlement.

## Routes and Role Matrix

The Console routes are:

| Route | Responsibility |
| --- | --- |
| `/agentic/tasks` | Digital Workforce summary, URL-backed filters, and task list |
| `/agentic/tasks/new` | Guided Store Health, advanced task, and authorized file intake |
| `/agentic/tasks/:taskId` | Timeline-first execution, evidence, cost, and report detail |
| `/agentic/approvals` | Approval Inbox and decision detail |
| `/agentic/employees` | AI CEO and six Department Agent profiles |
| `/agentic/employees/:agentId` | One employee's governance and recent-run detail |
| `/agentic/audit` | Filtered Agentic audit explorer |

The effective role matrix follows backend policy:

| Capability | administrator | agentic_operator | agentic_approver | agentic_governance_admin | agentic_auditor |
| --- | --- | --- | --- | --- | --- |
| List/read tasks and operations | yes | yes | yes | yes | no |
| Direct task create/update/ready/start/cancel | yes | yes | no | no | no |
| Upload/preview/approve/reject files | yes | no | no | yes | no |
| Read Approval Inbox | yes | yes | yes | yes | no |
| Decide approval | yes | no | yes | no | no |
| Read Digital Employees | yes | yes | yes | yes | yes |
| Read Agentic audit | yes | no | no | yes | yes |

The `/agentic/tasks/new` route is available when the actor can use at least one
intake mode. Unauthorized modes are absent, not rendered as fake disabled
controls. Entering a disallowed URL produces a safe denied state, while the API
still rejects the request independently.

## Staff API Contracts

Existing task, workflow, file, approval, employee, and audit endpoints remain
the command and basic query boundary. Phase G adds or tightens only the staff
contracts required for an honest operational UI.

### Task overview

`GET /v1/admin/agentic/tasks/overview` returns counts for running, waiting,
failed, completed, and canceled tasks, pending approvals visible to the actor,
and settled cost micros. Counts use one documented backend projection and never
replace authoritative Commerce metrics.

`GET /v1/admin/agentic/tasks` gains strict, bounded filters for task state,
created-by, and created-at window in addition to pagination. The response
retains stable ordering and total count. Unknown filters fail validation.

### Task operations

`GET /v1/admin/agentic/tasks/:taskId/operations` returns one purpose-specific
read model containing:

- task identity, goal, lifecycle state, owner, deadline, and version;
- workflow run identity, version, state, stage, freshness, and timestamps;
- immutable plan version and dependency edges;
- each branch owner, state, dependencies, approved tools, data classes,
  freshness, retry state, and bounded error category;
- Quality Gate disposition and provenance references without raw model output;
- mediated collaboration metadata and redacted digests;
- approval state, expiry, version, and effect summary;
- reserved and settled model cost summaries;
- audit and provenance references the actor may read;
- executive report content, completion state, conflicts, unavailable branches,
  and conclusion-to-provenance bindings when a settled report exists.

The backend derives state from authoritative records. The browser does not join
private endpoints, infer terminal status, or union Department data. A report is
absent until its immutable settlement exists. Partial reports name unavailable
branches rather than fabricating their results.

### Digital Employee detail

Employee detail adds configuration status, revocation status, approved models,
fallbacks, tools, data scope, budget limits, and bounded recent-run summaries.
An execution-health label is explicitly derived from configuration,
revocation, and recent run evidence and includes its basis and freshness. It is
not presented as a worker-process heartbeat.

Phase G employee pages are read-only. Configuration mutations remain outside
the approved route set.

### Idempotent intake

Direct task creation and file upload accept an `Idempotency-Key` bound to the
authenticated actor and a canonical request digest. Exact replay returns the
original result; reuse with changed input returns a governed conflict. File
preview approval continues using its existing version and idempotency binding.

Task transitions and approval decisions retain optimistic versions. A lost
response, refresh, or double click cannot create two tasks, files, workflow
runs, or decisions.

## Console Feature Boundaries

The Agentic frontend feature follows existing Console patterns:

- `api` sends authenticated requests and owns no view state;
- `schemas` validates every success and error envelope at runtime;
- `types` exposes UI-facing domain types rather than transport objects;
- `mappers` normalize timestamps, optional fields, state labels, and safe
  display values;
- `hooks` own loading, polling, abort, retry, mutation, and stale behavior;
- `components` render focused reusable panels;
- `pages` compose journeys and URL state without embedding transport logic.

Existing `PageHeader`, `SystemState`, `DialogShell`, form, table, timeline, and
Obsidian Flux tokens are reused. New shared primitives are introduced only if
at least two implemented features need the same responsibility.

## Screen Design

### Tasks workspace

`/agentic/tasks` places Digital Workforce metrics above a dense task table.
Filters for state, owner, and date are URL-backed. Refresh and shared deep links
restore the same view. Commerce dashboard cards are not modified.

```text
+ Digital Workforce --------------------------- [New task]
| Running | Waiting | Failed | Completed | Cost            |
+ Filters -------------------------------------------------+
| State | Owner | Date                         [Clear]       |
+----------------------------------------------------------+
| Task / Owner | State | Stage | Updated | Cost | Approval  |
+----------------------------------------------------------+
```

### Task intake

`/agentic/tasks/new` defaults to a guided Store Health Review with bounded
goal, review window, deadline, and budget context. Advanced mode exposes the
approved direct task fields without asking users to construct an orchestration
DAG. File mode accepts one CSV or TXT file, shows upload and scan progress,
renders the immutable preview and invalid records, then binds approval to the
exact preview version and digest.

Mode availability follows the role matrix. Switching modes never silently
submits or retains a file the actor no longer intends to use. Leaving a dirty
form requires explicit confirmation.

### Task operations

`/agentic/tasks/:taskId` is timeline-first. A compact dependency panel and
summary rail support the timeline without turning it into a graph editor.

```text
+ Task title / state / freshness -------- [Cancel or Retry] +
| Timeline: plan -> branches -> quality -> approval -> report |
|                                                            |
| Selected event detail             | Dependencies / Cost     |
| Evidence and provenance           | Approvals / Freshness   |
+------------------------------------------------------------+
| Executive report or honest waiting/partial/failed state     |
+------------------------------------------------------------+
```

Desktop uses the two-column operational layout. Tablet moves the summary rail
to a drawer. Mobile renders dependencies as an ordered relationship list and
keeps the primary action reachable without horizontal overflow.

### Approval Inbox

`/agentic/approvals` uses a master-detail layout. The list shows state, action,
risk, requester, age, and expiry. Detail shows actor, resource, action,
parameters digest, payload digest, policy/configuration versions, source
references, expected effect, and expiry before any decision.

Approve, reject, and request-revision actions require explicit confirmation.
Reject and revision-request require a bounded reason. Read-only roles never see
decision controls. Expired, already-decided, or stale versions reload into an
honest terminal state.

### Digital Employees and audit

Employee list and detail emphasize identity, Department, governance status,
approved execution configuration, scope, cost limits, and evidence-backed run
history. They do not mimic social profiles or chat presence.

Audit is a dense, paginated explorer with actor, action, outcome, resource, and
time filters supported by the backend. Details contain safe metadata and
provenance links only. The Console never performs client-side redaction of a
broader audit payload.

### Stitch-compatible visual references

The wireframes above are the canonical low-fidelity references. A Stitch or
equivalent rendering must produce the following named frames without changing
information architecture:

| Frame | Desktop reference | Responsive reference |
| --- | --- | --- |
| `G1 Tasks` | 240px shell sidebar, five compact metrics, filter row, dense task table | sidebar drawer, two-column metrics, task record list |
| `G2 Intake` | one primary form column plus sticky evidence/help rail | one column, inline evidence, bottom primary action |
| `G3 Operations` | timeline main column plus dependency/cost rail and report footer | timeline list, summary drawer, dependency relationship list |
| `G4 Approvals` | compact inbox list plus persistent decision detail | inbox list opening a full-height detail drawer |
| `G5 Employees` | seven-profile table and governance detail rail | profile cards followed by read-only detail sections |
| `G6 Audit` | filter bar, dense audit table, metadata drawer | filter drawer, audit record list, metadata sheet |

Each frame uses the existing Console canvas and token ladder, 8px controls,
12px operational panels, compact labels, tabular numerics, visible focus, and
only the approved lavender emphasis. Required variants are loading, empty,
denied, waiting, stale, partial, failed, and completed. These references are
implementation constraints, not approval to invent additional routes or a
second design system.

## Loading, Freshness, and Failure Behavior

Active task detail polls every five seconds. Polling stops for terminal tasks,
pauses while the document is hidden or offline, resumes with an immediate
refresh, and backs off to fifteen seconds after repeated safe failures. Route
changes and filter changes abort obsolete requests with `AbortController`.

The last validated response may remain visible during a transient outage, but
the page marks it stale with the last successful timestamp. It never presents
stale data as current. Mutations do not use optimistic success.

Each route supports stable loading, empty, denied, waiting, retrying, stale,
canceled, partial, failed, and completed states where applicable. Specific
conflicts behave as follows:

- `401`: authentication recovery without exposing protected content;
- `403` and existence-hiding `404`: safe denied/not-found state;
- `409`: stale or idempotency conflict, followed by controlled refetch;
- `413` or file-validation errors: retain safe form context and identify the
  rejected constraint;
- `503`: distinguish control-plane, workflow, and file-scan unavailability
  without exposing dependency internals.

Raw stack traces, prompts, provider responses, attachment bodies, secrets, and
object keys never appear in notifications or browser logs.

## Mutation and Recovery Safety

Mutation controls disable while one request is in flight, but server-side
idempotency and expected versions remain authoritative. Stable idempotency keys
survive retry of the same intent and rotate only when the user changes the
canonical input.

Starting, canceling, deciding, or approving never relies on a browser redirect
or local state as proof. After any ambiguous network result, the Console
refetches authoritative task, file, workflow, or approval state before offering
another action.

Worker restart is represented as continued durable execution, a bounded retry,
or an honest failure. The UI does not create a replacement run to simulate
recovery.

## Responsive and Accessible Interaction

The Console preserves the existing dark operational canvas: `#010102` canvas,
surface and hairline hierarchy, and scarce `#5e6ad2` emphasis for primary
action, focus, brand, and links. It adds no decorative gradients, orbs, broad
purple washes, or unrelated accent system.

Desktop tables and side panels collapse into record lists and drawers at
smaller widths. Required acceptance widths are 390x844, 768x1024, and
1440x900, with no document-level horizontal overflow or overlapping text.

All routes provide semantic `main`, navigation, heading, form, status, and
table/list structures. Focus is visible. Dialogs trap focus, close with Escape
when safe, and return focus to their trigger. Validation supplies an error
summary and moves focus to the first invalid field. Filters, timeline events,
drawers, intake modes, and approval actions are keyboard operable.

Color is never the only state signal. Important async transitions use a
polite live region without announcing every poll. Motion respects
`prefers-reduced-motion`.

## Security, Privacy, and Provenance

Backend route guards enforce the approved role matrix and append denial audit
before returning. Query services apply actor, role, Department, resource, and
data-classification policy before constructing DTOs. Frontend role checks are
navigation and control affordances only.

The task operations read model exposes accepted, shareable evidence and
references. It does not return the union of raw Department inputs. Executive
conclusions preserve their provenance bindings, completion state, conflicts,
and unavailable branches. Costs are backend-settled integers in micros and are
formatted only after runtime validation.

The UI does not store Agentic payloads in local storage. URL state contains
only bounded non-sensitive filters and resource identifiers. Telemetry and
browser diagnostics exclude goals, instructions, reports, attachment content,
digests that could reveal private data, and authorization material.

## Testing Strategy

Every vertical slice starts with the smallest failing test and ends with a
focused passing gate and atomic Conventional Commit.

API unit and PostgreSQL integration tests prove:

- strict query and idempotency validation;
- exact role/action and field-level visibility;
- denial audit and existence hiding;
- stable pagination, filtering, overview counts, and cost arithmetic;
- authoritative operations projection across waiting, retry, partial, failed,
  canceled, and completed histories;
- no raw provider, prompt, attachment, object-key, or cross-Department leakage;
- exact replay and changed-input conflict for task and file intake.

Console tests prove:

- response schema rejection and safe error mapping;
- role-aware routes, navigation, intake modes, and mutation controls;
- URL filter restoration, deep linking, refresh, and back/forward navigation;
- polling pause/resume, abort, stale display, and terminal stop;
- loading, empty, denied, waiting, expired, retrying, canceled, partial,
  failed, and completed states;
- keyboard focus, dialog recovery, reduced motion, and no duplicate clicks.

Browser acceptance uses deterministic fake model/tool fixtures. It covers
direct Store Health intake, CSV/TXT preview approval, six-branch progress,
Approval Inbox decisions, stale versions, lost responses, worker restart,
partial completion, executive report, provenance, role denial, responsive
layouts, and refresh-safe deep links. Default Phase G gates require no external
OpenRouter credential.

Repository handoff runs focused API and Console tests, browser acceptance,
`git diff --check`, `pnpm audit:repo`, and the broad source gate. Phase H, not
Phase G, owns complete cross-department attack and production hardening.

## Exit Gate

Phase G is complete only when an authorized operator can:

1. create one guided Store Health Review without a duplicate on retry;
2. upload and approve one exact safe file preview into one draft task;
3. start and follow the durable six-Department execution after refresh and
   worker restart;
4. observe waiting, retry, partial, failure, cancellation, and completion
   truthfully;
5. let an authorized approver approve, reject, or request revision from the
   exact versioned evidence;
6. inspect Digital Employee governance and evidence-backed recent activity;
7. inspect allowed audit and provenance without cross-role leakage;
8. read the settled executive report with cost, conflicts, unavailable
   branches, and conclusion provenance;
9. use every required route by keyboard at mobile, tablet, and desktop widths.

Unauthorized roles must receive no Agentic data, direct URLs must not bypass
backend guards, and Commerce truth or mutation behavior must remain unchanged.

## Deferred Work

Phase H owns cross-department acceptance and hardening beyond the focused Phase
G exit. Human-managed schedules remain a deferred Phase F slice. Company
Memory, GraphRAG, graph projection, semantic retrieval, and a memory Console
route require later focused designs. None is implied by approval of this spec.
