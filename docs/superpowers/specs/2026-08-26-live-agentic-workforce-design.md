<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Live Agentic Workforce Design

## Status

Proposed focused delivery design on 2026-08-26. It activates the existing
Phase F/G implementation as a real operator journey and replaces the
misleading Advanced intake placeholder with governed cross-department work.

## Purpose

An operator must be able to create an Advanced task, mark it ready, and start
it without an approval gate. Starting it must invoke the real AI CEO and the
relevant Department Agents through OpenRouter, bounded Tool Registry calls,
and the durable Temporal workflow. The result must be an honest executive
report backed by persisted model, tool, cost, audit, and provenance evidence.

## Scope

- Use one coherent source revision for Console, API, AI Runtime, and worker
  Compose services; reject mixed image/source deployments at startup.
- Enable the existing descriptor orchestration only when OpenRouter execution,
  seven service identities, active configuration, model records, grants, and
  budgets are valid.
- Make Advanced intake select a bounded requested-work profile rather than
  merely omitting the Store Health date window. Persist that profile and use it
  when the AI CEO constructs an eligible dependency plan.
- Run AI CEO planning, Department descriptor execution, and executive
  synthesis against OpenRouter in the operator path. No live-path fallback may
  invoke `execute_fake_*` activities or fabricate a successful terminal state.
- Show planning, dispatch, branch, model, tool, cost, proposal, waiting,
  partial, failed, and completed states in the Console task detail.
- Introduce exact-digest approval proposals for mutations owned by Catalog,
  Inventory, CRM, Support, Order, and Payment. The task itself starts without
  approval; each proposed write remains pending until a human approves that
  exact actor/resource/parameters/version binding.
- Keep the owning Commerce module authoritative. An Agent never has direct
  database credentials, unrestricted SQL, or a direct write adapter.
- Require a credential-owner live acceptance that starts one Advanced task and
  proves persisted CEO, Department, model, tool, cost, report, and approval
  evidence without logging credentials, prompts, provider payloads, private
  object keys, or customer content.

## Explicit Boundaries

- Advanced work is not an unrestricted workflow editor, chat interface, or
  self-managed permission system.
- A Department can only receive a policy-eligible assignment and its exact
  configured typed tools. Unsupported requests finish with an honest blocked
  or partial result.
- Catalog, Inventory, CRM, Support, Order, and Payment actions are separate
  module-owned command adapters. They are delivered as independent vertical
  slices after the live-runtime and Advanced-planning foundation, not as a
  cross-module bulk mutation.
- Price, promotion, inventory, order, payment, authorization, and audit truth
  remain backend/PostgreSQL responsibilities. Payment confirmation remains
  authenticated-provider-event or reconciliation only.
- Every risky command requires a distinct, version- and digest-bound human
  approval. Approval is not required to start analysis or planning.
- Real OpenRouter output is expected in live acceptance, but a Quality Gate
  must disclose unsupported, stale, conflicting, partial, or failed output
  rather than claim correctness.

## Runtime Contract

```text
Advanced draft -> ready -> start
  -> AI CEO plan (OpenRouter)
  -> policy-eligible descriptor DAG
  -> Department tools + Department model runs (OpenRouter)
  -> Quality Gate and executive synthesis (OpenRouter)
  -> report and zero or more immutable mutation proposals
  -> explicit approval -> owning module command adapter
```

The worker may register descriptor activities only when
`OPENROUTER_EXECUTION_ENABLED=true` and
`ORCHESTRATION_DESCRIPTOR_EXECUTION_ENABLED=true`. A missing key, disabled
flag, missing identity, unavailable configuration, or invalid execution
authority is an observable failure. It is never permission to substitute fake
activities.

Local deterministic tests may use provider and typed-tool fakes through the
same ports. They are test-only and must be unable to enter the operator runtime
path. The live acceptance is separately opt-in, owner-credentialed, bounded by
the active task budget, and records redacted evidence only.

## Delivery Slices

1. **Live runtime activation:** fail-closed configuration validation, Compose
   topology, workflow-path observability, and a live Advanced execution using
   the existing read-only Department tools.
2. **Advanced planning contract:** persisted requested-work profiles, bounded
   eligible Departments/action intents, CEO plan validation, and honest
   blocked/partial Console states.
3. **Mutation proposal foundation:** generic immutable proposal/approval
   binding and worker-to-module command mediation.
4. **Owning-module action slices:** Catalog, Inventory, CRM/Support, then
   Order/Payment. Each adds only explicitly approved commands, public module
   APIs, authorization, idempotency, audit, and live acceptance evidence.
5. **Cross-department live acceptance:** a clean source build and one real
   Advanced task that demonstrates CEO delegation, configured Department work,
   report evidence, and an approved command; failures remain visible rather
   than becoming completed tasks.

## Acceptance Criteria

- The default local development stack cannot silently run a fake path for a
  task created through Advanced intake.
- A started Advanced task exposes `planning`, `dispatching`,
  `department_analysis`, `executive_synthesis`, and a truthful terminal state
  through the API and Console.
- The task has one persisted CEO plan, one or more persisted Department
  execution descriptors, model/tool records, settled costs, audit events,
  provenance, and an executive report.
- Invalid runtime configuration or provider failure produces a bounded failed
  or partial state with no fabricated evidence and no Commerce mutation.
- Every mutation proposal is immutable and separately approved against exact
  input/version bindings before the owning module executes it.
- Live evidence proves an OpenRouter request occurred without exposing the key
  or private model/provider content. A missing owner credential blocks this
  acceptance instead of substituting a fake.

