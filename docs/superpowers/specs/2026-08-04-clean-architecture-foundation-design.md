<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Clean Architecture Repository Structure Design

## Status

- Date: 2026-08-04
- State: Approved
- Baseline branch: `develop`
- Delivery branch: `refactor/clean-architecture-foundation`
- Scope: repository structure conventions, documentation, agent guidance, and
  review gates only

## Objective

Define one professional, feature-first Clean Architecture convention for the
Express, React, and Python codebases. Contributors and coding agents must be
able to identify where new code belongs, which dependencies are permitted, and
which tests and documentation accompany a future implementation.

This change documents the target structure. It does not migrate existing
business code, add application behavior, change API contracts, replace the
frontend framework, install dependencies, or create empty module trees.

## Scope Boundary

### Included

- A normative Clean Architecture overview.
- Dependency direction and module ownership rules.
- Target structures for Express, React, and Python.
- Coding and testing conventions.
- Updates to `AGENTS.md`, the repo-local development skill, and review
  checklists.
- A corrected implementation plan for this documentation-only unit.

### Excluded

- Moving the current Company Operating Core source files.
- Creating controllers, services, repositories, DTOs, mappers, or validators.
- Migrating Next.js to Vite.
- Refactoring the FastAPI health endpoint.
- Adding ESLint, Prettier, Zod, Ruff, mypy, Husky, or any other dependency.
- Changing tests, runtime behavior, API responses, Docker configuration, or CI.
- Creating placeholder files or empty future feature directories.

Each excluded change requires a separately approved spec and plan when that
work begins.

## Architecture Model

Business modules use inward dependencies:

```text
Presentation -> Application -> Domain
Infrastructure -> Application + Domain
Composition root -> Presentation + Application + Infrastructure
Domain -> no framework, transport, or persistence dependency
```

The standard request flow is:

```text
Route
-> Validator
-> Controller
-> Service Interface
-> Service Implementation
-> Repository Interface
-> Repository Implementation
-> Mapper
-> Response DTO
```

Layers are introduced only when an implemented use case requires them.
Interfaces belong at substitution and external-system boundaries, not around
every private helper.

## Module Ownership

Code is grouped by business feature or domain. A module owns its entities, use
cases, ports, adapters, presentation, fixtures, and tests. The repository must
not introduce global controller, service, repository, or DTO folders that mix
unrelated domains.

Only genuinely reusable behavior with identical semantics belongs in `shared`
or a workspace package. Cross-module access must use the target module's public
entry point rather than private files.

## Express Target Structure

```text
apps/api/src/
|-- modules/
|   `-- <business-module>/
|       |-- domain/
|       |   |-- entities/
|       |   |-- value-objects/
|       |   `-- exceptions/
|       |-- application/
|       |   |-- dtos/
|       |   |   |-- requests/
|       |   |   `-- responses/
|       |   |-- mappers/
|       |   |-- services/
|       |   |   |-- interfaces/
|       |   |   `-- implementations/
|       |   `-- repositories/
|       |       `-- interfaces/
|       |-- infrastructure/
|       |   `-- repositories/
|       |       `-- implementations/
|       |-- presentation/
|       |   |-- controllers/
|       |   |-- routes/
|       |   `-- validators/
|       |-- tests/
|       |   |-- fixtures/
|       |   `-- integration/
|       |-- index.ts
|       `-- <business-module>.module.ts
|-- shared/
|-- app.ts
`-- server.ts
```

- Routes declare transport wiring only.
- Controllers contain HTTP orchestration, not business rules.
- Services depend on repository interfaces and never query a database
  directly.
- Repository implementations contain persistence logic, not business policy.
- Request validation uses schemas or explicit DTO validation.
- Mappers separate entities from public response DTOs.
- Concrete dependencies are wired in a module composition root using manual
  constructor injection until complexity justifies another mechanism.

A technical endpoint may use `Route -> Handler` only when it has no business
rule, tenant data, repository, or external business-system interaction.

## React Target Structure

```text
apps/console/src/
|-- app/
|-- features/
|   `-- <feature>/
|       |-- api/
|       |-- components/
|       |-- hooks/
|       |-- pages/
|       |-- schemas/
|       |-- types/
|       |-- mappers/
|       `-- tests/
|-- shared/
|   |-- components/
|   |-- hooks/
|   |-- layouts/
|   |-- utilities/
|   |-- constants/
|   `-- types/
|-- router/
`-- store/
```

- Components focus on rendering and interaction.
- API calls live in feature API modules, not presentational components.
- Hooks coordinate data and state when needed.
- Features own loading, empty, error, and success states.
- A feature cannot import another feature's private files.
- Shared abstractions are created only after proven reuse.
- Frontend work follows `docs/design/linear-product-canvas.md`.

The current frontend framework remains unchanged in this documentation unit.
Any Next.js-to-Vite migration is separate implementation work.

## Python Target Structure

```text
services/ai-runtime/app/
|-- modules/
|   `-- <feature>/
|       |-- domain/
|       |-- application/
|       |   |-- dtos/
|       |   |-- services/
|       |   `-- repositories/
|       |-- infrastructure/
|       |-- presentation/
|       `-- tests/
|-- shared/
|   |-- configuration/
|   |-- exceptions/
|   |-- health/
|   `-- http/
`-- main.py
```

- Public boundaries use complete type hints.
- Substitutable boundaries use `Protocol`, `ABC`, or abstract methods where
  appropriate.
- Pydantic models define transport schemas.
- Routers and services do not contain database queries.
- FastAPI dependency functions or explicit factories perform composition.

The existing Python code remains unchanged until a separately approved
implementation task requires migration.

## SOLID Guidance

- Single Responsibility: each file, class, and function has one primary reason
  to change.
- Open/Closed: adapters can be added behind stable inward-facing interfaces.
- Liskov Substitution: fakes, in-memory adapters, and database adapters honor
  the same behavioral contract.
- Interface Segregation: interfaces describe focused use cases rather than
  broad utility surfaces.
- Dependency Inversion: business policy depends on abstractions; frameworks and
  persistence depend inward.

SOLID does not require a class or interface for every operation. Small,
framework-neutral pure functions remain functions.

## Quality and Open-Source Rules

Future implementation specs must require:

- TypeScript strict mode and explicit Python type hints.
- Request and response DTOs appropriate to each use case.
- Central error translation at transport boundaries.
- Unit, integration, and API tests proportional to risk.
- Tenant isolation, authorization, audit, and provenance tests where relevant.
- Environment-based configuration and no committed secrets.
- Dependency documentation and lockfile updates when libraries are added.
- README, API, architecture, build, and changelog updates when behavior changes.
- CI checks for the tools actually present in the repository.

## Directory Creation Policy

Target trees in documentation are maps, not instructions to create every folder
immediately. A directory is created in the same change that adds its first
approved source or test file. `.gitkeep`, empty `index.ts`, placeholder classes,
and speculative feature folders are prohibited.

This policy keeps the repository honest: its visible tree describes implemented
capabilities rather than future aspirations.

## Acceptance Criteria

This documentation foundation is complete when:

1. Clean Architecture, dependency direction, and feature ownership are
   documented consistently.
2. Express, React, and Python target layouts are documented without being
   materialized as empty directories.
3. The project structure guide distinguishes current state from target state.
4. Coding and testing conventions explain how future implementations apply the
   architecture pragmatically.
5. `AGENTS.md`, the repo-local skill, and a review checklist enforce the same
   scope and boundaries.
6. Existing application code, dependencies, lockfiles, API behavior, frontend
   behavior, and Python behavior remain unchanged.
7. Documentation links and repository audit checks pass.

## Follow-Up Work

When the user explicitly starts a backend, frontend, or Python refactor, create
a focused spec and implementation plan for that work. The plan must inventory
the existing code, preserve behavior with tests, migrate one active module at a
time, and avoid pre-creating unrelated future modules.
