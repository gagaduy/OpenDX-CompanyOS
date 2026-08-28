<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Synchronized Hero Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` task-by-task. Every production behavior starts with a focused RED test.

**Goal:** Import the approved NovaCommerce MP4 into MinIO, persist ordered Catalog chapters in PostgreSQL, and synchronize the desktop Storefront product hero with video playback while retaining image fallbacks.

**Architecture:** Catalog owns a typed hero-presentation aggregate, a PostgreSQL repository and a dedicated MinIO storage port. A new anonymous presentation endpoint preserves the existing `/hero-slides` contract, and a separately authorized media route supports single HTTP byte ranges. The Storefront validates the new DTO, treats video time as the automatic carousel clock, and never renders video on mobile or reduced-motion clients.

**Tech Stack:** TypeScript 7, PostgreSQL 18, node-pg-migrate, Express 5, MinIO, React 19, Zod 4, Vitest, Testing Library, Docker Compose, Chrome DevTools browser acceptance.

**Design:** `docs/superpowers/plans/2026-08-28-storefront-synchronized-hero-video-design.md`

## Constraints

- Work only in `feat/storefront-synchronized-hero-video`; do not edit `main` or the existing `phuong` worktree.
- Keep `/v1/storefront/hero-slides` backward compatible. Add `/v1/storefront/hero-presentation` and `/v1/storefront/hero-media/:mediaId/content`.
- Do not commit the 25 MB MP4 or its absolute host path. Import it explicitly from an operator-mounted read-only file.
- Do not expose MinIO object keys, credentials, database row shapes, or a public upload endpoint.
- Use the existing `product-media` bucket but a separate `storefront/hero/<sha256>.mp4` namespace and storage port.
- Keep pricing, publication, inventory, and product selection backend-authoritative.
- Do not render `<video>` below 768 px or when reduced motion is requested.
- Preserve both Storefront themes, the full product copy/price/CTA, keyboard focus, pause control, and image fallback.
- Preserve the two untracked recovery ZIP files in the primary worktree.
- The clean-worktree baseline has two unrelated Console Agentic failures (`console-shell.test.tsx` and `agentic-task-detail-page.test.tsx`); do not modify those files in this feature.
- Add SPDX headers, update `[Unreleased]`, use atomic Conventional Commits, and finish with `git diff --check` plus `pnpm audit:repo`.

## Target Public Contract

```ts
export interface StorefrontHeroPresentationDto {
  readonly media?: {
    readonly id: string;
    readonly contentUrl: string;
    readonly contentType: "video/mp4";
    readonly byteSize: number;
    readonly durationMs: number;
  };
  readonly slides: readonly (StorefrontHeroSlideDto & {
    readonly chapter?: {
      readonly startMs: number;
      readonly endMs: number;
      readonly label: string;
    };
  })[];
}
```

When no complete active presentation exists, `media` and every `chapter` are omitted and `slides` equals the current image-backed hero projection.

---

### Task 1: Hero Presentation Schema and Readiness

**Files:**
- Create: `apps/api/src/shared/database/migrations/202608280050_add_storefront_hero_video.ts`
- Modify: `apps/api/src/shared/database/migrations/catalog-migration.integration.test.ts`
- Modify: `apps/api/src/shared/database/migration-readiness.ts`
- Modify: `apps/api/src/shared/database/migration-readiness.test.ts`

- [ ] **Step 1: Write the migration RED test**

Add `storefront_hero_presentations` and `storefront_hero_chapters` to the expected tables. Insert two active categories, then assert invalid duration, empty labels, duplicate order, overlap, chapter end beyond duration, and a second enabled presentation are rejected. Roll down one migration and assert only these two tables disappear before reapplying.

```ts
await expect(pool.query(`INSERT INTO storefront_hero_presentations
  (id,code,object_key,content_type,byte_size,duration_ms,content_digest,enabled)
  VALUES (gen_random_uuid(),'bad','storefront/hero/bad.mp4','video/mp4',1,0,
          repeat('a',64),true)`)).rejects.toThrow();

await pool.query(`INSERT INTO storefront_hero_presentations
  (id,code,object_key,content_type,byte_size,duration_ms,content_digest,enabled)
  VALUES ('83000000-0000-4000-8000-000000000001','nova-signal',
          'storefront/hero/a.mp4','video/mp4',100,24000,repeat('a',64),true)`);
await pool.query(`INSERT INTO storefront_hero_chapters
  (presentation_id,category_id,sort_order,start_ms,end_ms,label)
  VALUES ('83000000-0000-4000-8000-000000000001',
          '81000000-0000-4000-8000-000000000001',0,0,4000,'Laptop')`);
await expect(pool.query(`INSERT INTO storefront_hero_chapters
  (presentation_id,category_id,sort_order,start_ms,end_ms,label)
  VALUES ('83000000-0000-4000-8000-000000000001',
          '81000000-0000-4000-8000-000000000002',1,3000,5000,'Phone')`))
  .rejects.toThrow();
```

- [ ] **Step 2: Run migration and readiness tests; confirm RED**

```bash
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/shared/database/migrations/catalog-migration.integration.test.ts
pnpm --filter @opendx/api exec vitest run src/shared/database/migration-readiness.test.ts
```

Expected: the migration test fails because the tables do not exist; readiness still accepts catalog count `4`.

- [ ] **Step 3: Implement the reversible migration**

Create typed tables with UUID foreign keys to `categories`, positive byte/duration constraints, `video/mp4`, 64-character lowercase SHA-256, one-active partial unique index, deterministic chapter order, and trigger guards:

```sql
CREATE TABLE storefront_hero_presentations (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (btrim(code) <> ''),
  object_key TEXT NOT NULL UNIQUE CHECK (object_key ~ '^storefront/hero/[a-f0-9]{64}\\.mp4$'),
  content_type TEXT NOT NULL CHECK (content_type = 'video/mp4'),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  content_digest TEXT NOT NULL UNIQUE CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX storefront_hero_one_enabled_idx
  ON storefront_hero_presentations(enabled) WHERE enabled = TRUE;
CREATE TABLE storefront_hero_chapters (
  presentation_id UUID NOT NULL REFERENCES storefront_hero_presentations(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms INTEGER NOT NULL CHECK (end_ms > start_ms),
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  PRIMARY KEY (presentation_id, category_id),
  UNIQUE (presentation_id, sort_order)
);
```

Add a `storefront_hero_chapter_guard()` trigger that rejects `end_ms` beyond the parent duration and any other row in the same presentation satisfying `int4range(start_ms,end_ms,'[)') && int4range(NEW.start_ms,NEW.end_ms,'[)')`. Drop triggers/functions before tables in `down`.

- [ ] **Step 4: Raise Catalog readiness from 4 to 5**

Change `minimumMigrationCounts.catalog` and `completeReadinessRow().catalog` to `5`; the incomplete case becomes `{ catalog: "4" }`.

- [ ] **Step 5: Run GREEN checks and commit**

Run both Step 2 commands and `pnpm --filter @opendx/api typecheck`.

```bash
git add apps/api/src/shared/database/migrations/202608280050_add_storefront_hero_video.ts \
  apps/api/src/shared/database/migrations/catalog-migration.integration.test.ts \
  apps/api/src/shared/database/migration-readiness.ts \
  apps/api/src/shared/database/migration-readiness.test.ts
git commit -m "feat(catalog): add storefront hero video schema"
```

### Task 2: MP4 Inspection and Import Validation

**Files:**
- Create: `apps/api/src/modules/catalog/domain/entities/storefront-hero-presentation.ts`
- Create: `apps/api/src/modules/catalog/domain/services/storefront-hero-rules.ts`
- Create: `apps/api/src/modules/catalog/domain/services/storefront-hero-rules.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/media/mp4-duration.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/media/mp4-duration.test.ts`

- [ ] **Step 1: Write RED tests for chapter rules**

Test a six-chapter input, then independently reject empty arrays, non-contiguous sort orders, duplicate category slugs, overlap, gaps, first start other than zero, final end unequal to duration, empty label, and unsafe integers.

```ts
expect(() => validateStorefrontHeroChapters(24_000, [
  { categorySlug: "laptops", sortOrder: 0, startMs: 0, endMs: 4_000, label: "Laptop" },
  { categorySlug: "phones", sortOrder: 1, startMs: 4_000, endMs: 24_000, label: "Phone" },
])).not.toThrow();
expect(() => validateStorefrontHeroChapters(24_000, [
  { categorySlug: "laptops", sortOrder: 0, startMs: 1, endMs: 24_000, label: "Laptop" },
])).toThrow("Hero chapters must start at zero");
```

- [ ] **Step 2: Write RED tests for an ISO BMFF duration reader**

Build deterministic in-memory `ftyp` + `moov/mvhd` buffers for mvhd version 0 and 1. Assert `readMp4DurationMs` returns `24_000`, and rejects missing `ftyp`, missing `mvhd`, zero timescale, truncated boxes, or duration above the safe integer range.

- [ ] **Step 3: Implement minimal rules and parser**

Use these public types:

```ts
export interface StorefrontHeroChapterInput {
  readonly categorySlug: string;
  readonly sortOrder: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly label: string;
}
export interface StorefrontHeroImportInput {
  readonly code: string;
  readonly bytes: Uint8Array;
  readonly chapters: readonly StorefrontHeroChapterInput[];
}
```

The parser walks top-level ISO boxes, finds `moov`, then `mvhd`, supports 32-bit and extended box sizes plus mvhd versions 0/1, and computes `Number(duration * 1000n / timescale)` only after a safe-integer check. Do not add a media parsing dependency.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/catalog/domain/services/storefront-hero-rules.test.ts \
  src/modules/catalog/infrastructure/media/mp4-duration.test.ts
git add apps/api/src/modules/catalog/domain apps/api/src/modules/catalog/infrastructure/media
git commit -m "feat(catalog): validate storefront hero video imports"
```

### Task 3: Import Service, PostgreSQL Repository, and MinIO Adapter

**Files:**
- Create: `apps/api/src/modules/catalog/application/repositories/interfaces/storefront-hero.repository.ts`
- Create: `apps/api/src/modules/catalog/application/storage/storefront-hero-media.storage.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/storefront-hero-import.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/storefront-hero-import.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/storefront-hero-import.service.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-storefront-hero.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-storefront-hero.repository.integration.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/storage/minio-storefront-hero-media.storage.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/storage/minio-storefront-hero-media.storage.integration.test.ts`

- [ ] **Step 1: Write import-service RED tests**

Use fakes to prove SHA-256 object naming, MP4 duration inspection, a 50 MiB maximum, validation before upload, storage-before-transaction ordering, identical import replay, unknown category failure, and cleanup of a newly uploaded object when activation fails.

```ts
expect(storage.upload).toHaveBeenCalledWith({
  objectKey: `storefront/hero/${digest}.mp4`,
  bytes,
  contentType: "video/mp4",
});
expect(repository.activate).toHaveBeenCalledWith(expect.anything(), {
  id: generatedId,
  code: "nova-signal",
  objectKey: `storefront/hero/${digest}.mp4`,
  contentDigest: digest,
  contentType: "video/mp4",
  byteSize: bytes.byteLength,
  durationMs: 24_000,
  chapters,
});
```

- [ ] **Step 2: Define focused inward ports**

```ts
export interface StorefrontHeroRepository {
  activate(session: DatabaseSession, input: StorefrontHeroActivation): Promise<void>;
  disable(session: DatabaseSession, code: string): Promise<boolean>;
}
export interface StorefrontHeroMediaStorage {
  upload(input: { objectKey: string; bytes: Uint8Array; contentType: "video/mp4" }): Promise<void>;
  open(objectKey: string, range?: { offset: number; length: number }): Promise<AsyncIterable<Uint8Array>>;
  exists(objectKey: string): Promise<boolean>;
  delete(objectKey: string): Promise<void>;
}
```

The application service receives repository, storage, transactions, `generateId`, duration inspector, and `maximumBytes`. It hashes bytes with `createHash("sha256")`, validates chapters against the inspected duration, records whether the digest object already exists, uploads, then activates inside `transactions.run`. An activation failure deletes only an object created by this attempt; replay never deletes a previously active object. The same service exposes `disable(code)`, which disables the matching presentation transactionally and returns whether an enabled row changed.

- [ ] **Step 3: Implement PostgreSQL activation with serialization**

`activate` acquires `pg_advisory_xact_lock(hashtext('catalog.storefront-hero'))`, resolves every category slug with one query, rejects a missing/inactive category, disables all prior presentations, upserts the presentation by digest, replaces its chapters, and enables it last. Reimporting the same digest/config converges to one presentation and one chapter set.

- [ ] **Step 4: Implement MinIO storage and integration tests**

Use `putObject`, `getObject`, `getPartialObject`, `statObject`, and `removeObject`. Map only MinIO's missing-object result to `false` in `exists`; rethrow every other storage failure. The integration test uploads deterministic MP4 bytes, asserts existence, full read, `offset: 4, length: 8`, then deletion and non-existence. Keep the existing bucket bootstrap and isolated `MINIO_BUCKET` contract.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/catalog/application/services/implementations/storefront-hero-import.service.test.ts
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test \
MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=opendx_minio \
MINIO_SECRET_KEY=opendx_minio_password MINIO_BUCKET=product-media-test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/catalog/infrastructure/repositories/implementations/postgresql-storefront-hero.repository.integration.test.ts \
  src/modules/catalog/infrastructure/storage/minio-storefront-hero-media.storage.integration.test.ts \
  --no-file-parallelism --maxWorkers=1
git add apps/api/src/modules/catalog/application apps/api/src/modules/catalog/infrastructure
git commit -m "feat(catalog): import storefront hero video"
```

### Task 4: Operator Import Command and Approved Chapter Configuration

**Files:**
- Create: `apps/api/src/modules/catalog/infrastructure/imports/nova-signal-hero.json`
- Create: `apps/api/src/modules/catalog/infrastructure/imports/storefront-hero-import.config.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/imports/storefront-hero-import.config.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/imports/run-storefront-hero-import.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/imports/run-storefront-hero-disable.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write config-parser RED tests**

Parse `--file` and `--config` exactly once, reject unknown/missing flags, validate JSON with Zod, and forbid absolute/object paths inside JSON. The JSON shape is:

```json
{
  "code": "nova-signal",
  "chapters": [
    { "categorySlug": "laptops", "sortOrder": 0, "startMs": 0, "endMs": 4000, "label": "Laptop nổi bật" },
    { "categorySlug": "phones", "sortOrder": 1, "startMs": 4000, "endMs": 8000, "label": "Điện thoại nổi bật" },
    { "categorySlug": "tablets", "sortOrder": 2, "startMs": 8000, "endMs": 12000, "label": "Máy tính bảng nổi bật" },
    { "categorySlug": "smart-watches", "sortOrder": 3, "startMs": 12000, "endMs": 16000, "label": "Đồng hồ thông minh nổi bật" },
    { "categorySlug": "computer-components", "sortOrder": 4, "startMs": 16000, "endMs": 20000, "label": "Linh kiện nổi bật" },
    { "categorySlug": "accessories", "sortOrder": 5, "startMs": 20000, "endMs": 24000, "label": "Phụ kiện nổi bật" }
  ]
}
```

- [ ] **Step 2: Implement runner and package script**

The runner reads only the explicitly supplied file/config, parses the normal API environment, constructs `PostgresTransactionRunner`, `PostgresqlStorefrontHeroRepository`, and `MinioStorefrontHeroMediaStorage`, calls the import service with `maximumBytes: 50 * 1024 * 1024`, prints only code/digest prefix/byte size/duration/chapter count, and closes the pool in `finally`.

The disable runner accepts exactly `--code <non-empty-code>`, composes the same repository/service, calls `disable`, prints only code and `disabled`/`already-disabled`, and closes the pool. It never removes the MinIO object, so rollback is immediate and recoverable.

```json
"db:import:storefront-hero": "tsx src/modules/catalog/infrastructure/imports/run-storefront-hero-import.ts",
"db:disable:storefront-hero": "tsx src/modules/catalog/infrastructure/imports/run-storefront-hero-disable.ts"
```

- [ ] **Step 3: Verify parser/runner types and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/catalog/infrastructure/imports/storefront-hero-import.config.test.ts
pnpm --filter @opendx/api typecheck
git add apps/api/package.json apps/api/src/modules/catalog/infrastructure/imports
git commit -m "feat(catalog): add storefront hero import command"
```

### Task 5: Public Presentation and Byte-Range API

**Files:**
- Modify: `apps/api/src/modules/catalog/application/dtos/responses/public-catalog-response.dto.ts`
- Modify: `apps/api/src/modules/catalog/application/repositories/interfaces/public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/application/services/interfaces/public-catalog.service.ts`
- Modify: `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.ts`
- Modify: `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.test.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`
- Create: `apps/api/src/modules/catalog/presentation/validators/http-byte-range.ts`
- Create: `apps/api/src/modules/catalog/presentation/validators/http-byte-range.test.ts`
- Modify: `apps/api/src/modules/catalog/presentation/controllers/public-catalog.controller.ts`
- Modify: `apps/api/src/modules/catalog/presentation/routes/public-catalog.routes.ts`
- Modify: `apps/api/src/modules/catalog/catalog.module.ts`
- Modify: `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`
- Modify: `apps/api/src/modules/catalog/tests/catalog.api.integration.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `docs/api/storefront-catalog.md`

- [ ] **Step 1: Write repository/service RED tests**

Assert a complete active six-chapter presentation is returned in chapter order with the newest eligible product per configured category. Disable a category or unpublish its only product and assert the service returns the normal image slides without `media`. Assert object key/digest/timestamps never enter the DTO.

- [ ] **Step 2: Write byte-range RED tests**

```ts
expect(parseSingleByteRange(undefined, 100)).toBeUndefined();
expect(parseSingleByteRange("bytes=10-19", 100)).toEqual({ offset: 10, length: 10, end: 19 });
expect(parseSingleByteRange("bytes=90-", 100)).toEqual({ offset: 90, length: 10, end: 99 });
expect(parseSingleByteRange("bytes=-10", 100)).toEqual({ offset: 90, length: 10, end: 99 });
expect(() => parseSingleByteRange("bytes=0-1,4-5", 100)).toThrow("Unsupported byte range");
expect(() => parseSingleByteRange("bytes=100-101", 100)).toThrow("Unsatisfiable byte range");
```

- [ ] **Step 3: Implement repository/service contract**

Add `findActiveHeroPresentation`, `findHeroMediaAuthorization`, `getHeroPresentation`, and `getHeroMediaContentAuthorization`. The repository returns configured chapter count plus eligible projections. The service emits video only when every configured chapter has one complete published product; otherwise it calls the existing `listHeroSlides` fallback. Build media URL as `/v1/storefront/hero-media/${id}/content`.

- [ ] **Step 4: Implement anonymous routes and streaming controller**

```ts
router.get("/hero-presentation", controller.heroPresentation);
router.get("/hero-media/:mediaId/content", controller.heroMedia);
```

The media handler authorizes by UUID, parses one `Range`, sets `Accept-Ranges: bytes`, `Content-Type: video/mp4`, `Content-Length`, and `Cache-Control: public, max-age=3600, immutable`. Range responses use `206` and `Content-Range`; invalid ranges use `416` and `Content-Range: bytes */<size>`. Stream `AsyncIterable<Uint8Array>` with `Readable.from` and `pipeline`, never `Buffer.concat` the complete MP4.

- [ ] **Step 5: Wire dedicated storage**

Add `heroMediaStorage: StorefrontHeroMediaStorage` to `CatalogModuleDependencies`, pass the same MinIO client/bucket through `new MinioStorefrontHeroMediaStorage(...)` in `server.ts`, and update the Catalog integration fixture.

- [ ] **Step 6: Run API tests and commit**

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/catalog/application/services/implementations/public-catalog.service.test.ts \
  src/modules/catalog/presentation/validators/http-byte-range.test.ts \
  src/modules/catalog/tests/public-catalog.api.test.ts
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test \
MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=opendx_minio \
MINIO_SECRET_KEY=opendx_minio_password MINIO_BUCKET=product-media-test \
pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts \
  src/modules/catalog/tests/catalog.api.integration.test.ts \
  --no-file-parallelism --maxWorkers=1
git add apps/api/src apps/api/package.json docs/api/storefront-catalog.md
git commit -m "feat(catalog): expose storefront hero presentation"
```

### Task 6: Storefront Presentation Transport and State

**Files:**
- Modify: `apps/storefront/src/features/catalog/schemas/storefront-catalog.schema.ts`
- Modify: `apps/storefront/src/features/catalog/types/catalog.types.ts`
- Modify: `apps/storefront/src/features/catalog/api/storefront-catalog-api.ts`
- Modify: `apps/storefront/src/features/catalog/tests/storefront-catalog-api.test.ts`
- Modify: `apps/storefront/src/features/catalog/hooks/use-homepage-catalog.ts`
- Modify: `apps/storefront/src/features/catalog/tests/homepage-catalog.test.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/intro-home-page.test.tsx`

- [ ] **Step 1: Write transport/state RED tests**

Validate the target contract, reject non-MP4 media, unsafe sizes/times, missing chapters when media exists, overlapping chapters, and a media duration different from the final chapter end. Assert the homepage uses `/v1/storefront/hero-presentation`, retains an explicit error region, and supplies presentation plus fallback product to the hero.

- [ ] **Step 2: Add Zod super-refinement and inferred types**

```ts
export const heroPresentationSchema = z.object({
  media: z.object({
    id: z.string().uuid(), contentUrl: z.string().startsWith("/"),
    contentType: z.literal("video/mp4"),
    byteSize: z.number().int().positive(), durationMs: z.number().int().positive(),
  }).optional(),
  slides: z.array(heroSlideSchema.extend({
    chapter: z.object({
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().positive(), label: nonEmptyTextSchema,
    }).optional(),
  })),
}).superRefine(validatePresentationShape);
```

Change `HomepageCatalogReader.heroPresentation()` and the hero region type to `StorefrontHeroPresentation`, with loading data `{ slides: [] }`. The existing error isolation remains unchanged.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @opendx/storefront exec vitest run \
  src/features/catalog/tests/storefront-catalog-api.test.ts \
  src/features/catalog/tests/homepage-catalog.test.tsx \
  src/features/catalog/tests/intro-home-page.test.tsx
git add apps/storefront/src/features/catalog
git commit -m "feat(storefront): load hero presentation metadata"
```

### Task 7: Chapter-Synchronized Hero Component

**Files:**
- Create: `apps/storefront/src/features/catalog/hooks/use-hero-video-eligibility.ts`
- Create: `apps/storefront/src/features/catalog/hooks/use-hero-video-eligibility.test.tsx`
- Modify: `apps/storefront/src/features/catalog/components/storefront-hero.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/storefront-hero.test.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`

- [ ] **Step 1: Write eligibility RED tests**

Mock both media queries and prove video is eligible only when `(min-width: 768px)` matches and reduced motion does not. Prove query changes update state and listeners are removed on unmount.

- [ ] **Step 2: Write component RED tests**

Cover these observable behaviors with a real JSDOM `<video>` element and stubbed `play`, `pause`, and writable `currentTime`:

- video has `muted`, `playsInline`, `loop`, `preload="metadata"`, and the API-origin URL;
- no video exists when ineligible or the presentation has no media;
- `timeupdate` selects the chapter containing `currentTime * 1000`;
- category/next/previous selection seeks to `chapter.startMs / 1000` and calls `play` when not manually paused;
- hover, focus, hidden document, and manual pause call `pause` and keep copy stable;
- play/pause button exposes `aria-label="Tạm dừng video"` or `"Phát video"`;
- `error` removes video mode but keeps product, price, CTA, category controls, and image;
- a failed product image still skips only that slide.

- [ ] **Step 3: Replace timer ownership only in video mode**

Keep the existing five-second timer for image fallback. In video mode, remove the timer and derive `activeIndex` from chapter boundaries. Store `videoFailed` and `manuallyPaused`; use one ref and focused event handlers rather than a new global state provider.

Render order inside the hero is video background, bounded scrim/panel, product stage image, copy, category selector, carousel controls, play/pause, then the existing hidden scroll link. Resolve both media URLs with `new URL(path, apiBaseUrl)`.

- [ ] **Step 4: Add semantic responsive CSS**

Use `.hero-video-background`, `.hero-product-stage`, and `.hero-playback-control`. Keep the 418 px desktop minimum, left panel at no more than 47%, right stage at 52%, `overflow: hidden`, 12 px radius, semantic tokens, and no decorative gradient. At `<768px`, keep the current image layout. In `prefers-reduced-motion`, disable enter animations.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @opendx/storefront exec vitest run \
  src/features/catalog/hooks/use-hero-video-eligibility.test.tsx \
  src/features/catalog/tests/storefront-hero.test.tsx
pnpm --filter @opendx/storefront build
git add apps/storefront/src/features/catalog apps/storefront/src/shared/styles/globals.css
git commit -m "feat(storefront): synchronize products with hero video"
```

### Task 8: Browser Acceptance, Documentation, Import, and Rollout

**Files:**
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Extend browser fixtures and assertions**

Add `/v1/storefront/hero-presentation` fixture with six chapters and a small deterministic browser-safe MP4 data route for `/v1/storefront/hero-media/83000000-0000-4000-8000-000000000001/content`. Desktop light/night assertions require a video, full product copy, playback control, chapter switching after a synthetic `timeupdate`, category click seeking, and no overflow. Mobile assertions require zero video elements and the existing image/product hierarchy. Add `?hero-video=unavailable` to prove a video error retains product, CTA, controls, and image fallback.

- [ ] **Step 2: Document the operator command and rollback**

Document this exact non-destructive import after building/migrating:

```bash
export HERO_VIDEO_FILE=/absolute/path/to/hero.mp4
docker compose --env-file .env -f infra/docker/docker-compose.yml build migrate api storefront
docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm migrate
docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm --no-deps \
  -v "${HERO_VIDEO_FILE}:/imports/hero.mp4:ro" \
  api pnpm --filter @opendx/api db:import:storefront-hero -- \
  --file /imports/hero.mp4 \
  --config /workspace/apps/api/src/modules/catalog/infrastructure/imports/nova-signal-hero.json
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d \
  --no-deps --force-recreate api storefront
```

Document this exact recoverable rollback; do not document ad-hoc direct SQL:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm --no-deps \
  api pnpm --filter @opendx/api db:disable:storefront-hero -- --code nova-signal
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d \
  --no-deps --force-recreate api storefront
```

- [ ] **Step 3: Update changelog and run focused verification**

Move the hero video entry from `Planned` to `Added`, mentioning PostgreSQL chapters, MinIO import, range delivery, synchronized desktop playback, and mobile/reduced-motion fallback.

```bash
pnpm --filter @opendx/api test
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront build
pnpm check:storefront-browser
git diff --check
pnpm audit:repo
```

Expected: API `823+` tests pass, Storefront `66+` tests pass, build and browser acceptance exit 0. Record rather than alter the two known Console Agentic baseline failures if `pnpm check` is repeated.

- [ ] **Step 4: Apply migration and import the approved video**

Run the Step 2 rollout. Verify:

```bash
curl -fsS http://localhost:4000/health/ready | jq -e '.status == "ready"'
curl -fsS http://localhost:4000/v1/storefront/hero-presentation \
  | jq -e '.success and (.data.media.contentType == "video/mp4") and (.data.slides | length == 6)'
media_path=$(curl -fsS http://localhost:4000/v1/storefront/hero-presentation | jq -r '.data.media.contentUrl')
curl -fsS -H 'Range: bytes=0-1023' -D /tmp/opendx-hero-range-headers \
  -o /tmp/opendx-hero-range.bin "http://localhost:4000${media_path}"
rg -i '^HTTP/.* 206|^accept-ranges: bytes|^content-range: bytes 0-1023/' \
  /tmp/opendx-hero-range-headers
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3100
```

- [ ] **Step 5: Commit acceptance and operations**

```bash
git add scripts/dev/storefront-browser-check.mjs docs/build-from-source.md CHANGELOG.md
git commit -m "test(storefront): cover synchronized hero video"
git status --short
```

Expected final status: clean feature worktree. The primary worktree still contains only its two untracked recovery ZIP files.
