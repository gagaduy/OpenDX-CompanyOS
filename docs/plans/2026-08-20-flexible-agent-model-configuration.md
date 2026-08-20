# Flexible Agent Model Configuration Implementation Plan

**Goal:** Let governance-approved configuration revisions choose each Agent's OpenRouter primary and fallback models, including paid models only after human approval.

**Architecture:** Reuse the existing API-owned configuration revision, model configuration, budget, approval, audit, and provenance records. The API returns the pinned configured model pair in reservation receipts; AI Runtime preflights that pair against OpenRouter's current catalog without a hard-coded model map. A paid configuration is submitted and activated through the existing Governance Admin decision flow, never through environment variables.

**Tech Stack:** TypeScript, Express, PostgreSQL, Python 3.13, FastAPI, Temporal, httpx, Vitest, Pytest.

---

### Task 1: Remove fixed API model-pair enforcement

**Files:**
- Modify: `apps/api/src/modules/agentic/application/services/implementations/model-run.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/model-run.service.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing tests**

```ts
it("accepts a distinct configured model pair without a source-code allow-list", async () => {
  const service = serviceWith({ primaryModel: "provider/paid-model", fallbackModel: "provider/free-model" });
  await expect(service.reserve(request())).resolves.toMatchObject({ primaryModel: "provider/paid-model" });
});
```

**Step 2: Run RED**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/model-run.service.test.ts`

**Step 3: Implement minimal validation**

Validate only the active revision's model pair, limits, pricing, revocations, and policy; remove `approvedPrimaryModels` and `approvedFallbackModel` comparisons.

**Step 4: Run GREEN and commit**

```bash
git add apps/api/src/modules/agentic/application/services/implementations/model-run.service.ts apps/api/src/modules/agentic/application/services/implementations/model-run.service.test.ts CHANGELOG.md
git commit -m "feat(agentic): authorize configured model pairs"
```

### Task 2: Make Runtime preflight revision-driven

**Files:**
- Modify: `services/ai-runtime/app/agentic/infrastructure/openrouter.py`
- Modify: `services/ai-runtime/tests/agentic/infrastructure/test_openrouter.py`
- Modify: `scripts/dev/agentic-model-runtime-check.mjs`
- Modify: `scripts/dev/openrouter-live-acceptance.py`

**Step 1: Write failing tests**

```python
async def test_preflight_accepts_catalog_model_from_authorized_request() -> None:
    await gateway.preflight(request(model="provider/paid-model", fallback_position=0))
```

**Step 2: Run RED**

Run: `docker run --rm -v "$PWD/services/ai-runtime:/workspace/services/ai-runtime" -w /workspace/services/ai-runtime opendx-agentic-model-runtime-check python -m pytest tests/agentic/infrastructure/test_openrouter.py -q`

**Step 3: Implement minimal behavior**

Remove static Agent-to-model authorization from the gateway. Require a non-empty configured model, catalog presence, non-negative declared pricing, and `response_format`; retain strict request/response schemas, size bounds, redaction, and secret-safe errors.

**Step 4: Run GREEN and commit**

```bash
git add services/ai-runtime scripts/dev/agentic-model-runtime-check.mjs scripts/dev/openrouter-live-acceptance.py CHANGELOG.md
git commit -m "feat(agentic): preflight configured openrouter models"
```

### Task 3: Prove paid model governance

**Files:**
- Modify: `apps/api/src/modules/agentic/application/services/implementations/configuration.service.test.ts`
- Modify: `docs/api/agentic.md`
- Modify: `docs/architecture/agentic-workflow-runtime.md`
- Modify: `CHANGELOG.md`

**Step 1: Write failing tests**

```ts
it("requires a different Governance Admin to activate priced models", async () => {
  await expect(service.decide(paidRevisionDecision, creator)).rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
});
```

**Step 2: Run RED**

Run: `pnpm --filter @opendx/api exec vitest run src/modules/agentic/application/services/implementations/configuration.service.test.ts`

**Step 3: Implement minimal behavior**

Treat a revision as paid when either configured input/output pricing is greater than zero. Preserve the existing human decision gate for every submitted revision: only a different Governance Admin can activate the exact immutable, digest-bound payload. Do not add a nested approval request that duplicates the revision decision.

**Step 4: Run GREEN and commit**

```bash
git add apps/api/src/modules/agentic docs CHANGELOG.md
git commit -m "test(agentic): prove paid model governance"
```

### Task 4: Validate complete configuration flow

**Files:**
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `services/ai-runtime/tests/agentic/application/test_model_executor.py`

**Step 1: Add integration coverage**

Test free revision activation, paid activation denial without approval, approved paid activation, pinned old-task execution, and configured fallback receipt.

**Step 2: Run focused checks**

```bash
pnpm --filter @opendx/api exec vitest run src/modules/agentic/tests/agentic.api.integration.test.ts
pnpm check:agentic-model-runtime
pnpm check:agentic-phase-d-exit
git diff --check
pnpm audit:repo
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts services/ai-runtime/tests/agentic/application/test_model_executor.py CHANGELOG.md
git commit -m "test(agentic): cover governed model revisions"
```
