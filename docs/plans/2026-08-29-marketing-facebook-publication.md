<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Marketing Facebook Publication Implementation Plan

**Goal:** Deliver one governed Marketing & Creative department in which three distinct Digital Employees prepare, approve, publish, verify, and report one image-based Facebook Page post from either direct staff assignment or an AI CEO handoff.

**Architecture:** A new API `marketing` module owns campaign truth, artifacts, publication packages, and the platform-neutral publishing port. The existing Agentic module owns identities, model governance, task handoff, approval, audit, and provenance; the Python AI Runtime owns a separate versioned Temporal workflow and governed text/image activities. PostgreSQL is authoritative, private MinIO stores immutable artifacts, and a Facebook Graph adapter is composed only in infrastructure.

**Tech Stack:** TypeScript, Express 5, PostgreSQL 18, node-pg-migrate, Python 3.13, FastAPI, Temporal 1.31/Python SDK 1.30, OpenRouter Chat and Image APIs, MinIO, Keycloak, React 19, Zod 4, Vitest, Pytest, Testing Library, Docker Compose, `docx`, `exceljs`, and `pdf-lib`.

---

## Approved Scope and Preconditions

Implementation source is
`docs/superpowers/specs/2026-08-29-marketing-facebook-department-design.md`.
Only the Facebook image-post workflow is authorized. Do not implement another
Department, social network, paid ads, analytics, post editing/deletion,
recurring schedules, Company Memory, GraphRAG, or a generic workflow builder.

Work from a new feature branch based on the branch that contains completed
Phases F/G and live Agentic activation. Before Task 1:

```bash
git fetch origin
git merge-base --is-ancestor 6aee900 HEAD
git status --short --branch
```

Expected: ancestry exits `0` and the feature worktree is clean. If not, stop;
this plan does not authorize merging missing prerequisites.

The current planning baseline has two pre-existing Console failures:

- `apps/console/src/app/console-shell.test.tsx`
- `apps/console/src/features/agentic/tests/agentic-task-detail-page.test.tsx`

The user explicitly allowed planning to continue on 2026-08-29. Implementation
must rebase onto the current delivery branch and either prove those failures no
longer exist or fix them in a separate atomic unit before the final gate.

## Test List

Implement these behaviors in RED-GREEN order:

1. direct Marketing intake is actor-bound and idempotent;
2. out-of-scope and cross-Department tasks fail without execution;
3. the three Digital Employees have separate identities and least privilege;
4. copy and image versions settle once with cost and provenance;
5. changed content/image/Page/schedule invalidates approval;
6. no publication occurs without a current human approval;
7. an ambiguous Facebook timeout never causes a blind duplicate POST;
8. read-after-write verification binds Page, post, content, and image;
9. restarts do not duplicate model calls, objects, approvals, or posts;
10. completion requires DOCX/PNG/XLSX/PDF artifacts and authoritative records;
11. AI CEO handoff starts the same Marketing workflow, not a second workflow;
12. another platform adapter can be added without changing workflow code.

## Target File Map

Create `apps/api/src/modules/marketing/` only with the first files in each task.
It grows through `domain`, `application`, `infrastructure`, `presentation`, and
`tests`. Cross-module access is through `apps/api/src/modules/marketing/index.ts`
and the existing `apps/api/src/modules/agentic/index.ts` only.

Create `services/ai-runtime/app/marketing/` for the Marketing Temporal workflow,
application services, and outward adapters. Create
`apps/console/src/features/marketing/` for the staff experience. Do not place
Marketing business rules in `shared`, routes, React components, prompts, or
environment parsing.

### Task 1: Establish Marketing domain, state machine, and PostgreSQL truth

**Files:**

- Create: `apps/api/src/modules/marketing/domain/entities/marketing-campaign.ts`
- Create: `apps/api/src/modules/marketing/domain/services/marketing-campaign-rules.ts`
- Create: `apps/api/src/modules/marketing/domain/services/marketing-campaign-rules.test.ts`
- Create: `apps/api/src/modules/marketing/application/repositories/interfaces/marketing.repository.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/database/migrations/202608290001_create_marketing_facebook_publication.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/database/run-marketing-migrations.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/database/marketing-migration.integration.test.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/repositories/implementations/postgresql-marketing.repository.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/repositories/implementations/postgresql-marketing.repository.integration.test.ts`
- Modify: `apps/api/src/shared/database/run-migrations.ts`
- Modify: `apps/api/package.json`
- Modify: `CHANGELOG.md`

**Step 1: Write failing domain tests**

Use the exact lifecycle:

```ts
export type MarketingCampaignState =
  | "draft" | "validating" | "content_drafting" | "visual_creation"
  | "campaign_review" | "awaiting_human_approval" | "revision_requested"
  | "scheduled" | "publishing" | "publication_unknown"
  | "verifying_publication" | "reporting" | "completed"
  | "waiting_for_input" | "quality_escalated" | "blocked_credentials"
  | "platform_rejected" | "schedule_missed" | "out_of_scope"
  | "cross_department_coordination_required" | "failed" | "canceled";
```

Test valid transitions, terminal immutability, maximum two quality corrections,
approval invalidation on package-affecting changes, and prohibition of
`completed` without verified publication plus all five artifact kinds.

**Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/domain/services/marketing-campaign-rules.test.ts
```

Expected: FAIL because Marketing domain code does not exist.

**Step 3: Implement the minimal domain contract**

Use framework-neutral types. Define `MarketingCampaign`, `CampaignBrief`,
`ContentVersion`, `VisualAsset`, `PublicationPackage`, `PublicationAttempt`,
`PublicationRecord`, and `MarketingArtifact`. Use integer versions, ISO
timestamps, SHA-256 digests, and explicit state transitions. Do not include
tokens, object keys, provider bodies, or prompts in public entities.

**Step 4: Write migration/repository tests and run RED**

Create tests for migration up/down, checks, foreign keys, immutable accepted
versions, unique `(created_by,idempotency_key)`, unique current package,
unique publication claim per package, unique external `(platform,page_id,
external_post_id)`, and optimistic updates.

```bash
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/marketing/infrastructure/database/marketing-migration.integration.test.ts \
  src/modules/marketing/infrastructure/repositories/implementations/postgresql-marketing.repository.integration.test.ts
```

**Step 5: Implement PostgreSQL truth**

Create normalized tables for campaigns, briefs, content versions, visual
assets, packages, attempts, publications, artifacts, and immutable event
records. Store `page_configuration_id`, not a Page token. Publication attempts
store bounded error class/code and response digest only. Use transaction-scoped
advisory locks for idempotent intake, package creation, publication claims, and
artifact settlement.

Add `db:migrate:marketing` and place Marketing after Agentic in migrate-up and
before Agentic in rollback-all. Update the shared migration runner ledger.

**Step 6: Run GREEN and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/domain/services/marketing-campaign-rules.test.ts
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/marketing/infrastructure/database/marketing-migration.integration.test.ts \
  src/modules/marketing/infrastructure/repositories/implementations/postgresql-marketing.repository.integration.test.ts
git add apps/api/src/modules/marketing apps/api/src/shared/database/run-migrations.ts apps/api/package.json CHANGELOG.md
git commit -m "feat(marketing): establish campaign publication truth"
```

### Task 2: Add direct assignment, scope validation, and staff API

**Files:**

- Create: `apps/api/src/modules/marketing/application/dtos/marketing.dto.ts`
- Create: `apps/api/src/modules/marketing/application/services/interfaces/marketing-campaign.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-campaign.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-campaign.service.test.ts`
- Create: `apps/api/src/modules/marketing/presentation/validators/marketing.validator.ts`
- Create: `apps/api/src/modules/marketing/presentation/controllers/marketing.controller.ts`
- Create: `apps/api/src/modules/marketing/presentation/routes/marketing.routes.ts`
- Create: `apps/api/src/modules/marketing/presentation/middleware/marketing-error.middleware.ts`
- Create: `apps/api/src/modules/marketing/tests/marketing.api.test.ts`
- Create: `apps/api/src/modules/marketing/marketing.module.ts`
- Create: `apps/api/src/modules/marketing/index.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing service and transport tests**

The request contract is:

```ts
export interface CreateMarketingCampaignInput {
  readonly assignmentMode: "direct_department" | "ai_ceo";
  readonly idempotencyKey: string;
  readonly campaignName: string;
  readonly objective: string;
  readonly subject: { readonly kind: "catalog_product" | "free_topic"; readonly reference: string };
  readonly audience?: string;
  readonly language: "vi" | "en";
  readonly tone?: string;
  readonly mandatoryMessage: string;
  readonly prohibitedClaims: readonly string[];
  readonly callToAction: string;
  readonly facebookPageConfigurationId: string;
  readonly scheduledFor: string;
  readonly deadline: string;
  readonly approverId: string;
  readonly maximumCostMicros: number;
  readonly provenance: readonly { readonly sourceType: string; readonly sourceId: string; readonly sourceDigest: string; readonly classification: "internal" | "confidential" }[];
}
```

Assert `agentic_operator`/administrator authorization, exact replay, changed
payload conflict, strict UTC timestamps, future schedule/deadline, allowed
language, bounded text/arrays/budget, configured Page reference, and no raw
customer list. Test `OUT_OF_DEPARTMENT_SCOPE`, `WAITING_FOR_INPUT`, and
`CROSS_DEPARTMENT_COORDINATION_REQUIRED` without creating a workflow command.

**Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/application/services/implementations/marketing-campaign.service.test.ts \
  src/modules/marketing/tests/marketing.api.test.ts
```

**Step 3: Implement direct intake**

Expose:

```text
POST /v1/admin/marketing/campaigns
GET  /v1/admin/marketing/campaigns
GET  /v1/admin/marketing/campaigns/:campaignId
POST /v1/admin/marketing/campaigns/:campaignId/ready
POST /v1/admin/marketing/campaigns/:campaignId/cancel
```

Parse `Idempotency-Key` at presentation and pass it into the application DTO.
The service deterministically validates scope; it must not call an LLM to
decide permissions. Store accepted provenance and append allowed/denied audit
through an injected Agentic public audit port. Direct intake sets Department
to `marketing` and never creates an AI CEO planning authority.

**Step 4: Run GREEN and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/application/services/implementations/marketing-campaign.service.test.ts \
  src/modules/marketing/tests/marketing.api.test.ts
git add apps/api/src/modules/marketing apps/api/src/server.ts CHANGELOG.md
git commit -m "feat(marketing): accept governed direct assignments"
```

### Task 3: Govern three Marketing Digital Employees

**Files:**

- Modify: `apps/api/src/modules/agentic/domain/entities/agent-profile.ts`
- Modify: `apps/api/src/modules/agentic/domain/entities/configuration-revision.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/configuration.service.test.ts`
- Create: `apps/api/src/modules/agentic/infrastructure/database/migrations/202608290010_add_marketing_digital_employees.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/database/agentic-migration.integration.test.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/repositories/implementations/postgresql-agentic.repository.integration.test.ts`
- Modify: `infra/keycloak/realm-export.json`
- Modify: `infra/keycloak/realm-production.json`
- Modify: `scripts/dev/keycloak-agentic-realm-check.test.mjs`
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/.env.production.example`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `services/ai-runtime/app/shared/config.py`
- Modify: `services/ai-runtime/tests/shared/test_config.py`
- Modify: `CHANGELOG.md`

**Step 1: Write failing identity and governance tests**

Extend `AgentKind` with:

```ts
"marketing_content" | "marketing_visual" | "marketing_publisher"
```

Assert three distinct Keycloak client IDs and secrets, no fallback credential,
separate text/image model configuration, positive budgets, revocation, and
deny-first policies. `marketing_content` may execute text generation;
`marketing_visual` may execute image generation; `marketing_publisher` may
assemble/request approval and invoke publication only through a package-bound
grant. None may approve.

**Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/configuration.service.test.ts
node --test scripts/dev/keycloak-agentic-realm-check.test.mjs
pnpm test:py -- tests/shared/test_config.py
```

**Step 3: Implement identities and policy contracts**

Add migration-safe check-constraint evolution rather than editing only the
original migration. Seed no production secret. Validate these ignored env
inputs in runtime configuration:

```text
AGENT_MARKETING_CONTENT_CLIENT_ID / _CLIENT_SECRET
AGENT_MARKETING_VISUAL_CLIENT_ID / _CLIENT_SECRET
AGENT_MARKETING_PUBLISHER_CLIENT_ID / _CLIENT_SECRET
```

Keep credentials visible only to the worker/API process that owns each call.
Update local and production realm definitions and static secret-forwarding
tests.

**Step 4: Run GREEN and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/configuration.service.test.ts
node --test scripts/dev/keycloak-agentic-realm-check.test.mjs
pnpm test:py -- tests/shared/test_config.py
git add apps/api/src/modules/agentic infra/keycloak infra/docker infra/deploy .env.example services/ai-runtime CHANGELOG.md
git commit -m "feat(agentic): govern marketing digital employees"
```

### Task 4: Implement governed Content Strategist execution

**Files:**

- Create: `services/ai-runtime/app/marketing/domain/content_schema.py`
- Create: `services/ai-runtime/app/marketing/application/content_service.py`
- Create: `services/ai-runtime/app/marketing/application/ports.py`
- Create: `services/ai-runtime/tests/marketing/application/test_content_service.py`
- Modify: `services/ai-runtime/app/agentic/application/model_executor.py`
- Modify: `apps/api/src/modules/agentic/domain/entities/model-run.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/model-run.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/model-run.service.test.ts`
- Create: `apps/api/src/modules/marketing/application/services/interfaces/marketing-worker.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-worker.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-worker.service.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing strict-schema tests**

Use this bounded result:

```python
class MarketingContentResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    hook: Annotated[str, StringConstraints(min_length=1, max_length=240)]
    body: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    call_to_action: Annotated[str, StringConstraints(min_length=1, max_length=300)]
    hashtags: Annotated[tuple[str, ...], Field(max_length=20)]
    visual_direction: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    factual_claim_source_ids: Annotated[tuple[str, ...], Field(max_length=50)]
```

Test prompt injection labeling, source-reference enforcement, prohibited-claim
rejection, configured model/budget/policy checks, atomic settlement, exact
replay, and maximum two correction requests.

**Step 2: Run RED**

```bash
pnpm test:py -- tests/marketing/application/test_content_service.py
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/model-run.service.test.ts \
  src/modules/marketing/application/services/implementations/marketing-worker.service.test.ts
```

**Step 3: Implement content settlement**

Reuse the governed OpenRouter chat gateway and API-owned model-run lifecycle.
Add purpose `marketing_content_generation` without weakening existing purpose
checks. The runtime receives only the immutable brief and authorized Catalog
facts. The API accepts one structured result whose digest, model settlement,
cost, configuration, policy, task, identity, and source IDs all match.

**Step 4: Run GREEN and commit**

```bash
pnpm test:py -- tests/marketing/application/test_content_service.py
pnpm --filter @opendx/api exec vitest run \
  src/modules/agentic/application/services/implementations/model-run.service.test.ts \
  src/modules/marketing/application/services/implementations/marketing-worker.service.test.ts
git add services/ai-runtime/app/marketing services/ai-runtime/tests/marketing apps/api/src/modules/agentic apps/api/src/modules/marketing CHANGELOG.md
git commit -m "feat(marketing): generate governed facebook content"
```

### Task 5: Implement governed Visual Designer and private asset storage

**Files:**

- Create: `services/ai-runtime/app/marketing/infrastructure/openrouter_image.py`
- Create: `services/ai-runtime/tests/marketing/infrastructure/test_openrouter_image.py`
- Create: `services/ai-runtime/app/marketing/application/visual_service.py`
- Create: `services/ai-runtime/tests/marketing/application/test_visual_service.py`
- Modify: `services/ai-runtime/app/shared/config.py`
- Modify: `services/ai-runtime/tests/shared/test_config.py`
- Create: `apps/api/src/modules/marketing/application/storage/marketing-artifact.storage.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.integration.test.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/storage/bootstrap-marketing-artifact-bucket.ts`
- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/.env.production.example`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `CHANGELOG.md`

**Step 1: Write failing image boundary tests**

Test `/images/models` capability preflight before `/images`, exact configured
model, raster-only output, PNG signature, base64 validation, one image only,
configured byte/dimension bounds, cost ceiling, timeout/size errors, redacted
exceptions, and no cache of failed capability discovery. Assert MinIO metadata
cleanup/compensation and private authorized streaming.

**Step 2: Run RED**

```bash
pnpm test:py -- \
  tests/marketing/infrastructure/test_openrouter_image.py \
  tests/marketing/application/test_visual_service.py
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.integration.test.ts
```

**Step 3: Implement the image port and adapter**

Use the official OpenRouter Image API boundary with:

```python
@dataclass(frozen=True)
class ImageGenerationRequest:
    model: str
    prompt: str
    aspect_ratio: Literal["1:1"]
    output_format: Literal["png"]
    maximum_cost_micros: int
    idempotency_key: str
```

Decode and validate one PNG before submitting it to the worker-only Marketing
API. Store it at a backend-generated key in a distinct private
`marketing-artifacts` bucket. Add validated `MINIO_MARKETING_BUCKET` and ensure
it differs from product, support, and Agentic buckets. Store only Asset ID and
digest in workflow history.

**Step 4: Run GREEN and commit**

```bash
pnpm test:py -- tests/marketing
TEST_DATABASE_URL=postgresql://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/marketing/infrastructure/storage/minio-marketing-artifact.storage.integration.test.ts
git add services/ai-runtime apps/api/src/modules/marketing apps/api/src/shared/config apps/api/src/server.ts infra .env.example CHANGELOG.md
git commit -m "feat(marketing): create governed visual assets"
```

### Task 6: Add deterministic quality review and digest-bound approval

**Files:**

- Create: `apps/api/src/modules/marketing/domain/services/marketing-quality-rules.ts`
- Create: `apps/api/src/modules/marketing/domain/services/marketing-quality-rules.test.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-package.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-package.service.test.ts`
- Modify: `apps/api/src/modules/agentic/domain/entities/approval-request.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/approval.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/approval.service.test.ts`
- Modify: `apps/api/src/modules/agentic/application/dtos/responses/agentic-console.dto.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/agentic-console.service.test.ts`
- Modify: `apps/api/src/modules/marketing/index.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing quality/approval tests**

Deterministically require nonempty copy, CTA, alt text, one PNG, approved Page
configuration, future schedule, no prohibited claim, source binding, Facebook
length/media limits, and matching content/image digests. Test that package
creation requests `social_publication` approval and that approving an old
package cannot schedule a new version.

The parameters digest must be canonical SHA-256 of:

```ts
{
  campaignId, packageVersion, contentVersion, visualVersion,
  facebookPageConfigurationId, scheduledFor,
  contentDigest, imageDigest, packageDigest,
  configurationRevisionId, policyVersion
}
```

**Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/domain/services/marketing-quality-rules.test.ts \
  src/modules/marketing/application/services/implementations/marketing-package.service.test.ts \
  src/modules/agentic/application/services/implementations/approval.service.test.ts
```

**Step 3: Implement approval binding**

Add `social_publication` to `ApproverScope` through a new migration/check update.
Use an Agentic application port that creates/reads approval without exposing
its repository. `marketing_publisher` may request approval; only staff role
`agentic_approver` or administrator may decide. Rejection terminates the
package; revision request returns to the precise failed owner. Any package-
affecting edit marks the prior approval superseded.

**Step 4: Run GREEN and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/domain/services/marketing-quality-rules.test.ts \
  src/modules/marketing/application/services/implementations/marketing-package.service.test.ts \
  src/modules/agentic/application/services/implementations/approval.service.test.ts
git add apps/api/src/modules/marketing apps/api/src/modules/agentic CHANGELOG.md
git commit -m "feat(marketing): bind publication approval to exact package"
```

### Task 7: Implement versioned durable Marketing workflow

**Files:**

- Create: `services/ai-runtime/app/marketing/domain/contracts.py`
- Create: `services/ai-runtime/app/marketing/activities/marketing_activities.py`
- Create: `services/ai-runtime/app/marketing/workflows/facebook_publication_v1.py`
- Create: `services/ai-runtime/tests/marketing/workflows/test_facebook_publication_v1.py`
- Create: `services/ai-runtime/tests/marketing/workflows/test_facebook_publication_replay.py`
- Modify: `services/ai-runtime/app/agentic/worker.py`
- Modify: `services/ai-runtime/app/agentic/infrastructure/temporal_client.py`
- Modify: `apps/api/src/modules/agentic/application/workflows/interfaces/workflow-gateway.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/workflows/http-workflow.gateway.ts`
- Modify: `apps/api/src/modules/agentic/infrastructure/workflows/http-workflow.gateway.test.ts`
- Create: `apps/api/src/modules/marketing/application/workflows/interfaces/marketing-workflow.gateway.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-workflow.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-workflow.service.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing workflow tests**

Cover the full sequence, direct and CEO source metadata, approval wait/signal,
rejection, revision, two correction rounds, cancellation at every await,
schedule using Temporal timers rather than process sleeps, missed schedule,
model/image retries, reporting retry, and hard-stop recovery. Assert Temporal
history contains references/digests only.

**Step 2: Run RED**

```bash
pnpm test:py -- tests/marketing/workflows
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/application/services/implementations/marketing-workflow.service.test.ts \
  src/modules/agentic/infrastructure/workflows/http-workflow.gateway.test.ts
```

**Step 3: Implement `MarketingFacebookPublicationWorkflowV1`**

Register it alongside the unchanged Store Health workflow. Use a distinct task
queue or explicit workflow name routing without replacing existing histories.
Every activity must reserve and settle through an API-owned idempotency record.
Use named Temporal patch boundaries for future-compatible changes. Signals
carry approval/cancellation IDs, versions, and digests only.

**Step 4: Run GREEN, replay, and commit**

```bash
pnpm test:py -- tests/marketing/workflows
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/application/services/implementations/marketing-workflow.service.test.ts \
  src/modules/agentic/infrastructure/workflows/http-workflow.gateway.test.ts
git add services/ai-runtime apps/api/src/modules/marketing apps/api/src/modules/agentic CHANGELOG.md
git commit -m "feat(marketing): orchestrate durable publication workflow"
```

### Task 8: Add platform-neutral publisher and Facebook Graph adapter

**Files:**

- Create: `apps/api/src/modules/marketing/application/publishing/social-publisher.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-publication.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-publication.service.test.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/publishing/facebook-page.publisher.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/publishing/facebook-page.publisher.test.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/publishing/fixed-social-publisher.registry.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/publishing/fixed-social-publisher.registry.test.ts`
- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `.env.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/.env.production.example`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `CHANGELOG.md`

**Step 1: Write failing port and adapter tests**

Use framework-neutral contracts:

```ts
export interface ApprovedSocialPublication {
  readonly platform: "facebook";
  readonly attemptKey: string;
  readonly pageConfigurationId: string;
  readonly message: string;
  readonly image: NodeJS.ReadableStream;
  readonly imageDigest: string;
  readonly packageDigest: string;
}

export interface PublishReceipt {
  readonly externalPostId: string;
  readonly providerReceiptDigest: string;
  readonly acceptedAt: string;
}
```

Assert correct versioned URL and Page binding, token only in authorization
transport, safe multipart upload, bounded timeout/response, redacted Meta
errors, rate-limit classification, no logging of token/body, and verification
GET that confirms post ID, Page ID, message digest, and attached image evidence.

Test adapter substitutability using a fake second registry entry in the test;
do not implement Instagram.

**Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/application/services/implementations/marketing-publication.service.test.ts \
  src/modules/marketing/infrastructure/publishing/facebook-page.publisher.test.ts \
  src/modules/marketing/infrastructure/publishing/fixed-social-publisher.registry.test.ts
```

**Step 3: Implement fail-closed Facebook publication**

Use built-in `fetch`; add no Facebook SDK. Validate:

```text
META_GRAPH_API_BASE_URL=https://graph.facebook.com
META_GRAPH_API_VERSION=<explicit supported version>
META_FACEBOOK_PAGE_ID=<owned Page ID>
META_FACEBOOK_PAGE_ACCESS_TOKEN=<secret>
META_FACEBOOK_PUBLICATION_ENABLED=false
```

Production requires the official HTTPS host and an explicit supported version.
Configuration exposes a Page configuration ID derived from safe metadata, not
the token. Claim the package in PostgreSQL before I/O. If timeout occurs after
transmission, store `publication_unknown` and run verification/reconciliation;
never immediately repeat the POST. A verified duplicate response returns the
existing record.

**Step 4: Run GREEN and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/application/services/implementations/marketing-publication.service.test.ts \
  src/modules/marketing/infrastructure/publishing/facebook-page.publisher.test.ts \
  src/modules/marketing/infrastructure/publishing/fixed-social-publisher.registry.test.ts
git add apps/api/src/modules/marketing apps/api/src/shared/config apps/api/src/server.ts infra .env.example CHANGELOG.md
git commit -m "feat(marketing): publish approved facebook packages"
```

### Task 9: Generate immutable DOCX, XLSX, and PDF handoff artifacts

**Files:**

- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/modules/marketing/application/reporting/marketing-report.renderer.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/reporting/openxml-marketing-report.renderer.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/reporting/openxml-marketing-report.renderer.test.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-report.service.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/marketing-report.service.test.ts`
- Modify: `apps/api/src/modules/marketing/presentation/controllers/marketing.controller.ts`
- Modify: `apps/api/src/modules/marketing/presentation/routes/marketing.routes.ts`
- Modify: `apps/api/src/modules/marketing/tests/marketing.api.test.ts`
- Modify: `docs/dependencies.md`
- Modify: `CHANGELOG.md`

**Step 1: Add dependencies and record them**

```bash
pnpm --filter @opendx/api add docx exceljs pdf-lib
```

Record exact resolved versions, licenses, purpose, and owning infrastructure
adapter in `docs/dependencies.md`. Do not expose library types through the
application port.

**Step 2: Write failing deterministic renderer tests**

Freeze clock and metadata. Assert ZIP signatures for DOCX/XLSX, PDF signature,
required headings/cells, escaped untrusted text, no token/object key/raw prompt,
stable logical content digest, bounded file sizes, and the five artifact names:

```text
campaign-brief.docx
facebook-content.docx
facebook-visual.png
facebook-publication-log.xlsx
marketing-final-report.pdf
```

**Step 3: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/infrastructure/reporting/openxml-marketing-report.renderer.test.ts \
  src/modules/marketing/application/services/implementations/marketing-report.service.test.ts \
  src/modules/marketing/tests/marketing.api.test.ts
```

**Step 4: Implement rendering and authorized download**

Render from authoritative DTOs after verified publication. Write bytes to
private MinIO first, then settle immutable artifact metadata with SHA-256;
delete the object if metadata settlement fails. Exact retry checks stored
digest before rendering. Expose:

```text
GET /v1/admin/marketing/campaigns/:campaignId/artifacts
GET /v1/admin/marketing/campaigns/:campaignId/artifacts/:artifactId/content
```

Stream authorized bytes with safe filename/content type; never presign or
return an object key. `completed` is unavailable until all five artifacts pass
digest verification.

**Step 5: Run GREEN and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/infrastructure/reporting/openxml-marketing-report.renderer.test.ts \
  src/modules/marketing/application/services/implementations/marketing-report.service.test.ts \
  src/modules/marketing/tests/marketing.api.test.ts
git add apps/api/package.json pnpm-lock.yaml apps/api/src/modules/marketing docs/dependencies.md CHANGELOG.md
git commit -m "feat(marketing): generate publication handoff artifacts"
```

### Task 10: Add AI CEO-to-Marketing handoff without changing the workflow

**Files:**

- Create: `apps/api/src/modules/marketing/application/handoffs/marketing-handoff.port.ts`
- Create: `apps/api/src/modules/marketing/application/handoffs/marketing-handoff.service.ts`
- Create: `apps/api/src/modules/marketing/application/handoffs/marketing-handoff.service.test.ts`
- Modify: `apps/api/src/modules/agentic/domain/entities/orchestration-execution-descriptor.ts`
- Modify: `apps/api/src/modules/agentic/domain/services/ai-ceo-orchestration-rules.ts`
- Modify: `apps/api/src/modules/agentic/domain/services/ai-ceo-orchestration-rules.test.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.ts`
- Modify: `apps/api/src/modules/agentic/application/services/implementations/orchestration.service.test.ts`
- Modify: `services/ai-runtime/app/agentic/domain/orchestration_schemas.py`
- Modify: `services/ai-runtime/app/agentic/application/planning_quality_gate.py`
- Modify: `services/ai-runtime/tests/agentic/application/test_planning_quality_gate.py`
- Modify: `services/ai-runtime/app/agentic/application/orchestration.py`
- Modify: `services/ai-runtime/tests/agentic/application/test_department_execution.py`
- Modify: `CHANGELOG.md`

**Step 1: Write failing handoff tests**

Add a bounded CEO proposal kind `marketing_facebook_publication` whose owner is
`marketing_publisher`. Assert policy eligibility, exact brief fields,
provenance, no Facebook credential/tool grant to CEO, and no attempt to run the
Marketing content/image work inside the Store Health workflow.

Test direct and CEO handoffs produce the same canonical `CampaignBrief` and
start `MarketingFacebookPublicationWorkflowV1`; only `assignmentMode`, source
task ID, and handoff provenance differ.

**Step 2: Run RED**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/application/handoffs/marketing-handoff.service.test.ts \
  src/modules/agentic/domain/services/ai-ceo-orchestration-rules.test.ts \
  src/modules/agentic/application/services/implementations/orchestration.service.test.ts
pnpm test:py -- \
  tests/agentic/application/test_planning_quality_gate.py \
  tests/agentic/application/test_department_execution.py
```

**Step 3: Implement the mediated handoff**

Expose `MarketingHandoffPort` from `marketing/index.ts`. Agentic composition
injects it; Agentic does not import Marketing repositories. Extend CEO planning
only for the new task type and exact Department policy. The API creates the
campaign idempotently from accepted CEO output, then starts the same Marketing
workflow. Unsupported cross-Department requirements pause for staff rather
than silently creating another Department task.

**Step 4: Run GREEN and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/marketing/application/handoffs/marketing-handoff.service.test.ts \
  src/modules/agentic/domain/services/ai-ceo-orchestration-rules.test.ts \
  src/modules/agentic/application/services/implementations/orchestration.service.test.ts
pnpm test:py -- tests/agentic/application/test_planning_quality_gate.py tests/agentic/application/test_department_execution.py
git add apps/api/src/modules/marketing apps/api/src/modules/agentic services/ai-runtime CHANGELOG.md
git commit -m "feat(agentic): hand marketing work from ai ceo"
```

### Task 11: Build the Marketing Console journey

**Files:**

- Create: `apps/console/src/features/marketing/types/marketing.types.ts`
- Create: `apps/console/src/features/marketing/schemas/marketing-api.schema.ts`
- Create: `apps/console/src/features/marketing/api/marketing-api.ts`
- Create: `apps/console/src/features/marketing/hooks/use-marketing-campaigns.ts`
- Create: `apps/console/src/features/marketing/hooks/use-marketing-intake.ts`
- Create: `apps/console/src/features/marketing/hooks/use-marketing-campaign.ts`
- Create: `apps/console/src/features/marketing/components/marketing-intake-form.tsx`
- Create: `apps/console/src/features/marketing/components/marketing-workflow-timeline.tsx`
- Create: `apps/console/src/features/marketing/components/publication-package-preview.tsx`
- Create: `apps/console/src/features/marketing/components/marketing-artifact-list.tsx`
- Create: `apps/console/src/features/marketing/pages/marketing-campaigns-page.tsx`
- Create: `apps/console/src/features/marketing/pages/marketing-campaign-new-page.tsx`
- Create: `apps/console/src/features/marketing/pages/marketing-campaign-detail-page.tsx`
- Create: `apps/console/src/features/marketing/tests/marketing-campaign-new-page.test.tsx`
- Create: `apps/console/src/features/marketing/tests/marketing-campaign-detail-page.test.tsx`
- Create: `apps/console/src/features/marketing/index.ts`
- Create: `apps/console/src/features/marketing/styles/marketing.css`
- Modify: `apps/console/src/features/agentic/components/task-intake-form.tsx`
- Modify: `apps/console/src/features/agentic/components/approval-detail.tsx`
- Modify: `apps/console/src/features/agentic/tests/agentic-task-intake-page.test.tsx`
- Modify: `apps/console/src/features/agentic/tests/agentic-approvals-page.test.tsx`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/app/console-shell.test.tsx`
- Modify: `CHANGELOG.md`

**Step 1: Write failing user-journey tests**

Test selection between AI CEO and Direct Department, Marketing-only form,
validation/waiting states, three named employees, content/image preview,
digest-bound approval details, stale approval reload, publication unknown,
verified Post URL, artifact downloads, cancellation rules, denied roles,
keyboard focus, and no horizontal overflow assumptions.

**Step 2: Run RED**

```bash
VITEST_MAX_WORKERS=1 pnpm --filter @opendx/console exec vitest run \
  src/features/marketing/tests/marketing-campaign-new-page.test.tsx \
  src/features/marketing/tests/marketing-campaign-detail-page.test.tsx \
  src/features/agentic/tests/agentic-task-intake-page.test.tsx \
  src/features/agentic/tests/agentic-approvals-page.test.tsx \
  src/app/console-shell.test.tsx
```

**Step 3: Implement the focused operational UI**

Add routes:

```text
/marketing/campaigns
/marketing/campaigns/new
/marketing/campaigns/:campaignId
```

Validate every API envelope with Zod. Hooks own abort/retry/polling. Pages
compose existing `PageHeader`, `SystemState`, dialog, table, and status patterns.
Use semantic tokens, `#010102` canvas, scarce `#5e6ad2` accent, dense timeline,
and responsive stacking. Do not expose tokens, object keys, prompts, or raw
provider responses.

**Step 4: Run GREEN and commit**

```bash
VITEST_MAX_WORKERS=1 pnpm --filter @opendx/console exec vitest run \
  src/features/marketing/tests \
  src/features/agentic/tests/agentic-task-intake-page.test.tsx \
  src/features/agentic/tests/agentic-approvals-page.test.tsx \
  src/app/console-shell.test.tsx
pnpm --filter @opendx/console build
git add apps/console CHANGELOG.md
git commit -m "feat(console): operate marketing publication workflow"
```

### Task 12: Add deterministic lifecycle, browser, and live acceptance gates

**Files:**

- Create: `scripts/dev/marketing-facebook-lifecycle-check.mjs`
- Create: `scripts/dev/marketing-facebook-lifecycle-check.test.mjs`
- Create: `scripts/dev/marketing-facebook-browser-check.mjs`
- Create: `scripts/dev/marketing-facebook-browser-check.test.mjs`
- Create: `scripts/dev/marketing-facebook-live-acceptance.mjs`
- Create: `scripts/dev/marketing-facebook-live-acceptance.test.mjs`
- Create: `scripts/dev/marketing-facebook-exit-check.mjs`
- Create: `scripts/dev/marketing-facebook-exit-check.test.mjs`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: `scripts/dev/agentic-production-compose-check.mjs`
- Modify: `scripts/dev/agentic-production-compose-check.test.mjs`
- Create: `docs/api/marketing.md`
- Create: `docs/operations/marketing-facebook-publication.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/architecture/agentic-workflow-runtime.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: Write failing static gate tests**

Assert the lifecycle gate uses fake OpenRouter/Image/Facebook servers, isolated
PostgreSQL/Temporal/MinIO resources, kills and replaces the worker after each
committed external boundary, replays history, and proves one content result,
one PNG, one approval, one verified publication, and one handoff bundle.

Browser acceptance must cover 390x844, 768x1024, and 1440x900, direct and CEO
intake, approval, revision, failure, verified completion, downloads, keyboard
focus, and a denied role before any Marketing API call.

Live acceptance must refuse to run unless:

```text
MARKETING_FACEBOOK_LIVE_CONFIRM=I_OWN_THIS_TEST_PAGE
META_FACEBOOK_PUBLICATION_ENABLED=true
```

It must never print/read back the token, must use a uniquely marked test post,
must verify the exact Page/Post and report bundle, must emit redacted evidence,
and must not delete the post automatically.

**Step 2: Run RED**

```bash
node --test \
  scripts/dev/marketing-facebook-lifecycle-check.test.mjs \
  scripts/dev/marketing-facebook-browser-check.test.mjs \
  scripts/dev/marketing-facebook-live-acceptance.test.mjs \
  scripts/dev/marketing-facebook-exit-check.test.mjs
```

**Step 3: Implement commands and documentation**

Add discoverable package commands and thin Make targets. Document Meta App/Page
prerequisites, required permissions, Graph API version rotation, token rotation,
test Page isolation, OpenRouter image model configuration, MinIO backup/restore,
failure codes, reconciliation, and explicit approval. Record that live
acceptance is owner-triggered and excluded from CI.

Update the roadmap only after deterministic exit evidence passes. Do not mark
live acceptance complete unless the owner-credential command actually ran.

**Step 4: Run focused exit gates**

```bash
pnpm check:marketing-facebook
pnpm check:marketing-facebook-browser
pnpm check:marketing-facebook-lifecycle
pnpm check:agentic-phase-f-orchestration
pnpm check:agentic-phase-g-exit
VITEST_MAX_WORKERS=1 pnpm check
git diff --check
pnpm audit:repo
```

Expected: every deterministic Marketing and unchanged Agentic gate passes. The
two previously observed Console baseline tests must be green here.

**Step 5: Run optional owner-credential acceptance**

```bash
MARKETING_FACEBOOK_LIVE_CONFIRM=I_OWN_THIS_TEST_PAGE \
pnpm run:marketing-facebook-live-acceptance
```

Expected: one redacted evidence file with Campaign ID, package/publication
digests, Page/Post IDs, URL, artifact digests, approval ID, costs, and terminal
state only. If prerequisites are absent, record `not run` honestly; never fake
or substitute the evidence.

**Step 6: Commit closure**

```bash
git add scripts package.json Makefile docs README.md CHANGELOG.md
git commit -m "test(marketing): verify facebook publication lifecycle"
```

## Final Review Checklist

- [ ] Only Marketing & Creative and Facebook image posts were implemented.
- [ ] Three Digital Employees use distinct identities, scopes, models, budgets,
      audit, and revocation.
- [ ] Direct assignment bypasses AI CEO planning but not policy or approval.
- [ ] AI CEO handoff enters the same versioned Marketing workflow.
- [ ] No LLM decides authorization, approval, price, promotion, Page, or retry
      safety.
- [ ] Facebook credentials exist only behind the API connector boundary.
- [ ] Approval binds exact copy, image, Page, schedule, policy, and configuration.
- [ ] An ambiguous timeout cannot produce a blind duplicate publication.
- [ ] PostgreSQL remains authoritative and MinIO artifacts remain private.
- [ ] DOCX/XLSX/PDF generators are outward adapters with documented dependencies.
- [ ] Every completion has verified Post ID/URL, artifacts, audit, provenance,
      approval, and settled cost.
- [ ] Existing Store Health histories replay and current Agentic gates remain
      unchanged.
- [ ] `git diff --check` and `pnpm audit:repo` pass.
