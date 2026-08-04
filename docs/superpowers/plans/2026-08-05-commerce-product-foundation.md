<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Commerce Product Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a full-container NovaCommerce staff workflow for managing a
PostgreSQL-backed general-merchandise catalog with categories, products,
variants, SKU, VND prices, MinIO media, Keycloak authorization, and audit.

**Architecture:** Extend `apps/api` with one feature-first `catalog` Clean
Architecture module and narrowly shared technical adapters. PostgreSQL access
uses `pg` behind application-owned repository ports; `node-pg-migrate` owns
versioned schema changes; the React console consumes `/v1/admin/catalog` DTOs.
Docker Compose runs PostgreSQL, Keycloak, MinIO, migration/bootstrap jobs, API,
and console; a small root Makefile exposes the approved common commands.

**Tech Stack:** Node.js 22.22.0, TypeScript strict mode, Express 5, React 19,
Vite 7, PostgreSQL 18.3, `pg` 8.22.0, `node-pg-migrate` 9.0.0, Zod 4.4.3,
JOSE 6.2.8, `oidc-client-ts` 3.5.0, MinIO SDK 8.0.7, React Router 7.18.2,
Vitest 4, Testing Library, Supertest, Docker Compose, and GNU Make.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-05-commerce-product-foundation-design.md`.
- NovaCommerce is the only company; no `companyId`, company route parameter, or
  tenant abstraction is added.
- Phase 3 manages draft and archived products only; inventory and publication
  remain Phase 4.
- PostgreSQL is the commerce source of truth. Domain/application code cannot
  import `pg` or migration types.
- Monetary values are positive integer VND minor units and tax-inclusive.
- Staff authentication uses Keycloak Authorization Code + PKCE; authorization
  is rechecked in the API.
- Browser code never receives PostgreSQL, Keycloak administrator, or MinIO
  credentials.
- API controllers contain no business rules; services contain no SQL; database
  adapters contain no business decisions.
- Every catalog mutation writes audit in the same PostgreSQL transaction.
- Full-container local mode is the supported workflow.
- Root Makefile targets are limited to `help`, `up`, `down`, `logs`, `check`,
  `db-migrate`, `db-rollback`, `db-seed`, `db-backup`, and `db-restore`.
- Do not implement Company Core persistence, inventory, storefront, cart,
  checkout, SePay, shipping, refund, return, workflow, agent, or GraphRAG work.
- New source files carry SPDX Apache-2.0 headers.
- Use TDD: observe each focused test fail for the expected reason before adding
  the minimum implementation.
- Update `docs/dependencies.md` whenever a dependency is introduced.
- End every task with the listed focused checks and an atomic Conventional
  Commit.

---

## File Map

### Root and Infrastructure

- `Makefile`: approved contributor command facade.
- `.env.example`: complete safe local configuration contract.
- `infra/docker/docker-compose.yml`: full-container local topology.
- `infra/docker/README.md`: service matrix and direct Docker commands.
- `infra/keycloak/realm-export.json`: deterministic local staff realm.
- `infra/backups/.gitignore`: retain backup directory without committing dumps.
- `apps/api/Dockerfile`: API, migration, seed, and storage-bootstrap image.
- `apps/console/Dockerfile`: containerized Vite console.
- `services/ai-runtime/Dockerfile`: one-shot Python repository-check image; it
  is not part of `make up`.

### API Shared Technical Boundaries

- `apps/api/src/shared/config/environment.ts`: Zod-validated API environment.
- `apps/api/src/shared/database/postgres.ts`: pool construction and lifecycle.
- `apps/api/src/shared/database/transaction.ts`: transaction runner contract and
  `pg` implementation.
- `apps/api/src/shared/database/migrations/202608050001_create_catalog.ts`:
  Phase 3 catalog and audit schema.
- `apps/api/src/shared/http/api-response.ts`: success/error envelopes.
- `apps/api/src/shared/http/application-error.ts`: stable application errors.
- `apps/api/src/shared/http/correlation-id.middleware.ts`: request correlation.
- `apps/api/src/shared/http/error-handler.middleware.ts`: centralized mapping.
- `apps/api/src/shared/http/health.routes.ts`: liveness/readiness.
- `apps/api/src/shared/auth/staff-principal.ts`: verified staff identity.
- `apps/api/src/shared/auth/staff-auth.middleware.ts`: JOSE/JWKS verification.
- `apps/api/src/shared/auth/require-role.middleware.ts`: role enforcement.

### API Catalog Module

- `apps/api/src/modules/catalog/domain/`: entities, value objects, errors, and
  pure invariants.
- `apps/api/src/modules/catalog/application/`: request/response DTOs, service
  interfaces/implementations, repository and storage ports, and mappers.
- `apps/api/src/modules/catalog/infrastructure/`: PostgreSQL repositories, MinIO
  storage, and deterministic seed implementation.
- `apps/api/src/modules/catalog/presentation/`: Zod validators, controllers, and
  `/v1/admin/catalog` routes.
- `apps/api/src/modules/catalog/tests/`: PostgreSQL, MinIO, API, and fixture
  integration tests.

### Console

- `apps/console/src/app/`: router, providers, authenticated shell, and primary
  Catalog navigation.
- `apps/console/src/features/authentication/`: OIDC manager, provider, callback,
  and protected route.
- `apps/console/src/features/catalog/`: API client, schemas, types, mappers,
  hooks, pages, components, and tests.
- `apps/console/src/shared/components/`: only stable layout/control primitives
  proven by current Catalog screens.
- `apps/console/src/shared/styles/`: approved design tokens and responsive
  catalog styles.

---

### Task 1: Lock Dependencies and Validate Configuration

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/console/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Create: `apps/api/src/shared/config/environment.ts`
- Create: `apps/api/src/shared/config/environment.test.ts`
- Create: `apps/console/src/app/environment.ts`
- Create: `apps/console/src/app/environment.test.ts`
- Modify: `docs/dependencies.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces `ApiEnvironment`, `parseApiEnvironment(source)`, `ConsoleEnvironment`,
  and `parseConsoleEnvironment(source)` for every later task.

- [ ] **Step 1: Install only the dependencies required by the approved phase**

Run:

```bash
pnpm --filter @opendx/api add pg@8.22.0 zod@4.4.3 jose@6.2.8 minio@8.0.7 multer@2.2.0 file-type@22.0.1 cors@2.8.6
pnpm --filter @opendx/api add -D @types/pg@8.20.4 node-pg-migrate@9.0.0 @types/multer@2.2.0 @types/cors@2.8.19
pnpm --filter @opendx/console add zod@4.4.3 oidc-client-ts@3.5.0 react-router-dom@7.18.2
pnpm --filter @opendx/console add -D @testing-library/user-event@14.6.3
```

Expected: manifests and lockfile contain the exact versions; no workspace gains
an unrelated dependency.

- [ ] **Step 2: Write failing API environment tests**

Test exact required values and rejection of missing `DATABASE_URL`, malformed
URLs, non-positive ports, and non-positive upload limits:

```typescript
const validSource = {
  OPENDX_ENV: "test",
  API_PORT: "4000",
  DATABASE_URL: "postgres://opendx:secret@postgres:5432/opendx",
  CONSOLE_ORIGIN: "http://localhost:3000",
  KEYCLOAK_ISSUER: "http://keycloak:8080/realms/opendx",
  KEYCLOAK_AUDIENCE: "opendx-api",
  MINIO_ENDPOINT: "http://minio:9000",
  MINIO_ACCESS_KEY: "opendx_minio",
  MINIO_SECRET_KEY: "local-only-secret",
  MINIO_BUCKET: "product-media",
  MEDIA_MAX_BYTES: "10485760",
} as const;

expect(parseApiEnvironment(validSource).apiPort).toBe(4000);
expect(() => parseApiEnvironment({ ...validSource, DATABASE_URL: "" }))
  .toThrow(/DATABASE_URL/);
```

- [ ] **Step 3: Run the API config test and verify failure**

Run: `pnpm --filter @opendx/api test -- environment.test.ts`

Expected: FAIL because `parseApiEnvironment` does not exist.

- [ ] **Step 4: Implement strict API and console environment parsers**

`ApiEnvironment` must expose camelCase typed values and preserve secrets only
inside the returned server object. `ConsoleEnvironment` accepts exactly:

```typescript
export interface ConsoleEnvironment {
  readonly apiBaseUrl: string;
  readonly oidcAuthority: string;
  readonly oidcClientId: string;
  readonly oidcRedirectUri: string;
  readonly oidcPostLogoutRedirectUri: string;
}
```

Do not import `process.env` or `import.meta.env` inside business modules; parse
once at each composition root.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter @opendx/api test -- environment.test.ts
pnpm --filter @opendx/console test -- environment.test.ts
```

Expected: PASS.

- [ ] **Step 6: Document dependency purpose/license and all safe local env keys**

Add each package with its task-specific purpose and MIT or Apache-2.0 license.
Do not put real secrets in `.env.example`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/console/package.json pnpm-lock.yaml .env.example apps/api/src/shared/config apps/console/src/app/environment.ts apps/console/src/app/environment.test.ts docs/dependencies.md CHANGELOG.md
git commit -m "build(platform): add commerce foundation dependencies"
```

---

### Task 2: Define Catalog Domain Invariants

**Files:**

- Create: `apps/api/src/modules/catalog/domain/entities/category.ts`
- Create: `apps/api/src/modules/catalog/domain/entities/product.ts`
- Create: `apps/api/src/modules/catalog/domain/entities/product-variant.ts`
- Create: `apps/api/src/modules/catalog/domain/entities/product-price.ts`
- Create: `apps/api/src/modules/catalog/domain/entities/product-media.ts`
- Create: `apps/api/src/modules/catalog/domain/value-objects/money.ts`
- Create: `apps/api/src/modules/catalog/domain/value-objects/slug.ts`
- Create: `apps/api/src/modules/catalog/domain/value-objects/sku.ts`
- Create: `apps/api/src/modules/catalog/domain/services/catalog-rules.ts`
- Create: `apps/api/src/modules/catalog/domain/services/catalog-rules.test.ts`
- Create: `apps/api/src/modules/catalog/domain/exceptions/catalog-domain.error.ts`

**Interfaces:**

- Produces framework-neutral catalog entities and pure constructors used by all
  application services and repository contracts.

- [ ] **Step 1: Write failing tests for normalization and invariants**

Cover:

```typescript
expect(normalizeSlug("  Bình Giữ Nhiệt  ")).toBe("binh-giu-nhiet");
expect(normalizeSku(" nc bottle black ")).toBe("NC BOTTLE BLACK");
expect(createMoney(1299000, "VND")).toEqual({
  amountMinor: 1299000,
  currency: "VND",
  taxInclusive: true,
});
expect(() => createMoney(0, "VND")).toThrow(CatalogDomainError);
expect(() => assertProductMutable("archived")).toThrow(CatalogDomainError);
```

Also test allowed JSONB attribute values, non-empty variant options, one primary
media invariant, and safe-integer maximum.

- [ ] **Step 2: Run the domain test and verify failure**

Run: `pnpm --filter @opendx/api test -- catalog-rules.test.ts`

Expected: FAIL with missing catalog domain modules.

- [ ] **Step 3: Implement minimum pure domain behavior**

Use these stable statuses:

```typescript
export type CategoryStatus = "active" | "archived";
export type ProductStatus = "draft" | "archived";
export type VariantStatus = "active" | "archived";
```

Use `crypto.randomUUID()` only in application factories, not inside entities or
repository mappers. Store timestamps as ISO strings at domain boundaries.

- [ ] **Step 4: Run focused domain tests**

Run: `pnpm --filter @opendx/api test -- catalog-rules.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/catalog/domain
git commit -m "feat(catalog): define product domain invariants"
```

---

### Task 3: Add PostgreSQL, Transactions, and Catalog Migration

**Files:**

- Create: `apps/api/src/shared/database/postgres.ts`
- Create: `apps/api/src/shared/database/postgres.test.ts`
- Create: `apps/api/src/shared/database/transaction.ts`
- Create: `apps/api/src/shared/database/transaction.test.ts`
- Create: `apps/api/src/shared/database/migrations/202608050001_create_catalog.ts`
- Create: `apps/api/src/shared/database/migrations/catalog-migration.integration.test.ts`
- Create: `apps/api/src/shared/database/run-migrations.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.integration.config.ts`
- Modify: `docs/dependencies.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces `createPostgresPool(environment)`, `PostgresTransactionRunner`, and
  migration scripts consumed by repositories and Docker jobs.

- [ ] **Step 1: Write failing transaction tests with a fake `PoolClient`**

Assert successful work issues `BEGIN` then `COMMIT`, failed work issues `BEGIN`
then `ROLLBACK`, and the client is always released.

```typescript
await runner.run(async (transaction) => {
  await transaction.query("SELECT 1");
});

expect(queryCalls).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
expect(release).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the transaction test and verify failure**

Run: `pnpm --filter @opendx/api test -- transaction.test.ts`

Expected: FAIL because the transaction runner is absent.

- [ ] **Step 3: Implement pool lifecycle and transaction runner**

Expose this inward-facing shape rather than `PoolClient`:

```typescript
export interface DatabaseSession {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[]; readonly rowCount: number }>;
}

export interface TransactionRunner {
  run<T>(work: (session: DatabaseSession) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 4: Write the migration and integration assertions**

Create PostgreSQL enums/checks, tables, foreign keys, indexes, partial unique
indexes, timestamps, versions, and the migration table exactly from the spec.
The integration test runs `up`, checks all six business tables, runs `down`, and
checks they are absent.

- [ ] **Step 5: Add deterministic migration scripts**

Add:

```json
{
  "db:migrate": "node-pg-migrate up -j ts -m src/shared/database/migrations --check-order",
  "db:rollback": "node-pg-migrate down 1 -j ts -m src/shared/database/migrations --check-order",
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

- [ ] **Step 6: Run unit and PostgreSQL integration tests**

Run:

```bash
pnpm --filter @opendx/api test -- transaction.test.ts postgres.test.ts
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api test:integration -- catalog-migration.integration.test.ts
```

Expected: PASS with migration up/down evidence.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/shared/database apps/api/package.json apps/api/vitest.integration.config.ts docs/dependencies.md CHANGELOG.md
git commit -m "feat(database): add catalog migration foundation"
```

---

### Task 4: Standardize HTTP, Correlation, and Health

**Files:**

- Create: `apps/api/src/shared/http/api-response.ts`
- Create: `apps/api/src/shared/http/application-error.ts`
- Create: `apps/api/src/shared/http/correlation-id.middleware.ts`
- Create: `apps/api/src/shared/http/error-handler.middleware.ts`
- Create: `apps/api/src/shared/http/health.routes.ts`
- Create: `apps/api/src/shared/http/http-foundation.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`

**Interfaces:**

- Produces `successResponse`, stable `ApplicationError`, request correlation,
  centralized error mapping, `/health/live`, and `/health/ready`.

- [ ] **Step 1: Write failing HTTP contract tests**

Assert:

```typescript
expect(live.body).toEqual({ status: "ok", service: "opendx-api" });
expect(ready.body).toEqual({
  status: "ready",
  service: "opendx-api",
  dependencies: { postgres: "up", keycloak: "up", minio: "up", migrations: "up" },
});
expect(validationError.body.errorCode).toBe("VALIDATION_ERROR");
expect(validationError.headers).toHaveProperty("x-correlation-id");
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/api test -- http-foundation.test.ts app.test.ts`

Expected: FAIL because new endpoints and envelopes do not exist.

- [ ] **Step 3: Implement middleware ordering in `createApiApp`**

Use this order:

```text
JSON/body limits -> CORS -> correlation -> health -> business routes
-> not found -> centralized error handler
```

Inject readiness probes so health tests use fakes and do not open real network
connections.

- [ ] **Step 4: Run focused HTTP tests**

Run: `pnpm --filter @opendx/api test -- http-foundation.test.ts app.test.ts`

Expected: PASS; unknown errors expose no stack trace.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/http apps/api/src/app.ts apps/api/src/app.test.ts
git commit -m "feat(api): standardize health and error contracts"
```

---

### Task 5: Add Staff OIDC Authentication and Role Authorization

**Files:**

- Create: `apps/api/src/shared/auth/staff-principal.ts`
- Create: `apps/api/src/shared/auth/staff-auth.middleware.ts`
- Create: `apps/api/src/shared/auth/staff-auth.middleware.test.ts`
- Create: `apps/api/src/shared/auth/require-role.middleware.ts`
- Create: `apps/api/src/shared/auth/require-role.middleware.test.ts`
- Create: `infra/keycloak/realm-export.json`
- Create: `docs/security/staff-authentication.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces verified `StaffPrincipal`, `authenticateStaff`, and
  `requireStaffRole("administrator", "catalog_manager")` for catalog routes.

- [ ] **Step 1: Write failing JWT and role tests**

Use a local test keypair and signed fixtures. Cover valid token, no token,
expired token, wrong issuer, wrong audience, malformed token, missing role, and
allowed role. The principal shape is:

```typescript
export interface StaffPrincipal {
  readonly subject: string;
  readonly displayName: string;
  readonly email?: string;
  readonly roles: readonly ("administrator" | "catalog_manager")[];
}
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/api test -- staff-auth.middleware.test.ts require-role.middleware.test.ts`

Expected: FAIL because auth middleware is missing.

- [ ] **Step 3: Implement JOSE verification behind an injectable verifier**

Production uses `createRemoteJWKSet` and `jwtVerify`; unit tests inject a
deterministic verifier. Never decode without signature verification.

- [ ] **Step 4: Create deterministic Keycloak realm import**

Realm `opendx` contains:

- Public PKCE client `opendx-console` with local redirect/logout URIs.
- Bearer audience `opendx-api` included through a client scope/mapper.
- Realm roles `administrator` and `catalog_manager`.
- Development users `admin@novacommerce.example` and
  `catalog@novacommerce.example` with temporary local-only passwords documented
  in `.env.example`.

- [ ] **Step 5: Run auth tests and validate realm JSON**

Run:

```bash
pnpm --filter @opendx/api test -- staff-auth.middleware.test.ts require-role.middleware.test.ts
node -e "JSON.parse(require('node:fs').readFileSync('infra/keycloak/realm-export.json','utf8'))"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/shared/auth infra/keycloak/realm-export.json docs/security/staff-authentication.md CHANGELOG.md
git commit -m "feat(identity): add catalog staff authorization"
```

---

### Task 6: Persist Catalog Audit Events

**Files:**

- Create: `apps/api/src/modules/catalog/application/repositories/interfaces/catalog-audit.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-catalog-audit.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-catalog-audit.repository.integration.test.ts`
- Create: `apps/api/src/modules/catalog/application/services/catalog-audit.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/catalog-audit.service.test.ts`

**Interfaces:**

- Produces atomic audit append/list behavior for every later catalog mutation.

- [ ] **Step 1: Write failing service and repository contract tests**

Define:

```typescript
export interface CatalogAuditEntry {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly resourceType: "category" | "product" | "variant" | "price" | "media";
  readonly resourceId: string;
  readonly outcome: "success" | "failure" | "denied";
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}
```

Assert sensitive metadata keys are rejected or removed.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/api test -- catalog-audit.service.test.ts`

Expected: FAIL because audit service/repository are missing.

- [ ] **Step 3: Implement minimum audit service and PostgreSQL adapter**

The repository accepts the current `DatabaseSession` so callers write domain
mutation and audit in one transaction.

- [ ] **Step 4: Run unit and integration tests**

Run:

```bash
pnpm --filter @opendx/api test -- catalog-audit.service.test.ts
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api test:integration -- postgresql-catalog-audit.repository.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/catalog/application apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-catalog-audit.repository*
git commit -m "feat(catalog): persist mutation audit events"
```

---

### Task 7: Implement Category Vertical Slice

**Files:**

- Create: `apps/api/src/modules/catalog/application/dtos/requests/category-request.dto.ts`
- Create: `apps/api/src/modules/catalog/application/dtos/responses/category-response.dto.ts`
- Create: `apps/api/src/modules/catalog/application/mappers/category.mapper.ts`
- Create: `apps/api/src/modules/catalog/application/repositories/interfaces/category.repository.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/category.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/category.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/category.service.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-category.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-category.repository.integration.test.ts`
- Create: `apps/api/src/modules/catalog/presentation/validators/category.validator.ts`
- Create: `apps/api/src/modules/catalog/presentation/controllers/category.controller.ts`
- Create: `apps/api/src/modules/catalog/presentation/routes/category.routes.ts`
- Create: `apps/api/src/modules/catalog/tests/category.api.test.ts`

**Interfaces:**

- Produces authenticated category list/create/update/archive APIs and category
  DTOs consumed by product services and console.

- [ ] **Step 1: Write failing service tests**

Cover generated UUID/time injection, normalized slug, duplicate conflict,
parent existence, cycle rejection, optimistic version, archived parent, and
archive rejection when active products exist.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/api test -- category.service.test.ts`

Expected: FAIL because service contracts do not exist.

- [ ] **Step 3: Implement repository port, mapper, and service**

The service constructor receives repository, audit repository, transaction
runner, ID generator, and clock. It never imports Express or `pg`.

- [ ] **Step 4: Add PostgreSQL repository and integration tests**

Verify hierarchy ordering, case-insensitive slug conflict, version increment,
transaction rollback, and database mapping.

- [ ] **Step 5: Write failing API tests**

Cover `GET`, `POST`, `PATCH`, archive, `401`, `403`, `404`, `409`, validation,
success envelope, and correlation/audit propagation.

- [ ] **Step 6: Implement validator/controller/routes and run all category tests**

Run:

```bash
pnpm --filter @opendx/api test -- category
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api test:integration -- postgresql-category.repository.integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/catalog
git commit -m "feat(catalog): add category management"
```

---

### Task 8: Implement Product List, Detail, Edit, and Archive

**Files:**

- Create: `apps/api/src/modules/catalog/application/dtos/requests/product-request.dto.ts`
- Create: `apps/api/src/modules/catalog/application/dtos/responses/product-response.dto.ts`
- Create: `apps/api/src/modules/catalog/application/mappers/product.mapper.ts`
- Create: `apps/api/src/modules/catalog/application/repositories/interfaces/product.repository.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/product.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/product.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/product.service.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-product.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-product.repository.integration.test.ts`
- Create: `apps/api/src/modules/catalog/presentation/validators/product.validator.ts`
- Create: `apps/api/src/modules/catalog/presentation/controllers/product.controller.ts`
- Create: `apps/api/src/modules/catalog/presentation/routes/product.routes.ts`
- Create: `apps/api/src/modules/catalog/tests/product.api.test.ts`

**Interfaces:**

- Produces paginated product summaries, full product detail, create/update, and
  archive commands used by console and later variant/media tasks.

- [ ] **Step 1: Write failing product service tests**

Cover category eligibility, slug normalization/conflict, validated JSONB
attributes, archive rules, stale version, and audit atomicity.

- [ ] **Step 2: Implement application contracts and minimum service**

Use this query contract:

```typescript
export interface ProductListQuery {
  readonly query?: string;
  readonly categoryId?: string;
  readonly status?: "draft" | "archived";
  readonly page: number;
  readonly pageSize: number;
}
```

- [ ] **Step 3: Write PostgreSQL repository integration tests**

Assert case-insensitive search across name/SKU, filters, deterministic
`updated_at DESC, id ASC` ordering, total count, 20 default/100 maximum page
size, primary image projection, price range, and variant count.

- [ ] **Step 4: Implement PostgreSQL adapter and row mappers**

Use parameterized SQL only. Keep list/read SQL in infrastructure and never
return rows directly to application or HTTP.

- [ ] **Step 5: Write and satisfy API tests**

Cover list filters/pagination meta, create, detail, patch, archive, auth,
validation, not found, duplicate slug, stale version, and stable envelope.

Run: `pnpm --filter @opendx/api test -- product`

Expected: PASS.

- [ ] **Step 6: Run PostgreSQL product integration tests**

Run: `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api test:integration -- postgresql-product.repository.integration.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/catalog
git commit -m "feat(catalog): add product management"
```

---

### Task 9: Implement Variant and Price History

**Files:**

- Create: `apps/api/src/modules/catalog/application/dtos/requests/variant-request.dto.ts`
- Create: `apps/api/src/modules/catalog/application/dtos/responses/variant-response.dto.ts`
- Create: `apps/api/src/modules/catalog/application/repositories/interfaces/variant.repository.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/variant.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/variant.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/variant.service.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-variant.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-variant.repository.integration.test.ts`
- Create: `apps/api/src/modules/catalog/presentation/validators/variant.validator.ts`
- Create: `apps/api/src/modules/catalog/presentation/controllers/variant.controller.ts`
- Create: `apps/api/src/modules/catalog/presentation/routes/variant.routes.ts`
- Create: `apps/api/src/modules/catalog/tests/variant.api.test.ts`

**Interfaces:**

- Produces variant create/update/archive and transactional current-price
  replacement APIs.

- [ ] **Step 1: Write failing variant/price tests**

Cover global uppercase SKU uniqueness, option validation, archived product and
variant rejection, positive/safe VND price, one-current-price invariant, price
history close/open timestamps, and stale version.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/api test -- variant.service.test.ts`

Expected: FAIL because variant service is missing.

- [ ] **Step 3: Implement service and repository contracts**

`replacePrice` must close the existing current price, insert the new price, and
append audit in one transaction.

- [ ] **Step 4: Implement PostgreSQL adapter and constraint tests**

Prove concurrent duplicate SKU writes produce one success/one conflict and
concurrent price replacement leaves exactly one current row.

- [ ] **Step 5: Add validator/controller/routes/API tests**

Cover create/update/archive variant and `PUT .../price`, plus all auth and
conflict paths.

- [ ] **Step 6: Run focused and integration tests**

```bash
pnpm --filter @opendx/api test -- variant
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api test:integration -- postgresql-variant.repository.integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/catalog
git commit -m "feat(catalog): manage variants and VND prices"
```

---

### Task 10: Implement MinIO Product Media

**Files:**

- Create: `apps/api/src/modules/catalog/application/dtos/requests/media-request.dto.ts`
- Create: `apps/api/src/modules/catalog/application/dtos/responses/media-response.dto.ts`
- Create: `apps/api/src/modules/catalog/application/repositories/interfaces/product-media.repository.ts`
- Create: `apps/api/src/modules/catalog/application/storage/product-media.storage.ts`
- Create: `apps/api/src/modules/catalog/application/services/interfaces/product-media.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/product-media.service.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/product-media.service.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-product-media.repository.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/storage/minio-product-media.storage.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/storage/bootstrap-product-media-bucket.ts`
- Create: `apps/api/src/modules/catalog/tests/product-media.integration.test.ts`
- Create: `apps/api/src/modules/catalog/presentation/validators/media.validator.ts`
- Create: `apps/api/src/modules/catalog/presentation/controllers/product-media.controller.ts`
- Create: `apps/api/src/modules/catalog/presentation/routes/product-media.routes.ts`
- Create: `apps/api/src/modules/catalog/tests/product-media.api.test.ts`

**Interfaces:**

- Produces backend-mediated upload, metadata update/order/primary selection,
  delete, and public-internal media URL mapping for staff console previews.

- [ ] **Step 1: Write failing media service tests**

Cover product mutable check, JPEG/PNG/WebP/AVIF allowlist, byte-sniffed type,
10 MiB limit, required alt text, generated object key, one primary image,
ordering, upload compensation, idempotent delete, and audit.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/api test -- product-media.service.test.ts`

Expected: FAIL because media service is missing.

- [ ] **Step 3: Implement ports, service, and MinIO adapter**

Use memory storage only with Multer's hard `10 * 1024 * 1024` byte limit, then
verify actual bytes using `fileTypeFromBuffer`. Never trust browser MIME alone.

- [ ] **Step 4: Implement PostgreSQL media adapter and API**

Make primary-image updates atomic. Return media DTOs with backend-controlled
preview URLs; never return bucket credentials or raw object-store admin URLs.

- [ ] **Step 5: Run unit, API, and MinIO integration tests**

Run:

```bash
pnpm --filter @opendx/api test -- product-media
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=opendx_minio MINIO_SECRET_KEY=opendx_minio_password MINIO_BUCKET=product-media-test pnpm --filter @opendx/api test:integration -- product-media.integration.test.ts
```

Expected: PASS and test bucket cleanup succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/catalog
git commit -m "feat(catalog): manage product media in MinIO"
```

---

### Task 11: Compose Catalog API Module

**Files:**

- Create: `apps/api/src/modules/catalog/catalog.module.ts`
- Create: `apps/api/src/modules/catalog/index.ts`
- Create: `apps/api/src/modules/catalog/tests/catalog.api.integration.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**

- Produces the complete `/v1/admin/catalog` router wired to real PostgreSQL,
  MinIO, auth, transaction, clock, and ID implementations.

- [ ] **Step 1: Write failing composition integration test**

Create the app with test environment and real infrastructure adapters. Sign a
valid staff JWT and prove category -> product -> variant -> price -> media ->
audit through HTTP. Assert JSON contains no `companyId`, database row shape, or
credentials.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/api test:integration -- catalog.api.integration.test.ts`

Expected: FAIL because module composition is absent.

- [ ] **Step 3: Implement manual constructor composition**

`createCatalogModule(dependencies)` wires concrete adapters once. Do not add a
DI library. `createApiApp` accepts injectable dependencies for tests and uses
production dependencies from `server.ts`.

- [ ] **Step 4: Run complete API tests**

Run:

```bash
pnpm --filter @opendx/api test
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test pnpm --filter @opendx/api test:integration
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/catalog apps/api/src/app.ts apps/api/src/server.ts
git commit -m "feat(api): compose catalog module"
```

---

### Task 12: Add Console OIDC and Authenticated Catalog Shell

**Files:**

- Create: `apps/console/src/features/authentication/api/oidc-manager.ts`
- Create: `apps/console/src/features/authentication/hooks/auth-context.tsx`
- Create: `apps/console/src/features/authentication/pages/sign-in-page.tsx`
- Create: `apps/console/src/features/authentication/pages/auth-callback-page.tsx`
- Create: `apps/console/src/features/authentication/components/protected-route.tsx`
- Create: `apps/console/src/features/authentication/tests/authentication.test.tsx`
- Create: `apps/console/src/app/app-router.tsx`
- Create: `apps/console/src/app/console-shell.tsx`
- Create: `apps/console/src/app/console-shell.test.tsx`
- Modify: `apps/console/src/app/app.tsx`
- Modify: `apps/console/src/main.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`

**Interfaces:**

- Produces authenticated routes, token access for API client, role-aware
  navigation, and Catalog as the primary workspace.

- [ ] **Step 1: Write failing auth route tests**

Cover anonymous redirect to sign-in, login action, callback completion, valid
session rendering, logout, administrator/catalog roles, and permission-denied
state. Inject an `AuthClient` fake; do not contact Keycloak in unit tests.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/console test -- authentication.test.tsx console-shell.test.tsx`

Expected: FAIL because auth/router/shell are absent.

- [ ] **Step 3: Implement OIDC client and provider**

Configure Authorization Code + PKCE, automatic silent token renewal only if
supported by the configured realm, explicit callback handling, and logout
redirect. Store OIDC state through the library; never manually persist tokens
to localStorage.

- [ ] **Step 4: Implement compact console shell**

Primary nav is Products and Categories. Company Overview remains a secondary
alpha route and is not expanded. Use Lucide icons and accessible tooltips.

- [ ] **Step 5: Run focused console tests**

Run: `pnpm --filter @opendx/console test -- authentication.test.tsx console-shell.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/console/src/app apps/console/src/features/authentication apps/console/src/main.tsx apps/console/src/shared/styles/globals.css
git commit -m "feat(console): add staff OIDC shell"
```

---

### Task 13: Build Catalog List, Categories, and Product Editor

**Files:**

- Create: `apps/console/src/features/catalog/api/catalog-api.ts`
- Create: `apps/console/src/features/catalog/schemas/catalog-api.schema.ts`
- Create: `apps/console/src/features/catalog/types/catalog.types.ts`
- Create: `apps/console/src/features/catalog/mappers/catalog.mapper.ts`
- Create: `apps/console/src/features/catalog/hooks/use-products.ts`
- Create: `apps/console/src/features/catalog/hooks/use-product-editor.ts`
- Create: `apps/console/src/features/catalog/hooks/use-categories.ts`
- Create: `apps/console/src/features/catalog/pages/product-list-page.tsx`
- Create: `apps/console/src/features/catalog/pages/product-editor-page.tsx`
- Create: `apps/console/src/features/catalog/pages/category-page.tsx`
- Create: `apps/console/src/features/catalog/components/product-table.tsx`
- Create: `apps/console/src/features/catalog/components/product-form.tsx`
- Create: `apps/console/src/features/catalog/components/category-tree.tsx`
- Create: `apps/console/src/features/catalog/tests/product-list-page.test.tsx`
- Create: `apps/console/src/features/catalog/tests/product-editor-page.test.tsx`
- Create: `apps/console/src/features/catalog/tests/category-page.test.tsx`
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`

**Interfaces:**

- Consumes authenticated API and category/product DTOs.
- Produces operational product/category pages and reusable catalog hooks.

- [ ] **Step 1: Write failing API-schema and page-state tests**

Cover loading, empty, API error with retry, search, category/status filter,
pagination, create success, validation, duplicate slug, stale version,
permission denied, and archive confirmation.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/console test -- catalog`

Expected: FAIL because catalog feature is absent.

- [ ] **Step 3: Implement authenticated API client and response validation**

Every response is parsed by Zod before mapping to view models. The client sends
Bearer token and correlation ID, maps `401/403/409`, and never exposes raw
transport errors to components.

- [ ] **Step 4: Implement Products and Categories pages**

Use a dense table, stable column widths, thumbnail, product/brand, category,
variant count, price range, status, updated time, and icon action menu. Filters
remain URL-addressable through router search params.

- [ ] **Step 5: Implement product/category editor behavior**

Fields include category, name, slug preview, brand, description, and validated
attribute rows. Send current `version` on updates and present stale conflict as
a refresh-required state.

- [ ] **Step 6: Run focused tests, typecheck, and build**

```bash
pnpm --filter @opendx/console test -- catalog
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/console/src/features/catalog apps/console/src/app/app-router.tsx apps/console/src/shared/styles/globals.css
git commit -m "feat(console): add catalog management workspace"
```

---

### Task 14: Add Variant, Price, Media, and Audit Editor Panels

**Files:**

- Create: `apps/console/src/features/catalog/components/variant-editor.tsx`
- Create: `apps/console/src/features/catalog/components/price-editor.tsx`
- Create: `apps/console/src/features/catalog/components/media-manager.tsx`
- Create: `apps/console/src/features/catalog/components/catalog-audit-timeline.tsx`
- Create: `apps/console/src/features/catalog/hooks/use-variant-editor.ts`
- Create: `apps/console/src/features/catalog/hooks/use-product-media.ts`
- Create: `apps/console/src/features/catalog/tests/variant-editor.test.tsx`
- Create: `apps/console/src/features/catalog/tests/media-manager.test.tsx`
- Create: `apps/console/src/features/catalog/tests/catalog-audit-timeline.test.tsx`
- Modify: `apps/console/src/features/catalog/api/catalog-api.ts`
- Modify: `apps/console/src/features/catalog/pages/product-editor-page.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`

**Interfaces:**

- Completes the staff product workflow against variant, price, media, and audit
  APIs.

- [ ] **Step 1: Write failing interaction tests**

Cover SKU normalization/conflict, variant options, VND integer formatting,
price replacement confirmation, upload type/size/alt validation, upload
progress, primary selection, ordering, deletion confirmation, preview, empty
audit, and chronological audit rendering.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @opendx/console test -- variant-editor media-manager catalog-audit-timeline`

Expected: FAIL because editor panels are absent.

- [ ] **Step 3: Implement panels with stable responsive geometry**

Use tabs for Product, Variants and prices, Media, and Audit. Do not nest cards.
Use color-neutral operational states; lavender remains reserved for primary
action/focus/link emphasis.

- [ ] **Step 4: Run tests, typecheck, and build**

```bash
pnpm --filter @opendx/console test -- catalog
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console build
```

Expected: PASS with no text overflow at tested widths.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/catalog apps/console/src/shared/styles/globals.css
git commit -m "feat(console): complete product editing workflow"
```

---

### Task 15: Deliver Full Docker, Make, Seed, Backup, Restore, and Documentation

**Files:**

- Create: `Makefile`
- Create: `apps/api/Dockerfile`
- Create: `apps/console/Dockerfile`
- Create: `services/ai-runtime/Dockerfile`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/docker/README.md`
- Create: `infra/docker/postgres/init/001-create-test-database.sql`
- Create: `infra/backups/.gitignore`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/run-catalog-seed.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/catalog.seed.integration.test.ts`
- Create: `apps/api/src/modules/catalog/infrastructure/seeds/assets/` with
  twelve generated or attribution-compatible product images
- Create: `docs/api/catalog.md`
- Create: `docs/development/catalog-local-environment.md`
- Create: `docs/development/database-operations.md`
- Modify: `README.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `docs/dependencies.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces the contributor workflow and clean-checkout acceptance evidence for
  the entire focused phase.

- [ ] **Step 1: Write failing Make/Compose smoke assertions**

Create shell checks in `scripts/audit/repo.sh` or a focused
`scripts/audit/commerce-foundation.sh` that assert exactly the approved Make
targets, no `latest` image, no Temporal service, required health checks, named
volumes, Keycloak import, migration/bootstrap one-shot jobs, and no committed
backup archives.

- [ ] **Step 2: Run the audit and verify failure**

Run: `pnpm audit:repo`

Expected: FAIL because Makefile and full-container topology are absent.

- [ ] **Step 3: Implement API and console development images**

Use verified bases:

```text
node:22.22.0-bookworm-slim
postgres:18.3-bookworm
quay.io/keycloak/keycloak:26.4.2
minio/minio:RELEASE.2025-04-22T22-12-26Z
```

Pin reviewed digests in Compose/Dockerfiles during implementation and record
the human-readable tags in `docs/dependencies.md`. Run application containers
as non-root users. Bind-mount only source/config paths needed for hot reload;
keep container dependency directories isolated.

- [ ] **Step 4: Implement Compose dependency graph**

```text
postgres healthy -> migrate completed
minio healthy -> minio-bootstrap completed
keycloak healthy + migrate completed + minio-bootstrap completed -> api healthy
api healthy -> console healthy
```

Expose local ports 5432, 8080, 9000, 9001, 4000, and 3000. Preserve PostgreSQL
and MinIO named volumes on normal down.

- [ ] **Step 5: Implement the exact root Makefile surface**

`make help` lists only:

```text
help up down logs check db-migrate db-rollback db-seed db-backup db-restore
```

`make db-backup` writes
`infra/backups/opendx-YYYYMMDD-HHMMSS.dump` in PostgreSQL custom format.
`make db-restore BACKUP=infra/backups/opendx-20260805-120000.dump` rejects an
empty/missing path and uses `pg_restore --clean --if-exists --no-owner`.

`make check` runs TypeScript lint/typecheck/tests/build/audit through the API
tooling image, Python tests through a one-shot AI check image, PostgreSQL/MinIO
integration tests against isolated test resources, and Compose config
validation. It does not require host Node.js or Python and does not start the AI
runtime as an application service.

- [ ] **Step 6: Add deterministic catalog seed and asset provenance**

Seed four top-level categories and twelve products with one to three variants,
VND prices, alt text, and MinIO objects. Use UUID constants and upsert/skip
behavior so repeated runs do not duplicate data. Generate repository-owned
bitmap product images or use Apache-2.0/CC0-compatible assets with attribution;
do not hotlink remote images.

- [ ] **Step 7: Test migration, seed, backup, and restore**

Run:

```bash
make up
make db-migrate
make db-seed
make db-backup
make db-restore BACKUP="$(find infra/backups -name 'opendx-*.dump' -type f | sort | tail -n 1)"
```

Expected: all commands succeed, seed count remains twelve after rerun, and
catalog records/media references survive restore.

- [ ] **Step 8: Run complete automated validation**

Run:

```bash
make check
docker compose -f infra/docker/docker-compose.yml config --quiet
```

Expected: lint, typecheck, TypeScript/Python/unit/integration tests, console/API
builds, repository audit, and Compose validation pass. Record exact counts in
`docs/roadmap/mvp-status.md`.

- [ ] **Step 9: Verify the 17-step focused acceptance chain**

Follow the design document from clean checkout through login, seeded listing,
product create, variant, price, image, edit, audit, denied mutation, duplicate
SKU, stale edit, backup, restore, checks, and volume-preserving down. Record
commands and redacted evidence in `docs/development/catalog-local-environment.md`.

- [ ] **Step 10: Perform browser visual verification**

Use Playwright or the available browser harness at 1440x900, 1024x768, and
390x844. Capture Products, empty products, Product editor, Media, and denied
states. Verify no overlap/overflow, keyboard focus, product-image visibility,
and full-container API/media loading.

- [ ] **Step 11: Update all contributor and architecture docs**

Document Make and direct commands, Docker matrix, environment, Keycloak roles,
database operations/data-loss behavior, MinIO troubleshooting, API examples,
dependencies/licenses, project structure, roadmap status, and changelog.

- [ ] **Step 12: Final verification and commit**

Run:

```bash
git diff --check
make check
git status --short
```

Expected: all gates pass; only intended Phase 3 files are changed.

Commit:

```bash
git add Makefile .env.example apps/api apps/console infra scripts docs README.md CHANGELOG.md package.json pnpm-lock.yaml
git commit -m "feat(catalog): deliver commerce product foundation"
```

---

## Phase Completion Checklist

- [ ] Full-container `make up` reaches healthy state from clean checkout.
- [ ] Keycloak staff login and role enforcement work end to end.
- [ ] Category, product, variant, SKU, VND price, media, and audit workflows pass.
- [ ] PostgreSQL migration up/down and repository integration tests pass.
- [ ] MinIO upload, compensation, delete, bootstrap, and seed tests pass.
- [ ] Backup/restore preserves catalog state.
- [ ] Makefile contains exactly the approved common targets.
- [ ] No `companyId`, Company Core persistence, inventory, publication,
  storefront, checkout, shipping, or refund behavior entered the phase.
- [ ] API, console, Docker, security, database, dependency, build, roadmap, and
  changelog documentation match implementation.
- [ ] `make check` and repository audit pass with recorded evidence.
- [ ] Focused code review has no unresolved blocking or high-severity findings.
- [ ] Pull request targets `develop`; no release is created.
