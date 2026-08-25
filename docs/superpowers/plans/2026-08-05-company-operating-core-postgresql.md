<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Company Operating Core PostgreSQL Persistence Implementation Plan

> **Execution order:** Complete Tasks 1-4 of
> `2026-08-05-commerce-product-foundation.md`, execute this companion plan, then
> resume Commerce Tasks 5-15. Use TDD and the repository execution workflow.

**Goal:** Replace production in-memory Company Operating Core persistence with
normalized PostgreSQL storage while preserving the current read-only API
contracts and single-company model.

**Architecture:** Reuse the Phase 3 shared PostgreSQL pool, database session,
transaction runner, migration runner, correlation, readiness, and error
boundaries. Add a Company Operating Core migration, PostgreSQL repository, row
mappers, and idempotent NovaCommerce seed inside the existing module; runtime
composition injects PostgreSQL and never falls back to memory.

**Tech Stack:** Node.js 22, TypeScript strict mode, Express 5, PostgreSQL 18,
`pg` 8.22.0, `node-pg-migrate` 9.0.0, Vitest 4, Supertest, Docker Compose.

---

## Global Constraints

- Follow
  `docs/superpowers/specs/2026-08-05-company-operating-core-postgresql-design.md`.
- Preserve the current routes and response DTOs.
- Do not expose a Company ID or add `company_id` to child tables.
- Do not add Company Core mutation endpoints.
- Domain and application code cannot import `pg`, SQL rows, migrations, or
  environment types.
- Production composition cannot construct or fall back to the in-memory
  repository.
- Seed data must preserve current stable IDs, timestamps, correlations, and API
  fixture content.
- Migration, repository, seed, and API integration tests use an isolated real
  PostgreSQL database.
- Every behavior change follows red-green-refactor and ends with focused
  validation plus an atomic Conventional Commit.
- Update `CHANGELOG.md` and affected contributor/API/architecture docs in the
  same implementation unit.

## File Map

### Shared Database Prerequisite

Created by Commerce Tasks 1-4 and consumed without business imports:

- `apps/api/src/shared/config/environment.ts`
- `apps/api/src/shared/database/postgres.ts`
- `apps/api/src/shared/database/transaction.ts`
- `apps/api/src/shared/database/run-migrations.ts`
- `apps/api/src/shared/http/application-error.ts`
- `apps/api/src/shared/http/health.routes.ts`

### Company Operating Core

- `apps/api/src/modules/company-operating-core/infrastructure/database/migrations/202608050002_create_company_operating_core.ts`
- `apps/api/src/modules/company-operating-core/infrastructure/database/company-operating-core.rows.ts`
- `apps/api/src/modules/company-operating-core/infrastructure/database/company-operating-core.row-mapper.ts`
- `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/postgresql-company-operating-core.repository.ts`
- `apps/api/src/modules/company-operating-core/infrastructure/seeds/run-nova-commerce.seed.ts`
- `apps/api/src/modules/company-operating-core/tests/integration/`
- Existing module, service, repository interface, routes, DTOs, and API docs.

---

### Task 1: Add the Normalized Company Core Migration

**Files:**

- Create: `apps/api/src/modules/company-operating-core/infrastructure/database/migrations/202608050002_create_company_operating_core.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/integration/company-operating-core-migration.integration.test.ts`
- Modify: `apps/api/src/shared/database/run-migrations.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write the failing migration integration test**

The test must migrate an empty isolated database and assert these tables exist:

```typescript
const expectedTables = [
  "company_profile",
  "departments",
  "positions",
  "human_employees",
  "goals",
  "kpis",
  "operating_tasks",
  "business_events",
  "decisions",
  "approval_requests",
  "audit_events",
] as const;
```

It must also assert representative foreign keys and check constraints reject an
unknown task status, invalid actor type, and a department-owned goal without a
department reference. Run `down` and assert all eleven tables are absent.

**Step 2: Run the focused test and confirm RED**

```bash
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test \
pnpm --filter @opendx/api test:integration -- company-operating-core-migration.integration.test.ts
```

Expected: FAIL because migration `202608050002` does not exist.

**Step 3: Implement the migration**

Create normalized tables from the approved design. Use text IDs for existing
stable fixture identifiers, timezone-aware timestamps, nullable relationship
columns only where the domain permits them, indexes on every foreign key and
correlation ID, and database checks matching current TypeScript unions.

Use a singleton constraint for `company_profile`:

```sql
singleton_key smallint primary key check (singleton_key = 1)
```

Do not expose or map this key outside infrastructure.

**Step 4: Verify GREEN and rollback behavior**

Run the same focused integration command. Expected: PASS with all schema,
constraint, and down-migration assertions green.

**Step 5: Commit**

```bash
git add apps/api/src/modules/company-operating-core/infrastructure/database \
  apps/api/src/modules/company-operating-core/tests/integration/company-operating-core-migration.integration.test.ts \
  apps/api/src/shared/database/run-migrations.ts CHANGELOG.md
git commit -m "feat(company-core): add postgresql schema"
```

---

### Task 2: Implement Row Mapping and PostgreSQL Repository Reads

**Files:**

- Create: `apps/api/src/modules/company-operating-core/infrastructure/database/company-operating-core.rows.ts`
- Create: `apps/api/src/modules/company-operating-core/infrastructure/database/company-operating-core.row-mapper.ts`
- Create: `apps/api/src/modules/company-operating-core/infrastructure/database/company-operating-core.row-mapper.test.ts`
- Create: `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/postgresql-company-operating-core.repository.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/integration/postgresql-company-operating-core.repository.integration.test.ts`

**Step 1: Write failing row-mapper tests**

Assert snake-case rows map to the existing domain shape, nullable columns
become omitted optional properties, timestamps become ISO strings, numeric KPI
values are safe finite numbers, and returned actors are fresh nested objects.

**Step 2: Run the mapper test and confirm RED**

```bash
pnpm --filter @opendx/api test -- company-operating-core.row-mapper.test.ts
```

Expected: FAIL because row types and mapper do not exist.

**Step 3: Implement row types and pure mappers**

Keep SQL row interfaces infrastructure-private. Validate enum-like database
values before mapping instead of casting arbitrary strings into domain unions.

**Step 4: Write failing PostgreSQL repository contract tests**

Insert a minimal valid relational fixture and exercise all methods on
`ICompanyOperatingCoreRepository`. Assert `getSnapshot()` uses one read-only
transaction and every collection method returns deterministic ordering and
defensive result ownership.

**Step 5: Run the repository test and confirm RED**

```bash
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test \
pnpm --filter @opendx/api test:integration -- postgresql-company-operating-core.repository.integration.test.ts
```

Expected: FAIL because the PostgreSQL repository does not exist.

**Step 6: Implement the repository**

Inject a database-session factory/transaction runner. Use parameter-free
ordered `SELECT` statements for the read-only routes. Do not import Express or
environment state. `getSnapshot()` must query all tables inside one read-only
transaction and return the current domain aggregate.

**Step 7: Verify GREEN**

Run mapper unit tests and repository integration tests. Expected: PASS.

**Step 8: Commit**

```bash
git add apps/api/src/modules/company-operating-core/infrastructure/database \
  apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/postgresql-company-operating-core.repository.ts \
  apps/api/src/modules/company-operating-core/tests/integration/postgresql-company-operating-core.repository.integration.test.ts
git commit -m "feat(company-core): read operating data from postgres"
```

---

### Task 3: Add the Idempotent NovaCommerce PostgreSQL Seed

**Files:**

- Create: `apps/api/src/modules/company-operating-core/infrastructure/seeds/nova-commerce-postgresql.seed.ts`
- Create: `apps/api/src/modules/company-operating-core/infrastructure/seeds/run-nova-commerce.seed.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/integration/nova-commerce-postgresql.seed.integration.test.ts`
- Modify: `apps/api/package.json`
- Modify: `CHANGELOG.md`

**Step 1: Write the failing seed integration test**

Run the seed twice and assert stable counts matching the existing fixture:

```typescript
expect(counts).toEqual({
  company: 1,
  departments: 8,
  positions: 5,
  humanEmployees: 5,
  goals: 2,
  kpis: 2,
  tasks: 2,
  events: 4,
  decisions: 1,
  approvals: 3,
  auditEvents: 3,
});
```

Assert the `corr_lead_to_cash` relationships and stable IDs remain intact.

**Step 2: Run the seed test and confirm RED**

```bash
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test \
pnpm --filter @opendx/api test:integration -- nova-commerce-postgresql.seed.integration.test.ts
```

Expected: FAIL because the PostgreSQL seed does not exist.

**Step 3: Implement the transactional seed**

Reuse `createNovaCommerceSnapshot()` as deterministic source data, but insert
through parameterized PostgreSQL statements in dependency order. Use stable
primary keys and conflict handling that updates deterministic fixture fields or
skips unchanged rows. Run all writes in one transaction.

**Step 4: Add a direct seed command**

Add to `apps/api/package.json`:

```json
"db:seed:company-core": "tsx src/modules/company-operating-core/infrastructure/seeds/run-nova-commerce.seed.ts"
```

The command parses validated environment, opens the pool, runs the seed, and
always closes the pool.

**Step 5: Verify GREEN**

Run the seed integration test twice in one test process and then run all
Company Core tests. Expected: stable counts and all tests pass.

**Step 6: Commit**

```bash
git add apps/api/src/modules/company-operating-core/infrastructure/seeds \
  apps/api/src/modules/company-operating-core/tests/integration/nova-commerce-postgresql.seed.integration.test.ts \
  apps/api/package.json CHANGELOG.md
git commit -m "feat(company-core): seed novacommerce in postgres"
```

---

### Task 4: Replace Runtime Memory Composition and Fail Closed

**Files:**

- Modify: `apps/api/src/modules/company-operating-core/company-operating-core.module.ts`
- Modify: `apps/api/src/modules/company-operating-core/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/integration/company-operating-core-postgresql.api.integration.test.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/integration/company-operating-core-database-failure.integration.test.ts`
- Modify: `apps/api/src/modules/company-operating-core/tests/integration/company-operating-core.api.test.ts`
- Modify: `CHANGELOG.md`

**Step 1: Write the failing PostgreSQL API compatibility test**

Migrate and seed the test database, compose the real PostgreSQL repository,
and assert all existing endpoints retain their documented shapes and values.
Assert no response contains `companyId`, `singletonKey`, SQL fields, or
credentials.

**Step 2: Write the failing no-fallback test**

Inject a repository/session failure and assert the business endpoint returns
the stable `503 DEPENDENCY_UNAVAILABLE` envelope with a correlation ID. Assert
the response does not contain NovaCommerce seed data from memory.

**Step 3: Run both tests and confirm RED**

```bash
TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:5432/opendx_test \
pnpm --filter @opendx/api test:integration -- company-operating-core-postgresql.api.integration.test.ts company-operating-core-database-failure.integration.test.ts
```

Expected: FAIL because production composition still constructs the in-memory
repository and does not map dependency errors.

**Step 4: Implement PostgreSQL-only runtime composition**

Make `createCompanyOperatingCoreModule(dependencies)` accept the repository or
database dependencies explicitly. `server.ts` owns production pool lifecycle
and supplies PostgreSQL composition. Tests inject fakes only through the same
application port. Remove all production imports of
`InMemoryCompanyOperatingCoreRepository`.

**Step 5: Verify GREEN and regression safety**

Run all API unit/integration tests, typecheck, and dependency-boundary review.
Expected: current API contracts pass against PostgreSQL and unavailable
database behavior fails closed.

**Step 6: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/server.ts \
  apps/api/src/modules/company-operating-core CHANGELOG.md
git commit -m "refactor(company-core): require postgres persistence"
```

---

### Task 5: Integrate Company Core into Docker Migration, Seed, and Readiness

**Execution:** Perform inside Commerce Task 15 so Docker and Make changes remain
one coherent topology unit.

**Files:**

- Modify: `Makefile`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/docker/README.md`
- Modify: `apps/api/Dockerfile`
- Modify: `apps/api/package.json`
- Modify: `.env.example`
- Modify: `docs/build-from-source.md`
- Modify: `docs/development/database-operations.md`
- Modify: `docs/api/company-operating-core.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

**Step 1: Extend the failing Commerce topology audit**

Assert the migration job applies both Catalog and Company Core migrations, the
seed command seeds both modules, API waits for migration and seed completion,
and no runtime command references the in-memory Company Core adapter.

**Step 2: Run audit and confirm RED**

Run `pnpm audit:repo`. Expected: FAIL until the full-container topology and
portable audit are implemented.

**Step 3: Wire migration and seed ordering**

Use one migration job for all committed migrations and a deterministic seed
job that runs Company Core before Catalog. API readiness checks PostgreSQL,
migration state, Keycloak, and MinIO as required by the Commerce design.

**Step 4: Document direct and Make commands**

Document migration, rollback, idempotent seed, backup, restore, readiness, and
the explicit no-memory-fallback behavior. Preserve direct pnpm/Docker commands
behind every Make target.

**Step 5: Run complete validation**

```bash
make up
make db-migrate
make db-seed
make check
docker compose -f infra/docker/docker-compose.yml config --quiet
```

Expected: all services healthy, Company Core routes read PostgreSQL seed data,
Catalog routes read PostgreSQL catalog data, and all checks pass.

**Step 6: Commit with Commerce Task 15**

Include the Company Core Docker/docs files in the Task 15 atomic platform
delivery commit.

---

## Completion Checklist

- [ ] Normalized Company Core migration passes `up` and `down` integration tests.
- [ ] PostgreSQL repository satisfies every existing application port method.
- [ ] NovaCommerce seed is transactional and idempotent.
- [ ] Existing Company Core API responses remain compatible.
- [ ] Production composition has no in-memory repository import or fallback.
- [ ] PostgreSQL failure makes business endpoints fail closed.
- [ ] Docker migration and seed jobs complete before API readiness.
- [ ] Catalog and Company Core share only approved technical infrastructure.
- [ ] API, database, Docker, architecture, roadmap, and changelog docs match runtime.
- [ ] Full validation and repository audit pass with recorded evidence.
