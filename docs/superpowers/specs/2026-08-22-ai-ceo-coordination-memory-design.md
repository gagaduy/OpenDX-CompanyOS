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

### Execution Descriptor and Department Identity Bridge

The API prepares an immutable `ExecutionDescriptor` for every accepted
Department subtask before Temporal may dispatch it. The descriptor is the
API-owned authorization snapshot for that execution, not a capability that the
workflow may broaden. It binds the task, plan revision, subtask, assigned
Department Agent, configuration and policy revisions, approved model pair,
strict result schema, authorized context and provenance references, allowed
tool/data scope, budget authorization, freshness boundary, expiry, and a digest.
The descriptor is append-only; a changed, revoked, stale, or expired decision
requires a new descriptor and a fresh policy evaluation.

Temporal history contains only the descriptor ID and digest, assigned Agent,
dependency result references, and idempotency keys. It never contains the
descriptor body, raw context, prompts, responses, access tokens, client
secrets, attachment content, or Department tool results. The AI worker uses
its control-plane workload identity to load the purpose-specific descriptor
from the internal API, verifies its binding and expiry, and obtains the exact
Department service identity only for that Department's Tool Registry calls.
The six Department identities remain separate from one another and from the AI
CEO and worker identities; no fallback to a shared Agent credential is
permitted.

Model execution continues through the API-owned governed model-run lifecycle.
The runtime submits the descriptor binding and assigned Agent rather than
selecting authority locally. The API revalidates active configuration, policy,
revocation, model pair, budget, schema, context provenance, and idempotency
before reserving or starting a run. This bridge adds no direct database access,
no general credential broker, and no new public runtime endpoint.

### AI CEO Model Authority and Private Result Bridge

Planning and synthesis use separate append-only `AiCeoExecutionAuthority`
records owned by the API. An authority has purpose `orchestration_planning` or
`executive_synthesis` and binds its ID and version, task, optional accepted
plan version, configuration and policy versions, approved primary and fallback
models, strict result-schema name, body, and digest, authorized-context digest,
budget, timeout, expiry, private-payload digest, and authority digest. It has no
tool grant, Department credential, prompt, or raw attachment field.

The API idempotently prepares a planning authority when the worker loads a
Task Brief. Exact retries return the same unexpired authority; expiry,
revocation, or an authority change requires a new version and policy
evaluation. Plan acceptance transactionally prepares the synthesis authority
for that immutable plan version. The private authority payload is available
only to the worker identity with `Cache-Control: no-store` and never crosses a
Temporal activity boundary.

The planning schema accepts only a bounded proposal of unique policy-eligible
Department owners and their dependency owners. The model cannot propose IDs,
models, schemas, tools, scopes, budgets, policy versions, provenance, or
timestamps. After the Phase-F planning Quality Gate accepts the proposal, the
runtime deterministically enriches it from the Task Brief, and the API
revalidates the resulting complete `OrchestrationPlan` before persistence.

The governed model executor may return an accepted structured result only to
its in-process application caller. Model-run settlements, Temporal activity
results, logs, metrics, and exceptions remain digest-only. Department
execution submits the accepted, strict, purpose-specific result envelope to
the API together with its descriptor binding. The API revalidates the
descriptor and schema, recomputes result and provenance digests, and stores the
bounded shareable envelope in a separate immutable private-payload table. A
terminal or escalated branch stores no fabricated payload.

For accepted Phase F outputs, model-run completion and the corresponding
plan, Department result, or executive-report settlement commit in one API
transaction. Before invoking a model, an activity checks the deterministic
domain settlement ID and returns its bounded reference when a prior commit's
response was lost. This closes the model-settled/domain-unsettled crash window
without persisting model bodies in Temporal or a runtime-local recovery cache.
The API binds atomic completion to the stored run's task, Agent, configuration,
policy, schema, and authorized input digest. Executive reports persist a digest
of their bounded synthesis branch references for exact recovery; an
all-unavailable partial report may use empty model provenance, while any
provided provenance must still be accepted synthesis evidence.

Before synthesis, the worker submits only Department result references from
Temporal to a worker-only synthesis-context operation. The API resolves exact
accepted result digests and returns only the validated shareable envelopes plus
the synthesis authority; unavailable references remain explicit. The AI CEO
therefore never receives raw Tool Registry responses or the union of
Department contexts. The final accepted AI CEO result envelope is similarly
schema-validated and stored as an immutable private executive-report payload,
while Temporal receives only the report digest and completion reference.

Planning uses the existing governed model-run lifecycle with a dedicated
`PlanningQualityGate` that validates the strict proposal, eligible owners, and
acyclic graph. Synthesis uses the existing `QualityGate` extended with the
explicit `executive_synthesis` purpose and the already bounded AI CEO result
schema. Phase D's no-delegation behavior remains unchanged for every command
outside the `orchestration_planning` authority.

## Immutable Contracts

`TaskBrief` contains task ID, goal, instructions, deadline, expected output,
constraints, risk signals, approved file-source references, configuration and
policy versions, and a digest. It is created from trusted task state and
explicitly labeled untrusted task/file content; raw attachment content is not
placed in logs or workflow history. Its worker-only view references the exact
planning authority without allowing the AI CEO to select that authority.

`OrchestrationPlan` is a versioned immutable DAG. Every subtask has exactly one
policy-eligible Department owner, an expected result schema, dependency IDs,
allowed tools/data scope, freshness requirement, timeout, budget, and source
provenance. A model may rank eligible assignments, but deterministic validation
rejects cycles, unknown Agents/tools, duplicate ownership, unsupported work,
scope expansion, and budget/timeout violations before dispatch.

`ExecutionDescriptor` is a short-lived immutable dispatch contract. Its
identity fields are descriptor ID and version, task ID, plan version, subtask
ID, Agent kind, configuration revision ID, policy version, and descriptor
digest. Its authority fields are the approved primary/fallback model IDs,
result-schema name and digest, authorized context/provenance reference IDs and
digest, allowed tool grants with purpose, data scope, version and invocation
limit, budget authorization reference, timeout, freshness limit, and expiry.
The internal read DTO may return the strict schema and minimized authorized
context needed for execution, but those values never enter Temporal history or
normal logs. Secrets are never descriptor fields.

`CollaborationRequest` is the sole cross-Agent channel. It records requester,
requested Department, task, question, purpose, requested data class, evidence
IDs, version, policy decision, and redacted payload digest. The AI CEO and
Policy Engine re-evaluate policy and minimize/redact data before forwarding.
There is no direct Agent-to-Agent transport.

`ExecutiveReport` contains conclusions, proposed actions, accepted Department
evidence, provenance, cost, approval history, conflicts, unavailable data,
failed branches, and an explicit completion state. Every conclusion references
accepted provenance; it never fabricates a result for a failed or unavailable
branch. Its bounded payload is private API state; normal responses and Temporal
history use only its digest and completion reference.

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

New executions use a named Temporal patch boundary for descriptor-based
dispatch. Existing Store Health Review histories remain on their original
deterministic Phase B path and must replay without receiving new commands.
On the new path, each dependency-ready subtask follows this sequence:

1. Load and verify the descriptor by ID, digest, task, plan, subtask, Agent,
   expiry, and current revocation state.
2. Invoke only descriptor-authorized typed tools with the assigned
   Department's service token; retain result references and digests rather
   than raw bodies in workflow state.
3. Submit minimized tool evidence to the existing governed model-run and
   Quality Gate lifecycle under the descriptor binding.
4. Append one schema-validated shareable result payload or return an explicit
   unavailable/partial reference, then release newly dependency-ready
   subtasks.
5. Route any cross-Department need through a persisted, policy-re-evaluated
   `CollaborationRequest`; the target receives only the approved redacted
   payload, never the requester's complete context.

Descriptor digest, scope, identity, or binding mismatches fail closed without
tool or model execution. Expired, stale, or revoked descriptors produce a
safe paused/replan outcome and cannot be retried as if authority were still
valid. Transient API, identity-provider, or Tool Registry failures may use
bounded activity retries with the same idempotency keys. A terminal Department
authentication or tool failure is reported as unavailable evidence; it never
causes another Department identity to be substituted. Idempotency is enforced
independently at descriptor creation, tool invocation, model run, accepted
result, collaboration forwarding, and executive report persistence.

Planning and synthesis authority preparation, private accepted-result payload
persistence, synthesis-context resolution, and private report-payload
persistence are independently idempotent. A retry with the same authority and
digest converges; a changed payload conflicts. API validation and digest
recomputation occur before either payload becomes eligible for synthesis or
reporting.

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

Department client credentials are deployment secrets loaded into a typed
Agent-to-credential mapping by the worker. Descriptor dispatch is disabled
unless all six distinct Department identities are configured; duplicate or
missing identities fail startup/configuration validation. Tokens are acquired
just in time, bounded to the intended audience, cached no longer than their
validity permits, and excluded from exceptions, metrics, logs, audit,
provenance, activity arguments/results, and workflow history. The worker's
control-plane identity cannot impersonate a Department at the Tool Registry.

## Validation

Deterministic fake models and typed fake tools prove Task Brief construction,
policy re-evaluation, schema validation, acyclic plans, eligible assignment,
fan-out/fan-in, mediated/redacted collaboration, Quality Gate correction
limits, partial reports, and restart replay. Tests must prove no
cross-department leakage, direct collaboration channel, unapproved tool/model
selection, permission inheritance, Commerce mutation, or fabricated report
conclusion. PostgreSQL/Temporal integration covers versioning, idempotency,
state projection, cancellation, approval waits, and recovery.

Descriptor bridge tests additionally prove digest and cross-task/subtask
binding rejection, expiry and revocation failure, exact Agent/model/schema/tool
authorization, context minimization, all six distinct Department token
selections, and fail-closed handling of missing or duplicate identities. They
inspect serialized histories and structured logs for absence of descriptor
bodies, raw tool/model data, and secrets. Retry/restart tests prove exactly-once
descriptor, tool, model-charge, collaboration, result, and report effects.
Replay tests cover both exported pre-bridge histories and new patched histories
so deployment cannot invalidate in-flight Phase B runs.

AI CEO authority tests additionally prove that model, schema, policy, budget,
and expiry cannot be supplied by model output; planning proposals cannot add
unknown owners or cycles; structured content remains process-local until the
API validates it; synthesis resolves only exact accepted references; and raw
Department tool bodies, rejected model results, private payloads, prompts, and
authority bodies are absent from Temporal history and structured logs.

## Deferred Phase F Slices

Slice 2 adds human-managed idempotent Store Health Review schedules. Slice 3
adds reviewed Company Memory candidates, human promotion, versioning,
staleness, and revocation. Neither slice can bypass the Task Brief, policy,
Quality Gate, or human-approval boundaries established here.
