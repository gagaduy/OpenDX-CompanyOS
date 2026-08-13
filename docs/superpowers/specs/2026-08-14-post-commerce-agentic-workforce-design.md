<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Post-Commerce Agentic Workforce Design

## Status

Approved in collaborative design on 2026-08-14. Written-spec review is the
remaining gate before an implementation plan may be created. This document
supersedes the agentic direction in the historical 2026-07-30 master roadmap;
it does not supersede the completed NovaCommerce Commerce Platform phases.

## Purpose

This design defines the first governed Agentic capability built on the
completed NovaCommerce Commerce Foundation. A human operator submits work to an
AI CEO, which analyzes the request, decomposes it, and delegates bounded work to
department-specific Digital Employees. The AI CEO coordinates collaboration,
applies deterministic policy decisions, checks result quality, and returns one
traceable executive report.

The AI CEO is an orchestration role, not an autonomous company executive. It
cannot grant permissions, inherit department access, or approve risky actions
outside policy configured by a human administrator.

## Product Outcome

The first demonstrable workflow is **Store Health Review & Action Plan**:

1. A human submits a task directly or uploads a supported business file.
2. Uploaded content is quarantined, scanned, parsed, and presented as a plan
   preview before bulk subtasks are created.
3. The AI CEO creates an auditable task brief and dependency-aware plan.
4. A deterministic Policy Engine restricts eligible agents, tools, data, and
   approval behavior.
5. Independent department analyses run in parallel; dependent work runs in
   order.
6. Department collaboration is mediated by the AI CEO and Policy Engine.
7. A deterministic Quality Gate validates every result before synthesis.
8. The AI CEO returns an executive report containing conclusions, unresolved
   conflicts, recommendations, and provenance.
9. Memory candidates are reviewed before becoming durable Company Memory.

## Initial Digital Workforce

| Digital Employee | Responsibility | Default data boundary |
| --- | --- | --- |
| AI CEO | Intake, planning, delegation, collaboration mediation, quality coordination, and synthesis | Task brief plus explicitly shared department outputs |
| Catalog Agent | Product completeness, content quality, price presence, publication readiness, and merchandising analysis | Catalog read models and approved catalog analytics |
| Inventory Agent | Low stock, sales velocity, slow stock, anomalies, and replenishment proposals | Inventory read models and inventory-sales analytics |
| Order Agent | Stalled orders, state anomalies, expiry risk, and operations proposals | Order operations read models and approved aggregates |
| Finance Agent | Pending payments, reconciliation evidence, discrepancies, and finance proposals | Payment read models and finance analytics |
| CRM Agent | Deterministic segments, customer behavior, and follow-up proposals | CRM read models with purpose-limited customer data |
| Support Agent | Ticket classification, SLA risk, relevant order context, and response drafts | Support read models and authorized support context |

There is one Digital Employee per department in the first release. Specialist
hierarchies and self-created agents are excluded.

## Authority Model

### Rule-first routing

The Policy Engine first determines which Digital Employees, tools, models, and
data classes are eligible for a task. The AI CEO may select only from that
eligible set. A model may help classify intent and rank eligible assignments,
but it cannot expand authority. Ambiguous or unmatched work is sent to the
human operator.

### AI CEO automatic authority

The AI CEO may automatically:

- read task briefs and safe attachment metadata;
- decompose tasks and create internal subtasks;
- schedule independent work in parallel and dependencies in order;
- mediate read-only collaboration explicitly allowed by policy;
- request up to two bounded corrections from a Department Agent;
- synthesize approved results and propose memory candidates.

The AI CEO may not:

- use the `administrator` staff role or inherit another Agent's authority;
- add agents, tools, models, permissions, or budgets;
- change prices, promotions, publication, inventory, order, or payment state;
- send customer-facing communications or close support tickets;
- approve financial, legal, production, publishing, permission-changing, or
  other policy-designated risky actions;
- query operational PostgreSQL directly.

The initial release is read, analyze, coordinate, and draft only. Later write
capabilities require separately approved workflow designs and human approval.

### Digital Employee identity

Every Digital Employee has a distinct service identity, department, tool
allow-list, data scope, model configuration, budget, task memory, and audit
trail. Digital Employees never share credentials. Staff Keycloak roles remain
human Console roles and are not reused as agent credentials.

## Architecture

```text
Console Task Intake / File Upload / Approval Inbox
                         |
                         v
                    Agentic API
       Task, Subtask, Policy, Audit, Memory records
                         |
                         v
               Temporal Workflow Service
   plan -> dispatch -> wait -> retry -> quality -> synthesize
                         |
            +------------+-------------+
            |                          |
            v                          v
          AI CEO               Department Agents
            |                          |
            +----------+---------------+
                       v
                  Tool Registry
                       |
          +------------+----------------+
          |                             |
          v                             v
 Module-owned read ports       Read-only analytics views
          |                             |
          +---------- PostgreSQL -------+

Agent Runtime -> Model Gateway -> OpenRouter
File Intake -> MinIO quarantine -> ClamAV -> Parser -> Preview
```

PostgreSQL remains the source of truth for tasks, policies, approvals, agent
configuration, results, audit, provenance, and memory. Temporal owns durable
execution state, retries, timers, fan-out/fan-in, signals, and restart recovery.
Temporal payloads carry identifiers and bounded immutable inputs rather than
credentials, unrestricted documents, or business-source-of-truth state.

## Module Boundaries

The implementation plan must preserve feature-first Clean Architecture and
introduce directories only with their first approved source or test file.
Expected ownership is:

- `workflow`: versioned workflow definitions, workflow runs, Temporal ports,
  durable orchestration, signals, and execution history;
- `agent`: Digital Employee profiles, agent runs, handoffs, task memory, budget
  enforcement contracts, and Quality Gate coordination;
- `policy`: deterministic `ALLOW`, `REQUIRE_APPROVAL`, and `DENY` decisions;
- `tool-registry`: registered tool descriptors, agent grants, bounded tool
  invocation, result redaction, and invocation audit;
- `memory`: memory candidates, approval, versioning, staleness, revocation, and
  permission-scoped retrieval;
- `integration`: OpenRouter and document-parser adapters behind inward-facing
  ports;
- existing commerce modules: public read ports owned by the module rather than
  repository or persistence internals exposed to Agentic modules.

The exact module split and cross-module public contracts are implementation-plan
decisions. No module may import another module's private repository, entity, or
database implementation.

## Task Intake

### Direct entry

A human submits a goal, instructions, optional deadline, and attachments. The
AI CEO creates a structured Task Brief containing scope, expected output,
constraints, risk signals, and source references. Policy evaluation occurs
before planning and again before each external action.

### Scheduled entry

The first release may create the same Store Health Review task on a configured
schedule. Scheduled tasks do not bypass intake, policy, budgets, or approvals.
Event-triggered commerce automation is deferred.

### File entry

Supported initial formats are DOCX, XLSX, PDF, CSV, and TXT. The pipeline is:

```text
upload -> private quarantine -> malware scan -> safe parse
       -> structured rows/sections -> proposed plan preview
       -> human approval -> task/subtask creation
```

Files remain private in MinIO. ClamAV failure is fail-closed. Macros, scripts,
embedded executables, external links, and active content are never executed.
Parsing has bounded file size, page/sheet count, row count, cell length, archive
expansion, and processing time. Unsupported, encrypted, malformed, or infected
files are rejected or retained in quarantine according to a documented
retention policy.

For XLSX and CSV input, the parser identifies sheets, headers, rows, invalid
records, duplicates, and grouping candidates. The preview shows:

- valid and invalid row counts;
- proposed tasks and assigned departments;
- dependency and parallel-execution groups;
- required tools and data classes;
- likely approval points;
- source references down to file, sheet, row, and cell where applicable.

No bulk subtasks are created until the human approves the versioned preview. A
changed preview invalidates the previous approval.

## Task and Collaboration Flow

A task contains immutable intake provenance and versioned planning revisions.
Each subtask has one owning Digital Employee, explicit dependencies, expected
output schema, tool scope, data freshness requirements, budget, timeout, and
completion status.

Digital Employees do not communicate directly. An Agent creates a structured
`CollaborationRequest` containing the source task, question, requested
department, needed data class, purpose, and supporting evidence. The AI CEO and
Policy Engine then:

- forward an allowed read-only request with the minimum necessary context;
- redact fields outside the receiver's scope;
- deny an impermissible request; or
- pause only the affected workflow branch and create a human approval request.

Every routing and collaboration decision records the policy version, reason,
actor, correlation, causation, and outcome.

## Store Health Review Workflow

The first Temporal workflow is fixed and versioned; it is not a generic visual
workflow builder.

```text
received
-> planning
-> awaiting_plan_approval (file-derived bulk work only)
-> dispatching
-> department_analysis
-> quality_review
-> collaboration (when required)
-> executive_synthesis
-> completed
```

Supported non-happy states are `awaiting_human_approval`, `retrying`,
`partially_completed`, `failed`, and `canceled`.

Temporal provides deterministic orchestration, fan-out/fan-in, activity retry
with bounded backoff, timeouts, cancellation propagation, approval signals, and
restart recovery. Activities are idempotent at their application boundary.
Published workflow versions cannot be changed in place; new behavior creates a
new version while existing runs retain their original definition.

## Tool Registry and Data Access

Models do not receive PostgreSQL credentials and cannot submit free-form SQL.
Every data request is a typed tool invocation. The Tool Registry checks:

1. agent service identity;
2. active task and purpose;
3. tool grant and tool version;
4. department, resource, action, and data classification;
5. parameter schema and query limits;
6. policy version, task budget, and rate limits;
7. output redaction and permitted sharing scope.

Tools use two controlled data paths:

- module-owned repositories or read models for authoritative record-level
  reads; and
- department-scoped, read-only PostgreSQL analytics views for approved
  aggregate analysis.

Analytics views expose purpose-specific columns and bounded filters. They are
not a generic SQL surface. Existing modules publish focused public ports; Agentic
modules never import their private persistence code.

Every tool result includes retrieval time, source module or view, statistical
window, freshness metadata, and a provenance identifier. The AI CEO receives
only the result explicitly shareable under policy, not the union of all
department records.

## Model Gateway and OpenRouter

OpenRouter is the initial model provider behind a provider-neutral Model
Gateway. Each Digital Employee has human-configured values for:

- primary model and ordered fallback models;
- maximum input and output tokens;
- maximum cost per task;
- daily and monthly budget;
- timeout and maximum retry count.

The Gateway validates the model allow-list and budget before each call, applies
data minimization and redaction, invokes OpenRouter with a centrally managed
secret, and records model, token usage, estimated cost, latency, result status,
and task provenance. Prompts, logs, and workflow payloads never contain API
keys. Sensitive request or response bodies are not placed in normal logs.

The AI CEO cannot choose an unapproved model. Provider failures use only the
configured fallback order. Budget exhaustion pauses the subtask and notifies
the human; it never silently changes policy or selects an arbitrary cheaper
model.

## Quality Gate

Department results use purpose-specific structured schemas. Before synthesis,
the Quality Gate deterministically checks:

- schema validity and required sections;
- provenance for material conclusions;
- tool and data-scope compliance;
- configured data freshness;
- backend-verified arithmetic and financial totals;
- restricted-data leakage;
- unresolved contradictions with other department results.

A result that fails is returned to its Agent with machine-readable reasons for
at most two correction attempts. Continued failure, missing authoritative data,
or unresolved conflict produces an explicit partial result or human escalation.
The AI CEO must not invent a replacement conclusion to make a task appear
complete.

## Human Approval

The Console Approval Inbox shows task, subtask, requesting Agent, proposed
action or data access, reason, sources, risk, expected effect, policy decision,
payload version, and expiry. A human can approve, reject, or request revision.

Approval is bound to the exact actor, resource, action, parameters, task,
payload digest, and policy/workflow versions. It is single-purpose, auditable,
time-bounded, and cannot be replayed for changed input. Temporal pauses and
resumes through authenticated application signals; direct Temporal signals do
not bypass application authorization.

## Memory

The first release separates:

1. **Task Memory:** durable task-scoped files, facts, tool results,
   collaboration, and outputs.
2. **Agent Working Memory:** bounded transient context for one agent run, with a
   defined expiry.
3. **Company Memory:** reviewed, versioned, permission-scoped durable knowledge.

An Agent may propose a `MemoryCandidate` but cannot promote it. Policy may
auto-approve only explicitly configured low-risk classes; sensitive,
cross-department, or decision-bearing candidates require human approval.
Company Memory records source provenance, author, scope, data classification,
approver, version, review date, and `active`, `stale`, or `revoked` state.
Source changes can mark dependent memory stale.

Full vector search, graph projection, and GraphRAG are deferred to a later
approved phase. The initial memory implementation must not claim semantic or
graph retrieval that does not exist.

## Console Surfaces

The Console adds a role-aware **Digital Workforce** navigation group:

- `/agentic/tasks` — tasks, state, owner, progress, cost, and approval status;
- `/agentic/tasks/new` — direct intake and file upload;
- `/agentic/tasks/:taskId` — brief, plan, dependency graph, subtasks,
  collaboration, quality evidence, approvals, and final report;
- `/agentic/approvals` — Approval Inbox;
- `/agentic/employees` and `/agentic/employees/:agentId` — identity, model,
  tools, scope, budget, health, and run history;
- `/agentic/memory` — memory candidates and approved Company Memory;
- `/agentic/audit` — model, tool, assignment, collaboration, policy, and
  approval timeline.

The task detail is an operational timeline rather than a multi-persona chat.
Every executive conclusion can reveal its Agent, tool calls, source timestamp,
file location, model cost, and Quality Gate evidence. Commerce Dashboard facts
remain backend-authoritative; a separate Agentic summary may show running,
waiting, failed, and completed tasks plus current cost without altering revenue
truth.

## Security and Privacy

- Backend and runtime authorization is mandatory; frontend visibility is only
  a usability aid.
- Tool calls and model calls are denied by default.
- Prompt injection in task text or files cannot grant tools, change policy,
  reveal secrets, or bypass approval.
- External content is labeled untrusted and cannot be interpreted as system or
  policy instructions.
- Customer and payment data is minimized before model calls and cross-agent
  collaboration.
- Secrets reside only in validated environment or secret-management
  boundaries.
- Important inputs, outputs, approvals, policy decisions, model calls, tool
  calls, and handoffs retain audit and provenance.
- Retention and deletion cover uploaded files, extracted content, task memory,
  model evidence, and rejected attachments without erasing required audit.

## Failure and Recovery

- OpenRouter transient failures use bounded retries and approved fallbacks.
- Tool failure or stale data yields a disclosed unavailable result, not an LLM
  estimate.
- Invalid model output enters Quality Gate correction, then escalation.
- Budget exhaustion pauses only affected branches where dependencies permit.
- Cross-department conflicts remain visible until resolved or accepted by the
  human.
- Malware scanner or parser unavailability fails file intake closed.
- Temporal and worker restart preserves workflow progress and approval waits.
- Policy is re-evaluated before every tool invocation and before final sharing;
  revoked authority stops later actions.
- Approval expiry or payload change requires a new approval.

## Validation Strategy

Implementation plans must include direct tests for:

- `ALLOW`, `REQUIRE_APPROVAL`, and `DENY` decisions;
- AI CEO non-inheritance of department authority;
- agent identity, tool allow-list, data scope, model allow-list, and budgets;
- zero cross-department CRM, Finance, and customer-data leakage;
- absence of direct agent database credentials and free-form SQL;
- prompt-injection resistance at task, file, tool-result, and collaboration
  boundaries;
- safe DOCX, XLSX, PDF, CSV, and TXT parsing with quarantine and provenance;
- bulk preview versioning and approval binding;
- Temporal fan-out/fan-in, retries, timeout, cancellation, restart recovery,
  and approval resume;
- idempotent activities and duplicate signals;
- Quality Gate schema, source, freshness, arithmetic, and conflict checks;
- audit and provenance completeness;
- model-provider failure, fallback, and budget exhaustion;
- responsive, keyboard-accessible Console loading, empty, error, denial,
  waiting, partial, and success states;
- deterministic reset and rerun of Store Health Review.

Permission-leakage tests require zero unauthorized records or model context.
Model behavior is tested through deterministic fakes at normal gates;
credential-owned OpenRouter acceptance is explicit and must not expose keys,
customer data, prompts, or provider payloads in repository evidence.

## Delivery Sequence

This master design is implemented through focused specs and plans in order:

1. **Agent Governance Foundation:** task, Digital Employee identity, policy,
   tool registry, audit, budgets, and model configuration contracts.
2. **Durable Store Health Workflow:** Temporal topology, versioned fixed
   workflow, recovery, approval signals, and task execution state.
3. **Read-only Department Tools:** module public read ports and approved
   department analytics views.
4. **OpenRouter Agent Runtime:** provider-neutral Gateway, seven configured
   Digital Employees, structured runs, and Quality Gate.
5. **File Intake and Bulk Preview:** private MinIO, ClamAV, safe parsing,
   provenance, preview, and approval.
6. **AI CEO Coordination:** task decomposition, collaboration mediation,
   result synthesis, and partial-result behavior.
7. **Console Digital Workforce:** tasks, approvals, employees, memory, audit,
   and Agentic dashboard summary.
8. **Deterministic Cross-department Acceptance:** Store Health Review, restart,
   permission leakage, budget, provider-failure, and browser evidence.

Each item requires its own approved focused spec where it changes runtime
architecture, permission behavior, external dependencies, or user-facing
behavior. The first implementation plan may group only tightly dependent
foundation items that can be validated as one coherent vertical slice.

## Out of Scope

- Generic drag-and-drop Workflow Builder.
- Agent-created agents, tools, skills, permissions, models, or budgets.
- Direct model access to PostgreSQL or unrestricted SQL.
- Automatic commerce mutations or customer communication.
- Autonomous financial, legal, publishing, production, or permission changes.
- Event-triggered commerce workflows in the initial release.
- Multiple specialist agents per department.
- Full GraphRAG, vector retrieval, or operational graph projection.
- Broad connector marketplace.

## Exit Criteria

The first Agentic milestone exits only when:

- a human can submit direct and file-backed Store Health Review tasks;
- the file preview must be approved before bulk task creation;
- the AI CEO produces a policy-constrained dependency plan;
- six Department Agents run with separate identities, models, scopes, tools,
  and budgets;
- collaboration is mediated and permission-limited;
- Temporal recovers active work and approval waits after restart;
- Quality Gate and human escalation behave deterministically;
- the executive report contains source-level provenance and honest partial
  results;
- memory candidates cannot bypass review;
- permission-leakage, prompt-injection, audit, budget, recovery, full-source,
  Compose, and browser checks pass;
- no Agent can mutate commerce state or access direct database credentials.
