<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Database Content and Wishlist Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move NovaCommerce service assurances and trust metrics from React constants into typed Catalog tables and prevent Wishlist schema drift from passing API readiness.

**Architecture:** Catalog owns two typed PostgreSQL tables, exposes enabled ordered content through its existing anonymous public repository/service/controller boundary, and the Storefront validates and loads that response once through a Catalog provider. A focused database readiness probe checks both the exact Customer Wishlist migration ledger entry and its table; the existing Customer migration remains the sole schema owner.

**Tech Stack:** TypeScript 7, PostgreSQL, node-pg-migrate, Express 5, React 19, Zod 4, Vitest, Testing Library, Docker Compose, Chrome DevTools browser acceptance.

**Spec:** `docs/superpowers/specs/2026-08-28-storefront-database-content-and-wishlist-recovery-design.md`

## Global Constraints

- Work on `phuong`; do not edit `main`.
- Preserve Clean Architecture and consume Catalog from other frontend features only through `features/catalog/index.ts`.
- Keep price, promotion, inventory, order, payment, authorization, and audit truth backend-authoritative.
- Persist only assurance and trust-metric merchandising content; navigation, CTA, filter, loading, validation, and error vocabulary remains frontend code.
- Use typed tables, not a generic settings table or arbitrary JSON.
- Add no CMS, management endpoint, new dependency, guest Wishlist, or new commerce behavior.
- Never reset or destructively restore customer/product data during rollout.
- Keep the existing light/dark theme system and responsive, non-overlapping layout.
- Add SPDX headers to every new license-capable file, update `[Unreleased]`, and use atomic Conventional Commits.
- Preserve the two untracked recovery ZIP files under `infra/backups/`; never stage or delete them.

## File Map

- `apps/api/src/shared/database/migrations/202608280040_add_storefront_content.ts`: owns the two Catalog content tables, constraints, indexes, and rollback.
- `apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.ts`: owns idempotent approved content rows alongside current product seed data.
- `apps/api/src/modules/catalog/application/dtos/responses/public-catalog-response.dto.ts`: defines purpose-specific public content DTOs.
- `apps/api/src/modules/catalog/application/repositories/interfaces/public-catalog.repository.ts`: defines the inward-facing `listStorefrontContent` persistence port.
- `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`: selects enabled content in deterministic order.
- `apps/api/src/modules/catalog/application/services/{interfaces,implementations}/public-catalog.service.ts`: exposes content inside a read-only transaction.
- `apps/api/src/modules/catalog/presentation/{controllers,routes}/public-catalog.*`: maps `GET /v1/storefront/content` to the existing success/failure envelope.
- `apps/api/src/shared/database/migration-readiness.ts`: owns exact migration/table readiness checks outside `server.ts`.
- `apps/storefront/src/features/catalog/{schemas,types,api}`: validates and fetches public content.
- `apps/storefront/src/features/catalog/context/storefront-content-provider.tsx`: fetch-once state owner with retry.
- `apps/storefront/src/features/catalog/components/service-assurance-panel.tsx`: renders provider-backed assurance/metric states and exhaustive icon mapping.
- `apps/storefront/src/app/app-router.tsx`: mounts the Catalog content provider once around route content.
- `scripts/dev/storefront-browser-check.mjs`: supplies content fixtures and validates themes, viewports, and unavailable-content behavior.

---

### Task 1: Typed Catalog Content Migration

**Files:**
- Create: `apps/api/src/shared/database/migrations/202608280040_add_storefront_content.ts`
- Modify: `apps/api/src/shared/database/migrations/catalog-migration.integration.test.ts`

**Interfaces:**
- Consumes: `node-pg-migrate` `MigrationBuilder` and the existing `catalog_migrations` runner.
- Produces: `storefront_service_assurances` and `storefront_trust_metrics`, ordered-read indexes, and reversible `up`/`down` functions.

- [ ] **Step 1: Write the failing migration test**

Extend `tables` with both table names, assert the icon/text/order constraints, and change the one-step rollback section to verify this newest migration alone drops only its two tables before reapply:

```ts
await expect(pool.query(`INSERT INTO storefront_service_assurances
  (code,icon_key,title,description,sort_order,enabled,created_at,updated_at)
  VALUES ('bad-icon','unknown','Title','Copy',0,true,NOW(),NOW())`)).rejects.toThrow();
await expect(pool.query(`INSERT INTO storefront_trust_metrics
  (code,display_value,label,sort_order,enabled,created_at,updated_at)
  VALUES ('bad-order','1','Label',-1,true,NOW(),NOW())`)).rejects.toThrow();
await runCatalogMigrations(databaseUrl!, "down", 1);
await expect(pool.query("SELECT to_regclass('public.storefront_service_assurances') AS name"))
  .resolves.toMatchObject({ rows: [{ name: null }] });
await expect(pool.query("SELECT to_regclass('public.products') AS name"))
  .resolves.toMatchObject({ rows: [{ name: "products" }] });
await runCatalogMigrations(databaseUrl!, "up");
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
docker compose -f infra/docker/docker-compose.yml run --rm \
  -e TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/opendx_test \
  api pnpm --filter @opendx/api exec vitest run --config vitest.integration.config.ts \
  src/shared/database/migrations/catalog-migration.integration.test.ts
```

Expected: FAIL because the two tables do not exist.

- [ ] **Step 3: Implement the migration**

Create the migration with exact constraints and deterministic indexes:

```ts
import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE storefront_service_assurances (
      code TEXT PRIMARY KEY CHECK (btrim(code) <> ''),
      icon_key TEXT NOT NULL CHECK (icon_key IN ('truck','shield-check','badge-percent','headphones')),
      title TEXT NOT NULL CHECK (btrim(title) <> ''),
      description TEXT NOT NULL CHECK (btrim(description) <> ''),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX storefront_service_assurances_enabled_order_idx
      ON storefront_service_assurances(sort_order,code) WHERE enabled=true;
    CREATE TABLE storefront_trust_metrics (
      code TEXT PRIMARY KEY CHECK (btrim(code) <> ''),
      display_value TEXT NOT NULL CHECK (btrim(display_value) <> ''),
      label TEXT NOT NULL CHECK (btrim(label) <> ''),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX storefront_trust_metrics_enabled_order_idx
      ON storefront_trust_metrics(sort_order,code) WHERE enabled=true;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql("DROP TABLE IF EXISTS storefront_trust_metrics; DROP TABLE IF EXISTS storefront_service_assurances;");
}
```

- [ ] **Step 4: Run focused migration test and typecheck**

Run the Step 2 command, then `pnpm --filter @opendx/api typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/database/migrations/202608280040_add_storefront_content.ts \
  apps/api/src/shared/database/migrations/catalog-migration.integration.test.ts
git commit -m "feat(catalog): add storefront content schema"
```

### Task 2: Idempotent Catalog Content Seed

**Files:**
- Modify: `apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and existing `seedCatalog(transactions, storage)`.
- Produces: four stable assurance rows and four stable metric rows, updated idempotently by `code`.

- [ ] **Step 1: Add a failing seed assertion**

After calling `seedCatalog` twice, assert exact rows and update one row before the second call to prove reseeding restores the approved value:

```ts
await seedCatalog(transactions, storage);
await pool.query("UPDATE storefront_service_assurances SET title='stale' WHERE code='free-delivery'");
await seedCatalog(transactions, storage);
const content = await pool.query(`SELECT code,icon_key,title,description,sort_order,enabled
  FROM storefront_service_assurances ORDER BY sort_order,code`);
expect(content.rows).toEqual([
  { code:"free-delivery", icon_key:"truck", title:"Miễn phí vận chuyển", description:"Cho đơn hàng đủ điều kiện", sort_order:0, enabled:true },
  { code:"official-warranty", icon_key:"shield-check", title:"Bảo hành chính hãng", description:"Cam kết sản phẩm xác thực", sort_order:1, enabled:true },
  { code:"zero-installment", icon_key:"badge-percent", title:"Trả góp 0%", description:"Theo điều kiện thanh toán", sort_order:2, enabled:true },
  { code:"customer-support", icon_key:"headphones", title:"Hỗ trợ 24/7", description:"Đồng hành khi bạn cần", sort_order:3, enabled:true },
]);
```

Add the equivalent exact expectation for metrics: `100%`, `30+`, `1.000+`, `50.000+` with sort orders `0..3`.

- [ ] **Step 2: Run the seed test and confirm RED**

Run the seed integration file through the same Docker/Vitest integration command used in Task 1.
Expected: FAIL with zero content rows.

- [ ] **Step 3: Add typed seed constants and upserts**

Define immutable arrays and execute parameterized upserts inside the existing transaction:

```ts
const assurances = [
  ["free-delivery","truck","Miễn phí vận chuyển","Cho đơn hàng đủ điều kiện"],
  ["official-warranty","shield-check","Bảo hành chính hãng","Cam kết sản phẩm xác thực"],
  ["zero-installment","badge-percent","Trả góp 0%","Theo điều kiện thanh toán"],
  ["customer-support","headphones","Hỗ trợ 24/7","Đồng hành khi bạn cần"],
] as const;

for (const [sortOrder, [code, iconKey, title, description]] of assurances.entries()) {
  await session.query(`INSERT INTO storefront_service_assurances
    (code,icon_key,title,description,sort_order,enabled,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW()) ON CONFLICT (code) DO UPDATE SET
    icon_key=EXCLUDED.icon_key,title=EXCLUDED.title,description=EXCLUDED.description,
    sort_order=EXCLUDED.sort_order,enabled=true,updated_at=NOW()`,
    [code, iconKey, title, description, sortOrder]);
}
```

Use the same pattern for `storefront_trust_metrics(code,display_value,label,sort_order,enabled,...)`.

- [ ] **Step 4: Run the focused seed integration test**

Expected: PASS twice without duplicate rows and with stale values restored.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.ts \
  apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.integration.test.ts
git commit -m "feat(catalog): seed storefront content"
```

### Task 3: Catalog Repository and Application Contract

**Files:**
- Modify: `apps/api/src/modules/catalog/application/dtos/responses/public-catalog-response.dto.ts`
- Modify: `apps/api/src/modules/catalog/application/repositories/interfaces/public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/application/services/interfaces/public-catalog.service.ts`
- Modify: `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.ts`
- Modify: `apps/api/src/modules/catalog/application/services/implementations/public-catalog.service.test.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 tables through `DatabaseSession`.
- Produces: `PublicStorefrontContentDto`, repository `listStorefrontContent(session)`, and service `getStorefrontContent()`.

- [ ] **Step 1: Write failing repository and service tests**

Use this exact public shape, disable one inserted row, give two enabled rows the same order, and assert `sort_order,code` ordering plus empty arrays:

```ts
const expected = {
  assurances: [{ code:"free-delivery", iconKey:"truck" as const, title:"Miễn phí vận chuyển", description:"Cho đơn hàng đủ điều kiện" }],
  metrics: [{ code:"authentic-products", displayValue:"100%", label:"Sản phẩm chính hãng" }],
};
expect(await repository.listStorefrontContent(session)).toEqual(expected);
await expect(service.getStorefrontContent()).resolves.toEqual(expected);
expect(transactions.runReadOnly).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
pnpm --filter @opendx/api exec vitest run \
  src/modules/catalog/application/services/implementations/public-catalog.service.test.ts
```

Then run the repository integration file using the Task 1 Docker command pattern.
Expected: FAIL because methods/types are absent.

- [ ] **Step 3: Define DTO and inward-facing port**

```ts
export type StorefrontAssuranceIconKey = "truck" | "shield-check" | "badge-percent" | "headphones";
export interface PublicStorefrontContentDto {
  readonly assurances: readonly { readonly code:string; readonly iconKey:StorefrontAssuranceIconKey; readonly title:string; readonly description:string }[];
  readonly metrics: readonly { readonly code:string; readonly displayValue:string; readonly label:string }[];
}
```

Add `listStorefrontContent(session): Promise<PublicStorefrontContentDto>` to the repository and `getStorefrontContent(): Promise<PublicStorefrontContentDto>` to the service contract.

- [ ] **Step 4: Implement the read-only service and SQL mapping**

```ts
getStorefrontContent() {
  return this.transactions.runReadOnly((session) =>
    this.repository.listStorefrontContent(session));
}
```

Repository SQL must use two parameter-free selects with `WHERE enabled=true ORDER BY sort_order,code`, mapping snake case to the DTO and never selecting `enabled`, ordering, or timestamps into the public response.

- [ ] **Step 5: Run focused unit/integration tests and typecheck**

Expected: enabled-only deterministic data, empty arrays, and no DTO leakage all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/catalog/application apps/api/src/modules/catalog/infrastructure/repositories
git commit -m "feat(catalog): read public storefront content"
```

### Task 4: Anonymous Storefront Content Endpoint

**Files:**
- Modify: `apps/api/src/modules/catalog/presentation/controllers/public-catalog.controller.ts`
- Modify: `apps/api/src/modules/catalog/presentation/routes/public-catalog.routes.ts`
- Modify: `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`
- Modify: `docs/api/storefront-catalog.md`

**Interfaces:**
- Consumes: Task 3 `PublicCatalogServiceContract.getStorefrontContent()`.
- Produces: anonymous `GET /v1/storefront/content` with message `Storefront content retrieved`.

- [ ] **Step 1: Write the failing API contract test**

Add `getStorefrontContent` to the fixture and test the envelope and redaction:

```ts
const response = await request(app).get("/v1/storefront/content").expect(200);
expect(response.body).toEqual({ success:true, message:"Storefront content retrieved", data:content });
expect(JSON.stringify(response.body)).not.toMatch(/sortOrder|enabled|createdAt|updatedAt/);
expect(service.getStorefrontContent).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the API test and confirm RED**

Run `pnpm --filter @opendx/api exec vitest run src/modules/catalog/tests/public-catalog.api.test.ts`.
Expected: 404 for `/content`.

- [ ] **Step 3: Implement controller and route**

```ts
readonly content: RequestHandler = async (_request, response, next) => {
  try {
    response.json(successResponse("Storefront content retrieved", await this.service.getStorefrontContent()));
  } catch (error) { next(toHttpError(error)); }
};
```

Register `router.get("/content", controller.content)` before the parameterized product route.

- [ ] **Step 4: Document and verify**

Document request, exact successful envelope, anonymous access, enabled-only ordering, empty arrays, and standard closed 500 envelope in `docs/api/storefront-catalog.md`. Run API focused tests and typecheck; expect PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/catalog/presentation apps/api/src/modules/catalog/tests/public-catalog.api.test.ts docs/api/storefront-catalog.md
git commit -m "feat(catalog): expose storefront content endpoint"
```

### Task 5: Exact Wishlist Schema Readiness

**Files:**
- Create: `apps/api/src/shared/database/migration-readiness.ts`
- Create: `apps/api/src/shared/database/migration-readiness.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `docs/build-from-source.md`

**Interfaces:**
- Consumes: a minimal `{ query(...) }` pool contract.
- Produces: `assertRequiredMigrations(pool): Promise<void>`; it throws `Database migrations are incomplete` unless every current minimum is met and Wishlist ledger/table both exist.

- [ ] **Step 1: Write failing readiness tests**

Use a fake query result containing existing migration counts plus flags and cover all three cases:

```ts
it.each([
  [{ wishlist_migration:false, wishlist_table:true }, "missing ledger"],
  [{ wishlist_migration:true, wishlist_table:false }, "missing table"],
])("rejects Wishlist drift: %s", async (override) => {
  const pool = fakePool({ ...completeReadinessRow(), ...override });
  await expect(assertRequiredMigrations(pool)).rejects.toThrow("Database migrations are incomplete");
});
it("accepts the exact migration and table", async () => {
  await expect(assertRequiredMigrations(fakePool(completeReadinessRow()))).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run and confirm RED**

Run `pnpm --filter @opendx/api exec vitest run src/shared/database/migration-readiness.test.ts`.
Expected: module not found.

- [ ] **Step 3: Extract and strengthen the probe**

Move the count query/check from `server.ts` into the new file and add these SQL expressions:

```sql
EXISTS (SELECT 1 FROM customer_migrations
        WHERE name='202608270030_add_customer_wishlist') AS wishlist_migration,
to_regclass('public.customer_wishlist_items') IS NOT NULL AS wishlist_table
```

Update the Catalog minimum from `3` to `4` for Task 1 and require both booleans. `server.ts` becomes:

```ts
migrations: await probe(() => assertRequiredMigrations(pool)),
```

- [ ] **Step 4: Verify readiness and existing Customer acceptance**

Run the new unit test, API typecheck, then the Customer migration/API integration files through Docker. Expected: the missing-ledger and missing-table vectors fail readiness; authenticated add/list/idempotent add/remove/isolation still PASS against PostgreSQL.

- [ ] **Step 5: Document and commit**

Update the readiness section of `docs/build-from-source.md` to name the exact Wishlist migration and table requirement.

```bash
git add apps/api/src/shared/database/migration-readiness.ts \
  apps/api/src/shared/database/migration-readiness.test.ts apps/api/src/server.ts docs/build-from-source.md
git commit -m "fix(api): detect wishlist schema drift"
```

### Task 6: Storefront Content Validation and Fetch-Once Provider

**Files:**
- Modify: `apps/storefront/src/features/catalog/schemas/storefront-catalog.schema.ts`
- Modify: `apps/storefront/src/features/catalog/types/catalog.types.ts`
- Modify: `apps/storefront/src/features/catalog/api/storefront-catalog-api.ts`
- Modify: `apps/storefront/src/features/catalog/tests/storefront-catalog-api.test.ts`
- Create: `apps/storefront/src/features/catalog/context/storefront-content-provider.tsx`
- Create: `apps/storefront/src/features/catalog/context/storefront-content-provider.test.tsx`
- Modify: `apps/storefront/src/features/catalog/index.ts`
- Modify: `apps/storefront/src/app/app-router.tsx`

**Interfaces:**
- Consumes: Task 4 envelope.
- Produces: `StorefrontCatalogApi.content()`, `StorefrontContentProvider`, and `useStorefrontContent(): {status:"loading"|"ready"|"empty"|"error"; content?; retry():void}`.

- [ ] **Step 1: Write failing schema/API tests**

```ts
await expect(api.content()).resolves.toEqual(content);
payload = { success:true, message:"bad", data:{ assurances:[{...content.assurances[0],iconKey:"unknown"}], metrics:[] } };
await expect(api.content()).rejects.toBeInstanceOf(z.ZodError);
```

Also reject blank `code`, `title`, `description`, `displayValue`, and `label`.

- [ ] **Step 2: Confirm RED and implement the schema/API**

Run the API test, then add `z.enum(["truck","shield-check","badge-percent","headphones"])`, trimmed nonempty strings, arrays, envelope, inferred types, and:

```ts
async content() {
  return (await this.client.request("/v1/storefront/content", storefrontContentEnvelopeSchema)).data;
}
```

- [ ] **Step 3: Write failing provider state tests**

With a deferred promise and a rejected-first/resolved-second API, assert `loading`, one initial call, `ready`, `empty`, `error`, and retry:

```tsx
render(<StorefrontContentProvider api={api}><StateProbe /></StorefrontContentProvider>);
expect(screen.getByText("loading")).toBeVisible();
expect(await screen.findByText("error")).toBeVisible();
await user.click(screen.getByRole("button", { name:"retry-probe" }));
expect(await screen.findByText("ready")).toBeVisible();
expect(api.content).toHaveBeenCalledTimes(2);
```

- [ ] **Step 4: Implement provider and mount once**

Use `useEffect` + request sequence guard, classify both arrays empty as `empty`, preserve no fallback values, and expose a stable retry counter. Export only provider/hook through `features/catalog/index.ts`. Wrap `StorefrontSessionBoundary` once inside `StorefrontContentProvider api={dependencies.catalogApi}` so homepage and product detail share one request.

- [ ] **Step 5: Run Storefront focused tests and typecheck**

Run both new/focused tests and `pnpm --filter @opendx/storefront typecheck`. Expected: PASS and one fetch per provider mount.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/features/catalog apps/storefront/src/app/app-router.tsx
git commit -m "feat(storefront): load catalog content once"
```

### Task 7: Provider-Backed Assurance and Metric UI States

**Files:**
- Modify: `apps/storefront/src/features/catalog/components/service-assurance-panel.tsx`
- Create: `apps/storefront/src/features/catalog/components/service-assurance-panel.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/intro-home-page.test.tsx`
- Modify: `apps/storefront/src/features/catalog/tests/product-detail.test.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/intro-home-page.tsx`
- Modify: `apps/storefront/src/features/catalog/pages/product-detail-page.tsx`
- Modify: `apps/storefront/src/styles/storefront.css`

**Interfaces:**
- Consumes: Task 6 `useStorefrontContent` state and validated icon keys.
- Produces: bounded loading skeleton, populated panels, omitted empty panels, and one compact assurance error/retry region.

- [ ] **Step 1: Write failing component/page tests**

Mock the provider hook per state and assert:

```tsx
expect(screen.getByRole("status", { name:"Đang tải cam kết dịch vụ" })).toBeVisible();
expect(screen.queryByRole("complementary", { name:"Cam kết dịch vụ" })).not.toBeInTheDocument(); // empty
expect(screen.getByRole("alert")).toHaveTextContent("Không thể tải cam kết dịch vụ.");
await user.click(screen.getByRole("button", { name:"Thử lại" }));
expect(retry).toHaveBeenCalledOnce();
```

For ready state, assert all DB-provided titles/copy/metrics on homepage, the same assurance values on product detail, and no literal approved business copy remains in `service-assurance-panel.tsx`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
pnpm --filter @opendx/storefront exec vitest run \
  src/features/catalog/components/service-assurance-panel.test.tsx \
  src/features/catalog/tests/intro-home-page.test.tsx \
  src/features/catalog/tests/product-detail.test.tsx
```

- [ ] **Step 3: Implement exhaustive icon rendering and states**

```tsx
const icons = { truck:Truck, "shield-check":ShieldCheck, "badge-percent":BadgePercent, headphones:Headphones } satisfies Record<StorefrontAssuranceIconKey, LucideIcon>;
```

Render skeletons for `loading`; return `null` for `empty`; render one `role="alert"` plus `Thử lại` for assurance `error` while metrics return `null`; map ready arrays with `code` keys. Keep CSS dimensions stable and use existing tokens for both themes.

- [ ] **Step 4: Remove props/constants and verify pages**

Keep page call sites as `<ServiceAssurancePanel />` and `<ServiceMetricStrip />`; their shared provider is the only content source. Run focused tests, full Storefront tests, and build. Expected: PASS with no layout-breaking empty/error state.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/features/catalog apps/storefront/src/styles/storefront.css
git commit -m "feat(storefront): render database-backed assurances"
```

### Task 8: Browser Acceptance, Rollout, and Full Verification

**Files:**
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `docs/build-from-source.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1-7 and existing Docker services.
- Produces: responsive populated/unavailable-content evidence and a migrated, seeded, rebuilt local stack with live Wishlist acceptance.

- [ ] **Step 1: Add failing browser assertions**

Add assertions at `390`, `768`, and `1440` widths in both `light` and `dark`
themes that require fixture-provided assurance/metric copy. Add an unavailable
content scenario that requires product/hero content to remain visible, one
retry action, `documentElement.scrollWidth <= innerWidth`, and no interactive
control overlap. Leave the content fixture absent for the RED run.

- [ ] **Step 2: Run browser acceptance and confirm RED**

Run `pnpm check:storefront-browser`.
Expected: FAIL because `/v1/storefront/content` has no browser fixture.

- [ ] **Step 3: Add populated and unavailable content fixtures**

Add the normal response and a scenario-controlled HTTP 500 response:

```js
"/v1/storefront/content": envelope({ assurances, metrics })
```

Rerun `pnpm check:storefront-browser`.
Expected: every populated/unavailable theme and viewport case PASS.

- [ ] **Step 4: Update operational docs and changelog**

Document this non-destructive rollout order in `docs/build-from-source.md`:

```bash
docker compose -f infra/docker/docker-compose.yml run --rm migrate
docker compose -f infra/docker/docker-compose.yml run --rm seed
docker compose -f infra/docker/docker-compose.yml up -d --build api storefront
```

Move the relevant `[Unreleased]` item from `Planned` to `Added`/`Fixed`, naming database-backed content and exact Wishlist readiness. Do not claim CMS behavior.

- [ ] **Step 5: Apply migrations/seeds and verify schema without reset**

Run the rollout commands, then read-only checks:

```bash
docker compose -f infra/docker/docker-compose.yml exec -T postgres psql -U opendx_local -d opendx_local -c \
  "SELECT name FROM customer_migrations WHERE name='202608270030_add_customer_wishlist'; SELECT to_regclass('public.customer_wishlist_items'); SELECT count(*) FROM storefront_service_assurances; SELECT count(*) FROM storefront_trust_metrics;"
curl --fail http://localhost:4000/readyz
curl --fail http://localhost:4000/v1/storefront/content
curl --fail http://localhost:3100/
```

Expected: exact migration entry, non-null Wishlist table, counts `4` and `4`, ready API, successful public content, and Storefront HTML.

- [ ] **Step 6: Verify authenticated live Wishlist journey**

Use the existing local customer sign-in flow in a fresh browser session, capture CSRF through normal cookies, add one published product, verify it appears exactly once after a second add, remove it, and verify it disappears. Also confirm the API logs contain no 500 for the product-scoped PUT/DELETE. Do not insert sessions or Wishlist rows directly.

- [ ] **Step 7: Run the complete evidence gate**

```bash
pnpm --filter @opendx/api test
docker compose -f infra/docker/docker-compose.yml run --rm \
  -e TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@postgres:5432/opendx_test \
  -e MINIO_BUCKET=product-media-test api pnpm --filter @opendx/api test:integration
pnpm --filter @opendx/storefront test
pnpm --filter @opendx/storefront build
pnpm check:storefront-browser
pnpm check:full
git diff --check
pnpm audit:repo
git status --short
```

Expected: all commands PASS; final status contains only intended tracked changes plus the two preserved untracked recovery ZIPs.

- [ ] **Step 8: Commit the acceptance/documentation unit**

```bash
git add scripts/dev/storefront-browser-check.mjs docs/build-from-source.md CHANGELOG.md
git commit -m "test(storefront): cover database content rollout"
```

## Self-Review Results

- Spec coverage: typed persistence, constraints, seed, anonymous DTO, enabled ordering, frontend validation, fetch-once provider, all four UI states, Wishlist readiness/isolation, browser themes/viewports, non-destructive rollout, docs, and full verification each map to a task.
- Boundary check: no generic settings/CMS, management API, dependency, guest Wishlist, runtime DDL, data reset, or unrelated module is introduced.
- Type consistency: backend `PublicStorefrontContentDto` maps to frontend `StorefrontContent`; icon keys and `content()/getStorefrontContent()/listStorefrontContent()` names are stable across tasks.
- Execution dependency: Tasks 1-8 are intentionally sequential because later contracts consume earlier schema and interfaces; do not parallelize edits in the shared files.
