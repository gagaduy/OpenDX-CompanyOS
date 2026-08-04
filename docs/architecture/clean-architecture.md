<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Clean Architecture

This document defines the target architecture for new and explicitly approved
refactored code in OpenDX CompanyOS. It is normative for contributors and coding
agents, but it does not imply that every documented directory already exists.

## Feature First

Business code belongs to the module or frontend feature that owns it. Do not
create repository-wide folders that mix controllers, services, repositories,
DTOs, hooks, or components from unrelated domains.

Create a shared abstraction only when multiple owners use the same behavior
with the same semantics. Similar names or shapes alone do not justify sharing.

## Dependency Direction

```text
Presentation -> Application -> Domain
Infrastructure -> Application + Domain
Composition root -> Presentation + Application + Infrastructure
Domain -> no framework, transport, or persistence dependency
```

- Domain contains business concepts, invariants, and value behavior.
- Application contains use cases, inward-facing ports, DTO coordination, and
  business orchestration.
- Infrastructure implements ports using databases, queues, connectors, object
  storage, model providers, or other external systems.
- Presentation validates transport input, calls application contracts, and
  translates results to transport output.
- Composition roots instantiate concrete implementations and inject them into
  inward-facing contracts.

## Express Modules

An active Express business module grows toward this structure:

```text
modules/<module>/
|-- domain/
|   |-- entities/
|   |-- value-objects/
|   `-- exceptions/
|-- application/
|   |-- dtos/
|   |   |-- requests/
|   |   `-- responses/
|   |-- mappers/
|   |-- services/
|   |   |-- interfaces/
|   |   `-- implementations/
|   `-- repositories/
|       `-- interfaces/
|-- infrastructure/
|   `-- repositories/
|       `-- implementations/
|-- presentation/
|   |-- controllers/
|   |-- routes/
|   `-- validators/
|-- tests/
|   |-- fixtures/
|   `-- integration/
|-- index.ts
`-- <module>.module.ts
```

The normal request flow is:

```text
Route -> Validator -> Controller -> Service Interface
      -> Service Implementation -> Repository Interface
      -> Repository Implementation -> Mapper -> Response DTO
```

Responsibilities:

| Part | Responsibility |
| --- | --- |
| Route | Declare method, path, middleware, and controller delegation |
| Validator | Parse untrusted params, query, headers, and body |
| Controller | Coordinate HTTP input and output only |
| Service interface | Define focused application use cases |
| Service implementation | Enforce business rules and coordinate ports |
| Repository interface | Define persistence operations required by use cases |
| Repository implementation | Interact with storage or external data systems |
| Mapper | Convert between internal models and public DTOs |
| Composition root | Construct and inject concrete dependencies |

Manual constructor injection is the default. A dependency injection framework
requires a demonstrated need and a separately reviewed dependency decision.

## Technical Endpoint Exception

A technical endpoint may use a reduced `Route -> Handler` flow only when all of
these conditions hold:

1. It serves liveness, readiness, metrics, or equivalent infrastructure.
2. It has no business rule.
3. It uses no repository or external business system.
4. It exposes no tenant data.
5. Its reduced structure is documented.

The exception cannot be used to collapse a small business endpoint into one
file.

## React Features

An active React feature grows toward this structure:

```text
features/<feature>/
|-- api/
|-- components/
|-- hooks/
|-- pages/
|-- schemas/
|-- types/
|-- mappers/
`-- tests/
```

- Pages compose feature behavior and layouts.
- Presentational components render state and emit user intent.
- API modules own transport calls.
- Hooks coordinate API, local state, and derived state when needed.
- Schemas validate external data before feature code trusts it.
- Mappers isolate API response shapes from view models.
- Loading, empty, error, and success states are explicit.

Shared UI is reserved for stable, genuinely reusable components and utilities.
Features access another feature only through its public entry point.

All frontend work must also follow
[`linear-product-canvas.md`](../design/linear-product-canvas.md).

## Python Modules

Python business modules mirror the same boundaries:

```text
modules/<module>/
|-- domain/
|-- application/
|   |-- dtos/
|   |-- services/
|   `-- repositories/
|-- infrastructure/
|-- presentation/
`-- tests/
```

- Pydantic models define transport request and response schemas.
- `Protocol`, `ABC`, or abstract methods define substitutable boundaries when
  required.
- Services do not execute database queries.
- Routers do not contain business rules.
- FastAPI dependencies or explicit factories compose concrete dependencies.
- Public boundaries use complete type hints.

## CompanyOS Guardrails

Architecture does not replace product governance:

- Every business resource remains company scoped.
- Authorization is enforced before data access and tool execution.
- Risky actions can pause for human approval.
- Operational databases remain sources of truth.
- GraphRAG filters permissions before constructing model context.
- Important actions retain actor, input, output, decision, approval, audit, and
  provenance data.

Read [`implementation-guardrails.md`](../agent-guidelines/implementation-guardrails.md)
before agent, workflow, policy, GraphRAG, connector, or approval work.

## Pragmatic Layering

Clean Architecture is a dependency discipline, not a folder-count target.

- Add a layer directory when an approved file needs it.
- Add an interface when substitution or boundary isolation is real.
- Keep pure private helpers as functions.
- Do not add pass-through classes without a responsibility.
- Do not create empty trees, `.gitkeep` files, placeholder exports, or future
  modules.

Existing code is migrated only through a focused spec and plan that preserves
behavior with tests.
