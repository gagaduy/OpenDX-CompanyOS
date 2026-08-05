<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Route Inventory Managers to their authorized Inventory workspace after OIDC
  callback instead of rejecting them at the shared staff route guard.
- Make the repository governance audit self-contained and portable instead of
  depending on an absolute path from a contributor workstation.

### Added

- Document the Phase 4 Inventory, publication, Storefront Catalog, PostgreSQL
  operations, runtime topology, and contributor source-build contracts.
- Add role-aware Catalog publication controls with readiness checks, confirmed
  unpublishing, published filters, and explicit sold-out product status.
- Add the role-aware Inventory console workspace with validated API mapping,
  URL-backed filters, responsive stock states, movement history, and guarded
  receipt/adjustment dialogs.
- Seed a deterministic twelve-product technology assortment with generated
  catalog imagery, mixed PostgreSQL stock states, published storefront data,
  Inventory migration/seed operations, and a local Inventory Manager role.
- Expose role-protected Inventory and publication APIs, anonymous Storefront
  catalog/media routes, audited authorization denials, runtime reservation
  expiry, and explicit Catalog/Inventory composition over PostgreSQL.
- Add Catalog publication readiness, publish/unpublish auditing, anonymous-safe
  PostgreSQL product projections, sold-out availability enrichment, and batched
  inventory summaries for staff product lists.
- Add atomic multi-line Inventory reservations with fixed 15-minute expiry,
  idempotent release/consume, a bounded expiry worker, and PostgreSQL proofs for
  oversell prevention and concurrent retry/expiry safety.
- Add PostgreSQL-backed Inventory receipt, adjustment, availability, movement,
  idempotency recovery, application authorization, and audit use cases.
- Add the Phase 4 product-publication migration, one-location Inventory schema,
  rollback coverage, and framework-neutral stock/reservation invariants.
- Add the approved Phase 4 Inventory and Product Publication design for a
  technology storefront, one-location PostgreSQL inventory, 15-minute
  reservations, sold-out product discovery, and oversell-safe publication
  contracts.
- Add the file-level Phase 4 implementation plan with PostgreSQL concurrency,
  publication, public API, console, Docker, seed, documentation, and acceptance
  checkpoints.
- Deliver the full-container Commerce Product Foundation with pinned non-root
  application images, PostgreSQL/MinIO/Keycloak health ordering, deterministic
  Company Core and twelve-product Catalog seeds, focused Make operations,
  backup/restore guidance, and contributor documentation.
- Add product editor panels for variants, immutable VND price replacement,
  authenticated media management, previews, and catalog audit provenance.
- Add the authenticated Catalog console workspace with validated API mapping,
  URL-addressable product filters, product editing, and category management.
- Add the staff OIDC console shell with protected catalog routing, role-aware
  navigation, explicit callback/logout handling, and compact responsive UI.
- Add the normalized PostgreSQL schema and migration runner for Company
  Operating Core data, including relational and domain-level constraints.
- Add validated PostgreSQL row mapping and read-only repository transactions
  for Company Operating Core snapshots and route collections.
- Add transactional, idempotent NovaCommerce seed persistence and a direct
  Company Operating Core PostgreSQL seed command.
- Require explicit Company Operating Core persistence composition, use
  PostgreSQL in the API runtime, and fail closed when the database is down.
- Add verified staff OIDC principals, catalog role authorization, and a
  deterministic local Keycloak realm with PKCE console configuration.
- Add transaction-scoped PostgreSQL audit persistence for catalog mutations
  with sensitive metadata rejection.
- Add authenticated category list, create, update, and archive APIs with
  hierarchy rules, optimistic versions, PostgreSQL persistence, and audit.
- Add authenticated product listing, detail, create, edit, and archive flows
  with pagination projections, PostgreSQL persistence, versions, and audit.
- Add variant lifecycle and transactional VND price replacement APIs with
  global SKU uniqueness, optimistic versions, concurrency tests, and audit.
- Add backend-mediated product media management with byte-signature checks,
  bounded in-memory uploads, PostgreSQL metadata, MinIO storage, and audit.
- Compose the authenticated Catalog API with real PostgreSQL, OIDC, MinIO,
  clock, identity, audit, and media dependencies through one module factory.
- Add correlation-aware HTTP errors plus liveness and dependency-aware
  readiness contracts for the API.
- Add the PostgreSQL pool, transaction boundary, versioned Catalog migration,
  and isolated database integration-test workflow.
- Add framework-neutral Catalog entities, value objects, and validated domain
  invariants for draft product management.
- Add validated API and console environment contracts plus locked Commerce
  Foundation dependencies.
- Add the approved Company Operating Core PostgreSQL persistence companion
  design for Phase 3.
- Add the Company Operating Core PostgreSQL persistence companion
  implementation plan and execution order for Phase 3.
- Add the Phase 3 Commerce Product Foundation design for a PostgreSQL-backed
  general-merchandise catalog, full-container local stack, focused Makefile,
  Keycloak staff access, MinIO media, and audit.
- Add the file-level Phase 3 implementation plan with TDD checkpoints, Docker
  and Make acceptance, and contributor handoff criteria.
- Refocus Phase 3 on a usable product-management workflow and move inventory
  plus publication to Phase 4 instead of migrating Company Core persistence.
- Refocus the active master roadmap on the NovaCommerce B2C Commerce Platform,
  including separate storefront and console surfaces, one-location inventory,
  SePay payments, Operational CRM, support, dashboard, and hosting readiness.
- Defer shipping, refunds, returns, electronic invoices, workflow, Digital
  Employees, and GraphRAG until separately approved post-commerce work.
- Require a root `Makefile` and contributor-facing Docker operations
  documentation in the commerce foundation plan.
- Add the end-to-end NovaCommerce Commerce Platform master implementation plan
  with phase checklists, focused planning gates, test matrices, and acceptance
  criteria.
- Migrate the product console from Next.js to React + TypeScript with Vite,
  Vitest, and a feature-first `company-overview` structure.
- Isolate the FastAPI application factory and typed technical health endpoint
  under the AI runtime's shared infrastructure.
- Keep the production build in the repository gate, move NovaCommerce seed
  ownership out of tests, and remove remaining active tenant assumptions.
- Adopt a single-company architecture without Company IDs, company selectors,
  or tenant-scoped API routes.
- Simplify Company Core entities, seed data, repository methods, and API paths
  around the configured NovaCommerce company.
- Add single-company Company Core application ports, response DTOs, mapper, and
  query service.
- Move NovaCommerce fixtures into the Company Core module and add an async,
  defensive in-memory repository adapter.
- Compose Company Core through thin presentation controllers, routes, and an
  explicit module factory; remove the legacy flat implementation.
- Align active product, architecture, API, testing, and agent guidance with the
  single-company permission model.
- Mark historical Company ID plans as superseded and document the implemented
  Company Core module tree.
- Move Company Operating Core entities and validation from the shared domain
  package into their owning API module.
- Strengthen Company Core API and repository characterization coverage before
  structural refactoring.
- Add documentation-only Clean Architecture structure, dependency, coding,
  testing, agent workflow, and review guidance.
- Add the approved existing-code structure refactor design and subsystem plans.
- Add the approved repository-wide Clean Architecture structure design.
- Add the task-by-task Clean Architecture documentation plan.
- Add initial repository governance files for the OpenDX CompanyOS open-source project.
- Add the master MVP roadmap spec and plan for phase-gated delivery.
- Add the MVP status tracker for roadmap progress.
- Add the Phase 1 app foundation design spec.
- Add the Phase 2 Company Operating Core design spec.
- Add the Phase 2 Company Operating Core implementation plan.
- Add the Phase 1 app foundation implementation plan.
- Add the pnpm workspace and initial shared packages for configuration, domain contracts, and UI tokens.
- Add Company Operating Core domain contracts and deterministic validation helpers.
- Add NovaCommerce Company Operating Core seed data and in-memory repository.
- Add read-only company-scoped Company Operating Core API endpoints.
- Document the Company Operating Core API contract and Phase 2 implementation status.
- Record Phase 2 Company Operating Core completion after full validation.
- Add product, architecture, design, and agent implementation documentation foundation.
- Add the Express API shell with deterministic health endpoint tests.
- Add the FastAPI AI runtime shell with deterministic health endpoint tests.
- Add local Docker infrastructure and shared audit/check scripts.
- Add the initial React console shell using the approved dark operational product canvas.
- Add build-from-source, dependency, project-structure, agent instruction, and repo-local skill documentation.
- Add agent workspace README and review checklists for open-source, product architecture, frontend, and agent safety handoffs.
- Document verified Phase 1 development commands and roadmap status.
- Record Phase 1 foundation completion after full validation.
- Add SPDX headers to GitHub pull request and issue templates.
- Clarify that phase sub-specs and sub-plans are created only at explicit phase kickoff.
- Document frontend design constraints and mandatory AI coding agent guardrails.
- Document the MVP architecture baseline and phased implementation path.
- Document the OpenDX CompanyOS product vision, MVP scope, non-goals, and acceptance chain.
