<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# AI CEO Coordination and Memory Design

## Status

Approved focused design for Phase F Slice 1 on 2026-08-22. This slice delivers
the governed AI CEO orchestration path for direct-entry Store Health Review.
It deliberately defers schedule configuration and durable Company Memory to
later slices of the same Phase F design.

## Purpose and Boundary

The AI CEO turns one governed direct-entry task into an auditable dependency
plan, mediates only policy-approved departmental collaboration, and produces
an honest executive report. It is an orchestration role, never an autonomous
administrator: it cannot grant permissions, select unapproved tools or models,
approve risky actions, mutate Commerce, or communicate directly with a
Department Agent outside the mediated contract.

This slice includes Task Brief construction, policy-constrained planning,
department dispatch, structured collaboration, Quality-Gate-backed synthesis,
partial outcomes, and deterministic Temporal recovery. It excludes schedules,
Company Memory persistence or promotion, GraphRAG, vector search, Console UI,
customer communication, and Commerce mutation.

## Architecture

```text
direct Agentic task
  -> immutable Task Brief
  -> policy evaluation
  -> AI CEO structured plan proposal
  -> deterministic DAG / scope / budget validation
  -> Temporal dependency dispatch
  -> bounded Department model + typed Tool Registry calls
  -> Quality Gate
  -> mediated collaboration when required
  -> provenance-backed executive report
```

The API Agentic module owns task, plan, collaboration, policy, audit, and
provenance persistence. The Python AI runtime owns structured AI CEO planning,
dispatch coordination, and synthesis behind inward-facing ports. Temporal owns
durable orchestration state and retries. Existing OpenRouter runtime,
Quality Gate, Department identities, Tool Registry, policy, budgets, and
read-only Commerce ports remain the only model/tool execution paths.

## Immutable Contracts

`TaskBrief` contains task ID, goal, instructions, deadline, expected output,
constraints, risk signals, approved file-source references, configuration and
policy versions, and a digest. It is created from trusted task state and
explicitly labeled untrusted task/file content; raw attachment content is not
placed in logs or workflow history.

`OrchestrationPlan` is a versioned immutable DAG. Every subtask has exactly one
policy-eligible Department owner, an expected result schema, dependency IDs,
allowed tools/data scope, freshness requirement, timeout, budget, and source
provenance. A model may rank eligible assignments, but deterministic validation
rejects cycles, unknown Agents/tools, duplicate ownership, unsupported work,
scope expansion, and budget/timeout violations before dispatch.

`CollaborationRequest` is the sole cross-Agent channel. It records requester,
requested Department, task, question, purpose, requested data class, evidence
IDs, version, policy decision, and redacted payload digest. The AI CEO and
Policy Engine re-evaluate policy and minimize/redact data before forwarding.
There is no direct Agent-to-Agent transport.

`ExecutiveReport` contains conclusions, proposed actions, accepted Department
evidence, provenance, cost, approval history, conflicts, unavailable data,
failed branches, and an explicit completion state. Every conclusion references
accepted provenance; it never fabricates a result for a failed or unavailable
branch.

## Workflow and Failure Behavior

The existing versioned Store Health Review Temporal workflow gains planning,
dependency dispatch, collaboration, quality-review, and synthesis activities.
All activities are idempotent at their application boundary and project
versioned state. Policy is evaluated before planning, assignment, every model
call, every tool call, collaboration forwarding, and final sharing.

Invalid or cyclic plans, unapproved assignments, and scope/budget violations
produce `INVALID_PLAN` or `POLICY_DENIED` without dispatch. Ambiguous or
unsupported work pauses for human resolution. A branch needing approval pauses
without blocking unrelated dependency-ready branches. Quality Gate permits at
most two corrections; it then produces `PARTIAL_RESULT` or
`QUALITY_ESCALATED`. Cancellation is propagated durably. Recovery reuses the
same plan revision and idempotency keys, and cannot duplicate tool effects,
model charges, collaboration, or report artifacts.

## Security and Governance

All model inputs label untrusted task, file, tool, and collaboration content.
Models receive only policy-authorized, redacted, purpose-specific context.
The AI CEO receives shareable summaries rather than the union of Department
data. Tool access remains through the existing authenticated Tool Registry;
there are no database credentials, free-form SQL, shared Agent credentials, or
new public runtime commands. Important decisions preserve actor/service
identity, task, policy/model/tool versions, correlation/causation, outcome,
digest, audit, and provenance without normal-log prompt, response, secret, or
attachment bodies.

## Validation

Deterministic fake models and typed fake tools prove Task Brief construction,
policy re-evaluation, schema validation, acyclic plans, eligible assignment,
fan-out/fan-in, mediated/redacted collaboration, Quality Gate correction
limits, partial reports, and restart replay. Tests must prove no
cross-department leakage, direct collaboration channel, unapproved tool/model
selection, permission inheritance, Commerce mutation, or fabricated report
conclusion. PostgreSQL/Temporal integration covers versioning, idempotency,
state projection, cancellation, approval waits, and recovery.

## Deferred Phase F Slices

Slice 2 adds human-managed idempotent Store Health Review schedules. Slice 3
adds reviewed Company Memory candidates, human promotion, versioning,
staleness, and revocation. Neither slice can bypass the Task Brief, policy,
Quality Gate, or human-approval boundaries established here.
