# Single-Agent Live Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only command that performs one governed Catalog OpenRouter execution with an explicit cost confirmation.

**Architecture:** A Node wrapper owns local operator checks and active-configuration discovery. It starts a one-shot Python command in the AI worker image; that command constructs the existing `ModelExecutor`, so reservation, start, settlement, Quality Gate, audit, and provenance remain owned by the API and current internal ports. No HTTP route is added.

**Tech Stack:** Node.js, Python 3.13, Docker Compose, existing Keycloak/internal API, Vitest and pytest.

---

## File Structure

- Create `scripts/dev/catalog-live-acceptance.mjs` — local confirmation, safe aggregate output, container command orchestration.
- Create `scripts/dev/catalog-live-acceptance.test.mjs` — static contract and redaction checks.
- Create `services/ai-runtime/app/agentic/cli/catalog_live_acceptance.py` — one-shot, governed ModelExecutor command.
- Create `services/ai-runtime/tests/agentic/cli/test_catalog_live_acceptance.py` — command construction/confirmation tests with fakes.
- Modify `services/ai-runtime/app/agentic/worker.py` — extract the existing ModelExecutor composition into a reusable factory.
- Modify `README.md`, `docs/build-from-source.md`, and `CHANGELOG.md` — document the opt-in command and its cost boundary.

### Task 1: Extract reusable governed executor composition

**Files:**
- Modify `services/ai-runtime/app/agentic/worker.py`
- Test `services/ai-runtime/tests/agentic/test_worker.py`

- [ ] Write a failing test that imports `build_model_executor(settings, control, client)` and verifies it returns `None` when execution is disabled and a `ModelExecutor` only with enabled settings.
- [ ] Run `pytest services/ai-runtime/tests/agentic/test_worker.py -q`; expect the import to fail.
- [ ] Extract the block currently creating `OpenRouterModelGateway` and `ModelExecutor` into `build_model_executor`, preserving `QualityGate`, `enforce_context_boundary`, and `build_model_prompt`; call it from `run_worker`.
- [ ] Re-run the test and `pnpm test:py`; expect pass.
- [ ] Commit: `refactor(agentic): share governed model executor composition`.

### Task 2: Add one-shot Python acceptance command

**Files:**
- Create `services/ai-runtime/app/agentic/cli/catalog_live_acceptance.py`
- Create `services/ai-runtime/tests/agentic/cli/test_catalog_live_acceptance.py`

- [ ] Write failing tests for `run_catalog_acceptance(command, executor)`: it rejects non-`catalog`, disabled execution, absent confirmation, and returns only `runId`, `status`, token counts, and cost for a successful fake executor.
- [ ] Run `pytest services/ai-runtime/tests/agentic/cli/test_catalog_live_acceptance.py -q`; expect module-not-found.
- [ ] Implement a typed command loader that reads one JSON command from stdin, requires `agentKind == "catalog"`, a UUID task/revision, a 64-character idempotency digest, explicit `OPENROUTER_LIVE_ACCEPTANCE_CONFIRM=run-one-catalog`, and builds `ModelExecutionCommand` with fixed synthetic `internal` context and the existing result schema. Print only aggregate JSON; never print provider content, prompt, or environment values.
- [ ] Compose the existing internal `AgenticControlClient`, Keycloak client-credentials provider, HTTP client, and `build_model_executor`; reject disabled execution before any provider call.
- [ ] Re-run focused Python test and the runtime checks; expect pass.
- [ ] Commit: `feat(agentic): add governed catalog live acceptance command`.

### Task 3: Add local wrapper and static safety gate

**Files:**
- Create `scripts/dev/catalog-live-acceptance.mjs`
- Create `scripts/dev/catalog-live-acceptance.test.mjs`
- Modify `package.json`

- [ ] Write a failing Node test that asserts the wrapper requires `OPENROUTER_LIVE_ACCEPTANCE_CONFIRM=run-one-catalog`, reads only the active Catalog configuration, invokes the AI worker one-shot command once, and does not contain an API key, prompt, or `chat/completions` call.
- [ ] Run `node --test scripts/dev/catalog-live-acceptance.test.mjs`; expect failure because the wrapper does not exist.
- [ ] Implement the wrapper to query the active configuration through the local Compose PostgreSQL service, select exactly the Catalog model/budget record, create a disposable ready Catalog task through the authenticated API, pass only task ID/revision/model/fallback/token bounds to `docker compose exec ai-worker python -m ...`, and emit aggregate outcome. It must fail before task creation unless confirmation, enabled execution, and credentials are present.
- [ ] Add `test:catalog-live-acceptance` and `run:catalog-live-acceptance` package scripts; normal `check` includes only the static test.
- [ ] Re-run Node test and `pnpm check:fast`; expect pass.
- [ ] Commit: `feat(agentic): add local catalog live acceptance wrapper`.

### Task 4: Document, verify, and perform one opted-in local call

**Files:**
- Modify `README.md`
- Modify `docs/build-from-source.md`
- Modify `CHANGELOG.md`

- [ ] Document the exact confirmation command, $0.10 task cap, no-production-endpoint guarantee, safe output, and how to disable execution after use.
- [ ] Run `git diff --check`, `pnpm audit:repo`, focused Node/Python suites, API integration, and `pnpm check:fast`.
- [ ] With the user-owned key and explicit confirmation, run exactly one `catalog-live-acceptance`; assert one new completed model-run, settled cost at or below $0.10, and matching audit/provenance records. Recreate API/runtime/worker with execution disabled afterward.
- [ ] Commit: `docs(agentic): document catalog live acceptance`.
