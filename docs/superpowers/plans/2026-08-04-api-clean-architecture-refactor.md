<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Single-Company API Clean Architecture Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Company Operating Core into one feature-owned Clean Architecture
module and simplify it to one configured company with no Company ID.

**Architecture:** The repository owns one `CompanyOperatingCoreSnapshot` and
exposes no-argument query methods. Application services map that snapshot to
DTOs, presentation exposes single-company routes, and the module composition
root wires the in-memory adapter.

**Tech Stack:** Express 5, TypeScript strict mode, Vitest, Supertest, pnpm.

## Global Constraints

- Keep `Company` as the aggregate root but remove its `id` field.
- Remove `companyId` from every child entity and response.
- Remove `CompanyId` and `makeCompanyScopedId` from `packages/domain`.
- Keep only NovaCommerce seed data.
- Preserve all other IDs, timestamps, correlations, visible values, and
  collection response wrappers.
- Use `/v1/operating-core`, `/v1/departments`, `/v1/tasks`, `/v1/events`, and
  `/v1/approvals`.
- Add no runtime dependency or unrelated business behavior.
- Keep repository and service contracts asynchronous.
- Use manual constructor injection and no empty scaffolds.
- Update `[Unreleased]` with every commit.

---

### Task 1: Lock the Single-Company Domain Contract

**Files:**
- Modify:
  `apps/api/src/modules/company-operating-core/domain/entities/company-operating-core.ts`
- Modify:
  `apps/api/src/modules/company-operating-core/domain/services/company-operating-core-validation.ts`
- Modify:
  `apps/api/src/modules/company-operating-core/domain/services/company-operating-core-validation.test.ts`
- Delete: `packages/domain/src/ids.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/index.test.ts`

**Interfaces:**
- Produces: Company Core entities with local entity IDs only and
  `validateCompanyOperatingCoreSnapshot(snapshot): ValidationIssue[]`.

- [ ] Rewrite the domain fixture test without `id` on Company or `companyId` on
  children; assert no returned validation issue is company-scope related.
- [ ] Run the test and confirm TypeScript fails while entities still require
  Company IDs.
- [ ] Remove Company-ID fields and `assertValidCompanyScope` from domain code.
- [ ] Remove shared Company-ID types and update package tests to service names
  only.
- [ ] Run API domain tests and shared package tests/typechecks.
- [ ] Commit with `refactor(domain): adopt single company model`.

### Task 2: Replace Seed and Repository With One Snapshot

**Files:**
- Modify: `apps/api/src/company-core/seed.ts`
- Modify: `apps/api/src/company-core/repository.ts`
- Modify: `apps/api/src/company-core/repository.test.ts`

**Interfaces:**

```ts
export interface CompanyOperatingCoreRepository {
  getSnapshot(): CompanyOperatingCoreSnapshot;
  listDepartments(): Department[];
  listTasks(): Task[];
  listEvents(): BusinessEvent[];
  listApprovals(): ApprovalRequest[];
}
```

- [ ] Rewrite repository tests to use no-argument methods and assert only the
  NovaCommerce snapshot exists.
- [ ] Run the tests and confirm failure because old methods require Company ID.
- [ ] Remove the secondary company fixture and every company-ID field from the
  NovaCommerce seed.
- [ ] Store one validated snapshot in the repository and implement the new
  methods.
- [ ] Run repository, API, and TypeScript checks.
- [ ] Commit with `refactor(api): simplify company core repository`.

### Task 3: Introduce Single-Company Application Ports

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
  getSnapshot(): Promise<CompanyOperatingCoreSnapshot>;
  listDepartments(): Promise<readonly Department[]>;
  listTasks(): Promise<readonly Task[]>;
  listEvents(): Promise<readonly BusinessEvent[]>;
  listApprovals(): Promise<readonly ApprovalRequest[]>;
}
```

- Produces: equivalent no-argument service methods and explicit readonly DTOs.

- [ ] Write service tests using a no-argument fake repository; confirm target
  imports fail before implementation.
- [ ] Write a mapper defensive-copy test.
- [ ] Implement repository/service interfaces, response DTOs, mapper, and query
  service without Express or infrastructure imports.
- [ ] Run application tests and API typecheck.
- [ ] Commit with `refactor(api): add single company application layer`.

### Task 4: Move the In-Memory Adapter and Fixture

**Files:**
- Create:
  `apps/api/src/modules/company-operating-core/tests/fixtures/nova-commerce.fixture.ts`
- Create:
  `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/in-memory-company-operating-core.repository.ts`
- Create:
  `apps/api/src/modules/company-operating-core/infrastructure/repositories/implementations/in-memory-company-operating-core.repository.test.ts`

**Interfaces:**
- Produces: `createNovaCommerceSnapshot()` and an async implementation of
  `ICompanyOperatingCoreRepository`.

- [ ] Write the async adapter contract test for snapshot, collections,
  correlation IDs, and defensive copies; confirm target imports fail.
- [ ] Move the single NovaCommerce fixture without changing non-company data.
- [ ] Implement the async adapter and validate its constructor snapshot.
- [ ] Run adapter, API, and typecheck suites.
- [ ] Commit with `refactor(api): isolate single company adapter`.

### Task 5: Add Presentation and Composition

**Files:**
- Create:
  `apps/api/src/modules/company-operating-core/presentation/controllers/company-operating-core.controller.ts`
- Create:
  `apps/api/src/modules/company-operating-core/presentation/controllers/company-operating-core.controller.test.ts`
- Create:
  `apps/api/src/modules/company-operating-core/presentation/routes/company-operating-core.routes.ts`
- Create:
  `apps/api/src/modules/company-operating-core/company-operating-core.module.ts`
- Create: `apps/api/src/modules/company-operating-core/index.ts`
- Create:
  `apps/api/src/modules/company-operating-core/tests/integration/company-operating-core.api.test.ts`
- Modify: `apps/api/src/app.ts`
- Delete: `apps/api/src/company-core/`

**Interfaces:**
- Produces: the five `/v1/*` routes with current response shapes.

- [ ] Rewrite API contract tests for the five single-company paths and assert
  no response contains a `companyId` property.
- [ ] Run tests and confirm old `/companies/:companyId` routes fail the new
  contract.
- [ ] Write controller tests proving no-argument service delegation.
- [ ] Implement thin controllers and routes without company parameter
  validation.
- [ ] Wire adapter, mapper, service, controller, and router in the module root.
- [ ] Switch `app.ts`, remove the legacy directory, and run all API tests and
  typechecks.
- [ ] Commit with `refactor(api): compose single company module`.

### Task 6: Update Active Documentation and Verify

**Files:**
- Modify: `docs/api/company-operating-core.md`
- Modify: `docs/product/vision.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/architecture/clean-architecture.md`
- Modify: `docs/development/testing-strategy.md`
- Modify: `docs/agent-guidelines/implementation-guardrails.md`
- Modify: `AGENTS.md`
- Modify: `.agents/skills/opendx-companyos-development/SKILL.md`
- Modify: relevant `.agents/checklists/*.md`
- Modify: `docs/project-structure.md`
- Modify: `CHANGELOG.md`

- [ ] Replace active multi-company and tenant-isolation requirements with the
  single-company model and actor/department/resource permission scope.
- [ ] Mark historical Phase 1/2 specs and plans as superseded where they require
  Company IDs; do not rewrite historical implementation details.
- [ ] Run all API and shared-package tests/typechecks.
- [ ] Search production source and active docs for `CompanyId`, `companyId`,
  `/companies/:companyId`, and tenant-isolation requirements; expected no
  current references.
- [ ] Run `git diff --check` and `pnpm audit:repo`.
- [ ] Commit with `docs(architecture): document single company model`.
