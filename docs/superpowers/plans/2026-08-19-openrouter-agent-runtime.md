<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# OpenRouter Agent Runtime Implementation Plan

**Goal:** Deliver a governed provider-neutral runtime for all seven Digital Employees with fixed free OpenRouter models, strict structured results, deterministic Quality Gate decisions, atomic API-owned accounting, and a mandatory secret-safe live acceptance gate.

**Architecture:** The Agentic API remains authoritative for task identity, active configuration, model allow-list, pricing, revocation, policy, budget, model-run persistence, audit, and provenance. The Python AI Runtime owns only bounded context preparation, provider-neutral execution, OpenRouter transport, strict result parsing, and deterministic Quality Gate evaluation; it reaches authority through authenticated internal API ports and never receives database credentials. Existing Temporal workflow V1 remains immutable and non-coordinating; Phase D registers a model-execution activity for future workflow versions and validates the runtime directly without adding Phase F delegation.

**Tech Stack:** Node.js 22+, strict TypeScript, Express 5, Zod 4, PostgreSQL 18, `node-pg-migrate`, Python 3.13, dataclasses, `httpx` 0.28.1, Temporal 1.30.0, OpenRouter Chat Completions API, Vitest, Pytest, Docker Compose, and pnpm 11.

---

## Scope Guardrails

- Implement only Phase D from `docs/superpowers/specs/2026-08-19-openrouter-agent-runtime-design.md`.
- Keep AI CEO analysis single-input and read-only. Do not create subtasks, assign Departments, fan out, fan in, coordinate Agents, or promote memory.
- Permit only aggregate, redacted `internal` context to leave the local system. Reject unknown, `confidential`, and `restricted` classifications before provider preflight or prompt construction.
- Keep seven explicit Agent assignments and one approved fallback fixed. Inventory and Order temporarily share their approved primary. Reject aliases, `openrouter/free`, unknown IDs, non-zero live pricing, or missing structured-output support.
- Keep `agentic_budget_entries` as the only budget ledger. Model-run tables reference it; they do not duplicate task, daily, or monthly budget authority.
- Never persist or print API keys, authorization headers, prompt bodies, response bodies, provider error bodies, PII, ticket text, customer identifiers, or payment/provider evidence.
- Every behavior change follows RED-GREEN-REFACTOR. Run the named focused test in RED before changing production code and again in GREEN after the minimal implementation.
- Add no dependency: `httpx==0.28.1` already satisfies the provider adapter requirement.

## Fixed Runtime Contract

```python
PRIMARY_MODELS = {
    "ai_ceo": "z-ai/glm-5.2:free",
    "catalog": "google/gemma-4-26b-a4b-it:free",
    "inventory": "nvidia/nemotron-3-super-120b-a12b:free",
    "order": "nvidia/nemotron-3-super-120b-a12b:free",
    "finance": "openai/gpt-oss-20b:free",
    "crm": "dots-studio/dots-3-note-preview:free",
    "support": "nvidia/nemotron-nano-9b-v2:free",
}
EMERGENCY_FALLBACK = "liquid/lfm-2.5-2.6b:free"
MAX_CORRECTION_ROUNDS = 2
```

The common result envelope contains exactly `schemaVersion`, `agentKind`,
`status`, `summary`, `conclusions`, `risks`, `recommendedActions`, `evidence`,
and `payload`. Each payload is the exact Agent-specific structure approved in
the focused design. Unknown keys fail validation at every nesting level.

### Task 1: Define Model and Result Domain Contracts

**Files:**
- Create: `services/ai-runtime/app/agentic/domain/model_runtime.py`
- Create: `services/ai-runtime/app/agentic/domain/model_result_schemas.py`
- Create: `services/ai-runtime/tests/agentic/domain/test_model_result_schemas.py`
- Modify: `services/ai-runtime/app/agentic/application/ports.py`
- Modify: `CHANGELOG.md`

**Step 1: Write the failing schema tests**

Add table-driven Pytest cases that build one valid envelope for each of
`ai_ceo`, `catalog`, `inventory`, `order`, `finance`, `crm`, and `support`.
Assert exact-key validation, bounds, uppercase reason codes, non-negative safe
integers, VND integer amounts, 0-10,000 basis points, internal-only evidence,
and AI CEO rejection of `tasks`, `subtasks`, `assignees`, `delegations`, or
Agent-call fields.

**Step 2: Run RED**

Run:

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/domain/test_model_result_schemas.py -q
```

Expected: FAIL because `model_runtime` and `model_result_schemas` do not exist.

**Step 3: Implement minimal framework-neutral contracts**

Create frozen dataclasses and literals for `ModelRequest`, `ModelResult`,
`ModelGatewayFailure`, `AuthorizedModelRun`, `QualityDecision`, provenance
evidence, and the seven Agent payloads. Add `ModelGateway.generate()` to
`application/ports.py`. Implement explicit dictionary parsing without adding
Pydantic; reject booleans where integers are required and reject every unknown
key.

**Step 4: Run GREEN and existing Python tests**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/domain/test_model_result_schemas.py -q
python3 -m pytest -q
```

Expected: PASS; existing workflow contracts remain unchanged.

**Step 5: Commit**

```bash
git add services/ai-runtime/app/agentic/domain/model_runtime.py \
  services/ai-runtime/app/agentic/domain/model_result_schemas.py \
  services/ai-runtime/app/agentic/application/ports.py \
  services/ai-runtime/tests/agentic/domain/test_model_result_schemas.py CHANGELOG.md
git commit -m "feat(agentic): define structured model results"
```

### Task 2: Enforce Context Classification and Prompt Isolation

**Files:**
- Create: `services/ai-runtime/app/agentic/application/context_boundary.py`
- Create: `services/ai-runtime/app/agentic/application/prompt_builder.py`
- Create: `services/ai-runtime/tests/agentic/application/test_context_boundary.py`
- Create: `services/ai-runtime/tests/agentic/application/test_prompt_builder.py`
- Modify: `CHANGELOG.md`

**Step 1: Write the failing boundary tests**

Cover inherited leaf classifications, unknown classifications, blocked
`confidential`/`restricted` values, field allow-lists per Agent, collection and
string limits, emails, phone numbers, credentials, bearer tokens, API keys,
provider transaction evidence, ticket text, customer IDs, and prompt-injection
canaries. Assert blocked content fails before any gateway call. Assert safe
prompt messages keep trusted instructions separate from one serialized block
headed `UNTRUSTED_INTERNAL_CONTEXT`.

**Step 2: Run RED**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/application/test_context_boundary.py \
  tests/agentic/application/test_prompt_builder.py -q
```

Expected: FAIL because the boundary and builder do not exist.

**Step 3: Implement deterministic filtering and prompt construction**

Use code-owned per-Agent allowed fields, recursive limits, stable JSON
serialization, and conservative detectors. Return only a new redacted object;
never mutate caller input. Treat injection text as inert data and never derive
tools, models, permissions, policies, approvals, or system instructions from
it.

**Step 4: Run GREEN**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/application/test_context_boundary.py \
  tests/agentic/application/test_prompt_builder.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add services/ai-runtime/app/agentic/application/context_boundary.py \
  services/ai-runtime/app/agentic/application/prompt_builder.py \
  services/ai-runtime/tests/agentic/application/test_context_boundary.py \
  services/ai-runtime/tests/agentic/application/test_prompt_builder.py CHANGELOG.md
git commit -m "feat(agentic): isolate model prompt context"
```

### Task 3: Implement the Deterministic Quality Gate

**Files:**
- Create: `services/ai-runtime/app/agentic/application/quality_gate.py`
- Create: `services/ai-runtime/tests/agentic/application/test_quality_gate.py`
- Modify: `CHANGELOG.md`

**Step 1: Write failing ordered-decision tests**

Test checks in this exact order: schema, provenance, scope/classification,
freshness, arithmetic, leakage, conflicts. Cover all seven payloads, absent
evidence, unknown evidence IDs, stale windows, mismatched counts/amounts/basis
points, PII/secret/provider-evidence leakage, prompt injection, and conflicting
authoritative facts. Verify stable safe reason codes only.

**Step 2: Run RED**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/application/test_quality_gate.py -q
```

Expected: FAIL because `QualityGate` does not exist.

**Step 3: Implement the pure gate**

Return `accepted` for a valid result; `correct` for reparable schema,
provenance, freshness, or arithmetic failures while correction rounds remain;
`partial` after correction exhaustion when authoritative evidence is missing;
and `escalate` immediately for leakage, scope violations, or unresolved
conflicts. Never ask the model to decide its own outcome.

**Step 4: Run GREEN**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/application/test_quality_gate.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add services/ai-runtime/app/agentic/application/quality_gate.py \
  services/ai-runtime/tests/agentic/application/test_quality_gate.py CHANGELOG.md
git commit -m "feat(agentic): add deterministic quality gate"
```

### Task 4: Add Fail-Closed OpenRouter Infrastructure

**Files:**
- Create: `services/ai-runtime/app/agentic/infrastructure/openrouter.py`
- Create: `services/ai-runtime/tests/agentic/infrastructure/test_openrouter.py`
- Modify: `services/ai-runtime/app/shared/config.py`
- Modify: `services/ai-runtime/tests/shared/test_config.py`
- Modify: `CHANGELOG.md`

**Step 1: Write failing transport and configuration tests**

Using `httpx.MockTransport`, assert `/api/v1/models` verifies all eight exact
IDs are present, prompt/completion price strings equal zero, and
`supported_parameters` contains `response_format`. Assert catalog failure
occurs before `/api/v1/chat/completions`. Assert chat requests are non-streaming,
use one fixed model, `response_format.type=json_schema`, `strict=true`, recursive
`additionalProperties=false`, `provider.require_parameters=true`, configured
`max_tokens`, and no secret in exceptions.

Cover timeout, 401/403, 408, 429, 5xx, unsupported parameters, oversized body,
malformed JSON, model mismatch, negative/non-integer usage, empty choices, and
safe retryability codes. Assert `OPENROUTER_API_KEY` is required only when model
execution is enabled and production requires the canonical HTTPS base URL.

**Step 2: Run RED**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/infrastructure/test_openrouter.py \
  tests/shared/test_config.py -q
```

Expected: FAIL because OpenRouter settings and adapter do not exist.

**Step 3: Implement the adapter and bounded catalog verifier**

Add `OpenRouterSettings` with base URL, API key, public attribution URL,
execution flag, response limit, and catalog-cache TTL. Keep the key excluded
from dataclass representation. Implement catalog preflight and chat generation
through injected `httpx.AsyncClient`; map all failures to stable codes and
retain no provider body in exceptions or logs.

**Step 4: Run GREEN and secret audit**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/infrastructure/test_openrouter.py \
  tests/shared/test_config.py -q
cd ../..
pnpm audit:secrets
```

Expected: PASS and no key fixture is committed.

**Step 5: Commit**

```bash
git add services/ai-runtime/app/agentic/infrastructure/openrouter.py \
  services/ai-runtime/tests/agentic/infrastructure/test_openrouter.py \
  services/ai-runtime/app/shared/config.py services/ai-runtime/tests/shared/test_config.py \
  CHANGELOG.md
git commit -m "feat(agentic): add fail-closed openrouter gateway"
```

### Task 5: Persist Governed Model Runs and Pricing

**Files:**
- Create: `apps/api/src/modules/agentic/domain/entities/model-run.ts`
- Create: `apps/api/src/modules/agentic/domain/services/model-run-rules.ts`
- Create: `apps/api/src/modules/agentic/domain/services/model-run-rules.test.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608190022_create_agent_model_runs.ts`
- Modify: `apps/api/src/modules/agentic/domain/entities/governance-records.ts`
- Modify: `apps/api/src/modules/agentic/domain/services/agent-governance-rules.ts`
- Modify: `apps/api/src/modules/agentic/domain/services/agent-governance-rules.test.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing domain, migration, and repository tests**

Add model pricing fields `inputCostMicrosPerMillion` and
`outputCostMicrosPerMillion` to configuration validation. Test exact integer
ceiling reservation calculation, zero-cost free models, safe-integer overflow,
lifecycle transitions, optimistic versioning, unique idempotency, generation
round 0-2, fallback position 0-1, digest constraints, immutable terminal
evidence, and rollback/reapply.

**Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/domain/services/model-run-rules.test.ts \
  src/modules/agentic/domain/services/agent-governance-rules.test.ts
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts \
  src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts
```

Expected: unit FAIL for missing contracts; integration FAIL for missing tables/columns.

**Step 3: Implement migration and repository lifecycle**

Add required non-negative integer pricing columns to model configs; add
`agentic_model_runs` and append-only `agentic_model_quality_evidence`; add an
optional `model_run_id` FK to `agentic_budget_entries` with one reservation and
one settlement per run. Store digests and bounded metadata only. Extend the
repository with reserve/find/transition/append-evidence operations inside the
caller's transaction.

**Step 4: Run GREEN**

Run the two commands from Step 2 again. Expected: PASS with clean rollback and
reapply.

**Step 5: Commit**

```bash
git add apps/api/src/modules/agentic CHANGELOG.md
git commit -m "feat(agentic): persist governed model runs"
```

### Task 6: Expose Atomic Internal Model-Run Control

**Files:**
- Create: `apps/api/src/modules/agentic/application/services/interfaces/model-run.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/model-run.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/model-run.service.test.ts`
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic-workload.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic-workload.routes.ts`
- Modify: `apps/api/src/modules/agentic/agentic.module.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.test.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing service and HTTP tests**

Cover authenticated reserve, start, complete, partial, escalate, and fail
requests. Reserve must load the task's pinned revision, require a matching
Agent assignment, active model configuration, no model/Agent revocation,
`ALLOW` for `resource=model`, `action=execute`, `purpose=department_analysis`,
`dataClassification=internal`, and an exact approved primary/fallback pair.
Assert API-owned maximum-cost calculation and model-run plus budget reservation
occur in one transaction.

Cover duplicate replay, payload conflict, stale version, wrong returned model,
budget exhaustion, correction round >2, unsupported AI CEO delegation fields,
settlement greater than reservation, zero-cost settlement, mandatory audit,
Quality Gate evidence, provenance links, and no body leakage in errors.

**Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/model-run.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
```

Expected: FAIL because the model-run service and routes do not exist.

**Step 3: Implement application authority and strict DTOs**

Add internal endpoints:

```text
POST /v1/internal/agentic/model-runs/reserve
POST /v1/internal/agentic/model-runs/:runId/start
POST /v1/internal/agentic/model-runs/:runId/complete
POST /v1/internal/agentic/model-runs/:runId/fail
```

Reserve returns only run ID, exact primary/fallback IDs, token/timeout bounds,
schema version, and pricing snapshot. Completion accepts digests, safe usage,
safe Quality Gate codes, and provenance IDs, never prompt/response bodies.
Perform reservation/settlement, model state, audit, and provenance writes in a
single PostgreSQL transaction.

**Step 4: Run GREEN and API integration**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/model-run.service.test.ts \
  src/modules/agentic/tests/agentic.api.test.ts
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/agentic/tests/agentic.api.integration.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/modules/agentic CHANGELOG.md
git commit -m "feat(agentic): authorize internal model runs"
```

### Task 7: Execute Models Through API-Owned Authority

**Files:**
- Create: `services/ai-runtime/app/agentic/application/model_executor.py`
- Create: `services/ai-runtime/tests/agentic/application/test_model_executor.py`
- Modify: `services/ai-runtime/app/agentic/application/ports.py`
- Modify: `services/ai-runtime/app/agentic/infrastructure/agentic_control_client.py`
- Modify: `services/ai-runtime/tests/agentic/infrastructure/test_agentic_control_client.py`
- Modify: `CHANGELOG.md`

**Step 1: Write failing executor and control-client tests**

Use fakes for the control port and gateway. Assert classification filtering
precedes reservation and provider preflight; reservation precedes generation;
primary is attempted once; only retryable transport/provider failures use the
shared fallback once; policy/schema/leakage/budget failures never fall back;
and each correction round has a distinct idempotency key and reservation.

Assert at most two corrections, `partial` for missing evidence after exhaustion,
`escalate` for leakage/scope/conflict, completion/failure settlement on every
reserved path, restart-safe duplicate replay, digest-only callbacks, and no
cross-Agent calls from AI CEO.

**Step 2: Run RED**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/application/test_model_executor.py \
  tests/agentic/infrastructure/test_agentic_control_client.py -q
```

Expected: FAIL because executor/control methods do not exist.

**Step 3: Implement `AgentExecutor` and control methods**

Compose context boundary, prompt builder, strict parser, gateway, Quality Gate,
and API callbacks. Keep retry and correction loops in application code. Hash
canonical bounded inputs/results locally and send only digests plus safe
metadata to the API.

**Step 4: Run GREEN and full Python suite**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/application/test_model_executor.py \
  tests/agentic/infrastructure/test_agentic_control_client.py -q
python3 -m pytest -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add services/ai-runtime/app/agentic/application \
  services/ai-runtime/app/agentic/infrastructure/agentic_control_client.py \
  services/ai-runtime/tests/agentic/application/test_model_executor.py \
  services/ai-runtime/tests/agentic/infrastructure/test_agentic_control_client.py \
  CHANGELOG.md
git commit -m "feat(agentic): execute governed model analysis"
```

### Task 8: Compose the Runtime Without Phase F Coordination

**Files:**
- Create: `services/ai-runtime/app/agentic/activities/model_execution_activities.py`
- Create: `services/ai-runtime/tests/agentic/activities/test_model_execution_activities.py`
- Modify: `services/ai-runtime/app/agentic/worker.py`
- Modify: `services/ai-runtime/tests/agentic/test_worker.py`
- Modify: `services/ai-runtime/app/agentic/observability.py`
- Modify: `services/ai-runtime/tests/agentic/test_observability.py`
- Modify: `CHANGELOG.md`

**Step 1: Write failing activity, composition, and observability tests**

Assert one `execute_model_analysis_v1` activity delegates one authorized Agent
input to `AgentExecutor`, returns a bounded safe result, and exposes no task
decomposition or Agent routing. Assert worker composition shares HTTP
resources safely, closes them once, registers the new activity without changing
`StoreHealthReviewWorkflowV1`, and logs only bounded Agent/model/status/token/
cost/latency fields.

**Step 2: Run RED**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/activities/test_model_execution_activities.py \
  tests/agentic/test_worker.py tests/agentic/test_observability.py -q
```

Expected: FAIL because the activity is absent.

**Step 3: Wire the composition root**

Construct the OpenRouter gateway and `AgentExecutor` only when execution is
enabled, register the activity alongside existing fake V1 activities, and
leave the published workflow and replay histories byte-for-byte unchanged.

**Step 4: Run GREEN and replay regression**

```bash
cd services/ai-runtime
python3 -m pytest tests/agentic/activities/test_model_execution_activities.py \
  tests/agentic/test_worker.py tests/agentic/test_observability.py \
  tests/agentic/workflows/test_store_health_replay.py -q
```

Expected: PASS with all stored histories replaying.

**Step 5: Commit**

```bash
git add services/ai-runtime/app/agentic services/ai-runtime/tests/agentic CHANGELOG.md
git commit -m "feat(agentic): compose model execution activity"
```

### Task 9: Add Fake and Mandatory Live Acceptance Gates

**Files:**
- Create: `scripts/dev/agentic-model-runtime-check.mjs`
- Create: `scripts/dev/agentic-model-runtime-check.test.mjs`
- Create: `scripts/dev/openrouter-live-acceptance.py`
- Create: `scripts/dev/openrouter-live-acceptance.test.mjs`
- Create: `scripts/dev/agentic-phase-d-exit-check.mjs`
- Create: `scripts/dev/agentic-phase-d-exit-check.test.mjs`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: `scripts/dev/check.sh`
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `scripts/dev/agentic-phase-c-exit-check.mjs`
- Modify: `scripts/dev/agentic-phase-c-exit-check.test.mjs`
- Modify: `scripts/dev/agentic-phase-b-exit-check.mjs`
- Modify: `scripts/dev/agentic-phase-b-exit-check.test.mjs`
- Modify: `CHANGELOG.md`

**Step 1: Write failing static, fake-provider, and live-runner tests**

The fake gate must execute all seven schemas with explicit configured primary
assignments, shared fallback, non-zero fake pricing, concurrent budget contention,
idempotent restart, timeout/429/5xx/malformed-response paths, prompt injection,
correction exhaustion, partial, escalation, and evidence leakage scans.

The live-runner unit tests must prove it exits non-zero when
`OPENROUTER_API_KEY` is absent, never prints the key, never writes prompt or
response bodies, checks all eight live catalog records, sends synthetic
`internal` context only, executes all seven Agents, and writes evidence only to
an ignored temporary directory. Update Phase B/C static gates so they preserve
their historical boundaries without rejecting the now-approved Phase D files.

**Step 2: Run RED**

```bash
node --test scripts/dev/agentic-model-runtime-check.test.mjs \
  scripts/dev/openrouter-live-acceptance.test.mjs \
  scripts/dev/agentic-phase-d-exit-check.test.mjs \
  scripts/dev/agentic-phase-c-exit-check.test.mjs \
  scripts/dev/agentic-phase-b-exit-check.test.mjs
```

Expected: FAIL for missing Phase D scripts and outdated Phase B/C assertions.

**Step 3: Implement commands and environment wiring**

Add scripts:

```json
{
  "test:agentic-model-runtime": "node --test scripts/dev/agentic-model-runtime-check.test.mjs",
  "check:agentic-model-runtime": "pnpm test:agentic-model-runtime && node scripts/dev/agentic-model-runtime-check.mjs",
  "test:openrouter-live": "node --test scripts/dev/openrouter-live-acceptance.test.mjs",
  "check:openrouter-live": "pnpm test:openrouter-live && python3 scripts/dev/openrouter-live-acceptance.py",
  "test:agentic-phase-d-exit": "node --test scripts/dev/agentic-phase-d-exit-check.test.mjs",
  "check:agentic-phase-d-exit": "pnpm test:agentic-phase-d-exit && node scripts/dev/agentic-phase-d-exit-check.mjs"
}
```

Add `make check-agentic-model-runtime` and `make check-openrouter-live`.
Pass `OPENROUTER_API_KEY` only to AI Runtime and worker containers; production
Compose requires it when execution is enabled. Never provide a default value.

**Step 4: Run GREEN without the real credential**

```bash
pnpm test:agentic-model-runtime
pnpm check:agentic-model-runtime
pnpm test:openrouter-live
pnpm test:agentic-phase-d-exit
pnpm audit:env
pnpm audit:secrets
docker compose -f infra/docker/docker-compose.yml config >/dev/null
```

Expected: deterministic tests PASS. Do not claim Phase D complete yet because
the credential-owned live command has not run.

**Step 5: Commit**

```bash
git add scripts/dev package.json Makefile .env.example infra/docker/docker-compose.yml \
  infra/deploy/compose.production.yml CHANGELOG.md
git commit -m "test(agentic): add model runtime acceptance gates"
```

### Task 10: Document Runtime Operations and Phase Boundaries

**Files:**
- Modify: `docs/api/agentic.md`
- Modify: `docs/architecture/agentic-workflow-runtime.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `docs/superpowers/plans/2026-08-14-post-commerce-agentic-workforce.md`
- Modify: `CHANGELOG.md`

**Step 1: Write failing static documentation assertions**

Extend `scripts/dev/agentic-phase-d-exit-check.test.mjs` to require exact
internal endpoints, model map, no-new-dependency statement, environment setup,
fake/live commands, secret handling, budget authority, Quality Gate outcomes,
AI CEO non-delegation, Phase E/F not started, and mandatory live acceptance.

**Step 2: Run RED**

```bash
pnpm test:agentic-phase-d-exit
```

Expected: FAIL until documentation is current.

**Step 3: Update documentation truthfully**

Document configuration, local Compose, production secret injection, API DTOs,
model-run lifecycle, retry/correction distinction, live acceptance evidence,
and recovery implications. Change the master Phase D exit gate from “optional”
to mandatory to match the approved focused design. Mark implementation complete
only after Task 11 succeeds; until then roadmap status remains “in progress”.

**Step 4: Run GREEN and repository audit**

```bash
pnpm check:agentic-phase-d-exit
git diff --check
pnpm audit:repo
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs scripts/dev/agentic-phase-d-exit-check.mjs \
  scripts/dev/agentic-phase-d-exit-check.test.mjs CHANGELOG.md
git commit -m "docs(agentic): document openrouter runtime operations"
```

### Task 11: Run Real Acceptance, Full Validation, and Closure Review

**Files:**
- Modify after all gates pass: `docs/roadmap/mvp-status.md`
- Modify after all gates pass: `docs/superpowers/plans/2026-08-14-post-commerce-agentic-workforce.md`
- Modify after all gates pass: `CHANGELOG.md`

**Step 1: Ask the operator to configure the ignored secret**

Do not request the value in chat. Ask the user to place this line in the
ignored root `.env`:

```dotenv
OPENROUTER_API_KEY=<operator-owned-key>
```

Verify presence without printing it:

```bash
test -n "$(sed -n 's/^OPENROUTER_API_KEY=//p' .env | tail -n 1)"
```

**Step 2: Run mandatory live acceptance**

```bash
set -a
. ./.env
set +a
pnpm check:openrouter-live
```

Expected: all seven unique catalog entries remain present/free/structured-output
capable and all seven synthetic Agent requests pass schema and Quality Gate.
No key, prompt, response, PII, or provider payload appears in stdout or temp
evidence.

**Step 3: Run focused integration and infrastructure gates**

```bash
pnpm check:agentic-model-runtime
pnpm check:agentic-phase-d-exit
pnpm check:agentic-production-compose
pnpm check:production-compose
pnpm check:agentic-workflow
pnpm check:agentic-workflow-recovery
pnpm check:agentic-department-tools
pnpm check:backup-restore
```

Expected: PASS without modifying existing backup archives.

**Step 4: Run the full source gate**

```bash
PATH=/tmp/opendx-python313-phase-c/bin:$PATH pnpm check
git diff --check
pnpm audit:repo
git status --short
```

Expected: every test/build/audit passes and only intended Phase D files differ.

**Step 5: Request independent review**

Use `requesting-code-review` against the Phase D base. Resolve every Critical
and Important finding with focused RED/GREEN evidence, then rerun Steps 2-4.

**Step 6: Record closure only from fresh committed-tree evidence**

Mark Phase D complete in the roadmap and master checklist, record validation
counts and the independent review result, and keep Phases E-H explicitly not
started.

**Step 7: Commit closure**

```bash
git add docs/roadmap/mvp-status.md \
  docs/superpowers/plans/2026-08-14-post-commerce-agentic-workforce.md CHANGELOG.md
git commit -m "docs(agentic): close openrouter runtime phase"
```

## Completion Checklist

- [ ] Seven approved Agent assignments and one fixed free fallback are enforced.
- [ ] Live catalog preflight fails closed before company context egress.
- [ ] Only aggregate/redacted `internal` context can reach OpenRouter.
- [ ] Strict common envelope and all seven payload schemas pass.
- [ ] API owns model allow-list, pricing, budget, lifecycle, audit, and provenance.
- [ ] Primary/fallback attempts and two correction rounds are independently bounded.
- [ ] Missing evidence becomes partial; leakage/scope/conflict escalates.
- [ ] AI CEO cannot delegate or coordinate before Phase F.
- [ ] Fake-provider and mandatory live OpenRouter gates pass without leakage.
- [ ] PostgreSQL migration, rollback, concurrency, restart, and settlement pass.
- [ ] Existing Temporal V1 replay histories remain unchanged and pass.
- [ ] Production Compose, recovery, full `pnpm check`, and repository audit pass.
- [ ] Independent review has no unresolved Critical or Important findings.
