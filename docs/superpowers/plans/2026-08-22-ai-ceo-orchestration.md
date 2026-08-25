<!-- SPDX-License-Identifier: Apache-2.0 -->

# AI CEO Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver governed, durable AI CEO orchestration for direct Store Health Review tasks, using API-owned execution descriptors and six distinct Department identities to produce an honest provenance-backed executive report.

**Architecture:** The Agentic API owns immutable plans, execution descriptors, policy/model/tool/budget authority, collaboration, accepted results, audit, and provenance. The Python worker loads purpose-specific descriptor payloads with its control identity, invokes Tool Registry with the assigned Department identity, and uses the existing governed model/Quality Gate lifecycle. A named Temporal patch preserves every Phase B replay history while new runs dispatch dependency-ready descriptor references only.

**Tech Stack:** TypeScript, Express, Zod, PostgreSQL 18, Python 3.13, Pydantic 2, httpx, Temporal 1.30, Keycloak client credentials, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-08-22-ai-ceo-coordination-memory-design.md`

## Global Constraints

- Company remains the center; AI CEO is a governed orchestration role.
- API owns model, schema, tool, policy, budget, authority, result, report,
  audit, and provenance truth.
- Worker, AI CEO, and all six Department identities remain distinct.
- Raw authority/context/tool/model/report payloads and credentials never enter
  Temporal history or normal logs.
- Phase B histories replay unchanged behind the named patch.
- No schedule, Company Memory, GraphRAG, Console UI, public runtime command,
  Commerce mutation, or new third-party dependency is included.

---

## Completed foundation

The following approved units are already implemented and verified on
`feat/ai-ceo-coordination`; do not repeat them:

- `c3c74e8`: immutable orchestration plan domain rules.
- `62d2a1d`: append-only plan, collaboration, accepted-result, and report persistence.
- `7a4ed30`: AI CEO identity and assignment-policy enforcement.
- `e9255f0`: strict internal plan-intake endpoint.
- `c420b9a`: frozen Python planning and synthesis contracts.
- `59841cf`: approved descriptor and Department-identity design amendment.
- `4baa309`: append-only execution-descriptor persistence.
- `86ed939`: server-owned Store Health execution catalog.
- `5edad75`: governed descriptor preparation, reads, and settlements.
- `ee0068b`: distinct AI CEO and Department identities and safe transports.
- `bd9f5c6`: strict descriptor-bound runtime execution foundation.
- `de5ae91`: approved AI CEO model-authority and private-result amendment.

## Remaining file map

- `apps/api/src/modules/agentic/domain/entities/orchestration-execution-descriptor.ts`
  owns immutable descriptor and private execution-payload types and validation.
- `apps/api/src/modules/agentic/infrastructure/database/migrations/202608220006_create_orchestration_execution_descriptors.ts`
  owns append-only descriptor/payload storage; it stores no credentials.
- Existing Agentic repository files own transactional descriptor reads/writes
  and authoritative source lookups.
- Existing orchestration service, workload controller, validator, routes, and
  module composition own internal Task Brief/dispatch-plan reads, descriptor
  preparation/read, and result, collaboration, and report settlement. No
  public Agent route is added.
- `apps/api/src/modules/agentic/application/orchestration/store-health-execution-catalog.ts`
  owns the bounded server-side result schemas and Department tool sets used to
  resolve plan digests; the AI CEO cannot supply models or arbitrary tools.
- `apps/api/src/modules/agentic/domain/entities/ai-ceo-execution-authority.ts`
  owns purpose-specific planning/synthesis authority and payload validation.
- Migration `202608220007` owns append-only AI CEO authority and private
  accepted-result/report payload storage.
- `services/ai-runtime/app/agentic/domain/execution_descriptor.py` owns strict
  purpose-specific runtime DTOs.
- `services/ai-runtime/app/agentic/infrastructure/department_tools.py` owns the
  authenticated Tool Registry transport; it never owns authorization policy.
- Existing runtime config and Keycloak files own the typed AI CEO plus six
  Department identity map and token providers.
- `services/ai-runtime/app/agentic/application/department_execution.py` owns
  descriptor verification, bounded tools, model command assembly, accepted
  results, and mediated collaboration.
- `services/ai-runtime/app/agentic/activities/orchestration_activities.py` is
  the Temporal adapter for Department execution and synthesis.
- Existing `store_health_review_v1.py` owns the named patch and deterministic
  DAG scheduling; the original Phase B path remains intact.
- Phase F scripts and focused API/build docs own reproducible exit evidence.

### Task 5: Persist immutable execution descriptors and private payloads

**Files:**
- Create: `apps/api/src/modules/agentic/domain/entities/orchestration-execution-descriptor.ts`
- Create: `apps/api/src/modules/agentic/domain/entities/orchestration-execution-descriptor.test.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608220006_create_orchestration_execution_descriptors.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing domain and PostgreSQL tests**

Prove descriptor versions are append-only; the digest binds task, plan,
subtask, Agent, configuration, policy, expiry, and payload; exact replay
converges; conflicting replay fails; and UPDATE/DELETE is blocked.

```ts
it("rejects a descriptor replay with changed authority", async () => {
  await repository.appendExecutionDescriptor(session, descriptor);
  await expect(repository.appendExecutionDescriptor(session, {
    ...descriptor,
    primaryModel: "unapproved/model",
  })).rejects.toMatchObject({ code: "EXECUTION_DESCRIPTOR_CONFLICT" });
});
```

- [ ] **Step 2: Run tests and observe the missing contract**

```bash
pnpm --filter @opendx/api test -- orchestration-execution-descriptor
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test pnpm --filter @opendx/api test:integration -- postgresql-agentic.repository.integration.test.ts agentic-migration.integration.test.ts
```

Expected: FAIL because the entity, migration, and repository methods do not exist.

- [ ] **Step 3: Add the immutable domain contract and digest rule**

The private payload may contain only a minimized Task Brief, strict result
schema, authorized context references, and validated grants. Reject keys named
like tokens, passwords, or secrets.

```ts
export interface ExecutionDescriptor {
  readonly id: string; readonly version: number; readonly taskId: string;
  readonly planVersion: number; readonly subtaskId: string;
  readonly agentKind: DepartmentAgentKind; readonly configurationRevisionId: string;
  readonly policyVersion: number; readonly primaryModel: string;
  readonly fallbackModel: string; readonly resultSchemaName: string;
  readonly resultSchemaDigest: string; readonly authorizedContextDigest: string;
  readonly allowedToolsDigest: string; readonly budgetAuthorizationMicros: number;
  readonly timeoutSeconds: number; readonly freshnessSeconds: number;
  readonly expiresAt: string; readonly payloadDigest: string;
  readonly descriptorDigest: string; readonly createdAt: string;
}

export interface ExecutionDescriptorPayload {
  readonly taskBrief: Readonly<Record<string, unknown>>;
  readonly resultSchema: Readonly<Record<string, unknown>>;
  readonly authorizedContext: readonly Readonly<Record<string, unknown>>[];
  readonly toolGrants: readonly {
    readonly name: DepartmentToolName; readonly version: 1;
    readonly purpose: "store_health_review"; readonly dataScope: DepartmentToolScope;
    readonly dataClassification: ToolClassification; readonly maximumInvocations: number;
  }[];
}
```

- [ ] **Step 4: Add append-only tables and repository operations**

Create `agentic_orchestration_execution_descriptors` and
`agentic_orchestration_execution_payloads`, protected by
`agentic_prevent_mutation()`. Use `UNIQUE(task_id, plan_version, subtask_id,
version)` and `UNIQUE(descriptor_digest)`. Add exact append/replay, ID lookup,
and plan/task/provenance/configuration source reads required for preparation in
one transaction.

- [ ] **Step 5: Re-run focused tests**

Run both commands from Step 2. Expected: PASS, including migration up/down and
immutability assertions.

- [ ] **Step 6: Update changelog and commit**

```bash
git add apps/api/src/modules/agentic CHANGELOG.md
git commit -m "feat(agentic): persist execution descriptors"
```

### Task 6: Govern descriptor preparation, reads, and settlements

**Files:**
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/orchestration.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.test.ts`
- Create: `apps/api/src/modules/agentic/application/orchestration/store-health-execution-catalog.ts`
- Create: `apps/api/src/modules/agentic/application/orchestration/store-health-execution-catalog.test.ts`
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic-workload.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic-workload.routes.ts`
- Modify: `apps/api/src/modules/agentic/agentic.module.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.test.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing service and HTTP tests**

Cover trusted Task Brief construction, server-owned schema/tool resolution,
policy evaluation per tool/data scope,
revoked/stale/expired rejection, digest and cross-task binding, worker-only
reads, idempotent settlements, and `Cache-Control: no-store`.

```ts
it("stops before descriptor creation when one tool grant is denied", async () => {
  policy.evaluateInSession.mockResolvedValueOnce(allowAssignment).mockResolvedValueOnce(denyTool);
  await expect(service.acceptPlan(plan, aiCeo)).rejects.toMatchObject({ code: "POLICY_DENIED" });
  expect(repository.appendExecutionDescriptor).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests and observe failure**

```bash
pnpm --filter @opendx/api test -- orchestration.service agentic.api.test.ts
```

Expected: FAIL because descriptor preparation/read and settlement are absent.

- [ ] **Step 3: Extend the inward-facing service**

```ts
export interface OrchestrationService {
  acceptPlan(plan: OrchestrationPlanAppendInput, principal: WorkloadPrincipal): Promise<void>;
  loadTaskBrief(taskId: string, principal: WorkloadPrincipal): Promise<TaskBriefView>;
  loadDispatchPlan(runId: string, principal: WorkloadPrincipal): Promise<OrchestrationDispatchPlanView>;
  loadExecutionDescriptor(id: string, digest: string, principal: WorkloadPrincipal): Promise<ExecutionDescriptorView>;
  acceptResult(input: AcceptedOrchestrationResultAppendInput, principal: WorkloadPrincipal): Promise<void>;
  mediateCollaboration(input: CollaborationRequestAppendInput, principal: WorkloadPrincipal): Promise<void>;
  acceptExecutiveReport(input: ExecutiveReportAppendInput, principal: WorkloadPrincipal): Promise<void>;
}
```

`store-health-execution-catalog.ts` maps each of the six Department kinds to a
fixed result-schema name/body/digest and bounded subset of
`DEPARTMENT_TOOL_CATALOG`. During `acceptPlan`, resolve the submitted digests
against this catalog, derive the Task Brief from the persisted task, resolve
the exact configured model/budget/tool grants, re-evaluate assignment and tool
policy, bind trusted provenance, generate a short expiry, and append plan plus
descriptors atomically. Never accept model IDs, schema bodies, credentials, raw
attachments, or arbitrary tools from the AI CEO.
`TaskBriefView` includes only the policy-eligible Department assignments and
their server-owned schema/tool digests, allowing the AI CEO to propose a plan
without receiving configuration secrets or selecting authority.

- [ ] **Step 4: Add strict internal routes**

```text
GET  /orchestration/task-briefs/:taskId
GET  /orchestration/dispatch-plans/:runId
GET  /orchestration/descriptors/:descriptorId
POST /orchestration/results
POST /orchestration/collaborations
POST /orchestration/reports
```

Task Brief and dispatch-plan reads require the worker identity and return only
bounded fields. The dispatch plan returns descriptor ID/digest bindings for the
accepted plan revision. Require `x-opendx-descriptor-digest` for descriptor
reads. Re-evaluate revocation/expiry
before returning `ExecutionDescriptorView`; re-evaluate collaboration policy
before persistence. POST responses are digest-only acknowledgements.

- [ ] **Step 5: Run API unit and PostgreSQL HTTP integration tests**

```bash
pnpm --filter @opendx/api test -- orchestration.service agentic.api.test.ts
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test pnpm --filter @opendx/api test:integration -- agentic.api.integration.test.ts
```

Expected: PASS for forged identity, expiry, revocation, replay, and no-echo cases.

- [ ] **Step 6: Update changelog and commit**

```bash
git add apps/api/src/modules/agentic CHANGELOG.md
git commit -m "feat(agentic): govern execution descriptors"
```

### Task 7: Configure distinct AI CEO and Department identities and safe transports

**Files:**
- Modify: `services/ai-runtime/app/shared/config.py`
- Modify: `services/ai-runtime/app/agentic/application/ports.py`
- Modify: `services/ai-runtime/app/agentic/infrastructure/keycloak.py`
- Modify: `services/ai-runtime/app/agentic/infrastructure/agentic_control_client.py`
- Create: `services/ai-runtime/app/agentic/infrastructure/agent_submission_client.py`
- Create: `services/ai-runtime/app/agentic/infrastructure/department_tools.py`
- Modify: `services/ai-runtime/tests/shared/test_config.py`
- Modify: `services/ai-runtime/tests/agentic/infrastructure/test_keycloak.py`
- Modify: `services/ai-runtime/tests/agentic/infrastructure/test_agentic_control_client.py`
- Create: `services/ai-runtime/tests/agentic/infrastructure/test_agent_submission_client.py`
- Create: `services/ai-runtime/tests/agentic/infrastructure/test_department_tools.py`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing identity-routing and transport tests**

Assert planning refuses a missing AI CEO identity, descriptor execution refuses
missing/duplicate Department identities, plan submission uses only the AI CEO
token, Department tools select the assigned Department provider, the worker
token is never used for either impersonation path, responses are bounded, and
tokens/provider bodies are absent from exceptions.

```python
@pytest.mark.parametrize("agent_kind", ("catalog", "inventory", "order", "finance", "crm", "support"))
def test_routes_each_department_to_its_own_token(agent_kind: str) -> None:
    router = DepartmentTokenRouter(distinct_providers())
    assert asyncio.run(router.for_agent(agent_kind).get_token()) == f"{agent_kind}-token"
```

- [ ] **Step 2: Run focused Python tests and observe failure**

```bash
pnpm test:py -- tests/shared/test_config.py tests/agentic/infrastructure/test_keycloak.py tests/agentic/infrastructure/test_agentic_control_client.py tests/agentic/infrastructure/test_agent_submission_client.py tests/agentic/infrastructure/test_department_tools.py
```

Expected: FAIL because the identity maps and transports do not exist.

- [ ] **Step 3: Add typed settings and identity router**

```python
DepartmentAgentKind = Literal["catalog", "inventory", "order", "finance", "crm", "support"]

@dataclass(frozen=True)
class DepartmentIdentitySettings:
    client_id: str
    client_secret: str = dataclass_field(repr=False)

@dataclass(frozen=True)
class DepartmentExecutionSettings:
    enabled: bool
    tool_api_base_url: str
    identities: Mapping[DepartmentAgentKind, DepartmentIdentitySettings]
```

Add a separate redacted `ai_ceo_identity: DepartmentIdentitySettings` and parse
`AGENT_AI_CEO_CLIENT_ID`/`AGENT_AI_CEO_CLIENT_SECRET`. Parse
`AGENT_{CATALOG,INVENTORY,ORDER,FINANCE,CRM,SUPPORT}_CLIENT_ID` and
`_CLIENT_SECRET` only when `ORCHESTRATION_DESCRIPTOR_EXECUTION_ENABLED=true`.
Require all seven Agent client IDs and secrets to be distinct from one another
and from the worker client.

- [ ] **Step 4: Add descriptor and Tool Registry clients**

Extend `AgenticControlClient` with Task Brief, dispatch-plan, descriptor read,
and orchestration settlement methods using the worker identity. Implement
`AgentSubmissionClient.accept_plan` using only the AI CEO identity. Implement
`DepartmentToolClient.invoke` against
`/v1/agentic/tools/invoke`, taking an explicit Agent and selecting only its
provider. Validate response envelope/size; never log request or response bodies.

- [ ] **Step 5: Re-run focused tests**

Run Step 2. Expected: PASS for all identities, configuration failures,
redaction, response bounds, and retry classifications.

- [ ] **Step 6: Update changelog and commit**

```bash
git add services/ai-runtime CHANGELOG.md
git commit -m "feat(ai-runtime): isolate department identities"
```

### Task 8: Persist AI CEO authorities and private accepted payloads

**Files:**
- Create: `apps/api/src/modules/agentic/domain/entities/ai-ceo-execution-authority.ts`
- Create: `apps/api/src/modules/agentic/domain/entities/ai-ceo-execution-authority.test.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608220007_create_ai_ceo_execution_authorities.ts`
- Modify: `apps/api/src/modules/agentic/application/repositories/interfaces/agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: immutable task/configuration/plan records and `canonicalDigest`.
- Produces: `AiCeoExecutionAuthority`, `AiCeoExecutionPayload`, append/read
  repository methods, immutable accepted-result payloads, and immutable
  executive-report payloads.

- [ ] **Step 1: Write failing authority and persistence tests**

Prove purpose-specific authority validation, exact replay convergence,
conflicting payload rejection, secret-field rejection, UPDATE/DELETE
prevention, and one private payload for each accepted result/report digest.

```ts
it("rejects replay with a changed planning model", async () => {
  await repository.appendAiCeoExecutionAuthority(session, authority, payload);
  await expect(repository.appendAiCeoExecutionAuthority(session,
    { ...authority, primaryModel: "unapproved/model" }, payload))
    .rejects.toMatchObject({ code: "AI_CEO_AUTHORITY_CONFLICT" });
});
```

- [ ] **Step 2: Run the tests and observe the missing contracts**

```bash
pnpm --filter @opendx/api test -- ai-ceo-execution-authority
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test pnpm --filter @opendx/api test:integration -- postgresql-agentic.repository.integration.test.ts agentic-migration.integration.test.ts
```

Expected: FAIL because authority and private-payload persistence are absent.

- [ ] **Step 3: Add the strict authority contract**

```ts
export interface AiCeoExecutionAuthority {
  readonly id: string; readonly version: number;
  readonly purpose: "orchestration_planning" | "executive_synthesis";
  readonly taskId: string; readonly planVersion?: number;
  readonly configurationRevisionId: string; readonly policyVersion: number;
  readonly primaryModel: string; readonly fallbackModel: string;
  readonly resultSchemaName: string; readonly resultSchemaDigest: string;
  readonly authorizedContextDigest: string;
  readonly budgetAuthorizationMicros: number; readonly timeoutSeconds: number;
  readonly expiresAt: string; readonly payloadDigest: string;
  readonly authorityDigest: string; readonly createdAt: string;
}

export interface AiCeoExecutionPayload {
  readonly resultSchema: Readonly<Record<string, unknown>>;
  readonly authorizedContext: Readonly<Record<string, unknown>>;
}
```

Require `planVersion` only for synthesis. Bind every field into the canonical
authority digest and reject nested credential-like keys.

- [ ] **Step 4: Add append-only PostgreSQL storage**

Migration `202608220007` creates authority, authority-payload,
accepted-result-payload, and executive-report-payload tables. Protect all four
with `agentic_prevent_mutation()`. Repository append methods recompute payload
digests, converge exact retries, and return conflict for changed content.

- [ ] **Step 5: Re-run focused tests, update changelog, and commit**

Run both commands from Step 2. Expected: PASS.

```bash
git add apps/api/src/modules/agentic CHANGELOG.md
git commit -m "feat(agentic): persist ai ceo execution authority"
```

### Task 9: Govern AI CEO authority and private synthesis context

**Files:**
- Create: `apps/api/src/modules/agentic/application/orchestration/ai-ceo-execution-catalog.ts`
- Create: `apps/api/src/modules/agentic/application/orchestration/ai-ceo-execution-catalog.test.ts`
- Modify: `apps/api/src/modules/agentic/application/orchestration/store-health-execution-catalog.ts`
- Modify: `apps/api/src/modules/agentic/application/orchestration/store-health-execution-catalog.test.ts`
- Modify: `apps/api/src/modules/agentic/application/services/interfaces/orchestration.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.test.ts`
- Modify: `apps/api/src/modules/agentic/presentation/validators/agentic.validator.ts`
- Modify: `apps/api/src/modules/agentic/presentation/controllers/agentic-workload.controller.ts`
- Modify: `apps/api/src/modules/agentic/presentation/routes/agentic-workload.routes.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.test.ts`
- Modify: `apps/api/src/modules/agentic/tests/agentic.api.integration.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 8 authority/private-payload repositories and the active AI CEO
  model/budget configuration.
- Produces: planning-authority references in Task Briefs, synthesis-authority
  references in dispatch plans, authority reads, exact private result
  settlement, synthesis-context resolution, and private report settlement.

- [ ] **Step 1: Write failing service and HTTP tests**

Cover server-owned model/schema/budget selection, current policy/revocation,
unexpired replay, expired new-version preparation, worker-only authority reads,
digest headers, no-store responses, result schema/digest recomputation,
share-policy evaluation, exact synthesis references, and report provenance.

```ts
it("rejects a shareable result whose body does not match its digest", async () => {
  await expect(service.acceptResult({ ...result, resultDigest: "0".repeat(64) }, worker))
    .rejects.toMatchObject({ code: "RESULT_DIGEST_INVALID" });
  expect(repository.appendAcceptedOrchestrationResultPayload).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests and observe failure**

```bash
pnpm --filter @opendx/api test -- ai-ceo-execution-catalog orchestration.service agentic.api.test.ts
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test pnpm --filter @opendx/api test:integration -- agentic.api.integration.test.ts
```

Expected: FAIL because authority preparation and private synthesis context are
absent.

- [ ] **Step 3: Add server-owned schemas and safe Department payloads**

The planning proposal schema permits only `subtasks[]` containing one unique
eligible `owner` and unique `dependencies` by owner. Revise the Phase F
Department result schema payload to contain only exact tool summary references:

```ts
interface StoreHealthToolSummaryReference {
  readonly toolName: DepartmentToolName;
  readonly provenanceId: string;
  readonly summaryDigest: string;
}
```

This removes LLM-owned calculations from the result payload. Conclusions,
risks, and recommendations retain provenance IDs; raw tool summaries and
evidence rows are never shareable payload fields. The AI CEO synthesis schema
uses the existing bounded AI CEO envelope.

- [ ] **Step 4: Prepare and expose private authority**

`loadTaskBrief` idempotently prepares an unexpired planning authority from the
exact active AI CEO model configuration and budget, returning only
`{authorityId, authorityDigest}`. `acceptPlan` prepares the synthesis authority
in the plan transaction. Add worker-only routes:

```text
GET  /orchestration/ai-ceo-authorities/:authorityId
POST /orchestration/synthesis-contexts
```

Authority reads require `x-opendx-authority-digest`. Synthesis-context input is
only task ID, plan version, and bounded `DescriptorExecutionReference` values;
the response contains exact accepted shareable payloads and unavailable
references, never Department descriptor/tool bodies.

- [ ] **Step 5: Harden result and report settlements**

Extend result settlement with descriptor ID/digest and the strict shareable
result. Extend report settlement with authority ID/digest and the strict AI CEO
report. Revalidate current authority, parse the server-owned schema, recompute
all digests/provenance, and append metadata plus private payload atomically.

- [ ] **Step 6: Re-run tests, update changelog, and commit**

Run Step 2. Expected: PASS.

```bash
git add apps/api/src/modules/agentic CHANGELOG.md
git commit -m "feat(agentic): govern ai ceo execution authority"
```

### Task 10: Return governed structured model results in process

**Files:**
- Modify: `services/ai-runtime/app/agentic/application/model_executor.py`
- Modify: `services/ai-runtime/app/agentic/application/quality_gate.py`
- Create: `services/ai-runtime/app/agentic/application/planning_quality_gate.py`
- Create: `services/ai-runtime/app/agentic/application/phase_f_context.py`
- Create: `services/ai-runtime/app/agentic/domain/ai_ceo_execution.py`
- Modify: `services/ai-runtime/app/agentic/domain/store_health_result_schemas.py`
- Modify: `services/ai-runtime/tests/agentic/application/test_model_executor.py`
- Modify: `services/ai-runtime/tests/agentic/application/test_quality_gate.py`
- Create: `services/ai-runtime/tests/agentic/application/test_planning_quality_gate.py`
- Create: `services/ai-runtime/tests/agentic/application/test_phase_f_context.py`
- Create: `services/ai-runtime/tests/agentic/domain/test_ai_ceo_execution.py`
- Modify: `services/ai-runtime/tests/agentic/domain/test_store_health_result_schemas.py`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: API-owned authority and result-schema shapes from Task 9.
- Produces: `ModelExecutionOutcome.accepted_content`, strict AI CEO authority
  DTOs, Phase F contexts/prompts, `PlanningQualityGate`, and schema digests that
  exactly match the API catalog.

- [ ] **Step 1: Write failing model-content and Quality Gate tests**

Prove accepted/partial outcomes expose an immutable in-process content mapping,
escalated/correct/failed outcomes expose none, existing Temporal model activity
responses stay digest-only, planning rejects unknown owners/cycles/authority
fields, synthesis accepts purpose `executive_synthesis`, and Phase D continues
to block planning semantics.

```python
def test_completed_model_result_is_available_only_to_the_application_caller() -> None:
    outcome = asyncio.run(executor.execute(command()))
    assert dict(outcome.accepted_content or {}) == {"status": "complete"}
    assert "acceptedContent" not in asyncio.run(activity.execute_model_analysis_v1(command()))
```

- [ ] **Step 2: Run tests and observe failure**

```bash
pnpm test:py -- tests/agentic/application/test_model_executor.py tests/agentic/application/test_quality_gate.py tests/agentic/application/test_planning_quality_gate.py tests/agentic/application/test_phase_f_context.py tests/agentic/domain/test_ai_ceo_execution.py tests/agentic/domain/test_store_health_result_schemas.py
```

Expected: FAIL because process-local content and Phase F gates are absent.

- [ ] **Step 3: Add process-local accepted content**

Add `accepted_content: Mapping[str, object] | None = field(default=None,
repr=False, compare=False)` to `ModelExecutionOutcome`. Populate it only after
an `accepted` or terminal `partial` Quality Gate decision. Keep model-run
settlements and `ModelExecutionActivities` output unchanged and digest-only.

- [ ] **Step 4: Add strict Phase F authority, context, and gates**

Parse authority/payload with frozen Pydantic models and verify authority,
payload, schema, and authorized-context digests before model execution.
`PlanningQualityGate` parses only owner/dependency proposals and delegates DAG
validation to `OrchestrationPlanner`. The Phase F Department gate verifies
evidence/provenance plus exact `{toolName, provenanceId, summaryDigest}` values.
Extend the existing `QualityGate` purpose literal with
`executive_synthesis`; do not relax its Phase D `department_analysis` rules.

- [ ] **Step 5: Re-run tests, update changelog, and commit**

Run Step 2. Expected: PASS.

```bash
git add services/ai-runtime CHANGELOG.md
git commit -m "feat(ai-runtime): expose governed structured results"
```

### Task 11: Execute descriptor-bound Department and AI CEO work

**Files:**
- Modify: `services/ai-runtime/app/agentic/domain/execution_descriptor.py`
- Modify: `services/ai-runtime/app/agentic/application/department_execution.py`
- Modify: `services/ai-runtime/app/agentic/activities/orchestration_activities.py`
- Modify: `services/ai-runtime/app/agentic/worker.py`
- Modify: `services/ai-runtime/tests/agentic/application/test_department_execution.py`
- Modify: `services/ai-runtime/tests/agentic/activities/test_orchestration_activities.py`
- Modify: `services/ai-runtime/tests/agentic/test_worker.py`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 10 process-local accepted content, authority DTOs, and gates;
  Task 7 worker/AI CEO/Department transports.
- Produces: planning, Department execution, and synthesis services plus exactly
  three Phase F Temporal activities behind the descriptor-execution flag.

- [ ] **Step 1: Write failing application/activity tests**

Cover Task Brief loading, authority-bound AI CEO planning and plan submission, binding
mismatch, expiry, tool limits, Department token selection, safe context,
existing model executor/Quality Gate use, accepted/partial outcomes, mediated
collaboration, and exact settlement. An unavailable Department must never cause
identity substitution or a fabricated result. The runtime's named result schema
must hash to the exact schema digest in the descriptor before any model call.

```python
async def test_descriptor_mismatch_stops_before_tools_or_model() -> None:
    with pytest.raises(DepartmentExecutionError, match="DESCRIPTOR_BINDING_INVALID"):
        await executor.execute(command_with_wrong_subtask)
    tools.invoke.assert_not_awaited()
    models.execute.assert_not_awaited()
```

- [ ] **Step 2: Run focused tests and observe failure**

```bash
pnpm test:py -- tests/agentic/application/test_department_execution.py tests/agentic/activities/test_orchestration_activities.py tests/agentic/test_worker.py
```

Expected: FAIL because governed planning, synthesis, private payload
settlement, and feature-flagged worker composition are incomplete.

- [ ] **Step 3: Add strict frozen runtime contracts**

```python
class DescriptorExecutionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    descriptor_id: UUID
    descriptor_digest: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    task_id: UUID
    plan_version: PositiveInt
    subtask_id: UUID
    agent_kind: DepartmentAgentKind
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=256)]

class DescriptorExecutionReference(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    status: Literal["usable", "partial", "unavailable"]
    result_digest: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    provenance_ids: tuple[UUID, ...]
```

- [ ] **Step 4: Implement service and activity adapter**

Implement `plan_orchestration_v1` to load the bounded Task Brief and referenced
planning authority with the worker identity, run the AI CEO through the
governed model-run and `PlanningQualityGate` path, deterministically enrich the
accepted owner/dependency proposal from eligible assignment records, validate
it with `OrchestrationPlanner`, and submit it using only the AI CEO identity.
Then load descriptors with the worker token; verify every binding and expiry;
invoke only typed
grants using the assigned Department token; build minimized labeled context;
construct the existing `ModelExecutionCommand` from API-authorized model,
schema, context, and Quality Gate data; append one accepted private shareable
result. Terminal Department or escalated Quality Gate outcomes return
`unavailable` without settlement; partial outcomes remain explicit.

`synthesize_executive_report_v1` resolves only exact result references through
the worker synthesis-context operation, loads the synthesis authority, runs the
AI CEO through the existing synthesis Quality Gate, and settles one private
report. Structured collaboration requests are persisted and policy-checked
before target execution. Only bounded IDs, digests, statuses, provenance IDs,
and idempotency keys cross Temporal.

Accepted model completion and its plan/result/report settlement must share one
API transaction. Each activity checks its deterministic settlement ID before
model execution so a lost post-commit response recovers the existing bounded
reference without a second provider call.
The atomic completion must match the stored model run to the exact task,
Agent, configuration revision, policy version, result schema, and authorized
input digest. Executive-report recovery additionally compares a persisted
digest of the bounded synthesis branch references; an all-unavailable report
may carry no model provenance only when it has no accepted branch.

- [ ] **Step 5: Register and test activities**

Register `plan_orchestration_v1`, `execute_department_subtask_v1`, and
`synthesize_executive_report_v1` only when descriptor execution is enabled.
Run Step 2. Expected: PASS with no raw payload/secret serialization and exact
retry idempotency.

- [ ] **Step 6: Update changelog and commit**

```bash
git add services/ai-runtime CHANGELOG.md
git commit -m "feat(ai-runtime): execute governed department work"
```

### Task 12: Add the replay-safe Temporal descriptor path

**Files:**
- Modify: `services/ai-runtime/app/agentic/domain/contracts.py`
- Modify: `services/ai-runtime/app/agentic/infrastructure/agentic_control_client.py`
- Modify: `services/ai-runtime/app/agentic/workflows/store_health_review_v1.py`
- Modify: `services/ai-runtime/tests/agentic/workflows/test_store_health_review_v1.py`
- Modify: `services/ai-runtime/tests/agentic/workflows/test_store_health_replay.py`
- Create: `services/ai-runtime/tests/agentic/workflows/test_store_health_orchestration.py`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing new-history and old-history replay tests**

Prove roots fan out, dependents wait, failures become unavailable, partial
completion is honest, cancellation drains work, and restart does not duplicate
effects. Replay all five Phase B fixtures unchanged and one new patched history.

```python
async def test_new_runs_use_descriptor_references_without_raw_payloads() -> None:
    result, history = await run_descriptor_workflow(plan_with_two_roots)
    assert result.successful_branches == tuple(sorted(result.successful_branches))
    serialized = history.to_json()
    assert "authorizedContext" not in serialized
    assert "client_secret" not in serialized
```

- [ ] **Step 2: Run workflow/replay tests and observe failure**

```bash
pnpm test:py -- tests/agentic/workflows/test_store_health_review_v1.py tests/agentic/workflows/test_store_health_replay.py tests/agentic/workflows/test_store_health_orchestration.py
```

Expected: FAIL because the patched descriptor path is absent.

- [ ] **Step 3: Extend frozen plan references compatibly**

Add an `OrchestrationDispatchPlan` whose nodes require `descriptor_id` and
`descriptor_digest`; keep the existing `FrozenWorkflowPlan` and `PlanNode`
unchanged for Phase B replay. Map the new dispatch-plan endpoint only into the
new type so old recorded activity results retain their exact decoder.

- [ ] **Step 4: Add the named deterministic patch**

```python
if workflow.patched("phase-f-execution-descriptor-v1"):
    return await self._run_descriptor_orchestration(run_id, value)
return await self._run_phase_b_path(run_id, value)
```

Keep fake activity names, ordering, retries, timers, signals, and projections
unchanged in `_run_phase_b_path`. The new graph schedules dependency-ready
descriptor inputs in stable ID order after `plan_orchestration_v1` succeeds and
the worker loads the accepted `OrchestrationDispatchPlan`. It propagates
cancellation and synthesizes from result references only.

- [ ] **Step 5: Re-run workflow and replay tests**

Run Step 2. Expected: PASS for all unchanged Phase B histories and the new one.

- [ ] **Step 6: Update changelog and commit**

```bash
git add services/ai-runtime CHANGELOG.md
git commit -m "feat(ai-runtime): dispatch descriptor plan graph"
```

### Task 13: Wire deployment identities and Slice 1 acceptance

**Files:**
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `infra/keycloak/realm-export.json`
- Modify: `infra/keycloak/realm-production.json`
- Modify: `infra/keycloak/reconcile-production-realm.sh`
- Modify: `scripts/dev/agentic-production-compose-check.mjs`
- Create: `scripts/dev/agentic-phase-f-orchestration-check.mjs`
- Create: `scripts/dev/agentic-phase-f-orchestration-check.test.mjs`
- Modify: `package.json`
- Modify: `docs/api/agentic.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing static and deterministic acceptance tests**

Assert Keycloak and Compose define one AI CEO plus six Department credentials,
pass them only to the worker, require them when execution is enabled, keep the
API/worker non-public, and
Temporal receives references only. The scenario executes six fake Department
branches, one mediated collaboration, report synthesis, worker restart/history
replay, no duplicate tool/model/report rows, and zero Commerce mutation.

```js
test("phase F gate rejects shared Department credentials", () => {
  assert.throws(
    () => validateDepartmentSecrets(Object.fromEntries(DEPARTMENTS.map((name) => [name, "shared"]))),
    /distinct/,
  );
});
```

- [ ] **Step 2: Run the static test and observe failure**

```bash
node --test scripts/dev/agentic-phase-f-orchestration-check.test.mjs
```

Expected: FAIL because the gate and Compose wiring do not exist.

- [ ] **Step 3: Wire environment and add the exit gate**

Add `ORCHESTRATION_DESCRIPTOR_EXECUTION_ENABLED`,
`DEPARTMENT_TOOL_API_BASE_URL`, the AI CEO client pair, and six explicit
Department client pairs to Keycloak plus local/production worker environments.
Keep secrets out of image layers and documented values. Add package scripts
`test:agentic-phase-f-orchestration` and `check:agentic-phase-f-orchestration`.

- [ ] **Step 4: Document contracts and operations**

Document descriptor/read/settlement DTOs without sensitive example bodies,
identity separation, opt-in local setup, failure/replan behavior, replay
compatibility, and verification commands. Mark only Slice 1 complete after all
exit gates pass; keep schedules and Company Memory deferred.

- [ ] **Step 5: Run complete Slice 1 verification**

```bash
node --test scripts/dev/agentic-phase-f-orchestration-check.test.mjs
pnpm check:agentic-phase-f-orchestration
pnpm --filter @opendx/api typecheck
pnpm --filter @opendx/api test
pnpm test:py
pnpm check:agentic-production-compose
pnpm check
git diff --check
pnpm audit:repo
```

Expected: every command exits `0`; Python includes old/new replay tests, and the
Phase F gate reports six identities with no duplicate effects or Commerce mutation.

- [ ] **Step 6: Commit Slice 1 acceptance evidence**

```bash
git add .env.example infra scripts package.json docs CHANGELOG.md
git commit -m "test(agentic): verify ai ceo orchestration"
```

## Plan self-review

- Spec coverage: Tasks 5–7 own Department descriptors and distinct identities.
  Tasks 8–9 own append-only AI CEO authority, private accepted-result/report
  payloads, synthesis-context resolution, and API revalidation. Tasks 10–11
  own process-local structured results, purpose-specific Quality Gates,
  governed planning/Department/synthesis execution, and worker composition.
  Task 12 owns DAG cancellation, recovery, and old/new replay. Task 13 owns
  Compose, docs, deterministic acceptance, and closure evidence.
- Type consistency: `ExecutionDescriptor` is the API persistence contract;
  `ExecutionDescriptorView` is the internal DTO; `DescriptorExecutionInput`
  and `DescriptorExecutionReference` are the Department Temporal payloads.
  Planning and synthesis carry only bounded task/plan IDs, authority/result
  references, statuses, provenance IDs, and idempotency keys; private payloads
  remain API/runtime-local.
  Department kinds are exactly Catalog, Inventory, Order, Finance, CRM, and
  Support; AI CEO and worker remain separate identities across TypeScript,
  Python, Keycloak, and Compose.
- Scope: no schedule, Company Memory, GraphRAG, Console UI, public runtime API,
  direct Agent messaging, Commerce mutation, generic workflow engine, or new
  dependency is included.
