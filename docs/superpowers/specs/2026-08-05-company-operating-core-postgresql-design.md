<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Company Operating Core PostgreSQL Persistence Design

## Status

- Date: 2026-08-05
- State: Approved focused design
- Delivery phase: Phase 3 prerequisite and companion scope
- Parent design: `2026-08-05-commerce-product-foundation-design.md`

## Outcome

Company Operating Core and Commerce Catalog use PostgreSQL as their runtime
source of truth. The existing Company Operating Core API contracts remain
stable, while production composition replaces the in-memory repository with a
PostgreSQL adapter and deterministic relational seed.

This design is an explicitly approved exception to the earlier Phase 3
exclusion of Company Core persistence. It does not add Company Core mutation
APIs or expand commerce behavior.

## Approved Decisions

- Use normalized PostgreSQL tables rather than one JSONB snapshot.
- Keep the configured single-company model and omit public `companyId` fields.
- Do not repeat a company identifier in child tables.
- Preserve the existing read-only Company Operating Core routes and DTOs.
- Use the same `pg` pool, transaction boundary, and `node-pg-migrate` runner as
  the Commerce Product Foundation.
- Run deterministic NovaCommerce seed data idempotently in a transaction.
- Never fall back to in-memory data when PostgreSQL is unavailable.
- Keep in-memory fakes only inside focused unit tests when substitution is
  useful; production composition uses PostgreSQL exclusively.

## Scope

### Included

- PostgreSQL schema and constraints for the complete Company Operating Core
  snapshot.
- PostgreSQL repository implementation behind the existing application port.
- Relational row-to-domain mapping with defensive result ownership.
- Idempotent NovaCommerce seed preserving current fixture identifiers and API
  results.
- Database-aware composition, liveness/readiness behavior, and dependency
  error mapping.
- Migration, repository contract, seed, API integration, and failure tests.
- Docker migration and seed ordering required before API readiness.

### Excluded

- New Company Core create, update, archive, approval, or workflow endpoints.
- Multi-company routing, selectors, tenant IDs, or child `company_id` columns.
- Workflow execution, Digital Employee execution, GraphRAG, inventory,
  storefront, checkout, payment, shipping, refunds, returns, or invoices.
- Persisting framework, transport, or provider-specific types in domain code.

## Architecture

The current Clean Architecture dependency direction remains unchanged:

```text
Route -> Controller -> Service Interface -> Service Implementation
      -> Repository Interface -> PostgreSQL Repository Implementation
      -> PostgreSQL
```

The application repository interface remains owned by Company Operating Core.
The PostgreSQL implementation lives under that module's infrastructure layer.
Shared database code owns pool lifecycle, database sessions, transactions,
migration state, and test helpers without importing business modules.

The API composition root constructs the PostgreSQL implementation and injects
it into the existing service. Runtime code never constructs
`InMemoryCompanyOperatingCoreRepository`.

## Persistence Model

### Tables

```text
company_profile
departments
positions
human_employees
goals
kpis
operating_tasks
business_events
decisions
approval_requests
audit_events
```

`company_profile` contains one singleton row enforced by a fixed internal key.
The key is infrastructure-only and is never mapped to the domain or API.

### Relationships

- `positions.department_id` references `departments.id`.
- `human_employees.department_id` references `departments.id`.
- `human_employees.position_id` references `positions.id`.
- `human_employees.reports_to_employee_id` references
  `human_employees.id`.
- Department-owned goals reference `departments.id`; company-owned goals have
  no department reference.
- `kpis.goal_id` references `goals.id`.
- `operating_tasks.related_event_id` references `business_events.id`.
- `decisions.related_task_id` references `operating_tasks.id`.

Actor references remain polymorphic `actor_type` and `actor_id` columns because
actors may be users, agents, workflows, service accounts, or connectors.
Database check constraints enforce domain statuses, priorities, decisions,
risk levels, sensitivities, actor types, and outcomes.

## Data Flow

`GET /v1/operating-core` reads all Company Core collections through one
read-only transaction so the returned snapshot is internally consistent.
Collection endpoints issue focused queries for their owning table. Repository
mappers convert snake-case database rows to current domain entities and return
fresh arrays and objects.

The seed uses stable IDs from the current NovaCommerce fixture. It upserts or
skips deterministic records in dependency order and runs in one transaction.
Running it repeatedly produces the same row counts and relationships.

## Failure Handling

- Missing or malformed database configuration stops API startup with a precise
  configuration error.
- Liveness remains available when PostgreSQL is down.
- Readiness reports PostgreSQL or migration state as unavailable.
- Business requests return `503 DEPENDENCY_UNAVAILABLE`; they do not receive
  seed data from memory.
- Constraint or seed failures roll back the active transaction.
- SQL details, credentials, stack traces, and unrestricted row data never enter
  API responses or audit metadata.

## Migration and Rollout

1. Introduce validated database configuration, pool lifecycle, database
   session, and transaction runner.
2. Add a versioned Company Core migration with `up` and `down` behavior.
3. Add PostgreSQL repository contract tests and row mappers.
4. Add the idempotent NovaCommerce PostgreSQL seed and seed tests.
5. Change runtime composition to require the PostgreSQL repository.
6. Add dependency-aware readiness and stable dependency errors.
7. Wire migration and seed jobs into the full-container Phase 3 topology.
8. Remove the in-memory repository from production composition after the
   PostgreSQL API integration suite proves response compatibility.

## Testing

- Migration integration tests verify `up`, tables, foreign keys, check
  constraints, indexes, and `down` on an isolated database.
- Repository contract tests verify the aggregate snapshot and all collection
  reads against PostgreSQL.
- Seed tests run twice and prove stable counts, IDs, correlation IDs, and no
  duplication.
- API integration tests preserve the current response contracts and prove
  responses contain no `companyId` or infrastructure fields.
- Failure tests prove unavailable PostgreSQL never falls back to memory.
- Docker tests prove migrations and seed complete before API readiness.
- Full validation runs lint, typecheck, TypeScript and Python tests, frontend
  build, repository audit, and Docker Compose validation.

## Acceptance Criteria

1. A clean database migrates to the normalized Company Core schema.
2. The NovaCommerce seed is deterministic and idempotent.
3. Existing Company Core endpoints return their documented response shapes
   from PostgreSQL.
4. Production composition contains no in-memory Company Core repository.
5. PostgreSQL failure makes the API unready and business routes fail closed.
6. Migration rollback removes the Company Core schema in dependency-safe
   order.
7. Catalog and Company Core share technical database infrastructure without
   importing each other's private module code.
8. Full-container startup applies migrations and seed before serving Company
   Core traffic.
