<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Clean Architecture Foundation Design

## Status

- Date: 2026-08-04
- State: Approved for implementation planning
- Baseline branch: `develop`
- Delivery branch: `refactor/clean-architecture-foundation`
- Scope: repository-wide architecture standards plus refactoring of existing Phase 1 and Phase 2 code

## Objective

Standardize OpenDX CompanyOS around feature-first Clean Architecture and SOLID principles so TypeScript, Python, and React code is easy to read, test, maintain, contribute to, and extend. The change must update repository guidance and refactor existing code so new modules do not inherit a competing legacy structure.

This work is an architecture foundation. It does not start Phase 3 or add new CompanyOS business capabilities.

## Decisions

1. Use feature-first Clean Architecture for business modules.
2. Keep Express and TypeScript as the modular-monolith API.
3. Keep FastAPI and Python as the AI runtime service.
4. Replace Next.js with React, TypeScript, and Vite for the product console.
5. Use React Router when multiple product routes are introduced.
6. Use manual constructor injection instead of a dependency injection framework.
7. Use a consistent API success and error envelope.
8. Permit a documented reduced architecture for technical endpoints that have no business rules or persistence.
9. Refactor the existing Company Operating Core API to the new architecture without changing its tenant isolation or NovaCommerce data behavior.
10. Enforce architectural boundaries through automated tooling in addition to documentation.

## Architecture Principles

### Feature Ownership

Business code is grouped by module or feature. A module owns its domain, use cases, ports, adapters, transport code, fixtures, and tests. The repository must not create global `controllers`, `services`, `repositories`, or `dtos` directories that mix unrelated business areas.

Only code used by multiple modules with the same semantics belongs in `shared`, `core`, or a workspace package. Similar-looking code is not shared until a real common contract exists.

### Dependency Direction

The allowed dependency direction is:

```text
Presentation -> Application -> Domain
Infrastructure -> Application + Domain
Composition root -> Presentation + Application + Infrastructure
Domain -> no framework, transport, or persistence dependency
```

The rules mean:

- Domain code must not import Express, FastAPI, React, database clients, ORM models, HTTP DTOs, or repository implementations.
- Application code may use domain types and interfaces owned by the application layer.
- Repository interfaces are inward-facing ports. Repository implementations are infrastructure adapters.
- Presentation code receives validated transport input and calls service interfaces. It must not call repository implementations.
- Infrastructure code must not decide business policy.
- Composition roots are the only locations allowed to instantiate concrete implementations and wire dependencies.
- Cross-module imports must use a documented public module API. Importing another module's private files is prohibited.

### SOLID Application

- Single Responsibility: each class, function, and file has one primary reason to change.
- Open/Closed: new adapters and implementations can be introduced behind stable interfaces.
- Liskov Substitution: fake, in-memory, and database repositories satisfy the same behavioral contract.
- Interface Segregation: service and repository interfaces are use-case focused instead of broad catch-all APIs.
- Dependency Inversion: application policy depends on interfaces; frameworks and persistence depend inward on those contracts.

Interfaces are required at boundaries that need substitution or isolate external systems. Trivial private helpers do not receive ceremonial interfaces.

## Express Module Structure

Business modules use this shape:

```text
apps/api/src/
├── modules/
│   └── company-operating-core/
│       ├── domain/
│       │   ├── entities/
│       │   ├── value-objects/
│       │   └── exceptions/
│       ├── application/
│       │   ├── dtos/
│       │   │   ├── requests/
│       │   │   └── responses/
│       │   ├── mappers/
│       │   ├── services/
│       │   │   ├── interfaces/
│       │   │   └── implementations/
│       │   └── repositories/
│       │       └── interfaces/
│       ├── infrastructure/
│       │   └── repositories/
│       │       └── implementations/
│       ├── presentation/
│       │   ├── controllers/
│       │   ├── routes/
│       │   └── validators/
│       ├── tests/
│       │   ├── fixtures/
│       │   └── integration/
│       ├── index.ts
│       └── company-operating-core.module.ts
├── shared/
│   ├── configuration/
│   ├── errors/
│   ├── health/
│   ├── http/
│   ├── middleware/
│   └── types/
├── app.ts
└── server.ts
```

Directories are created only when they contain code required by an approved phase. Empty future module scaffolds are prohibited.

### Express Request Flow

Business requests use this flow:

```text
Route
-> request validator
-> controller
-> service interface
-> service implementation
-> repository interface
-> repository implementation
-> mapper
-> response DTO
```

- Route: declares HTTP method, path, and middleware, then delegates to a controller.
- Validator: parses route params, query, and body with a schema. Unsafe casts such as `request.params.companyId as CompanyId` are not validation.
- Controller: performs HTTP orchestration only and returns the mapped response.
- Service interface: defines a use-case-oriented application contract.
- Service implementation: enforces business rules, company scope, and coordination.
- Repository interface: defines persistence operations needed by the use case.
- Repository implementation: communicates with in-memory state, PostgreSQL, an ORM, or another data source.
- Mapper: converts domain/application results to transport-specific response DTOs.

Service and repository contracts are asynchronous so replacing in-memory adapters with PostgreSQL does not require an API-wide signature migration.

### Dependency Injection

Each module has a composition root named `<module>.module.ts`. It creates infrastructure implementations, injects them into application services, injects services into controllers, and supplies the configured router to `app.ts`.

The initial implementation uses constructor injection without a DI container. A container may be introduced only when manual composition becomes measurably difficult.

## Python Service Structure

The AI runtime follows equivalent boundaries:

```text
services/ai-runtime/app/
├── modules/
│   └── <feature>/
│       ├── domain/
│       ├── application/
│       │   ├── dtos/
│       │   ├── services/
│       │   └── repositories/
│       ├── infrastructure/
│       ├── presentation/
│       └── tests/
├── shared/
│   ├── configuration/
│   ├── exceptions/
│   ├── health/
│   └── http/
└── main.py
```

- Python uses complete type hints.
- Interfaces use `Protocol`, `ABC`, or abstract methods when substitution is required.
- Pydantic models define request and response schemas.
- FastAPI dependency functions or explicit factories perform composition.
- Routers, controllers, and services must not contain database queries.
- Central exception handlers own HTTP error translation.

The existing `/health` endpoint remains a reduced technical endpoint because it has no business policy or repository dependency.

## React Console Structure

The console becomes a client-side React application built with TypeScript and Vite:

```text
apps/console/
├── src/
│   ├── app/
│   ├── features/
│   │   └── company-overview/
│   │       ├── api/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── pages/
│   │       ├── schemas/
│   │       ├── types/
│   │       ├── mappers/
│   │       └── tests/
│   ├── shared/
│   │   ├── components/
│   │   ├── constants/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── types/
│   │   └── utilities/
│   ├── router/
│   └── store/
├── index.html
└── vite.config.ts
```

- `app` owns application bootstrap and providers.
- `router` owns route configuration.
- `features` own feature API clients, schemas, state hooks, pages, and components.
- `shared` contains only stable, genuinely reusable UI and utilities.
- Components focus on rendering and interaction. API calls do not live directly in presentational components.
- Features define loading, empty, error, and success states.
- A feature must not import private files from another feature.
- State remains local or feature-scoped until a real cross-feature requirement justifies global state.

The migration preserves the current Linear-inspired operational UI and its approved design tokens. It does not redesign the console or add Phase 3 screens.

## Shared Packages

`packages/domain` must not become a collection of backend database entities. Existing Company Operating Core entities move into the API module domain. Workspace packages are retained only for contracts with proven multi-application ownership.

- `packages/config`: framework-neutral configuration helpers shared by multiple TypeScript workspaces.
- `packages/ui`: design tokens and reusable React UI primitives.
- `packages/domain`: temporary home for truly shared domain primitives only; service labels and application configuration should migrate to more accurate ownership when touched.

Frontend API types must be response contracts, not imported persistence entities. A dedicated contracts package or generated OpenAPI client may be added later when multiple consumers justify it.

## DTO and API Conventions

Each use case receives purpose-specific request and response DTOs. Create, update, list, and detail operations must not share a single mutable DTO when their fields differ.

TypeScript request schemas use Zod. Python request and response schemas use Pydantic. Parsed schema output is the only untrusted request data passed to controllers.

Successful business API responses use:

```json
{
  "success": true,
  "message": "Company operating core retrieved successfully",
  "data": {},
  "meta": {}
}
```

Business API errors use:

```json
{
  "success": false,
  "message": "Company was not found",
  "errorCode": "COMPANY_NOT_FOUND",
  "errors": []
}
```

The contract rules are:

- `success`, `message`, and `data` are present on successful business responses.
- `meta` is an object and may be empty when pagination or other metadata does not apply.
- `success`, `message`, `errorCode`, and `errors` are present on business errors.
- Error codes are stable uppercase identifiers.
- Database entities are never returned merely because their shape resembles the API contract.
- Technical endpoints such as `/health` may return a documented minimal payload required by infrastructure.

HTTP status mapping:

| Status | Meaning |
| --- | --- |
| `400` | Request validation failed |
| `401` | Authentication is required |
| `403` | The actor lacks permission |
| `404` | The company-scoped resource does not exist |
| `409` | State or version conflict |
| `422` | Valid request violates a business rule |
| `500` | Unexpected internal failure |

Central error middleware or exception handlers translate known validation, application, and domain errors. Unexpected errors are logged with correlation context and returned without stack traces, secrets, or internal implementation details.

## Technical Endpoint Exception

A reduced `Route -> Handler` flow is allowed only when all of these conditions are true:

1. The endpoint is operational infrastructure such as liveness or readiness.
2. It has no business rule.
3. It has no repository or external business-system interaction.
4. It does not expose tenant data.
5. The exception is documented in module or API documentation.

If any condition is false, the normal business-module flow is required. The exception must not be used to bypass architecture for a small CRUD endpoint.

## Company Operating Core Refactor

The existing Phase 2 behavior is preserved while its internals are replaced:

- Move Company Core domain entities and validation into the module domain.
- Split repository interface from the in-memory implementation.
- Add service interfaces and implementations for snapshot and collection retrieval use cases.
- Add request and response DTOs.
- Add Zod validation for `companyId` route parameters.
- Add response mappers.
- Add controllers with no business logic.
- Add a module composition root and thin routes.
- Add centralized Express error handling.
- Split the large seed file into focused NovaCommerce and secondary-tenant fixtures.
- Preserve deterministic seed data, company scoping, unknown-company behavior, and tenant-isolation tests.
- Update API documentation to the standardized response envelope.

No PostgreSQL repository, authentication flow, new write endpoint, or Phase 3 behavior is part of this refactor.

## Code Quality Tooling

### TypeScript and React

- TypeScript strict mode remains mandatory.
- `any` requires a documented boundary reason and must be narrowed immediately.
- ESLint uses flat configuration and enforces dependency boundaries and unsafe-code rules.
- Prettier owns deterministic formatting.
- Vitest runs unit and integration tests.
- Supertest runs Express API integration tests.
- React Testing Library with jsdom tests user-visible frontend states and interactions.

### Python

- Ruff owns linting and formatting checks.
- mypy owns static type checking.
- pytest runs unit and API integration tests.
- Public functions and boundary methods use explicit parameter and return types.

### Local and CI Gates

- Husky and lint-staged run fast checks for changed files before commit.
- Hooks improve local feedback but are not trusted as the only enforcement point.
- GitHub Actions runs formatting checks, lint, typecheck, tests, frontend production build, Python checks, repository audit, and Docker Compose configuration validation for pull requests.

Architecture boundaries must be executable lint rules where practical. Documentation remains the source for intent and justified exceptions.

## Testing Strategy

Behavior changes and refactors follow test-driven development:

```text
Write a focused failing test
-> verify the expected failure
-> implement the minimum behavior
-> verify the focused test
-> refactor while green
-> run broader gates
```

The test layers are:

1. Domain unit tests for invariants and value behavior.
2. Service unit tests using fakes that satisfy repository interfaces.
3. Repository contract tests shared by in-memory and future database adapters.
4. Controller tests for transport orchestration and mapper use.
5. Express integration tests through the composed application and Supertest.
6. Frontend schema, mapper, hook, and component tests covering loading, empty, error, and success states.
7. Python service and FastAPI integration tests.

Unit tests are colocated with focused source when that improves discoverability. Module-level `tests/integration` contains tests that exercise multiple layers. Test fixtures remain outside production implementation classes.

This change does not introduce an arbitrary coverage percentage. Critical business rules, tenant boundaries, validation, error translation, and public contracts require explicit tests. A coverage threshold may be introduced when the suite is broad enough for the number to represent risk.

## Documentation and Agent Guidance

The implementation updates or creates:

- `README.md`
- `CONTRIBUTING.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `docs/architecture/system-baseline.md`
- `docs/architecture/clean-architecture.md`
- `docs/architecture/dependency-rules.md`
- `docs/development/api-conventions.md`
- `docs/development/coding-conventions.md`
- `docs/development/testing-strategy.md`
- `docs/project-structure.md`
- `docs/dependencies.md`
- `docs/build-from-source.md`
- `docs/api/company-operating-core.md`
- `.agents/skills/opendx-companyos-development/SKILL.md`
- relevant `.agents/checklists/*`
- relevant GitHub Actions workflows

The repo-local development skill must require an agent to:

1. Identify the owning business module.
2. Read architecture and dependency rules before creating files.
3. follow test-driven development for code behavior and refactors.
4. Create use-case-specific DTOs and validation schemas.
5. Keep interfaces inward and implementations outward.
6. Use constructor injection or the equivalent Python composition mechanism.
7. Keep controller, service, and repository responsibilities separate.
8. Update API, dependency, build, architecture, and changelog documentation when affected.
9. Run architecture, format, lint, typecheck, test, build, infrastructure, and repository-audit gates appropriate to the change.
10. Explain and document a reduced-layer technical endpoint before using the exception.

Skill changes follow the repo's skill-authoring process and are tested against pressure scenarios such as requests to put an endpoint in one file, access a database from a service, reuse a database entity as an API response, or skip tests for a refactor.

## Migration Sequence

The implementation plan must break this design into independently reviewable units:

1. Establish quality tooling and executable dependency rules.
2. Add shared HTTP response and error foundations.
3. Refactor Company Operating Core domain and application layers with tests.
4. Add infrastructure, presentation, composition, and integration tests.
5. Migrate the console from Next.js to React, TypeScript, and Vite while preserving UI behavior.
6. Normalize the Python service structure and quality gates.
7. Update repository docs, skill, checklists, CI, and build instructions.
8. Run the complete validation gate and inspect the final diff for stale Next.js references or architecture violations.

Tasks may be reordered in the implementation plan when test dependencies require it, but each unit must remain independently testable and commit-ready.

## Out of Scope

- Phase 3 workflow or iPaaS functionality.
- PostgreSQL or ORM persistence implementation.
- Keycloak login implementation.
- New Company Core write operations.
- New Mission Control product screens.
- UI redesign beyond changes required by the Vite migration.
- A dependency injection container.
- A generated OpenAPI client or shared API-contract package.
- Empty scaffolding for future modules.
- A release or merge to `main`.

## Acceptance Criteria

The architecture foundation is complete when:

1. Company Operating Core business requests use validated routes, controllers, service interfaces and implementations, repository interfaces and implementations, mappers, and response DTOs.
2. Controllers contain no business logic, services contain no database access, and repositories contain no business policy.
3. The Express API returns the documented success and error envelopes for business endpoints.
4. Company scope and tenant isolation behavior remain covered and unchanged.
5. The frontend builds with React, TypeScript, and Vite and contains no Next.js runtime, source conventions, dependency, or documentation references.
6. The existing operational UI renders with the approved design tokens and responsive behavior.
7. The Python AI runtime passes lint, typecheck, tests, and the documented technical-endpoint exception.
8. Automated checks reject prohibited dependency directions.
9. Formatting, linting, type checking, unit tests, integration tests, frontend build, Python checks, repository audit, and Docker Compose validation pass.
10. README, contributor docs, architecture docs, API docs, dependency docs, build docs, AGENTS instructions, repo-local skill, checklists, changelog, and CI describe the implemented structure accurately.
11. No secrets, generated build output, vendored dependency source, empty future modules, or unrelated Phase 3 functionality are introduced.

## Risks and Mitigations

### Excessive Layering

Risk: small features accumulate empty or pass-through classes.

Mitigation: create files only for active use cases, keep interfaces focused, and allow the five-condition technical-endpoint exception. Do not create empty directories.

### Contract Churn

Risk: standardized response envelopes change existing Phase 2 API tests and docs.

Mitigation: treat the new envelope as an intentional pre-release contract correction, update all consumers and tests in the same change, and record it in the changelog.

### Frontend Migration Regression

Risk: replacing Next.js changes build behavior or visual output.

Mitigation: preserve React markup and design tokens, add component tests, run a production Vite build, and verify the rendered application at desktop and mobile sizes.

### False Architectural Compliance

Risk: folders are renamed while dependency direction remains unenforced.

Mitigation: add import-boundary lint rules, service tests through interfaces, repository contract tests, and architecture review documentation.

### Contributor Friction

Risk: quality gates become difficult to install or run.

Mitigation: keep one documented root validation command, pin dependencies in lockfiles, avoid a DI framework, and make pre-commit hooks supplementary to CI.
