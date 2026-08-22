<!-- SPDX-License-Identifier: Apache-2.0 -->

# AI CEO Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver governed, durable AI CEO orchestration for direct Store Health Review tasks, from immutable Task Brief through an honest provenance-backed executive report.

**Architecture:** The Agentic API persists immutable task-brief, plan, collaboration, and report contracts under PostgreSQL transaction/audit control. The Python runtime uses structured AI CEO activities and existing model/Quality Gate ports; Temporal owns dependency execution and recovery. Policy and Tool Registry are re-evaluated at every execution boundary.

**Tech Stack:** TypeScript, Express, PostgreSQL, Python 3.13, Temporal, Pydantic, existing OpenRouter gateway, Vitest, pytest.

---

## File structure

- Create API domain entities and rules under `apps/api/src/modules/agentic/domain/{entities,services}/ai-ceo-*`.
- Create API application orchestration/query ports and implementations under `apps/api/src/modules/agentic/application/services/`.
- Extend the Agentic repository interface, PostgreSQL repository, migrations, module composition, and internal authenticated routes only as contracts require.
- Create Python planning/synthesis contracts, ports, activities, and workflow tests under `services/ai-runtime/app/agentic/`.
- Extend `store_health_review_v1.py`; do not create a generic workflow engine.

### Task 1: Immutable Task Brief and plan-DAG domain rules

**Files:**
- Create: `apps/api/src/modules/agentic/domain/entities/ai-ceo-orchestration.ts`
- Create: `apps/api/src/modules/agentic/domain/services/ai-ceo-orchestration-rules.ts`
- Test: `apps/api/src/modules/agentic/domain/services/ai-ceo-orchestration-rules.test.ts`

- [ ] **Step 1: Write failing domain tests**

```ts
it("rejects a cyclic or policy-ineligible assignment before dispatch", () => {
  expect(() => validatePlan(cyclicPlan, eligibleAssignments)).toThrow("INVALID_PLAN");
  expect(() => validatePlan(ineligiblePlan, eligibleAssignments)).toThrow("POLICY_DENIED");
});
```

- [ ] **Step 2: Run the focused test**

Run: `pnpm --filter @opendx/api test -- ai-ceo-orchestration-rules`

Expected: FAIL because contracts do not exist.

- [ ] **Step 3: Implement immutable contracts and pure rules**

```ts
export interface OrchestrationPlan { readonly taskId: string; readonly version: number; readonly digest: string; readonly subtasks: readonly PlannedSubtask[]; }
export function validatePlan(plan: OrchestrationPlan, eligible: ReadonlyMap<string, EligibleAssignment>): void { /* reject cycles, unknown scope, duplicate owner, timeout/budget violations */ }
```

- [ ] **Step 4: Re-run focused test**

Run: `pnpm --filter @opendx/api test -- ai-ceo-orchestration-rules`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agentic/domain
git commit -m "feat(agentic): define orchestration plan rules"
```

### Task 2: PostgreSQL plan, collaboration, and report persistence

**Files:**
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608220005_create_ai_ceo_orchestration.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Test: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`

- [ ] **Step 1: Write failing migration/repository tests**

```ts
it("persists one immutable plan revision and rejects duplicate collaboration delivery", async () => {
  await repository.appendPlan(session, plan);
  await expect(repository.appendPlan(session, plan)).rejects.toThrow();
});
```

- [ ] **Step 2: Run integration test**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @opendx/api test:integration -- postgresql-agentic.repository.integration.test.ts`

Expected: FAIL because tables and repository methods do not exist.

- [ ] **Step 3: Add migration and repository methods**

Persist digests and typed metadata only for task briefs, plan revisions,
subtasks/dependencies, collaboration requests, accepted results, and executive
reports. Add unique idempotency constraints and append audit/provenance inside
the same transaction; never persist prompt/response bodies.

- [ ] **Step 4: Re-run integration test**

Run: `TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @opendx/api test:integration -- postgresql-agentic.repository.integration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agentic
git commit -m "feat(agentic): persist ai ceo orchestration"
```

### Task 3: API orchestration service and authenticated internal contracts

**Files:**
- Create: `apps/api/src/modules/agentic/application/services/interfaces/orchestration.service.ts`
- Create: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic-workflow.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic-workload.routes.ts`
- Test: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.test.ts`

- [ ] **Step 1: Write failing service tests**

```ts
it("re-evaluates policy before plan persistence and dispatch", async () => {
  await expect(service.acceptPlan(input, principal)).rejects.toMatchObject({ code: "POLICY_DENIED" });
  expect(repository.appendPlan).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused test**

Run: `pnpm --filter @opendx/api test -- orchestration.service`

Expected: FAIL because service is absent.

- [ ] **Step 3: Implement service and internal DTO validation**

The service constructs Task Briefs from trusted task state, accepts only schema-
validated plan/result/collaboration commands from the authenticated runtime,
re-evaluates policy, writes audit/provenance, and returns purpose-specific DTOs.
Do not expose a public Agent-to-Agent endpoint.

- [ ] **Step 4: Re-run focused test**

Run: `pnpm --filter @opendx/api test -- orchestration.service agentic-workflow`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agentic
git commit -m "feat(agentic): govern orchestration commands"
```

### Task 4: Structured Python planning and synthesis contracts

**Files:**
- Create: `services/ai-runtime/app/agentic/domain/orchestration_schemas.py`
- Create: `services/ai-runtime/app/agentic/application/orchestration.py`
- Test: `services/ai-runtime/tests/test_orchestration.py`

- [ ] **Step 1: Write failing Python tests**

```python
def test_planner_rejects_unapproved_assignment_and_synthesizer_discloses_missing_branch() -> None:
    assert planner.validate(ineligible_plan).code == "POLICY_DENIED"
    assert "unavailable" in synthesizer.report(partial_results).disclosure.lower()
```

- [ ] **Step 2: Run test**

Run: `pnpm test:py -- tests/test_orchestration.py`

Expected: FAIL because orchestration contracts are absent.

- [ ] **Step 3: Implement typed planner/synthesizer ports**

Use Pydantic schemas with `extra="forbid"`; label untrusted content; accept
only policy-eligible assignment candidates and Quality-Gate-accepted results.
Executive conclusions require provenance IDs; unavailable/failed work becomes
explicit partial disclosure.

- [ ] **Step 4: Re-run test**

Run: `pnpm test:py -- tests/test_orchestration.py`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/ai-runtime
git commit -m "feat(ai-runtime): add structured orchestration contracts"
```

### Task 5: Temporal dependency dispatch and mediated collaboration

**Files:**
- Modify: `services/ai-runtime/app/agentic/workflows/store_health_review_v1.py`
- Modify: `services/ai-runtime/app/agentic/activities/store_health_activities.py`
- Create: `services/ai-runtime/tests/test_store_health_orchestration.py`

- [ ] **Step 1: Write failing workflow tests**

```python
async def test_independent_branches_fan_out_while_collaboration_is_mediated() -> None:
    result = await run_workflow(plan_with_two_roots_and_one_dependency)
    assert result.state == "completed"
    assert activity_calls.direct_agent_message_count == 0
```

- [ ] **Step 2: Run test**

Run: `pnpm test:py -- tests/test_store_health_orchestration.py`

Expected: FAIL because workflow has no orchestration activities.

- [ ] **Step 3: Implement deterministic workflow activities**

Use existing retry policies and stable idempotency keys. Dispatch only ready DAG
nodes; persist CollaborationRequest before forwarding redacted context; allow
other ready branches during approval waits. Keep plan revisions immutable and
do not change existing workflow behavior in place without a versioned path.

- [ ] **Step 4: Re-run workflow test**

Run: `pnpm test:py -- tests/test_store_health_orchestration.py`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/ai-runtime
git commit -m "feat(ai-runtime): orchestrate governed department plans"
```

### Task 6: Quality, recovery, and Phase F Slice 1 acceptance

**Files:**
- Create: `scripts/dev/agentic-phase-f-orchestration-check.mjs`
- Create: `scripts/dev/agentic-phase-f-orchestration-check.test.mjs`
- Modify: `package.json`
- Modify: `docs/api/agentic.md`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing acceptance checks**

Assert a deterministic direct task produces a validated DAG, six scoped fake
Agent executions, no direct communication, a Quality-Gate-backed partial or
complete report, provenance, cancellation/recovery safety, and zero Commerce
mutation.

- [ ] **Step 2: Run acceptance test**

Run: `node --test scripts/dev/agentic-phase-f-orchestration-check.test.mjs`

Expected: FAIL because the gate does not exist.

- [ ] **Step 3: Implement gate and document operations**

Add `check:agentic-phase-f-orchestration`; document only authenticated internal
contracts and developer acceptance setup. Do not add UI, schedules, Company
Memory, GraphRAG, or a public runtime API.

- [ ] **Step 4: Run all validations**

Run: `pnpm check:agentic-phase-f-orchestration && pnpm check && git diff --check && pnpm audit:repo`

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add scripts package.json docs CHANGELOG.md
git commit -m "test(agentic): verify ai ceo orchestration"
```

## Plan self-review

Tasks 1–3 cover the API-owned immutable contracts, authorization, policy,
persistence, audit, and provenance. Tasks 4–5 cover structured model behavior,
Temporal dispatch, mediated collaboration, Quality Gate integration, and
recovery. Task 6 covers deterministic acceptance and documentation. The plan
does not implement schedules, durable Company Memory, GraphRAG, UI, customer
communication, or Commerce mutation.
