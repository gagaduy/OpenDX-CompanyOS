<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Dependency Rules

These rules define legal dependencies for future modules and approved
refactors. They apply regardless of programming language or framework.

## Allowed Dependencies

| Source | May depend on |
| --- | --- |
| Domain | Language standard library and framework-neutral shared primitives |
| Application | Its domain, focused application contracts, shared primitives |
| Infrastructure | Its application ports, its domain, external SDKs |
| Presentation | Its application service interfaces, transport libraries, shared HTTP/UI helpers |
| Composition root | All layers in the module it composes |
| Shared | Other shared code with a lower-level responsibility |

## Prohibited Dependencies

- Domain to application, infrastructure, presentation, Express, FastAPI,
  React, database clients, ORM models, or transport DTOs.
- Application to repository implementations, controllers, routes, or framework
  request and response objects.
- Presentation directly to repository implementations or databases.
- Shared code to a business module or feature.
- One module or feature to another module's private file.
- Frontend code to backend persistence entities.
- Business logic to environment variables, global credentials, or concrete
  external SDK clients without an inward-facing port.

## Public Module APIs

Each business module exposes only intentional cross-module contracts through
its public entry point, normally `index.ts` or a Python package export. Private
directories remain implementation details.

Prefer event, task, handoff, or focused application contracts over importing a
different module's repository or entity internals. Cross-department behavior in
CompanyOS should be explicit and auditable.

## Ownership Rules

- Repository interfaces belong to the application layer that consumes them.
- Repository implementations belong to infrastructure.
- Request and response DTOs belong to the transport or application boundary
  that owns their contract.
- Database and ORM models belong to infrastructure.
- Domain entities must not double as public API responses by convenience.
- Connector credentials remain behind integration and secret-management
  boundaries.
- Authorization policy is enforced in backend/runtime boundaries, never only
  in the frontend.

## Shared Code Test

Before moving code to `shared` or a workspace package, answer all of these:

1. Are there at least two current consumers?
2. Do they require the same semantics, not merely a similar shape?
3. Is the proposed dependency more stable than its consumers?
4. Can it remain free of imports from those consumers?

If any answer is no, keep the code with its owning feature.

## Dependency Introduction

Before adding a library:

1. Confirm the standard library or current stack cannot reasonably solve the
   requirement.
2. Identify which outward layer owns the dependency.
3. Check license, maintenance, security posture, and runtime impact.
4. Add it through the relevant package manager.
5. Update the lockfile and [`dependencies.md`](../dependencies.md).
6. Add tests around the boundary it implements.

Do not place SDK-specific types in domain contracts unless they are immediately
mapped to framework-neutral values.

## Enforcement

Documentation defines intent. Automated import-boundary checks should be added
when an implementation refactor begins and there are real paths to test. Until
then, use
[`clean-architecture-review.md`](../../.agents/checklists/clean-architecture-review.md)
during review.

An exception must document the reason, owner, scope, and removal condition. A
deadline alone does not make an inward dependency violation acceptable.
