<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# API Clean Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing Company Operating Core Express code into one
feature-owned Clean Architecture module without changing endpoint paths,
response bodies, seed records, or tenant isolation.

**Architecture:** Presentation depends on application contracts, application
depends on domain and repository ports, infrastructure implements those ports,
and one module composition root wires concrete classes. Company Core entities
move out of the shared domain package into the API module.

**Tech Stack:** Express 5, TypeScript strict mode, Vitest, Supertest, pnpm.

## Global Constraints

- Preserve all five current endpoint paths and response payloads.
- Preserve every NovaCommerce and secondary-tenant fixture value.
- Add no runtime dependency and no new business behavior.
- Keep repository and service contracts asynchronous.
- Use manual constructor injection.
- Create only directories containing migrated source or tests.
- Update `[Unreleased]` with each commit.

---

### Task 1: Characterize the Existing API

**Files:**
- Modify: `apps/api/src/company-core/routes.test.ts`
- Modify: `apps/api/src/company-core/repository.test.ts`

**Interfaces:**
- Consumes: current `createApiApp()` and in-memory repository.
- Produces: regression coverage for exact endpoint envelopes, tenant scope, and
  repository behavior.

- [ ] Add assertions for the complete unknown-company response and collection
  wrappers currently returned by each route.
- [ ] Add a repository assertion proving a secondary-company record cannot
  appear in NovaCommerce task results.
- [ ] Run `pnpm --filter @opendx/api test`; expected PASS before movement.
- [ ] Commit with `test(api): characterize company core contracts`.

### Task 2: Move Domain Ownership

**Files:**
- Create:
  `apps/api/src/modules/company-operating-core/domain/entities/company-operating-core.ts`
- Create:
  `apps/api/src/modules/company-operating-core/domain/services/company-operating-core-validation.ts`
- Create:
  `apps/api/src/modules/company-operating-core/domain/services/company-operating-core-validation.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/index.test.ts`
- Delete: `packages/domain/src/company-core.ts`
- Delete: `packages/domain/src/company-core.test.ts`

**Interfaces:**
- Consumes: `CompanyId` from `@opendx/domain`.
- Produces: `CompanyOperatingCoreSnapshot`, entity interfaces,
  `ValidationIssue`, `validateCompanyOperatingCoreSnapshot()`, and
  `assertValidCompanyScope()` owned by the API module.

- [ ] Copy the existing validation tests to the target module and change only
  imports; run the target test and confirm it cannot resolve the new module.
- [ ] Move entity declarations and validation functions without changing field
  names, status literals, or messages.
- [ ] Update temporary API imports to the new domain files in one atomic edit.
- [ ] Remove Company Core exports from `packages/domain` while retaining
  `CompanyId`, service names, and ID helpers.
- [ ] Run API and domain-package tests plus both TypeScript typechecks.
- [ ] Commit with `refactor(domain): move company core ownership to api`.

### Task 3: Introduce Application Ports and Mapper

**Files:**
- Create:
  `apps/api/src/modules/company-operating-core/application/repositories/interfaces/company-operating-core.repository.ts`
- Create:
  `apps/api/src/modules/company-operating-core/application/services/interfaces/company-operating-core.service.ts`
- Create:
  `apps/api/src/modules/company-operating-core/application/services/implementations/company-operating-core.service.ts`
- Create:
  `apps/api/src/modules/company-operating-core/application/services/implementations/company-operating-core.service.test.ts`
- Create:
  `apps/api/src/modules/company-operating-core/application/dtos/responses/company-operating-core-response.dto.ts`
- Create:
  `apps/api/src/modules/company-operating-core/application/mappers/company-operating-core.mapper.ts`
- Create:
  `apps/api/src/modules/company-operating-core/application/mappers/company-operating-core.mapper.test.ts`

**Interfaces:**

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

- Produces: `ICompanyOperatingCoreService`, `CompanyOperatingCoreService`,
  explicit readonly response DTOs, and `CompanyOperatingCoreMapper`.

- [ ] Write service tests using a fake repository for existing company,
  unknown company, and all four scoped collections; confirm the target imports
  fail before implementation.
- [ ] Write a mapper test that mutates its source after mapping and expects the
  response DTO to remain unchanged.
- [ ] Implement focused repository and service interfaces.
- [ ] Implement explicit readonly response DTOs for every currently exposed
  field.
- [ ] Implement defensive mapping and the query service without Express imports.
- [ ] Run application tests and API typecheck.
- [ ] Commit with `refactor(api): introduce company core application layer`.

### Task 4: Move Fixtures and Infrastructure Adapter

**Files:**
- Create:
  `apps/api/src/modules/company-operating-core/tests/fixtures/nova-commerce.fixture.ts`
- Create:
  `apps/api/src/modules/company-operating-core/tests/fixtures/secondary-company.fixture.ts`
- Create:
  `apps/api/src/modules/company-operating-core/tests/fixtures/company-core-seed.ts`
- Create:
  `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/in-memory-company-operating-core.repository.ts`
- Create:
  `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/in-memory-company-operating-core.repository.test.ts`

**Interfaces:**
- Consumes: domain validation and `ICompanyOperatingCoreRepository`.
- Produces: `createCompanyCoreSeed()`, `NOVACOMMERCE_COMPANY_ID`, and
  `InMemoryCompanyOperatingCoreRepository`.

- [ ] Write an async reusable repository-contract test for the existing four
  behaviors and defensive-copy behavior; confirm target imports fail.
- [ ] Split the current seed by company without changing any value.
- [ ] Implement the async adapter and validate all constructor fixtures.
- [ ] Return defensive copies so callers cannot mutate repository state.
- [ ] Run adapter tests, complete API tests, and API typecheck.
- [ ] Commit with `refactor(api): isolate company core infrastructure`.

### Task 5: Add Presentation and Composition

**Files:**
- Create:
  `apps/api/src/modules/company-operating-core/presentation/controllers/company-operating-core.controller.ts`
- Create:
  `apps/api/src/modules/company-operating-core/presentation/controllers/company-operating-core.controller.test.ts`
- Create:
  `apps/api/src/modules/company-operating-core/presentation/routes/company-operating-core.routes.ts`
- Create:
  `apps/api/src/modules/company-operating-core/presentation/validators/company-id-params.validator.ts`
- Create:
  `apps/api/src/modules/company-operating-core/company-operating-core.module.ts`
- Create: `apps/api/src/modules/company-operating-core/index.ts`
- Create:
  `apps/api/src/modules/company-operating-core/tests/integration/company-operating-core.api.test.ts`
- Modify: `apps/api/src/app.ts`
- Delete: `apps/api/src/company-core/`

**Interfaces:**
- Consumes: application service interface and infrastructure adapter.
- Produces: the existing `/v1/companies/:companyId/*` router and module factory.

- [ ] Write controller tests proving each method calls only the matching service
  method with the company ID and returns the existing response shape.
- [ ] Move current API contract tests to the module integration directory and
  confirm they still pass against the old composition.
- [ ] Implement explicit company-ID validation without unsafe casts.
- [ ] Implement thin controller methods and route registration.
- [ ] Wire adapter, mapper, service, controller, and router in the module factory.
- [ ] Switch `app.ts` to the module factory and remove the legacy directory.
- [ ] Run `pnpm --filter @opendx/api test` and API typecheck.
- [ ] Commit with `refactor(api): compose company core module`.

### Task 6: Verify and Document the API Tree

**Files:**
- Modify: `docs/api/company-operating-core.md`
- Modify: `docs/project-structure.md`
- Modify: `CHANGELOG.md`

- [ ] Verify no private application or domain file imports infrastructure or
  presentation code using `rg` and manual review.
- [ ] Run `pnpm --filter @opendx/api test`.
- [ ] Run `pnpm --filter @opendx/api typecheck`.
- [ ] Run `pnpm --filter @opendx/domain test` and typecheck.
- [ ] Run `git diff --check` and `pnpm audit:repo`.
- [ ] Update documentation to match the implemented tree without claiming
  unimplemented modules.
- [ ] Commit with `docs(api): record clean architecture refactor`.
