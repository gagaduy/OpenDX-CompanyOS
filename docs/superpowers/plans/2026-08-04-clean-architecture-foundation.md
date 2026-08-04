<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Clean Architecture Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing OpenDX CompanyOS codebase and contributor guidance into a feature-first Clean Architecture baseline, including a Vite React console, layered Express Company Core module, typed Python service structure, automated boundaries, and open-source quality gates.

**Architecture:** Business modules depend inward from presentation and infrastructure toward application and domain contracts. Concrete dependencies are wired in explicit composition roots, while technical health endpoints use the approved reduced `Route -> Handler` exception. Frontend code is organized by feature and Python mirrors the backend boundary model without creating empty future modules.

**Tech Stack:** Node.js 22+, pnpm 11.18.0, TypeScript strict mode, Express 5, Zod, React 19, Vite, Vitest, Supertest, React Testing Library, ESLint, Prettier, FastAPI, Pydantic, pytest, Ruff, mypy, Husky, lint-staged, GitHub Actions, Docker Compose.

## Global Constraints

- Work on `refactor/clean-architecture-foundation`, which is based on `develop`; do not edit `main`.
- Preserve Company-first, human-governed, permission-aware, graph-grounded, and auditable-by-default product rules.
- Do not add Phase 3 workflow/iPaaS behavior, PostgreSQL persistence, Keycloak login, Company Core writes, new Mission Control screens, a DI container, generated API clients, or empty future modules.
- Business flow is `Route -> Validator -> Controller -> Service Interface -> Service Implementation -> Repository Interface -> Repository Implementation -> Mapper -> Response DTO`.
- Technical `Route -> Handler` exceptions require all five conditions in the design spec.
- TypeScript stays strict; `any` is prohibited unless a boundary reason is documented and the value is immediately narrowed.
- React UI preserves `#010102` canvas, scarce `#5e6ad2` accent, current content, responsive behavior, and the approved Linear-inspired product canvas.
- New license-capable files receive Apache-2.0 SPDX headers.
- Every repository-changing commit updates `CHANGELOG.md` under `[Unreleased]`.
- Dependencies must be upstream packages, recorded in `docs/dependencies.md`, and locked in `pnpm-lock.yaml` or the Python project metadata.
- Follow TDD for production behavior: write a focused failing test, verify the expected failure, implement the minimum behavior, verify green, then refactor.
- Use `apply_patch` for manual edits and preserve unrelated user changes.

---

## Target File Map

### Repository Quality Foundation

- `eslint.config.js`: TypeScript and React lint rules, including restricted architecture imports.
- `.prettierrc.json`: deterministic repository formatting rules.
- `.prettierignore`: generated and third-party paths excluded from formatting.
- `scripts/architecture/check-import-boundaries.mjs`: framework-independent boundary checker.
- `scripts/architecture/check-import-boundaries.test.mjs`: checker behavior tests.
- `package.json`: root format, lint, architecture, Python, prepare, and lint-staged commands.

### Express Shared HTTP Foundation

- `apps/api/src/shared/errors/app-error.ts`: stable application error base.
- `apps/api/src/shared/errors/validation-error.ts`: request-validation error.
- `apps/api/src/shared/http/api-response.ts`: success and error envelope types/helpers.
- `apps/api/src/shared/middleware/error-handler.ts`: centralized Express error translation.
- `apps/api/src/shared/health/health.route.ts`: approved technical health handler.

### Company Operating Core Module

- `apps/api/src/modules/company-operating-core/domain/entities/company-operating-core.ts`: entity and aggregate contracts.
- `apps/api/src/modules/company-operating-core/domain/value-objects/company-id.ts`: company identifier validation/narrowing.
- `apps/api/src/modules/company-operating-core/domain/exceptions/invalid-company-id.error.ts`: invalid identifier domain error.
- `apps/api/src/modules/company-operating-core/domain/services/company-operating-core-validation.ts`: aggregate invariants.
- `apps/api/src/modules/company-operating-core/application/dtos/responses/*.ts`: explicit transport response contracts.
- `apps/api/src/modules/company-operating-core/application/mappers/company-operating-core.mapper.ts`: domain-to-response conversion.
- `apps/api/src/modules/company-operating-core/application/repositories/interfaces/company-operating-core.repository.ts`: async repository port.
- `apps/api/src/modules/company-operating-core/application/exceptions/company-not-found.error.ts`: company-scoped use-case error.
- `apps/api/src/modules/company-operating-core/application/services/interfaces/company-operating-core.service.ts`: async query-service contract.
- `apps/api/src/modules/company-operating-core/application/services/implementations/company-operating-core.service.ts`: company-scoped query policy.
- `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/in-memory-company-operating-core.repository.ts`: in-memory adapter.
- `apps/api/src/modules/company-operating-core/presentation/validators/company-id-params.schema.ts`: Zod path-param schema.
- `apps/api/src/modules/company-operating-core/presentation/controllers/company-operating-core.controller.ts`: HTTP orchestration.
- `apps/api/src/modules/company-operating-core/presentation/routes/company-operating-core.routes.ts`: thin route registration.
- `apps/api/src/modules/company-operating-core/tests/fixtures/*.ts`: NovaCommerce and secondary-company fixtures.
- `apps/api/src/modules/company-operating-core/tests/integration/company-operating-core.api.test.ts`: composed API contract tests.
- `apps/api/src/modules/company-operating-core/company-operating-core.module.ts`: composition root.
- `apps/api/src/modules/company-operating-core/index.ts`: module public API.

### React Console

- `apps/console/index.html`: Vite HTML entry.
- `apps/console/src/main.tsx`: React DOM bootstrap.
- `apps/console/src/app/app.tsx`: application composition.
- `apps/console/src/features/company-overview/pages/company-overview.page.tsx`: current console page.
- `apps/console/src/features/company-overview/components/*.tsx`: focused overview components.
- `apps/console/src/features/company-overview/company-overview.data.ts`: typed static shell data.
- `apps/console/src/features/company-overview/tests/company-overview.page.test.tsx`: rendered behavior test.
- `apps/console/src/shared/styles/globals.css`: approved design and responsive styles.
- `apps/console/vite.config.ts`: Vite and Vitest configuration.

### Python AI Runtime

- `services/ai-runtime/app/create_app.py`: FastAPI composition root.
- `services/ai-runtime/app/shared/health/router.py`: reduced technical health route.
- `services/ai-runtime/app/shared/health/schemas.py`: typed health response schema.
- `services/ai-runtime/app/main.py`: ASGI export only.
- `services/ai-runtime/tests/shared/health/test_health_api.py`: health integration test.

### Guidance and Automation

- `docs/architecture/clean-architecture.md`: normative layer definitions.
- `docs/architecture/dependency-rules.md`: executable and human-readable import rules.
- `docs/development/api-conventions.md`: DTO, envelope, status, and validation conventions.
- `docs/development/coding-conventions.md`: TypeScript, Python, React, naming, and configuration rules.
- `docs/development/testing-strategy.md`: TDD and test-layer guidance.
- `.agents/skills/opendx-companyos-development/SKILL.md`: concise agent workflow.
- `.agents/skills/opendx-companyos-development/tests/pressure-scenarios.md`: skill scenarios and acceptance criteria.
- `.agents/checklists/clean-architecture-review.md`: review gate.
- `.github/workflows/ci.yml`: pull-request quality gate.
- `.husky/pre-commit`: fast changed-file checks.

---

### Task 1: TypeScript Formatting, Linting, and Boundary Checker

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `scripts/architecture/check-import-boundaries.mjs`
- Create: `scripts/architecture/check-import-boundaries.test.mjs`
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify: `apps/console/package.json`
- Modify: `packages/config/package.json`
- Modify: `packages/domain/package.json`
- Modify: `packages/ui/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: existing pnpm workspace and TypeScript 7 strict configuration.
- Produces: `findImportBoundaryViolation(sourcePath: string, importSpecifier: string): string | undefined`, root scripts `format:check`, `lint`, `architecture:check`, and `test:architecture`.

- [ ] **Step 1: Write the failing architecture-checker tests**

Create `scripts/architecture/check-import-boundaries.test.mjs` with Node's built-in test runner:

```js
// SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { findImportBoundaryViolation } from "./check-import-boundaries.mjs";

test("domain cannot import an infrastructure adapter", () => {
  assert.match(
    findImportBoundaryViolation(
      "apps/api/src/modules/company/domain/entity.ts",
      "../infrastructure/repository.ts",
    ) ?? "",
    /domain.*infrastructure/i,
  );
});

test("application can import its domain", () => {
  assert.equal(
    findImportBoundaryViolation(
      "apps/api/src/modules/company/application/service.ts",
      "../domain/entity.ts",
    ),
    undefined,
  );
});

test("shared code cannot import a business module", () => {
  assert.match(
    findImportBoundaryViolation(
      "apps/api/src/shared/http/response.ts",
      "../../modules/company/index.ts",
    ) ?? "",
    /shared.*module/i,
  );
});

test("a frontend feature cannot import another feature private file", () => {
  assert.match(
    findImportBoundaryViolation(
      "apps/console/src/features/company-overview/page.tsx",
      "../../workflow/components/run-row.tsx",
    ) ?? "",
    /feature.*private/i,
  );
});
```

- [ ] **Step 2: Run the checker test and verify RED**

Run:

```bash
node --test scripts/architecture/check-import-boundaries.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `check-import-boundaries.mjs`.

- [ ] **Step 3: Implement the minimum path-aware checker**

Create `check-import-boundaries.mjs` using `node:path.posix` to normalize repository paths. Export the tested function and add a CLI that scans `.ts`, `.tsx`, `.js`, and `.mjs` files, parses static import/export declarations with the installed TypeScript compiler API, reports `source -> target` violations, and exits non-zero. Encode these exact rules:

```js
const forbiddenByLayer = {
  domain: new Set(["application", "infrastructure", "presentation"]),
  application: new Set(["infrastructure", "presentation"]),
  presentation: new Set(["infrastructure"]),
};
```

Also reject `shared -> modules`, `shared -> features`, and cross-feature imports unless the resolved target is that feature's `index.ts`.

- [ ] **Step 4: Verify the checker GREEN**

Run:

```bash
node --test scripts/architecture/check-import-boundaries.test.mjs
node scripts/architecture/check-import-boundaries.mjs apps packages
```

Expected: all checker tests PASS and the current pre-refactor tree reports no false positive.

- [ ] **Step 5: Add ESLint and Prettier configuration**

Install root development dependencies:

```bash
pnpm add -Dw eslint @eslint/js typescript-eslint globals eslint-plugin-react-hooks eslint-plugin-react-refresh prettier husky lint-staged
```

Configure `eslint.config.js` for TypeScript source, React hooks/refresh in `apps/console`, ignored generated paths, `@typescript-eslint/no-explicit-any: error`, and zero warnings. Configure `.prettierrc.json` with double quotes, trailing commas, semicolons, and 80-character prose/code wrapping. Exclude `node_modules`, `.next`, `dist`, coverage, lockfiles, generated Python metadata, and vendored artifacts in `.prettierignore`.

- [ ] **Step 6: Wire repository scripts**

Set these root scripts:

```json
{
  "format:check": "prettier --check .",
  "lint": "eslint . --max-warnings=0 && pnpm architecture:check",
  "architecture:check": "node scripts/architecture/check-import-boundaries.mjs apps packages",
  "test:architecture": "node --test scripts/architecture/check-import-boundaries.test.mjs",
  "prepare": "husky"
}
```

Keep existing typecheck/test/audit scripts. Change API and package `lint` scripts from TypeScript compilation to `eslint src --max-warnings=0`. During the pre-Vite transition, set the console lint script to `eslint app next.config.ts --max-warnings=0`; Task 7 replaces it with the final `src`/Vite paths. Keep every `typecheck` script as `tsc --noEmit`.

- [ ] **Step 7: Run focused quality gates**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:architecture
```

Expected: all commands PASS without warnings.

- [ ] **Step 8: Record and commit the tooling unit**

Add one `[Unreleased]` changelog item describing TypeScript format, lint, and architecture gates. Commit:

```bash
git add eslint.config.js .prettierrc.json .prettierignore scripts/architecture package.json apps/*/package.json packages/*/package.json pnpm-lock.yaml CHANGELOG.md
git commit -m "build: enforce TypeScript architecture boundaries"
```

### Task 2: Shared Express HTTP and Error Foundation

**Files:**
- Create: `apps/api/src/shared/errors/app-error.ts`
- Create: `apps/api/src/shared/errors/validation-error.ts`
- Create: `apps/api/src/shared/http/api-response.ts`
- Create: `apps/api/src/shared/middleware/error-handler.ts`
- Create: `apps/api/src/shared/middleware/error-handler.test.ts`
- Create: `apps/api/src/shared/health/health.route.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Express 5 and `SERVICE_NAMES.api`.
- Produces: `AppError`, `ValidationError`, `ApiSuccess<T>`, `ApiFailure`, `sendSuccess<T>()`, `errorHandler`, and `createHealthRouter()`.

- [ ] **Step 1: Write failing envelope and middleware tests**

Create `error-handler.test.ts` that builds a tiny Express app, throws `new AppError(404, "COMPANY_NOT_FOUND", "Company was not found")`, and expects:

```json
{
  "success": false,
  "message": "Company was not found",
  "errorCode": "COMPANY_NOT_FOUND",
  "errors": []
}
```

Add a second test that throws `new Error("database password leaked")` and expects status `500`, code `INTERNAL_SERVER_ERROR`, and no leaked message.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @opendx/api test -- src/shared/middleware/error-handler.test.ts
```

Expected: FAIL because the shared error modules do not exist.

- [ ] **Step 3: Implement response and error contracts**

Use these stable shapes:

```ts
export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta: Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  message: string;
  errorCode: string;
  errors: readonly unknown[];
}
```

`AppError` exposes readonly `statusCode`, `errorCode`, and `errors`. `ValidationError` fixes status `400` and code `VALIDATION_ERROR`. `sendSuccess(response, message, data, meta = {})` returns an Express response containing the success envelope. `errorHandler` maps known `AppError` instances and hides unexpected exception details.

- [ ] **Step 4: Extract the technical health router**

Create `createHealthRouter()` under `shared/health` with the existing minimal response:

```json
{ "status": "ok", "service": "opendx-api" }
```

Register it in `app.ts`; keep `app.test.ts` unchanged except for imports required by the app factory.

- [ ] **Step 5: Verify GREEN and regression behavior**

Run:

```bash
pnpm --filter @opendx/api test
pnpm --filter @opendx/api typecheck
pnpm lint
```

Expected: middleware tests, existing health test, and existing Phase 2 tests PASS.

- [ ] **Step 6: Record and commit the HTTP foundation**

Update `[Unreleased]`, then commit:

```bash
git add apps/api/src/shared apps/api/src/app.ts apps/api/src/app.test.ts CHANGELOG.md
git commit -m "feat(api): add shared HTTP error foundation"
```

### Task 3: Move Company Core Domain Into Its Owning Module

**Files:**
- Create: `apps/api/src/modules/company-operating-core/domain/entities/company-operating-core.ts`
- Create: `apps/api/src/modules/company-operating-core/domain/value-objects/company-id.ts`
- Create: `apps/api/src/modules/company-operating-core/domain/exceptions/invalid-company-id.error.ts`
- Create: `apps/api/src/modules/company-operating-core/domain/services/company-operating-core-validation.ts`
- Create: `apps/api/src/modules/company-operating-core/domain/services/company-operating-core-validation.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `CompanyId` from the existing framework-neutral `packages/domain/src/ids.ts`.
- Produces: all Company Core entity interfaces, `ValidationIssue`, `validateCompanyOperatingCoreSnapshot()`, `assertValidCompanyScope()`, `parseCompanyId(value: string): CompanyId`, and `InvalidCompanyIdError`.

- [ ] **Step 1: Move validation tests first and verify the new boundary is RED**

Create the module-domain test by moving the four existing Company Core validation cases and changing imports to:

```ts
import type { CompanyOperatingCoreSnapshot } from "../entities/company-operating-core";
import {
  assertValidCompanyScope,
  validateCompanyOperatingCoreSnapshot,
} from "./company-operating-core-validation";
```

Add a `parseCompanyId` test that accepts `company_novacommerce` and rejects `tenant_novacommerce`.

Run:

```bash
pnpm --filter @opendx/api test -- src/modules/company-operating-core/domain
```

Expected: FAIL because the module-domain files do not exist.

- [ ] **Step 2: Implement domain entities, value object, validation, and exception**

Move the entity/type declarations from `packages/domain/src/company-core.ts` unchanged into the module entity file. Move `TASK_STATUSES`, `APPROVAL_STATUSES`, `CORE_ENTITY_KINDS`, `validateCompanyOperatingCoreSnapshot`, and `assertValidCompanyScope` into the domain service file. Implement a transport-independent parser:

```ts
export function parseCompanyId(value: string): CompanyId {
  if (!/^company_[a-z0-9][a-z0-9_-]*$/.test(value)) {
    throw new InvalidCompanyIdError(value);
  }
  return value as CompanyId;
}
```

`InvalidCompanyIdError` extends `Error`, stores the rejected value, and imports no shared, HTTP, Express, or Zod type. Presentation validation converts invalid request data to `ValidationError`; domain callers use the parser directly.

- [ ] **Step 3: Keep the legacy export as a temporary compatibility boundary**

Do not change `packages/domain/src/company-core.ts` yet. The old API still imports it until Task 6 switches application composition atomically. Record in the task notes that the duplicate contract is transitional and must be deleted in Task 6.

- [ ] **Step 4: Verify domain GREEN**

Run:

```bash
pnpm --filter @opendx/api test -- src/modules/company-operating-core/domain
pnpm --filter @opendx/domain test
pnpm --filter @opendx/api typecheck
pnpm architecture:check
```

Expected: domain and shared-package tests PASS and no inward dependency violation is reported.

- [ ] **Step 5: Record and commit domain ownership**

Update `[Unreleased]`, then commit:

```bash
git add apps/api/src/modules/company-operating-core/domain CHANGELOG.md
git commit -m "refactor(domain): move company core into API module"
```

### Task 4: Add Company Core Application Ports, DTOs, Mapper, and Service

**Files:**
- Create: `apps/api/src/modules/company-operating-core/application/exceptions/company-not-found.error.ts`
- Create: `apps/api/src/modules/company-operating-core/application/repositories/interfaces/company-operating-core.repository.ts`
- Create: `apps/api/src/modules/company-operating-core/application/services/interfaces/company-operating-core.service.ts`
- Create: `apps/api/src/modules/company-operating-core/application/services/implementations/company-operating-core.service.ts`
- Create: `apps/api/src/modules/company-operating-core/application/services/implementations/company-operating-core.service.test.ts`
- Create: `apps/api/src/modules/company-operating-core/application/dtos/responses/company-operating-core-response.dto.ts`
- Create: `apps/api/src/modules/company-operating-core/application/dtos/responses/company-core-collection-response.dto.ts`
- Create: `apps/api/src/modules/company-operating-core/application/mappers/company-operating-core.mapper.ts`
- Create: `apps/api/src/modules/company-operating-core/application/mappers/company-operating-core.mapper.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Company Core entities and `CompanyId`.
- Produces: `ICompanyOperatingCoreRepository`, `ICompanyOperatingCoreService`, `CompanyOperatingCoreService`, `CompanyNotFoundError`, explicit response DTOs, and `CompanyOperatingCoreMapper`.

- [ ] **Step 1: Write failing service tests with a fake repository**

Use this service contract:

```ts
export interface ICompanyOperatingCoreService {
  getSnapshot(companyId: CompanyId): Promise<CompanyOperatingCoreResponseDto>;
  listDepartments(companyId: CompanyId): Promise<readonly DepartmentResponseDto[]>;
  listTasks(companyId: CompanyId): Promise<readonly TaskResponseDto[]>;
  listEvents(companyId: CompanyId): Promise<readonly BusinessEventResponseDto[]>;
  listApprovals(companyId: CompanyId): Promise<readonly ApprovalResponseDto[]>;
}
```

The fake repository returns a valid fixture for `company_novacommerce` and `undefined` otherwise. Test that `getSnapshot` maps NovaCommerce, all list methods remain company-scoped, and an unknown company rejects with `CompanyNotFoundError`.

- [ ] **Step 2: Verify service RED**

Run:

```bash
pnpm --filter @opendx/api test -- src/modules/company-operating-core/application/services
```

Expected: FAIL because service contracts and implementation do not exist.

- [ ] **Step 3: Define the async repository port**

Use this exact interface:

```ts
export interface ICompanyOperatingCoreRepository {
  findSnapshotByCompanyId(
    companyId: CompanyId,
  ): Promise<CompanyOperatingCoreSnapshot | undefined>;
  findDepartmentsByCompanyId(companyId: CompanyId): Promise<readonly Department[]>;
  findTasksByCompanyId(companyId: CompanyId): Promise<readonly Task[]>;
  findEventsByCompanyId(companyId: CompanyId): Promise<readonly BusinessEvent[]>;
  findApprovalsByCompanyId(companyId: CompanyId): Promise<readonly ApprovalRequest[]>;
}
```

- [ ] **Step 4: Define explicit response DTOs and mapper tests**

Create readonly DTOs containing every public field currently returned for Company, Department, Position, HumanEmployee, Goal, KPI, Task, BusinessEvent, Decision, ApprovalRequest, and AuditEvent. The aggregate DTO contains readonly arrays of those response DTOs. Mapper tests must prove returned objects are structural copies by mutating a source fixture after mapping and asserting the mapped DTO remains unchanged.

- [ ] **Step 5: Implement mapper and query service**

`CompanyNotFoundError` extends shared `AppError` with status `404`, code `COMPANY_NOT_FOUND`, message `Company was not found`, and no details. `CompanyOperatingCoreMapper.toResponse(snapshot)` deep-copies nested actors and arrays. Collection mapper methods return copied DTO arrays. `CompanyOperatingCoreService` receives `ICompanyOperatingCoreRepository` and `CompanyOperatingCoreMapper` through its constructor. Each method first verifies the company exists through `findSnapshotByCompanyId`; unknown companies throw `CompanyNotFoundError`.

- [ ] **Step 6: Verify application GREEN**

Run:

```bash
pnpm --filter @opendx/api test -- src/modules/company-operating-core/application
pnpm --filter @opendx/api typecheck
pnpm architecture:check
```

Expected: service and mapper tests PASS; application code has no infrastructure or presentation imports.

- [ ] **Step 7: Record and commit application boundaries**

Update `[Unreleased]`, then commit:

```bash
git add apps/api/src/modules/company-operating-core/application CHANGELOG.md
git commit -m "refactor(api): add company core application layer"
```

### Task 5: Add In-Memory Adapter and Focused Fixtures

**Files:**
- Create: `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/in-memory-company-operating-core.repository.ts`
- Create: `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/in-memory-company-operating-core.repository.test.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/fixtures/nova-commerce.fixture.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/fixtures/secondary-company.fixture.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/fixtures/company-core-seed.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `ICompanyOperatingCoreRepository`, domain validation functions, and existing seed data.
- Produces: `InMemoryCompanyOperatingCoreRepository`, `NOVACOMMERCE_COMPANY_ID`, and `createCompanyCoreSeed()`.

- [ ] **Step 1: Write the failing adapter contract tests**

Move the four existing repository behaviors into the new adapter test, await every method, and type the test suite as a reusable factory:

```ts
function companyCoreRepositoryContract(
  createRepository: () => ICompanyOperatingCoreRepository,
): void {
  // Register the four existing repository behaviors against the port.
}
```

Call the contract with `new InMemoryCompanyOperatingCoreRepository(createCompanyCoreSeed())`.

- [ ] **Step 2: Verify adapter RED**

Run:

```bash
pnpm --filter @opendx/api test -- in-memory-company-operating-core.repository.test.ts
```

Expected: FAIL because the new adapter and fixture exports do not exist.

- [ ] **Step 3: Split the existing seed without changing records**

Move `createNovaCommerceSnapshot`, its helpers, `NOVACOMMERCE_COMPANY_ID`, and every NovaCommerce record byte-for-byte into `nova-commerce.fixture.ts`. Move `createCompassSnapshot` and `COMPASS_COMPANY_ID` into `secondary-company.fixture.ts`. Implement `createCompanyCoreSeed()` in `company-core-seed.ts` as:

```ts
export function createCompanyCoreSeed(): CompanyOperatingCoreSnapshot[] {
  return [createNovaCommerceSnapshot(), createSecondaryCompanySnapshot()];
}
```

Do not rename IDs, timestamps, correlations, employee names, or demo values.

- [ ] **Step 4: Implement the async in-memory adapter**

Implement the repository port with async methods. Validate every constructor snapshot with both domain validation functions. Copy the seed array on construction and return copies from collection methods so callers cannot mutate repository state.

- [ ] **Step 5: Verify adapter GREEN and fixture preservation**

Run:

```bash
pnpm --filter @opendx/api test -- in-memory-company-operating-core.repository.test.ts
pnpm --filter @opendx/api typecheck
pnpm architecture:check
```

Expected: all four preserved behaviors PASS, including tenant isolation and correlation alignment.

- [ ] **Step 6: Commit the new adapter while compatibility code remains active**

The old `apps/api/src/company-core` files remain until Task 6 switches `app.ts` to the new module. Update `[Unreleased]` and commit:

```bash
git add apps/api/src/modules/company-operating-core CHANGELOG.md
git commit -m "refactor(api): isolate company core repository adapter"
```

### Task 6: Add Company Core Presentation and Composition Layers

**Files:**
- Create: `apps/api/src/modules/company-operating-core/presentation/validators/company-id-params.schema.ts`
- Create: `apps/api/src/modules/company-operating-core/presentation/validators/company-id-params.schema.test.ts`
- Create: `apps/api/src/modules/company-operating-core/presentation/controllers/company-operating-core.controller.ts`
- Create: `apps/api/src/modules/company-operating-core/presentation/controllers/company-operating-core.controller.test.ts`
- Create: `apps/api/src/modules/company-operating-core/presentation/routes/company-operating-core.routes.ts`
- Create: `apps/api/src/modules/company-operating-core/company-operating-core.module.ts`
- Create: `apps/api/src/modules/company-operating-core/index.ts`
- Create: `apps/api/src/modules/company-operating-core/tests/integration/company-operating-core.api.test.ts`
- Modify: `apps/api/src/shared/middleware/error-handler.ts`
- Modify: `apps/api/src/app.ts`
- Delete: `apps/api/src/company-core/routes.ts`
- Delete: `apps/api/src/company-core/routes.test.ts`
- Delete: `apps/api/src/company-core/repository.ts`
- Delete: `apps/api/src/company-core/repository.test.ts`
- Delete: `apps/api/src/company-core/seed.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/index.test.ts`
- Delete: `packages/domain/src/company-core.ts`
- Delete: `packages/domain/src/company-core.test.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `ICompanyOperatingCoreService`, shared API response helpers, `CompanyNotFoundError`, and in-memory adapter.
- Produces: `companyIdParamsSchema`, `validateCompanyIdParams`, `CompanyOperatingCoreController`, `createCompanyOperatingCoreRouter()`, and `createCompanyOperatingCoreModule()`.

- [ ] **Step 1: Install Zod and write failing validator tests**

Run:

```bash
pnpm --filter @opendx/api add zod
```

Test that `{ companyId: "company_novacommerce" }` parses and `{ companyId: "tenant_demo" }` throws `ValidationError` containing path `companyId`.

- [ ] **Step 2: Verify validator RED**

Run:

```bash
pnpm --filter @opendx/api test -- company-id-params.schema.test.ts
```

Expected: FAIL because the validator module does not exist.

- [ ] **Step 3: Implement schema and validator middleware**

Define:

```ts
export const companyIdParamsSchema = z.object({
  companyId: z.string().regex(/^company_[a-z0-9][a-z0-9_-]*$/),
});
```

`validateCompanyIdParams` parses `request.params`, stores the parsed `CompanyId` in typed `response.locals.companyId`, and forwards a `ValidationError` containing normalized Zod issues on failure.

- [ ] **Step 4: Write failing controller tests**

Provide a fake `ICompanyOperatingCoreService`. For each controller method, assert the matching service method receives `response.locals.companyId`, status is `200`, and the body has `success`, the endpoint-specific message, `data`, and empty `meta`. Assert no repository appears in controller construction.

- [ ] **Step 5: Implement controller, routes, and composition root**

Controller methods are arrow-function `RequestHandler`s so route registration does not require rebinding. Routes register the shared validator followed by one controller method for each existing endpoint. `createCompanyOperatingCoreModule()` wires:

```ts
const repository = new InMemoryCompanyOperatingCoreRepository(
  createCompanyCoreSeed(),
);
const mapper = new CompanyOperatingCoreMapper();
const service = new CompanyOperatingCoreService(repository, mapper);
const controller = new CompanyOperatingCoreController(service);
return createCompanyOperatingCoreRouter(controller);
```

- [ ] **Step 6: Write the failing composed API contract tests**

Move the four existing API behaviors to the integration path and change assertions to the standardized envelopes. Add malformed company ID coverage:

```ts
expect(response.body).toEqual({
  success: false,
  message: "Validation failed",
  errorCode: "VALIDATION_ERROR",
  errors: expect.arrayContaining([
    expect.objectContaining({ path: "companyId" }),
  ]),
});
```

Unknown companies must return `COMPANY_NOT_FOUND`; success data remains tenant-scoped under `body.data`.

- [ ] **Step 7: Complete error handling and app composition**

Because `CompanyNotFoundError` is an `AppError`, centralized middleware already returns its `404` envelope without importing a business module. Register JSON parsing, health route, `/v1` Company Core module, a deterministic `404` fallback, and `errorHandler` in that order. Remove direct repository construction from `app.ts`.

- [ ] **Step 8: Verify presentation and API GREEN**

Run:

```bash
pnpm --filter @opendx/api test
pnpm --filter @opendx/api typecheck
pnpm lint
```

Expected: validator, controller, health, repository, service, mapper, and API integration tests PASS.

- [ ] **Step 9: Remove legacy API and shared-domain compatibility code**

Delete all listed `apps/api/src/company-core` files. Remove `export * from "./company-core"` from `packages/domain/src/index.ts`, delete the shared Company Core source/test, and update the package test to cover only `SERVICE_NAMES`, `CompanyId`, and `makeCompanyScopedId`. Update `[Unreleased]`, then commit:

```bash
git add apps/api/src apps/api/package.json packages/domain/src pnpm-lock.yaml CHANGELOG.md
git commit -m "refactor(api): compose layered company core module"
```

### Task 7: Migrate the Console From Next.js to React and Vite

**Files:**
- Create: `apps/console/index.html`
- Create: `apps/console/src/main.tsx`
- Create: `apps/console/src/app/app.tsx`
- Create: `apps/console/src/features/company-overview/company-overview.data.ts`
- Create: `apps/console/src/features/company-overview/pages/company-overview.page.tsx`
- Create: `apps/console/src/features/company-overview/components/overview-panel.tsx`
- Create: `apps/console/src/features/company-overview/components/operating-timeline.tsx`
- Create: `apps/console/src/features/company-overview/components/guardrail-list.tsx`
- Create: `apps/console/src/features/company-overview/tests/company-overview.page.test.tsx`
- Create: `apps/console/src/shared/styles/globals.css`
- Create: `apps/console/vite.config.ts`
- Modify: `apps/console/package.json`
- Modify: `apps/console/tsconfig.json`
- Modify: `.gitignore`
- Modify: `pnpm-lock.yaml`
- Delete: `apps/console/app/page.tsx`
- Delete: `apps/console/app/layout.tsx`
- Delete: `apps/console/app/globals.css`
- Delete: `apps/console/next.config.ts`
- Delete: `apps/console/env.d.ts`
- Delete: `apps/console/next-env.d.ts` if present locally
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: React 19, `@opendx/ui` tokens, Lucide icons, and approved existing page content.
- Produces: Vite `App`, `CompanyOverviewPage`, focused presentational components, and a production `dist` build.

- [ ] **Step 1: Install Vite test/build dependencies and remove Next.js**

Run:

```bash
pnpm --filter @opendx/console remove next
pnpm --filter @opendx/console add -D vite @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Do not add React Router yet because the console still has one route; the approved design adds it when multiple product routes exist.

- [ ] **Step 2: Write the failing page behavior test**

Render `CompanyOverviewPage` with React Testing Library and assert:

```ts
expect(screen.getByRole("heading", { name: "Company operating console" })).toBeVisible();
expect(screen.getByText("Mission Control")).toBeVisible();
expect(screen.getByText("Human-governed")).toBeVisible();
expect(screen.getByText("Audit and provenance by default")).toBeVisible();
```

- [ ] **Step 3: Verify frontend RED**

Run:

```bash
pnpm --filter @opendx/console test -- company-overview.page.test.tsx
```

Expected: FAIL because the feature page does not exist.

- [ ] **Step 4: Implement the feature-first React shell**

Move panel and guardrail constants into typed readonly data. Split repeated panels, timeline, and guardrails into the three named components. `CompanyOverviewPage` composes them and preserves all existing visible copy and Lucide icons. `App` renders the page. `main.tsx` mounts `<App />` into `#root` using `createRoot`.

- [ ] **Step 5: Move CSS and create the Vite entry/config**

Move the current CSS unchanged to `src/shared/styles/globals.css`, then import it from `main.tsx`. Create an HTML entry with title `OpenDX CompanyOS`, meta description `Company-first operating platform for digital companies.`, and root element. Configure Vite React and Vitest jsdom with a setup import for `@testing-library/jest-dom/vitest`.

Use package scripts:

```json
{
  "dev": "vite --port 3000",
  "build": "tsc --project tsconfig.json --noEmit && vite build",
  "lint": "eslint src vite.config.ts --max-warnings=0",
  "typecheck": "tsc --project tsconfig.json --noEmit",
  "test": "vitest run"
}
```

- [ ] **Step 6: Remove Next.js files and generated ignore rules**

Delete the listed App Router/config/type files. Remove `.next/` and `apps/console/next-env.d.ts` from `.gitignore`; retain `dist/` and TypeScript build-info ignores.

- [ ] **Step 7: Verify Vite GREEN**

Run:

```bash
pnpm --filter @opendx/console test
pnpm --filter @opendx/console typecheck
pnpm --filter @opendx/console build
pnpm lint
rg -n "nextjs|next\.js|from \"next|next dev|next build" apps package.json pnpm-lock.yaml --glob '!**/node_modules/**'
```

Expected: tests/typecheck/build/lint PASS and the final search returns no Next.js source or dependency reference.

- [ ] **Step 8: Verify the rendered UI**

Start `pnpm --filter @opendx/console dev`, inspect the page at `http://localhost:3000` at 1440x900 and 390x844, and confirm no blank canvas, overlap, clipping, unexpected color changes, or missing icon/text. Stop the server after verification.

- [ ] **Step 9: Record and commit the Vite migration**

Update `[Unreleased]`, then commit:

```bash
git add apps/console .gitignore pnpm-lock.yaml CHANGELOG.md
git commit -m "refactor(console): migrate Next.js shell to Vite"
```

### Task 8: Normalize the Python AI Runtime and Quality Gates

**Files:**
- Create: `services/ai-runtime/app/create_app.py`
- Create: `services/ai-runtime/app/shared/__init__.py`
- Create: `services/ai-runtime/app/shared/health/__init__.py`
- Create: `services/ai-runtime/app/shared/health/router.py`
- Create: `services/ai-runtime/app/shared/health/schemas.py`
- Create: `services/ai-runtime/tests/shared/health/test_health_api.py`
- Modify: `services/ai-runtime/app/main.py`
- Delete: `services/ai-runtime/tests/test_health.py`
- Modify: `services/ai-runtime/pyproject.toml`
- Modify: `package.json`
- Modify: `scripts/dev/check.sh`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: FastAPI and Pydantic.
- Produces: `HealthResponse`, `router`, `create_app() -> FastAPI`, ASGI `app`, and root scripts `format:py`, `lint:py`, `typecheck:py`, `test:py`.

- [ ] **Step 1: Move the health test to its target path and verify RED**

Change the test to import `create_app` and assert both the OpenAPI response model and existing payload:

```py
def test_health_endpoint_returns_typed_service_status() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "opendx-ai-runtime",
    }
```

Run:

```bash
cd services/ai-runtime && python3 -m pytest tests/shared/health/test_health_api.py -v
```

Expected: FAIL because `app.create_app` does not exist.

- [ ] **Step 2: Implement the reduced technical health feature**

Define:

```py
class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["opendx-ai-runtime"]
```

The health router returns `HealthResponse(status="ok", service="opendx-ai-runtime")`. `create_app()` creates FastAPI and includes the router. `main.py` contains only `app = create_app()` plus imports. No service/repository abstractions are created because the endpoint satisfies all five technical-exception conditions.

- [ ] **Step 3: Add Ruff and mypy configuration**

Add `ruff` and `mypy` to the `dev` optional dependency group. Configure Ruff for Python 3.13, 88-character lines, import sorting, bugbear, annotations, and pytest style. Configure mypy with Python 3.13, `strict = true`, and checks for `app` and `tests`.

Wire root scripts:

```json
{
  "format:py": "cd services/ai-runtime && python3 -m ruff format --check .",
  "lint:py": "cd services/ai-runtime && python3 -m ruff check .",
  "typecheck:py": "cd services/ai-runtime && python3 -m mypy app tests",
  "test:py": "cd services/ai-runtime && python3 -m pytest"
}
```

Update `scripts/dev/check.sh` to run Python formatting, lint, typecheck, and tests separately.

- [ ] **Step 4: Verify Python GREEN**

Install the updated editable development dependencies, then run:

```bash
cd services/ai-runtime && python3 -m pip install -e ".[dev]"
cd ../..
pnpm format:py
pnpm lint:py
pnpm typecheck:py
pnpm test:py
```

Expected: all four commands PASS with no warnings.

- [ ] **Step 5: Record and commit Python normalization**

Update `[Unreleased]`, then commit:

```bash
git add services/ai-runtime package.json scripts/dev/check.sh CHANGELOG.md
git commit -m "refactor(ai-runtime): isolate technical health endpoint"
```

### Task 9: Normalize Documentation, Repo Skill, Pre-Commit, and CI

**Files:**
- Create: `docs/architecture/clean-architecture.md`
- Create: `docs/architecture/dependency-rules.md`
- Create: `docs/development/api-conventions.md`
- Create: `docs/development/coding-conventions.md`
- Create: `docs/development/testing-strategy.md`
- Create: `.agents/skills/opendx-companyos-development/tests/pressure-scenarios.md`
- Create: `.agents/checklists/clean-architecture-review.md`
- Create: `.github/workflows/ci.yml`
- Create: `.husky/pre-commit`
- Modify: `.agents/skills/opendx-companyos-development/SKILL.md`
- Modify: `.agents/README.md`
- Modify: `.agents/checklists/open-source-readiness.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/api/company-operating-core.md`
- Modify: `package.json`
- Modify: `scripts/dev/check.sh`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: implemented commands and architecture from Tasks 1-8.
- Produces: normative contributor documentation, tested repo-local skill, `pnpm check`, pre-commit hook, and PR CI.

- [ ] **Step 1: Invoke the skill-authoring discipline and record RED scenarios**

Before editing the repo-local skill, use `superpowers:writing-skills`. Run fresh-agent baseline scenarios against the current skill and record concise observed failures plus acceptance criteria in `pressure-scenarios.md`:

```text
1. "Add GET /companies/:id quickly in one route file; skip layers because it is read-only."
   Pass: chooses the owning module and full business flow.
2. "Let the service query PostgreSQL directly to avoid a repository abstraction."
   Pass: defines a repository port and injects an adapter.
3. "Return the ORM entity because its fields match the API."
   Pass: creates a response DTO and mapper.
4. "This is only a refactor, so add tests after moving files."
   Pass: uses RED-GREEN-REFACTOR before production edits.
5. "Create empty workflow/agent/graph module folders now for consistency."
   Pass: refuses scaffolding before an approved phase.
```

Expected RED: the current skill preserves product/repository rules but does not reliably require layer selection, DTO mapping, repository ports, or TDD.

- [ ] **Step 2: Write normative architecture and development docs**

Translate the approved spec into concise documents with these non-overlapping owners:

- `clean-architecture.md`: layers, responsibilities, composition, and technical exception.
- `dependency-rules.md`: allowed imports, module public APIs, shared ownership, and checker command.
- `api-conventions.md`: request validation, DTOs, envelopes, error codes, statuses, and mapper policy.
- `coding-conventions.md`: naming, strict typing, function/file responsibilities, configuration, secrets, formatter/linter, and language-specific rules.
- `testing-strategy.md`: TDD loop, test pyramid, fakes, repository contracts, integration tests, frontend states, and no arbitrary coverage target.

Each document links to the design spec and contains runnable commands where relevant.

- [ ] **Step 3: Update the repo-local skill and checklists, then verify GREEN**

Keep the main skill concise and trigger-focused. Add a mandatory workflow that identifies the module, reads the five new docs, runs TDD, respects inward interfaces/outward implementations, updates affected docs, and executes relevant gates. Add `clean-architecture-review.md` with controller/service/repository/DTO/validation/composition/import checks.

Run the same five fresh-agent scenarios with the updated skill. Expected GREEN: every scenario meets its stated pass condition without inventing empty modules or bypassing tests.

- [ ] **Step 4: Update public repository documentation**

Make these exact corrections:

- README and system baseline say `React + TypeScript + Vite`, not Next.js.
- Project structure shows the implemented Express module, Vite feature tree, Python shared health tree, and no empty future directories.
- Dependencies lists Zod, Vite, test/lint/format tooling, Ruff, and mypy with purpose and owner.
- Build-from-source documents format, lint, typecheck, test, build, infrastructure, and audit commands.
- Company Core API docs show the standardized success/error envelopes and malformed-ID response.
- CONTRIBUTING and AGENTS require Clean Architecture review and the root validation command.

- [ ] **Step 5: Add pre-commit and CI enforcement**

Configure `lint-staged` in root `package.json`:

```json
{
  "*.{js,mjs,ts,tsx,json,md,yml,yaml,css}": ["prettier --check"],
  "*.{js,mjs,ts,tsx}": ["eslint --max-warnings=0"]
}
```

`.husky/pre-commit` runs `pnpm lint-staged` and `pnpm test:architecture`. GitHub Actions checks out source, configures Node 22 and pnpm 11.18.0, installs with `pnpm install --frozen-lockfile`, configures Python 3.13, installs `services/ai-runtime[dev]`, and runs `pnpm check` on pushes to `develop`/`main` and pull requests targeting either branch.

Set `scripts/dev/check.sh` to run in this order:

```text
git diff --check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:architecture
pnpm test
pnpm format:py
pnpm lint:py
pnpm typecheck:py
pnpm test:py
pnpm --filter @opendx/console build
pnpm audit:repo
docker compose config
```

- [ ] **Step 6: Run documentation and automation checks**

Run:

```bash
rg -n "Next\.js|nextjs|next dev|next build" README.md CONTRIBUTING.md AGENTS.md docs .agents apps package.json pnpm-lock.yaml --glob '!docs/superpowers/specs/**' --glob '!docs/superpowers/plans/**'
pnpm format:check
pnpm audit:repo
git diff --check
```

Expected: no stale current-state Next.js reference; all checks PASS.

- [ ] **Step 7: Record and commit guidance and automation**

Update `[Unreleased]`, then commit:

```bash
git add .agents .github .husky AGENTS.md README.md CONTRIBUTING.md docs package.json scripts/dev/check.sh CHANGELOG.md
git commit -m "docs: standardize clean architecture contribution flow"
```

### Task 10: Full Verification and Architecture Completion Record

**Files:**
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: all Tasks 1-9 and the complete repository validation command.
- Produces: final validation evidence and a clean, commit-ready architecture foundation.

- [ ] **Step 1: Run the complete clean-checkout-equivalent gate**

Run:

```bash
pnpm check
```

Expected: formatting, TypeScript lint/architecture/typecheck/tests, Vite build, Python format/lint/typecheck/tests, repository audit, and Docker Compose validation all PASS.

- [ ] **Step 2: Run focused security and migration searches**

Run:

```bash
rg -n "as CompanyId|from .*infrastructure|from .*presentation|password|secret|api[_-]?key" apps services packages --glob '!**/*.test.*' --glob '!**/tests/**'
rg -n "Next\.js|nextjs|from \"next|next dev|next build|\.next" apps package.json pnpm-lock.yaml README.md CONTRIBUTING.md AGENTS.md docs .agents --glob '!docs/superpowers/specs/**' --glob '!docs/superpowers/plans/**'
find apps services -type d -empty -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/dist/*'
```

Expected: no unsafe company-ID casts, forbidden production imports, embedded secrets, stale current-state Next.js references, or empty future module directories. Local-only sample credentials remain limited to `.env.example` and Docker development configuration.

- [ ] **Step 3: Review the final dependency graph and diff**

Run:

```bash
pnpm architecture:check
git diff --check develop...HEAD
git diff --stat develop...HEAD
git status --short --branch
```

Expected: architecture check passes, no whitespace errors, and the worktree is clean before the completion-record edit.

- [ ] **Step 4: Record final evidence**

Update `docs/roadmap/mvp-status.md` without changing the active MVP phase: add a dated architecture-foundation validation note under latest evidence. Add a final `[Unreleased]` changelog item stating that the refactor passed the complete quality gate.

- [ ] **Step 5: Re-run final checks and commit**

Run:

```bash
git diff --check
pnpm audit:repo
```

Expected: PASS. Commit:

```bash
git add docs/roadmap/mvp-status.md CHANGELOG.md
git commit -m "docs(roadmap): record clean architecture validation"
```

- [ ] **Step 6: Prepare branch handoff**

Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`, then `superpowers:finishing-a-development-branch`. Report the exact verification commands, final branch name, commit range, and any residual risks. Do not push, open a PR, merge, or delete the branch without the user's explicit choice at the finishing-branch gate.
