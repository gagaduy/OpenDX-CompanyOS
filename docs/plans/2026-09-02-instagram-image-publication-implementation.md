<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Governed Instagram Image Publication Implementation Plan

**Goal:** Extend the existing Marketing campaign workflow to prepare, approve, simulate, schedule, publish, verify, and retry Instagram Feed images, Stories, and image carousels alongside Facebook without accepting browser-supplied credentials or claiming that simulated posts are live.

**Architecture:** Keep campaign, approval, publication, artifacts, and reporting inside the existing `marketing` module. Introduce immutable target records beneath each publication package, a platform-neutral publisher port and registry, target-level PostgreSQL claims/attempts/receipts, typed fail-closed configuration, and purpose-specific API/Console view models; infrastructure remains the only layer that knows Meta request shapes or credentials.

**Tech Stack:** TypeScript, Node.js, Express, Zod, PostgreSQL, node-pg-migrate, Vitest, React, React Router, Vite, Docker Compose, MinIO, existing DOCX/XLSX/PDF generators.

---

## Delivery invariants

- Work only in `/home/nguyenphuong/Documents/OLP_Demo/.worktrees/instagram-image-publication` on `feat/instagram-image-publication`.
- Follow red-green-refactor for every behavior task. Never change the historical `202608290001_create_marketing_facebook_publication.ts` migration.
- Keep one immutable package approval for the ordered set of exact targets. Any target caption, media order, account reference, format, execution mode, or schedule change creates a new package and invalidates the prior approval.
- Never accept an access token in an HTTP request, return one in a DTO, store one in PostgreSQL, include one in a prompt, or log one.
- Local Instagram execution is `simulation`; every simulation response, artifact, and Console surface must say `Local simulation - not published to Instagram`.
- `feed_video`, `story_video`, and `reel_video` remain visible only as disabled capabilities. The backend returns `FORMAT_NOT_ENABLED` if a client submits one.
- A successful target is never submitted again. An `unknown` target must reconcile before it can be retried.
- Use UTC ISO-8601 timestamps at boundaries and an injected clock in domain/application tests.
- Update `CHANGELOG.md` under `[Unreleased]` in each implementation commit that changes repository behavior.

### Task 1: Add platform-neutral target entities, capability policy, and immutable digests

**Files:**
- Modify: `apps/api/src/modules/marketing/domain/entities/marketing-campaign.ts`
- Create: `apps/api/src/modules/marketing/domain/services/marketing-publication-policy.ts`
- Create: `apps/api/src/modules/marketing/domain/services/marketing-publication-policy.test.ts`
- Modify: `apps/api/src/modules/marketing/domain/services/marketing-campaign-rules.ts`
- Modify: `apps/api/src/modules/marketing/domain/services/marketing-campaign-rules.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing policy and digest tests**

Add tests that construct two ordered Instagram carousel assets and assert:

```ts
it("binds account, format, schedule, execution mode, caption, and media order", () => {
  const first = buildTarget({ mediaAssetIds: ["asset-a", "asset-b"] });
  const reordered = buildTarget({ mediaAssetIds: ["asset-b", "asset-a"] });
  expect(calculatePublicationTargetDigest(first)).not.toBe(
    calculatePublicationTargetDigest(reordered),
  );
});

it.each(["feed_video", "story_video", "reel_video"] as const)(
  "rejects disabled format %s",
  (format) => {
    expect(() => assertFormatEnabled("instagram", format)).toThrowError(
      expect.objectContaining({ code: "FORMAT_NOT_ENABLED" }),
    );
  },
);

it("invalidates approval when any target changes", () => {
  const approved = buildPackage([buildTarget({ caption: "A" })]);
  const revised = buildPackage([buildTarget({ caption: "B" })]);
  expect(isApprovalInvalidatedByPackageChange(approved, revised)).toBe(true);
});
```

Also update completion tests so a campaign with one verified Facebook target and one failed Instagram target derives `partial_failure`, not `completed` and not a Facebook republish.

**Step 2: Run the tests and confirm RED**

Run:

```bash
pnpm --filter @opendx/api test -- src/modules/marketing/domain/services/marketing-publication-policy.test.ts src/modules/marketing/domain/services/marketing-campaign-rules.test.ts
```

Expected: failure because the target types and policy functions do not exist.

**Step 3: Add the minimal domain model**

Define these values in `marketing-campaign.ts` and replace package-level attempt/record ownership with target ownership while retaining legacy package fields as nullable read compatibility fields:

```ts
export type SocialPlatform = "facebook" | "instagram";
export type PublicationExecutionMode = "live" | "simulation";
export type PublicationFormat =
  | "feed_image"
  | "story_image"
  | "image_carousel"
  | "feed_video"
  | "story_video"
  | "reel_video";
export type PublicationTargetStatus =
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "claimed"
  | "publishing"
  | "publication_unknown"
  | "verified"
  | "platform_rejected"
  | "failed";

export interface PublicationTarget {
  readonly id: string;
  readonly packageId: string;
  readonly platform: SocialPlatform;
  readonly format: PublicationFormat;
  readonly accountConfigurationId: string;
  readonly contentVersionId: string;
  readonly mediaAssetIds: readonly string[];
  readonly caption: string;
  readonly scheduledFor: string;
  readonly required: boolean;
  readonly executionMode: PublicationExecutionMode;
  readonly contentDigest: string;
  readonly mediaDigest: string;
  readonly targetDigest: string;
  readonly status: PublicationTargetStatus;
  readonly leaseOwner?: string | null;
  readonly leaseExpiresAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

Add `targetId` to `PublicationAttempt` and `PublicationRecord`; add `executionMode`, `simulated`, bounded provider IDs/evidence, and retain `packageId` for traceability. Add campaign aggregate state `partial_failure`.

In `marketing-publication-policy.ts`, export a frozen capability list, image constraints, canonical JSON digest helpers, `assertFormatEnabled`, `calculatePublicationTargetDigest`, `calculatePublicationPackageDigest`, and aggregate status derivation. Use `node:crypto`; sort object keys and preserve target/media array order.

**Step 4: Make rules tests GREEN**

Run the Task 1 test command. Expected: all selected tests pass.

**Step 5: Record and commit the domain unit**

Add a concise `[Unreleased]` entry, then run `git diff --check` and commit:

```bash
git add apps/api/src/modules/marketing/domain CHANGELOG.md
git commit -m "feat(marketing): model governed publication targets"
```

### Task 2: Add the forward migration and target-level repository contract

**Files:**
- Create: `apps/api/src/modules/marketing/infrastructure/database/migrations/202609020001_add_marketing_publication_targets.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/database/marketing-migration.integration.test.ts`
- Modify: `apps/api/src/modules/marketing/application/repositories/interfaces/marketing.repository.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/repositories/implementations/postgresql-marketing.repository.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/repositories/implementations/postgresql-marketing.repository.integration.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing migration lifecycle tests**

Extend the migration integration suite to:

1. migrate the original schema;
2. insert a Facebook package, attempt, and record;
3. migrate forward;
4. assert exactly one backfilled `facebook/feed_image/live` target and preserved historical attempt/record linkage;
5. roll the new migration down and assert the original rows remain readable;
6. migrate up again to prove idempotent lifecycle behavior.

The core assertion must be explicit:

```ts
expect(target.rows).toEqual([
  expect.objectContaining({
    package_id: legacyPackageId,
    platform: "facebook",
    format: "feed_image",
    execution_mode: "live",
    status: "verified",
  }),
]);
expect(attempt.rows[0]?.target_id).toBe(target.rows[0]?.id);
expect(record.rows[0]?.target_id).toBe(target.rows[0]?.id);
```

**Step 2: Confirm migration tests are RED**

Run:

```bash
pnpm --filter @opendx/api test:integration -- src/modules/marketing/infrastructure/database/marketing-migration.integration.test.ts
```

Expected: failure because the migration and target table are absent.

**Step 3: Implement the additive migration**

Create `marketing_publication_targets` with UUID primary key, package foreign key, platform/format/execution/status checks, ordered `media_asset_ids uuid[]`, digests, required flag, lease fields, timestamps, and a unique `(package_id, target_digest)` constraint. Add nullable `target_id` columns to attempts and records, backfill them transactionally, then make them non-null after backfill. Replace package-only uniqueness with target-level uniqueness; do not drop legacy package columns.

Create indexes for `(status, scheduled_for)`, `lease_expires_at`, `package_id`, and target attempts. The down migration restores old constraints before dropping target foreign keys/table and must abort with a descriptive error if new multi-target data cannot be represented by the legacy schema.

**Step 4: Write failing repository contract tests**

Add tests for:

```ts
await repository.createPublicationTargets([facebookTarget, instagramTarget]);
expect(await repository.findPublicationTargetsByPackageId(packageId)).toEqual([
  facebookTarget,
  instagramTarget,
]);

const claims = await Promise.all([
  repository.claimDuePublicationTargets({ workerId: "worker-a", now, leaseSeconds: 30, limit: 10 }),
  repository.claimDuePublicationTargets({ workerId: "worker-b", now, leaseSeconds: 30, limit: 10 }),
]);
expect(claims.flat().filter(({ id }) => id === instagramTarget.id)).toHaveLength(1);
```

**Step 5: Implement repository methods with PostgreSQL locking**

Add focused methods:

```ts
createPublicationTargets(targets: readonly PublicationTarget[]): Promise<readonly PublicationTarget[]>;
findPublicationTargetsByPackageId(packageId: string): Promise<readonly PublicationTarget[]>;
findPublicationTargetById(id: string): Promise<PublicationTarget | null>;
claimDuePublicationTargets(input: ClaimDueTargetsInput): Promise<readonly PublicationTarget[]>;
updatePublicationTargetStatus(input: UpdateTargetStatusInput): Promise<PublicationTarget>;
releasePublicationTargetLease(targetId: string, workerId: string): Promise<void>;
findPublicationAttemptsByTargetId(targetId: string): Promise<readonly PublicationAttempt[]>;
findPublicationRecordByTargetId(targetId: string): Promise<PublicationRecord | null>;
```

Implement claims as one transaction using `FOR UPDATE SKIP LOCKED`, status and due-time predicates, expired-lease recovery, an injected lease duration, and `RETURNING *`. Map nullable legacy fields defensively but never synthesize credentials or account IDs.

**Step 6: Run migration and repository suites**

Run:

```bash
pnpm --filter @opendx/api test:integration -- src/modules/marketing/infrastructure/database/marketing-migration.integration.test.ts src/modules/marketing/infrastructure/repositories/implementations/postgresql-marketing.repository.integration.test.ts
```

Expected: both files pass, including concurrent claims and down/up lifecycle.

**Step 7: Commit persistence changes**

```bash
git add apps/api/src/modules/marketing/infrastructure/database apps/api/src/modules/marketing/application/repositories apps/api/src/modules/marketing/infrastructure/repositories CHANGELOG.md
git commit -m "feat(marketing): persist publication targets"
```

### Task 3: Parse typed, fail-closed Marketing publication configuration

**Files:**
- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `.env.example`
- Modify: `infra/deploy/.env.production.example`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/deploy/compose.production.yml`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing environment tests**

Cover safe local defaults, live-mode rejection without every required field, numeric bounds, and secret non-exposure:

```ts
expect(parseEnvironment(baseEnv).marketing.instagram).toMatchObject({
  mode: "simulation",
  accountConfigurationId: "instagram-local-simulation",
});

expect(() => parseEnvironment({
  ...baseEnv,
  INSTAGRAM_PUBLICATION_MODE: "live",
  INSTAGRAM_ACCESS_TOKEN: "",
})).toThrow(/INSTAGRAM_ACCESS_TOKEN/);
```

Assert live Instagram also requires business account ID and an HTTPS public-media base URL. Assert `production + simulation` is rejected unless the affected platform is explicitly disabled.

**Step 2: Confirm RED**

Run:

```bash
pnpm --filter @opendx/api test -- src/shared/config/environment.test.ts
```

**Step 3: Add the typed configuration object**

Parse once into this application-facing shape:

```ts
interface MarketingPublicationEnvironment {
  readonly pollIntervalMs: number;
  readonly targetLeaseSeconds: number;
  readonly meta: { readonly graphBaseUrl: string; readonly requestTimeoutMs: number };
  readonly facebook: FacebookPublicationConfiguration;
  readonly instagram: InstagramPublicationConfiguration;
}
```

Use discriminated unions so `disabled`, `simulation`, and `live` have different required fields. Tokens exist only on the `live` infrastructure configuration. There must be no default token, production account ID, Graph API version, model ID, timeout, or poll interval in controllers/workers/adapters; defaults are defined once in the environment schema and documented.

Set local Compose to explicit Instagram simulation and remove the current Facebook fallback ID. Production Compose passes variables through without source-controlled secrets and keeps Instagram disabled by default.

**Step 4: Inject configuration from `server.ts`**

Pass `environment.marketing` into `createMarketingModule`. Do not read `process.env` below the composition boundary.

**Step 5: Verify and commit**

Run the focused environment test plus:

```bash
docker compose -f infra/docker/docker-compose.yml config --quiet
docker compose --env-file infra/deploy/.env.production.example -f infra/deploy/compose.production.yml config --quiet
pnpm audit:env
```

Then commit:

```bash
git add apps/api/src/shared/config apps/api/src/server.ts .env.example infra CHANGELOG.md
git commit -m "refactor(marketing): inject publication configuration"
```

### Task 4: Introduce the social publisher port, registry, Facebook wrapper, and truthful Instagram fake

**Files:**
- Create: `apps/api/src/modules/marketing/application/ports/social-publisher.port.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/social-publisher-registry.ts`
- Create: `apps/api/src/modules/marketing/application/services/implementations/social-publisher-registry.test.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/adapters/fake-instagram-publisher.adapter.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/adapters/fake-instagram-publisher.adapter.test.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-facebook-publisher.adapter.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/adapters/meta-graph-facebook-publisher.adapter.test.ts`
- Modify: `apps/api/src/modules/marketing/application/ports/facebook-publisher.port.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing port/registry/fake tests**

Test exact registry resolution, disabled format denial, no network activity in simulation, deterministic receipts, and truthful labels:

```ts
const receipt = await fake.publish(buildRequest({ format: "story_image" }));
expect(receipt).toMatchObject({
  platform: "instagram",
  executionMode: "simulation",
  simulated: true,
  displayMessage: "Local simulation - not published to Instagram",
});
expect(fetchSpy).not.toHaveBeenCalled();
```

Keep Facebook adapter regression tests and change their constructor to receive `graphBaseUrl`, timeout, page ID, and token through a live configuration object.

**Step 2: Confirm RED**

Run:

```bash
pnpm --filter @opendx/api test -- src/modules/marketing/application/services/implementations/social-publisher-registry.test.ts src/modules/marketing/infrastructure/adapters/fake-instagram-publisher.adapter.test.ts src/modules/marketing/infrastructure/adapters/meta-graph-facebook-publisher.adapter.test.ts
```

**Step 3: Define the inward-facing contract**

```ts
export interface SocialPublishRequest {
  readonly target: PublicationTarget;
  readonly caption: string;
  readonly media: readonly { id: string; bytes: Buffer; mimeType: "image/png"; fileName: string }[];
}

export interface SocialPublicationReceipt {
  readonly platform: SocialPlatform;
  readonly executionMode: PublicationExecutionMode;
  readonly simulated: boolean;
  readonly externalPublicationId: string;
  readonly publicationUrl?: string | null;
  readonly providerReceiptDigest: string;
  readonly verificationEvidenceDigest: string;
  readonly verifiedAt: string;
  readonly displayMessage: string;
}

export interface SocialPublisherPort {
  readonly platform: SocialPlatform;
  readonly executionMode: PublicationExecutionMode;
  publish(request: SocialPublishRequest): Promise<SocialPublicationReceipt>;
  reconcile(request: SocialReconciliationRequest): Promise<SocialReconciliationResult>;
}
```

Use one bounded `SocialPublisherError` with `code`, `classification`, `retryable`, and `outcomeKnown`. The registry keys adapters by `(platform, executionMode)` and fails closed when no exact adapter exists.

**Step 4: Implement adapters**

The fake Instagram adapter supports only the three approved image formats, hashes the target request into stable simulation IDs, and never imports/calls `fetch`. Adapt the existing Facebook implementation behind `SocialPublisherPort`; its concrete Meta URL and credential knowledge remain infrastructure-only. Keep the old port only as a private migration seam if required by one commit, then remove all application imports before Task 6 completes.

**Step 5: Verify and commit**

Run Task 4 tests and commit:

```bash
git add apps/api/src/modules/marketing/application/ports apps/api/src/modules/marketing/application/services/implementations apps/api/src/modules/marketing/infrastructure/adapters CHANGELOG.md
git commit -m "feat(marketing): add social publisher adapters"
```

### Task 5: Assemble multi-target campaign revisions and approval packages

**Files:**
- Modify: `apps/api/src/modules/marketing/application/dtos/marketing.dto.ts`
- Modify: `apps/api/src/modules/marketing/application/services/interfaces/marketing-campaign.service.ts`
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-campaign.service.ts`
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-campaign.service.test.ts`
- Modify: `apps/api/src/modules/marketing/marketing.module.ts`
- Modify: `CHANGELOG.md`

**Step 1: Replace Facebook-only fixture input with explicit targets**

Write failing tests around this contract:

```ts
targets: [
  { platform: "facebook", format: "feed_image", accountConfigurationId: "fb-page-config", required: true },
  { platform: "instagram", format: "feed_image", accountConfigurationId: "ig-config", required: true },
  { platform: "instagram", format: "story_image", accountConfigurationId: "ig-config", required: true },
  { platform: "instagram", format: "image_carousel", accountConfigurationId: "ig-config", required: true },
]
```

Assert one package is produced with four ordered targets, platform-specific content/assets satisfy policy, package digest changes on any target mutation, idempotency compares the complete normalized input, and video input returns `FORMAT_NOT_ENABLED`.

Add a regression test proving `approveCampaign` never publishes synchronously and never accepts a token.

**Step 2: Confirm RED**

```bash
pnpm --filter @opendx/api test -- src/modules/marketing/application/services/implementations/marketing-campaign.service.test.ts
```

**Step 3: Implement explicit target assembly**

Replace `facebookPageConfigurationId` in create input with non-empty `targets[]`. Generate/persist purpose-specific content and visual variants:

- Feed image: one policy-valid square image.
- Story image: one policy-valid 9:16 image.
- Carousel: 2–10 ordered square images.
- Facebook existing behavior: one feed image target.

Make `VisualAsset.aspectRatio` a validated image ratio union and persist exact width/height/MIME/bytes/digest/alt text/storage key/model provenance/cost. Compute each target digest and then the package digest. Approval updates the package and targets only; the worker owns due publication.

Extract the touched OpenRouter endpoint/model/prompt and image materialization dependencies from direct environment access into injected application ports/configuration. Preserve current generated output behavior with characterization tests; do not broaden this cleanup beyond the Marketing revision path.

**Step 4: Return purpose-specific detail DTOs**

`MarketingCampaignDetailResponseDto` must expose `targets`, target attempts, target records, capabilities, execution mode, `simulated`, and safe verification evidence. It must never expose credentials or raw provider payloads. Legacy Facebook records map into the same DTO.

**Step 5: Verify and commit**

Run Task 5 tests, `pnpm --filter @opendx/api typecheck`, then:

```bash
git add apps/api/src/modules/marketing/application apps/api/src/modules/marketing/marketing.module.ts CHANGELOG.md
git commit -m "feat(marketing): assemble multi-platform approval packages"
```

### Task 6: Execute, reconcile, and retry one publication target at a time

**Files:**
- Modify: `apps/api/src/modules/marketing/application/services/interfaces/marketing-publisher.service.ts`
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-publisher.service.ts`
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-publisher.service.test.ts`
- Modify: `apps/api/src/modules/marketing/presentation/middleware/marketing-error.middleware.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing application tests**

Cover:

- exact target adapter resolution;
- all media read from private storage in declared order;
- verified target creates one record and cannot publish twice;
- Facebook success plus Instagram failure derives partial failure and retrying Instagram does not call Facebook;
- unknown result invokes reconciliation before any resubmission;
- retryable error records bounded evidence and releases/advances the lease;
- simulation record remains visibly simulated;
- missing storage, adapter, or configuration fails before provider invocation.

The no-duplicate assertion must use independent spies:

```ts
await service.publishClaimedTarget(facebookClaim);
await expect(service.publishClaimedTarget(instagramClaim)).rejects.toMatchObject({
  code: "SIMULATED_TRANSIENT_FAILURE",
});
await service.retryTarget({ actorId: approverId, campaignId, targetId: instagramTargetId });
expect(facebookPublisher.publish).toHaveBeenCalledTimes(1);
expect(instagramPublisher.publish).toHaveBeenCalledTimes(2);
```

**Step 2: Confirm RED**

```bash
pnpm --filter @opendx/api test -- src/modules/marketing/application/services/implementations/marketing-publisher.service.test.ts
```

**Step 3: Implement target execution**

Use these application operations:

```ts
publishClaimedTarget(input: { targetId: string; workerId: string }): Promise<PublicationRecord>;
reconcileTarget(input: { targetId: string; workerId: string }): Promise<PublicationRecord | null>;
retryTarget(input: { actorId: string; campaignId: string; targetId: string }): Promise<PublicationTarget>;
```

Load and verify target/package/approval binding, confirm the lease owner, read media, resolve the registry, create an attempt before the external action, persist a bounded result, and derive aggregate campaign state after every terminal target change. Use an injected clock/ID generator. Do not sleep inside the service; store next-attempt timing in state and let the worker poll.

Map `outcomeKnown: false` to `publication_unknown`; only `reconcileTarget` may move it to verified or retryable. Make idempotency rely on target record uniqueness and the provider receipt/external ID, not in-memory state.

**Step 4: Verify and commit**

Run Task 6 tests and commit:

```bash
git add apps/api/src/modules/marketing/application/services apps/api/src/modules/marketing/presentation/middleware CHANGELOG.md
git commit -m "feat(marketing): publish and retry individual targets"
```

### Task 7: Replace campaign polling with leased due-target scheduling

**Files:**
- Modify: `apps/api/src/modules/marketing/infrastructure/workers/marketing-publisher.worker.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/workers/marketing-publisher.worker.test.ts`
- Modify: `apps/api/src/modules/marketing/marketing.module.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing worker tests**

Assert the worker claims due targets, skips future/unapproved/verified targets, reconciles unknown targets, survives one target failure, and passes no account ID/token:

```ts
await worker.tick();
expect(repository.claimDuePublicationTargets).toHaveBeenCalledWith({
  workerId: "marketing-publisher-1",
  now: fixedNow,
  leaseSeconds: 30,
  limit: 25,
});
expect(publisher.publishClaimedTarget).toHaveBeenCalledWith({
  targetId: instagramTargetId,
  workerId: "marketing-publisher-1",
});
```

Add a two-worker integration assertion in Task 2's repository suite if it is not already present.

**Step 2: Confirm RED**

```bash
pnpm --filter @opendx/api test -- src/modules/marketing/infrastructure/workers/marketing-publisher.worker.test.ts
```

**Step 3: Implement the configured worker**

Inject worker ID, poll interval, lease seconds, batch size, clock, repository, and publisher service. `tick()` performs one bounded batch; `start()` schedules future ticks without overlapping a running tick; `stop()` clears the timer. Remove the current `FACEBOOK_PAGE_ACCESS_TOKEN`, fallback page ID, `5_000`, and campaign-list scan.

Wire the registry and worker in `marketing.module.ts`. Disabled/live-invalid platform configuration must not silently compose a fake live adapter.

**Step 4: Verify and commit**

Run worker tests plus `pnpm --filter @opendx/api typecheck`, then commit:

```bash
git add apps/api/src/modules/marketing/infrastructure/workers apps/api/src/modules/marketing/marketing.module.ts apps/api/src/server.ts CHANGELOG.md
git commit -m "feat(marketing): schedule leased publication targets"
```

### Task 8: Add validated capabilities and target retry API contracts

**Files:**
- Modify: `apps/api/src/modules/marketing/presentation/validators/marketing.validator.ts`
- Modify: `apps/api/src/modules/marketing/presentation/controllers/marketing.controller.ts`
- Modify: `apps/api/src/modules/marketing/presentation/routes/marketing.routes.ts`
- Modify: `apps/api/src/modules/marketing/tests/marketing.api.test.ts`
- Modify: `apps/api/src/modules/marketing/tests/marketing-e2e-workflow.integration.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing API tests**

Add tests for:

- `GET /admin/marketing/capabilities` returns enabled image and disabled video capabilities from backend policy;
- create accepts validated `targets[]` and rejects empty, duplicate, invalid carousel, and every video format;
- approve request rejects any `facebookPageAccessToken` key because schemas are strict;
- `POST /campaigns/:campaignId/targets/:targetId/retry` requires an approver role and cannot retry another campaign's target;
- operator/viewer/auditor cannot approve, publish, reconcile, or retry;
- approval returns before scheduled execution and one approval binds every target;
- detail contains per-target attempts/records and truthful simulation metadata.

Example boundary test:

```ts
await request(app)
  .post(`/admin/marketing/campaigns/${campaignId}/approve`)
  .set(authHeader(approver))
  .send({ decision: "approve", facebookPageAccessToken: "must-not-enter-api" })
  .expect(400);
expect(publisher.publish).not.toHaveBeenCalled();
```

**Step 2: Confirm RED**

```bash
pnpm --filter @opendx/api test -- src/modules/marketing/tests/marketing.api.test.ts
```

**Step 3: Implement thin transport changes**

Use strict Zod schemas. Add `targets[]` with discriminated platform/format validation and UUID/path validation. Remove token parsing and all `process.env` access from the controller. Add `getCapabilities` and target-specific `retryPublication`; controller methods only validate, authorize through route middleware, invoke application services, and map results.

Keep approval on approver roles and retry on approver roles. Worker publication remains workload-owned; do not add a browser endpoint that forces an unapproved provider call.

**Step 4: Run API unit and E2E integration tests**

```bash
pnpm --filter @opendx/api test -- src/modules/marketing/tests/marketing.api.test.ts
pnpm --filter @opendx/api test:integration -- src/modules/marketing/tests/marketing-e2e-workflow.integration.test.ts
```

Expected: create → assets → one approval → due claims → Facebook result plus simulated Instagram Feed/Story/carousel receipts passes with no Meta call for Instagram.

**Step 5: Commit the API unit**

```bash
git add apps/api/src/modules/marketing/presentation apps/api/src/modules/marketing/tests CHANGELOG.md
git commit -m "feat(marketing): expose publication target APIs"
```

### Task 9: Make deliverables platform-neutral and simulation-truthful

**Files:**
- Modify: `apps/api/src/modules/marketing/domain/entities/marketing-campaign.ts`
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-artifact.service.ts`
- Modify: `apps/api/src/modules/marketing/application/services/implementations/marketing-artifact.service.test.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/generators/social-content-docx.generator.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/generators/social-visual-png.generator.ts`
- Create: `apps/api/src/modules/marketing/infrastructure/generators/social-publication-log-xlsx.generator.ts`
- Modify: `apps/api/src/modules/marketing/infrastructure/generators/marketing-final-report-pdf.generator.ts`
- Modify: `apps/api/src/modules/marketing/marketing.module.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write failing artifact tests**

For a new mixed campaign, assert platform-neutral artifact kinds, all targets in the log/report, target digest/account reference/execution mode evidence, and the exact simulation label. Keep a regression fixture proving legacy `facebook_*` artifacts remain listable/downloadable.

Assert the final report cannot contain the unqualified word/status `published` for a simulation receipt; it must render `Simulated` and the exact local label.

**Step 2: Confirm RED**

```bash
pnpm --filter @opendx/api test -- src/modules/marketing/application/services/implementations/marketing-artifact.service.test.ts
```

**Step 3: Add new artifact kinds without rewriting history**

Add `social_content_docx`, `social_visual_png`, and `social_publication_log_xlsx` for new packages. Keep old enum values readable. Generate one ordered target section per artifact and include approval/package/target digests, execution mode, simulation flag, bounded receipt evidence, attempts, and final aggregate state.

**Step 4: Verify and commit**

Run artifact tests and commit:

```bash
git add apps/api/src/modules/marketing/domain apps/api/src/modules/marketing/application/services/implementations/marketing-artifact.service* apps/api/src/modules/marketing/infrastructure/generators apps/api/src/modules/marketing/marketing.module.ts CHANGELOG.md
git commit -m "feat(marketing): report social publication evidence"
```

### Task 10: Validate Marketing API data and add frontend transport contracts

**Files:**
- Create: `apps/console/src/features/marketing/schemas/marketing.schemas.ts`
- Create: `apps/console/src/features/marketing/mappers/marketing.mapper.ts`
- Modify: `apps/console/src/features/marketing/types.ts`
- Modify: `apps/console/src/features/marketing/api/marketing-api.ts`
- Modify: `apps/console/src/features/marketing/index.ts`
- Modify: `apps/console/src/features/marketing/__tests__/marketing-pages.test.tsx`
- Modify: `CHANGELOG.md`

**Step 1: Write failing frontend contract tests**

Mock capabilities/detail responses and assert malformed platform, missing target digest, or a simulation receipt marked `simulated: false` is rejected into the existing recoverable error state. Assert create sends exactly the selected targets and retry URL contains `targetId`. Assert approval sends only `{ decision, reason? }`.

**Step 2: Confirm RED**

```bash
pnpm --filter @opendx/console test -- src/features/marketing/__tests__/marketing-pages.test.tsx
```

**Step 3: Implement schemas, mappers, and API methods**

Create Zod schemas mirroring the purpose-specific public DTOs. Map API records to view models that expose `platformLabel`, `formatLabel`, `statusLabel`, `executionLabel`, ordered media, and safe retry eligibility. Add:

```ts
getCapabilities(): Promise<MarketingCapabilities>;
createCampaign(input: CreateMarketingCampaignInput): Promise<MarketingCampaign>;
approveCampaign(campaignId: string, input: ApprovalDecisionInput): Promise<MarketingCampaign>;
retryPublicationTarget(campaignId: string, targetId: string): Promise<PublicationTarget>;
```

Remove form/request defaults for `free_topic`, `san-pham`, page IDs, and all tokens. The UI must require explicit user selection or use a capability/account option actually returned by the backend.

**Step 4: Verify and commit**

Run Task 10 tests plus Console typecheck, then:

```bash
git add apps/console/src/features/marketing CHANGELOG.md
git commit -m "feat(console): validate marketing publication data"
```

### Task 11: Add explicit platform/format selection to campaign creation

**Files:**
- Modify: `apps/console/src/features/marketing/pages/marketing-campaign-list-page.tsx`
- Create: `apps/console/src/features/marketing/components/publication-target-selector.tsx`
- Modify: `apps/console/src/features/marketing/styles/marketing.css`
- Modify: `apps/console/src/features/marketing/__tests__/marketing-pages.test.tsx`
- Modify: `CHANGELOG.md`

**Step 1: Write failing interaction tests**

Assert the page loads capabilities, lets staff select Facebook Feed and Instagram Feed/Story/carousel, renders video options disabled with `Chưa được bật`, requires an account configuration for selected platforms, displays carousel image count constraints, and submits the ordered target list.

Add a narrow viewport test that verifies controls remain reachable without document-width overflow.

**Step 2: Confirm RED**

```bash
pnpm --filter @opendx/console test -- src/features/marketing/__tests__/marketing-pages.test.tsx
```

**Step 3: Implement the selector**

`PublicationTargetSelector` receives capabilities and controlled selected targets; it renders only backend-supplied availability. It emits user intent and contains no business validation constants. Keep the operational dark canvas, compact controls, existing semantic tokens, 8/12px radii, and scarce `#5e6ad2` accent through CSS variables rather than inline colors.

The page owns loading/error/form state and blocks submission until explicit subject, target, account reference, schedule, deadline, approver, and budget inputs are present.

**Step 4: Verify and commit**

Run the Console test and build, then:

```bash
git add apps/console/src/features/marketing CHANGELOG.md
git commit -m "feat(console): select Instagram image targets"
```

### Task 12: Render locked previews, per-target timeline, partial outcomes, and retry

**Files:**
- Create: `apps/console/src/features/marketing/components/social-publication-preview.tsx`
- Create: `apps/console/src/features/marketing/components/publication-target-timeline.tsx`
- Modify: `apps/console/src/features/marketing/components/campaign-approval-action-bar.tsx`
- Modify: `apps/console/src/features/marketing/components/visual-asset-preview.tsx`
- Modify: `apps/console/src/features/marketing/pages/marketing-campaign-detail-page.tsx`
- Modify: `apps/console/src/features/marketing/styles/marketing.css`
- Modify: `apps/console/src/features/marketing/__tests__/marketing-pages.test.tsx`
- Delete: `apps/console/src/features/marketing/components/facebook-post-preview-modal.tsx`
- Modify: `CHANGELOG.md`

**Step 1: Write failing visible-state tests**

Test Feed 1:1, Story 9:16, and ordered carousel previews; one approval summary listing all locked targets and package digest; per-target scheduled/publishing/verified/unknown/rejected states; partial failure; target-specific retry; no retry for verified or unknown-before-reconciliation targets; and the exact simulation label beside every simulated Instagram receipt.

Test desktop and mobile DOM/layout classes. Include accessible names for carousel previous/next controls, platform badges, approval actions, and retry buttons.

**Step 2: Confirm RED**

```bash
pnpm --filter @opendx/console test -- src/features/marketing/__tests__/marketing-pages.test.tsx
```

**Step 3: Implement purpose-specific previews and timeline**

Replace the Facebook-only modal with one component that switches on validated `format` and receives a complete view model. It renders media in backend order and never derives constraints or publication truth. The detail page groups attempts/records beneath each target and invokes retry with the selected target ID.

Make the simulation banner visually unavoidable but consistent with the existing status palette. Keep `partial_failure` explicit; never collapse it to failed/completed. Approval content includes platform, format, account reference, schedule, execution mode, media count/digests, and one package digest before enabling Approve.

**Step 4: Verify behavior and production bundle**

```bash
pnpm --filter @opendx/console test -- src/features/marketing/__tests__/marketing-pages.test.tsx
pnpm --filter @opendx/console build
```

Manually inspect `/marketing` and one campaign detail at desktop and mobile widths using local simulation. Verify no horizontal page overflow, clipped labels, overlap, or claim of live Instagram publication.

**Step 5: Commit the UI unit**

```bash
git add apps/console/src/features/marketing CHANGELOG.md
git commit -m "feat(console): show governed social publication status"
```

### Task 13: Add credential-free lifecycle acceptance and operator documentation

**Files:**
- Create: `scripts/dev/instagram-simulation-lifecycle-check.mjs`
- Create: `scripts/dev/instagram-simulation-lifecycle-check.test.mjs`
- Modify: `package.json`
- Modify: `docs/build-from-source.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `docs/dependencies.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: Write the failing acceptance harness test**

Test command construction, auth fixture selection, exact multi-target payload, one approval, polling bounds, target-level assertions, artifact truthfulness, and process cleanup. The harness must fail if any Instagram receipt is live, lacks the simulation label, duplicates a successful Facebook target, or if a Meta network endpoint appears in captured Instagram activity.

**Step 2: Confirm RED**

```bash
node --test scripts/dev/instagram-simulation-lifecycle-check.test.mjs
```

**Step 3: Implement the bounded lifecycle check**

Follow existing `scripts/dev/*-lifecycle-check.mjs` patterns. Use configured base URLs and staff credentials from environment; never embed IDs/tokens. Create one immediate multi-target campaign, wait for asset readiness, submit one approval, poll until each target is terminal, retry only the configured simulated-failure target when the fixture enables it, download artifacts, and assert audit/provenance and simulation truth.

Add scripts:

```json
"test:instagram-simulation": "node --test scripts/dev/instagram-simulation-lifecycle-check.test.mjs",
"check:instagram-simulation": "pnpm test:instagram-simulation && node scripts/dev/instagram-simulation-lifecycle-check.mjs"
```

**Step 4: Update operator-facing docs**

Document local simulation variables, build/migration/start commands, how to run the acceptance check, supported formats, disabled video behavior, and the exact requirements that still block live Meta activation: approved Meta app, Professional account, HTTPS deployment, public bounded media delivery, deployment secret storage, and a separate live acceptance run.

State in `docs/dependencies.md` that no new runtime dependency was added, or document any dependency actually introduced with license/purpose/source. Mark only this approved Instagram image simulation slice complete in `mvp-status.md`; keep TikTok, live Instagram, video, email, and realtime messaging deferred.

**Step 5: Verify and commit**

```bash
pnpm test:instagram-simulation
pnpm audit:repo
git diff --check
git add scripts/dev package.json docs README.md CHANGELOG.md
git commit -m "docs(marketing): document Instagram simulation workflow"
```

### Task 14: Run migration, integration, Compose, UI, and repository completion gates

**Files:**
- Verify only; modify a file only to correct a failure caused by Tasks 1–13, and amend the owning atomic commit.

**Step 1: Run focused API unit tests**

```bash
pnpm --filter @opendx/api test -- src/modules/marketing
```

Expected: all Marketing unit/API tests pass.

**Step 2: Run PostgreSQL integration and migration lifecycle**

With the documented test database available:

```bash
pnpm --filter @opendx/api test:integration -- src/modules/marketing/infrastructure/database/marketing-migration.integration.test.ts src/modules/marketing/infrastructure/repositories/implementations/postgresql-marketing.repository.integration.test.ts src/modules/marketing/tests/marketing-e2e-workflow.integration.test.ts
```

Expected: backfill, down/up, concurrent claim, partial outcome, and credential-free E2E tests pass.

**Step 3: Run Console tests and production build**

```bash
pnpm --filter @opendx/console test -- src/features/marketing/__tests__/marketing-pages.test.tsx
pnpm --filter @opendx/console build
```

Expected: tests and Vite production build pass.

**Step 4: Validate Compose and run local simulation acceptance**

```bash
docker compose -f infra/docker/docker-compose.yml config --quiet
docker compose --env-file infra/deploy/.env.production.example -f infra/deploy/compose.production.yml config --quiet
pnpm check:instagram-simulation
```

Expected: Compose configurations validate and the lifecycle check proves simulated Instagram Feed, Story, and carousel execution without Meta network calls.

**Step 5: Run broad repository gates**

```bash
pnpm check:full
git diff --check
pnpm audit:repo
git status --short
```

Expected: all gates pass and the worktree contains no uncommitted implementation files. If container infrastructure prevents a gate from running, record the exact unavailable dependency and remaining risk; do not report that gate as passed.

**Step 6: Review commit boundaries and hand off**

```bash
git log --oneline --decorate origin/develop..HEAD
```

Confirm every commit is Conventional, each behavior commit updates `[Unreleased]`, no secret-like value or request credential remains, and changes are limited to the approved Instagram image slice. Do not merge, deploy, enable live mode, or push without explicit user authorization.
