<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add the authenticated Operational CRM customer API with read-only Customer
  360 composition, authoritative paid segments, immutable note corrections,
  versioned self-claimed follow-ups, PostgreSQL concurrency controls, and
  PII-minimized authorization audit evidence.
- Add the reversible CRM schema for immutable customer notes, self-claimed
  follow-ups, and CRM audit events, together with deterministic segmentation
  and pure follow-up domain rules.

### Changed

- Complete Phase 6 acceptance with a contributor-owned SePay sandbox checkout,
  one authenticated IPN event, an authoritative paid transition, and successful
  reconciliation through a temporary public HTTPS callback without recording
  credentials or customer data.

### Fixed

- Make pending-order cancellation converge atomically across Payment, Order,
  Inventory, Promotion, and Checkout while preserving the winning paid result
  under concurrent authenticated SePay IPN processing.
- Permit only one checkout per immutable cart snapshot, keep a cart active when
  it changes after checkout, and prevent a later payment from finalizing that
  newer cart version.
- Require SePay transaction amount and VND currency to match provider order
  evidence before IPN or reconciliation can confirm payment, and persist a
  mismatch when the trusted paid transition rejects the provider result.
- Use bigint intermediate arithmetic for percentage discounts and proportional
  order-line allocation so valid VND values near JavaScript's safe-integer
  boundary cannot overflow during calculation.
- Use a consistent Payment-before-Attempt lock order for reconciliation,
  notification, expiry, and cancellation paths to prevent financial-state
  deadlocks under concurrent workers.
- Remove Customer audit actors while rolling back the Customer schema so the
  older Company Core actor constraint can be restored on databases containing
  real checkout and paid-order history.
- Make `db:rollback:all` remove every migration in every module rather than
  leaving the first Catalog schema behind, while retaining one-step module
  rollback commands for focused development.
- Wait for the payment-return cleanup effect in its test so parallel workspace
  execution cannot race the local pending-checkout assertion.
- Pass the optional repository-root `.env` explicitly to Docker Compose so
  local Google Sign-In configuration reaches API and Storefront containers
  without changing relative build or bind-mount paths.
- Make the double-submit CSRF cookie readable from the Storefront document path
  while keeping guest and customer session cookies API-scoped and `HttpOnly`.
  Expire the legacy API-path cookie and tolerate both values during migration,
  restoring real-browser add-to-cart mutations for existing sessions.
- Isolate credentialed Console and Storefront CORS audiences, clear invalid
  customer cookies before guest restoration, and revoke newly issued sessions
  when post-login cart inspection fails.
- Serialize cart-resolution idempotency keys, preserve them across Storefront
  retries, and return usable cart media content URLs.
- Load validated Storefront configuration from the repository-root environment,
  make database restore atomic while application writes are stopped, and make
  integration migration runners wait safely for advisory locks.
- Allow Commerce customers as audited actors in the Phase 5 schema, serialize
  concurrent first Google login, avoid request-racing session rotation, and
  reject insecure production customer-cookie configuration.
- Refuse integration-test execution against non-test PostgreSQL databases or
  MinIO buckets so cleanup cannot remove local runtime data.
- Fail cart merge on stale optimistic versions and preserve profile mutation
  input while surfacing recoverable Storefront errors.
- Pin both React frontends to the maintained React Router v6 line outside the
  high-severity unstable-RSC CSRF advisory range.
- Navigate newly created products to their persistent editor URL so variants,
  media, publication, and audit controls become available immediately.
- Serialize reservation references, finalize expiry by complete groups, and
  reject consumption after the backend-owned TTL. Allow atomic checkout
  orchestration to supply that same validated expiry to its order reservation.
- Apply public stock-status filtering before pagination and keep Catalog
  dependencies on Inventory's exported module contract.
- Route Inventory Managers to their authorized Inventory workspace after OIDC
  callback instead of rejecting them at the shared staff route guard.
- Make the repository governance audit self-contained and portable instead of
  depending on an absolute path from a contributor workstation.

### Added

- Add Phase 7 CRM, Support, and Executive staff roles plus PostgreSQL-backed
  Customer and Order operations readers with least-privilege public contracts.
- Add the approved twelve-task Phase 7 implementation plan covering public
  operations readers, CRM, Support SLA and attachments, ClamAV, Reporting,
  role-aware Console surfaces, and deterministic exit acceptance.
- Add the approved Phase 7 focused design for least-privilege Operational CRM,
  staff-created Support tickets and SLA, private ClamAV-scanned attachments,
  deterministic customer segments, and aggregate PostgreSQL-backed reporting.
- Add an isolated Phase 6 checkout-to-paid exit gate covering scarce-stock
  concurrency, exact-once IPN replay, provider/expiry races, fail-closed API
  boundaries, paid-order backup/restore, and migration rollback/reapply, plus a
  credential-redacted opt-in real SePay sandbox runner.
- Add idempotent active/inactive NovaCommerce Promotion fixtures, independent
  Checkout expiry configuration, health-waiting full-container startup, and
  contributor documentation for Checkout, Order, Payment, Promotion, SePay
  sandbox, migration, backup, restore, and credential operations.
- Add role-aware Console order and payment operations with legal order
  transitions, optimistic-version recovery, redacted provider-event evidence,
  reconciliation review, responsive dark operational surfaces, and
  deterministic browser acceptance.
- Add the authenticated Storefront checkout and order journey with owned address
  selection, promotion feedback, immutable backend totals, ordered SePay form
  submission, bounded authoritative payment polling, customer order history,
  responsive light/dark surfaces, and reproducible browser evidence.
- Add bounded unpaid-checkout expiry and SePay reconciliation workers, including
  idempotent Inventory-first cleanup, redacted provider comparisons, shared
  exact-once paid transitions, administrator/finance payment APIs, audited role
  enforcement, and PostgreSQL race coverage across IPN and reconciliation.
- Add constant-time authenticated SePay IPN ingestion with strict pre-parse
  authentication, allow-listed event projections, database deduplication, and
  one atomic paid transition across Payment, Order, Inventory, Promotion,
  Checkout, and Cart, including twenty-callback concurrency coverage.
- Add authenticated, CSRF-protected Checkout APIs that revalidate owned
  customer, cart, Catalog, promotion, price, and stock facts; atomically create
  immutable checkout/order/payment snapshots with Inventory reservations; and
  generate replay-safe SePay initiation only after commit.
- Add a provider-neutral Payment core with immutable SePay attempts, replay-safe
  post-commit initiation, audited PostgreSQL persistence, ordered HMAC-SHA256
  checkout signing, timeout-safe Basic Auth reconciliation reads, and strictly
  redacted official-contract notification projections.
- Add immutable Order and line snapshots, Order-owned public numbers, exact
  transition rules, optimistic and idempotent status updates, customer-owned
  reads, administrator/operations APIs, audited role denials, and a
  transaction-participating Checkout port.
- Add transaction-participating Commerce ports for owned Customer address and
  contact snapshots, locked Cart snapshots, current Catalog variant facts, and
  atomic Inventory reserve/release/consume operations, including PostgreSQL
  rollback coverage for downstream checkout and paid-transition failures.
- Add deterministic percentage and fixed-amount Promotion rules, concurrency-
  safe usage holds, idempotent redemption lifecycle, audited PostgreSQL
  persistence, a transaction-participating Checkout port, and administrator-
  only management APIs.
- Add constrained PostgreSQL schemas and ordered migration/rollback lifecycle
  for promotions, immutable checkout and order snapshots, payment attempts,
  provider events, and reconciliation evidence.
- Add validated sandbox/production SePay environment contracts, fixed checkout
  expiry, and local Operations Manager and Finance Operator staff identities
  without requiring payment credentials for normal local startup.
- Add the proposed Phase 6 Checkout, Order, and SePay focused design plus a
  13-task TDD implementation plan covering deterministic promotions, immutable
  order snapshots, atomic inventory reservation, server-signed SePay checkout,
  authenticated exact-once IPN handling, reconciliation, Storefront/Console
  workflows, Docker operations, and sandbox acceptance.
- Add the product-first NovaCommerce Storefront redesign with editorial catalog
  discovery, a sticky product purchase surface, immersive customer sign-in,
  structured profile/address workspaces, persistent light/dark themes, and
  responsive browser evidence for both modes.
- Add reproducible Chrome DevTools browser acceptance for Storefront image
  delivery, semantic layout, keyboard focus, and responsive overflow at mobile,
  tablet, and desktop viewports.
- Add the NovaCommerce React storefront with URL-backed catalog discovery,
  product detail, persistent guest cart, lazy Google identity sign-in,
  checkout gating, customer profile/address workflows, and accessible cart
  resolution controls.
- Add CSRF-protected Cart APIs, explicit persisted guest/customer cart
  resolution, login-time non-conflicting cart transfer, and customer-only
  checkout-readiness validation without checkout, order, or payment state.
- Add backend-authoritative Cart operations backed by PostgreSQL, batch Catalog
  variant projections, live Inventory availability, stale-line markers, and
  concurrency-safe first-cart creation.
- Add Google-verified customer registration, hash-only rotating Commerce
  sessions, guest sessions, CSRF/origin protection, owned profiles and address
  APIs, authentication rate limiting, and credential-free audit events.
- Add Customer, Commerce session, address, Cart, CartItem, and durable cart
  resolution PostgreSQL schemas with matching domain invariants.
- Scaffold the strict React, TypeScript, and Vite NovaCommerce Storefront with
  validated public environment configuration and initial semantic app states.
- Add reviewed cookie parsing and selected Express authentication rate-limiting
  dependencies for the Phase 5 Commerce session boundary.
- Add the Phase 5 file-level TDD implementation plan for the Storefront,
  Customer identity and sessions, address ownership, authoritative Cart,
  explicit cart resolution, Docker delivery, and acceptance evidence.
- Add the approved Phase 5 Storefront, Customer, and Cart design with a
  catalog-first technology storefront, seven-day guest carts, Google customer
  registration, 30-day Commerce sessions, explicit cart resolution, and an
  authenticated checkout gate.
- Complete Phase 4 after source, container, concurrency, OIDC console, public
  HTTP, responsive UI, and PostgreSQL backup/restore acceptance.
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
