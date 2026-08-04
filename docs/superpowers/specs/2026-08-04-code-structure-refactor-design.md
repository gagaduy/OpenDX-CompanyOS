<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Existing Code Structure Refactor Design

## Status

- Date: 2026-08-04
- State: Approved for implementation planning
- Branch: `refactor/clean-architecture-foundation`
- Baseline: current Phase 2 behavior on `develop`

## Objective

Move the existing Express API, React console, and Python AI runtime into the
approved feature-first structure without adding CompanyOS business capability.
The refactor must preserve NovaCommerce data, health behavior, and the current
frontend content and visual design while simplifying the product to one
configured company.

## Single-Company Decision

OpenDX CompanyOS is deployed for one company. `Company` remains the aggregate
root and product center, but the system does not model multiple companies or
select a company by identifier.

- `Company` has no technical `CompanyId` field.
- Child records do not repeat `companyId`.
- Repositories expose the configured company snapshot without a company key.
- API routes do not contain `/companies/:companyId`.
- Seed data contains only NovaCommerce.
- Authorization still applies by actor, department, role, resource, action,
  classification, and risk, but not by tenant selection.

## Delivery Units

The work is split into three independently verifiable units:

1. Express Company Operating Core Clean Architecture refactor.
2. Console migration from Next.js to React, TypeScript, and Vite with
   feature-first source ownership.
3. Python AI runtime composition and technical-health structure refactor.

Each unit receives a separate implementation plan and commit sequence. A unit
must be green before the next begins.

## Express Design

The existing `apps/api/src/company-core` implementation moves under
`apps/api/src/modules/company-operating-core` with these boundaries:

```text
presentation -> application -> domain
infrastructure -> application + domain
company-operating-core.module.ts -> all module layers
```

The current entities and validation leave `packages/domain`; the obsolete
`CompanyId` and company-scoped ID helper are removed. The module owns its
response DTOs and maps internal entities before returning them.

Repository and service contracts become asynchronous so a later PostgreSQL
adapter does not require changing controller signatures. Manual constructor
injection wires the in-memory repository, mapper, service, controller, and
router.

The API exposes the single-company paths `/v1/operating-core`,
`/v1/departments`, `/v1/tasks`, `/v1/events`, and `/v1/approvals`. Response
shapes remain unchanged apart from removal of company identifiers.

## Console Design

The console becomes a React 19 + TypeScript client built with Vite. Existing
visible copy, layout, Lucide icons, responsive behavior, and Linear-inspired
tokens are preserved.

The current page becomes the `company-overview` feature. Static page data,
focused presentational components, feature page composition, application
bootstrap, and global styles receive separate ownership. `router` and `store`
directories are not created because the current console has one page and no
cross-feature state requirement.

Generated `.next` output is ignored and removed from the working tree. Next.js
dependencies and configuration are removed only after the Vite test and build
path is ready.

## Python Design

The existing FastAPI health endpoint is a documented technical endpoint. It
moves to `app/shared/health` with a Pydantic response schema. `create_app.py`
owns FastAPI composition and `main.py` exports the ASGI application.

No empty `modules` directory is created because the AI runtime has no approved
business feature implementation yet.

## Testing and Migration Safety

- Existing tests are characterization tests and must pass before migration.
- New path-level tests are written before their target implementation.
- API integration tests cover NovaCommerce data and the five single-company
  collections.
- Frontend tests cover the current visible headings and guardrail content.
- Python tests exercise `/health` through the composed application.
- Every unit runs typecheck, tests, build, lint commands currently supported by
  that workspace, plus repository audit and diff checks.

## Non-Goals

- New API endpoints or write behavior.
- PostgreSQL, ORM, Keycloak, Temporal, GraphRAG, connector, or agent runtime
  implementation.
- New console pages, routing, global state, or visual redesign.
- New Python business modules.
- A dependency injection container.
- Empty module scaffolds or placeholder exports.
- Release creation or merge to `develop` or `main`.

## Acceptance Criteria

1. Existing API behavior passes through the new module composition root.
2. Domain and application layers do not import Express or infrastructure.
3. The in-memory adapter satisfies a no-argument single-company repository
   contract.
4. `packages/domain` no longer owns API-specific entities, `CompanyId`, or a
   company-scoped ID helper.
5. The console builds with Vite and retains the approved UI at desktop and
   mobile sizes.
6. No Next.js dependency, source convention, or generated output remains.
7. Python health behavior passes through `create_app.py` and
   `shared/health/router.py`.
8. No speculative module, router, store, or placeholder directory is added.
9. No production source, active API documentation, or current architecture
   guidance refers to `CompanyId`, `companyId`, multi-company selection, or
   per-company isolation requirements.
10. Documentation and repository checks describe the resulting tree accurately.
