<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Add the Agentic workflow application boundary with governed starts, frozen
  approvals, durable cancellation signals, activity evidence, and retryable dispatch.
- Add the durable Agentic workflow-run, activity-invocation, and signal-receipt
  state model with reversible PostgreSQL constraints and idempotent repositories.
- Add pinned Temporal and JWT runtime dependencies plus fail-closed AI Runtime
  configuration for workload identity, activity bounds, and production mTLS.
- Add the approved file-level TDD implementation plan for the durable Store
  Health Temporal workflow, authenticated workload boundaries, production
  Compose hardening, replay validation, and three-database recovery.
- Define the production-ready single-VPS Temporal workflow design for explicit
  Store Health Review starts, durable branch orchestration, bound signals,
  restart recovery, workload identity, and three-database backup/restore.
- Make local database backup create matching readable SQL and custom archives,
  and restore either format through an extension-aware fail-closed command.
- Define the dual-format `make db-backup` and extension-aware `make db-restore`
  contract for safe local SQL and custom-archive database recovery.
- Add the file-level TDD plan for dual-format local backup creation,
  fail-closed publication, extension-aware restore, and recovery verification.
- Harden Agent governance with immutable identities, assigned approval scopes,
  exact configuration diffs, intake provenance, filtered audit, and model revocation.
- Document Phase A Agent governance architecture, staff API, migration order,
  source validation, current non-executing scope, and roadmap completion.
- Add the authenticated `/v1/admin/agentic` staff API with strict validators,
  backend role enforcement, denied-access audit, and PostgreSQL composition.
- Add owner-scoped, non-executing Agent task intake with validated dependency
  graphs, active-configuration pinning, cancellation, and audit evidence.
- Add two-person Agent configuration decisions, bound action approvals, and
  Administrator or Governance Admin approved-request emergency revocation.
- Add deny-by-default Agent policy evaluation, inert typed-tool authorization,
  idempotent integer-micro budget accounting, and mandatory safe evidence.
- Add the reversible PostgreSQL Agent governance schema and migration chain for
  identities, tasks, configuration, policy, tools, models, budgets, approvals,
  revocations, audit, and provenance.
- Add pure Agent governance domain rules for task, configuration, approval,
  dependency graph, model, and integer budget invariants.
- Add distinct Agentic staff roles and an isolated Digital Employee service
  principal boundary that cannot trust a payload-provided Agent identity.
- Add the Agent Governance Foundation file-level TDD plan covering separate
  identities, domain rules, PostgreSQL constraints, policy/tool/budget checks,
  two-person approvals, task ownership, staff APIs, and phase-exit validation.
- Define the Agent Governance Foundation focused design with separate human and
  Digital Employee identities, two-person configuration control, deterministic
  policy, versioned tasks, tool grants, budgets, approvals, audit, provenance,
  and emergency revocation before runtime execution.
- Add the Post-Commerce Agentic Workforce master implementation plan with eight
  gated delivery phases from governance foundation through deterministic
  cross-department acceptance.
- Define the Post-Commerce Agentic Workforce design for a rule-first AI CEO,
  six read-only Department Agents, Temporal orchestration, OpenRouter model
  governance, approval-bound file intake, Tool Registry mediation, Quality
  Gate, scoped memory, and auditable Store Health Review workflow.
- Add a transaction-safe, idempotent PostgreSQL commerce fixture for testing
  current and previous dashboard reporting windows without replacing contributor data.
- Extend authoritative Reporting responses with equal-length prior-period
  comparisons and zero-filled Vietnam-local daily commerce and customer facts.
- Replace Dashboard analytics placeholders with accessible SVG revenue and
  paid-order charts plus backend-derived KPI comparisons and sparklines.
- Expand Dashboard browser acceptance to verify real chart landmarks and
  accessible data tables across supported viewports and themes.
- Align the Console's default 30-day Dashboard range with the backend's
  Vietnam-local, end-exclusive reporting window so the current day is included.
- Apply restrained technical typography to Console identifiers, evidence,
  timestamps, SKUs, and audit provenance without changing application data.
- Align the Support ticket detail with the approved timeline-and-context layout,
  make status and priority explicit, and show an honest unavailable SLA state.
- Reframe the Console dashboard into executive metrics, operational focus,
  and performance overview regions using only authoritative report data.
- Restructure the Console product editor into clear basic-details,
  classification, and description-and-attributes setup panels.
- Refine Console navigation emphasis, technical typography, and desktop table
  density to more closely match the approved Obsidian Flux operations canvas.
- Expand deterministic Console browser acceptance to all 17 routes at mobile,
  tablet, and desktop widths in both themes, and fix the responsive product
  table and mobile navigation cascade issues exposed by those checks.
- Redesign the executive Dashboard around authoritative commerce aggregates,
  explicit unavailable-chart placeholders, and operational focus, and label
  every Company Overview capability with a truthful delivery state.
- Redesign Support operations with a ticket-creation drawer, accessible queue
  and evidence regions, clean-only attachment downloads, and a retryable real
  customer reply composer while future internal notes remain disabled.
- Redesign Customer operations as an accessible searchable list and a
  three-region Customer 360 workspace while preserving URL-backed segments
  and optimistic follow-up claiming.
- Redesign Order and SePay Payment operations with accessible dense tables,
  immutable evidence timelines, side snapshots, confirmed unpaid-order
  cancellation, and truthful disabled receipt/export controls.
- Redesign Inventory as a dense stock workspace with visible-result summaries,
  an accessible stock table, and shared movement and mutation dialogs.
- Redesign Product Editor as a five-tab Obsidian Flux workspace with truthful
  setup progress and disabled Product Tags, Import, and Export CSV controls.
- Redesign Console Product and Category workspaces with shared headers,
  accessible filter/table/tree landmarks, explicit system states, and reusable
  confirmation drawers while preserving catalog mutations.
- Redesign Console staff authentication with a focused NovaCommerce Keycloak
  entry surface and an explicit retry path for failed OIDC callbacks.
- Add shared Console page-header, system-state, Coming soon, and accessible
  modal/drawer primitives for the Obsidian Flux redesign.
- Redesign the NovaCommerce Console shell with grouped role-aware navigation,
  contextual route headers, a responsive mobile drawer, and night mode by
  default while preserving the persisted light theme.
- Add the file-level TDD implementation plan for the approved NovaCommerce
  Console Obsidian Flux redesign.
- Define the approved Obsidian Flux redesign for all NovaCommerce Console
  routes, preserving real role-aware commerce behavior while clearly disabling
  unsupported Stitch reference controls.
- Move Phase 7 implementation evidence from the hidden `.superpowers`
  tool-output directory into `docs/superpowers/reports`, and document the
  distinction between normative specs/plans and historical execution reports.
- Add an authoritative public Catalog read model that selects the newest
  eligible product in every active category for Storefront hero merchandising.
- Rotate the Storefront catalog hero through active categories with accessible
  manual controls, reduced-motion handling, and graceful image fallbacks.
- Collapse the Storefront navigation behind its existing hamburger at
  intermediate widths so navigation labels cannot overlap product search.
- Add reviewed local GLB assets, MIT WebGL dependencies, deterministic scene
  progress, device quality budgets, and a six-section semantic journey backed
  by authoritative Catalog product queries, native scroll coordination, and
  accessible scene shortcuts, plus bounded GLB loading, shared caching, and
  deterministic GPU disposal, lazy WebGL delivery, theme-aware lighting, and
  adaptive intro, smartphone, computing, audio, gaming, and featured scenes,
  progressive scroll-driven model loading, hidden-tab rendering suspension,
  reduced-motion behavior, responsive showroom overlays, and browser evidence
  for both themes and the no-WebGL fallback on the approved Storefront 3D
  homepage, with upright per-asset poses, viewport-bounded model fitting, and
  isolated model-specific dark palettes so products remain recognizable and
  fully visible without changing their authored light-theme materials.
- Define the approved Nexora-inspired six-scene 3D Storefront homepage design,
  including real Catalog data, light/dark presentation, licensed GLB assets,
  progressive loading, reduced motion, and static failure fallback.
- Add a dedicated Storefront introduction homepage at `/` and move customer
  product discovery/catalog navigation to `/products`.
- Add a persisted Console light/night-mode toggle so staff can switch from a
  light admin canvas into night mode.
- Make the Storefront discovery filter toggle expose explicit open/closed state
  so the sidebar panel opens reliably from the rail button.
- Make the Storefront discovery sidebar rail icons actionable for catalog
  navigation instead of decorative-only controls.
- Replace the Storefront header search icon and duplicate quick-search chip with
  a usable product search field that applies the catalog query directly.
- Back Storefront `Sản phẩm mới`, `Bán chạy`, and `Đang giảm` shortcuts with
  authoritative catalog, order, and price-history queries.
- Align the Storefront header and discovery shortcut row into one compact
  commerce navigation layout.
- Add a Storefront customer discovery taskbar and collapsible catalog filter
  sidebar design implementation.
- Fix Storefront header hash navigation so customer `Danh mục` and `Khám phá`
  links scroll to their discovery sections after React Router navigation.
- Complete Phase 8 hardening readiness on `phuong` with exit preflight, root
  source validation, local commerce acceptance, and recorded production SePay
  acceptance decision.
- Add Phase 8 exit preflight wiring and closure documentation for hardening
  readiness evidence.
- Add Phase 8 CI and security workflows with environment-contract and committed
  secret-fixture audits.
- Add Phase 8 accessibility and performance gates for local Storefront,
  Console, CRM/Support/Dashboard, and public Storefront API checks.
- Add Phase 8 PostgreSQL and MinIO backup/restore scripts with path validation,
  restore guardrails, safety checks, and operations documentation.
- Add Phase 8 payment threat-model documentation and an opt-in SePay
  production acceptance guard that refuses accidental real-money checks.
- Add Phase 8 authorization matrix documentation and a source check covering
  staff, customer, guest, anonymous, and SePay provider boundaries.
- Add Phase 8 PII-safe API observability with structured logs, bounded request
  metrics, optional `/metrics`, and operations documentation.
- Add Phase 8 API runtime hardening with security headers, configurable JSON
  body limits, readiness timeouts, and graceful shutdown cleanup.
- Add Phase 8 VPS production-candidate Docker targets, Caddy routing, Compose
  topology validation, and production deployment documentation.
- Add the Phase 8 production environment contract baseline with fail-closed
  production validation for placeholder domains and typed observability,
  request-size, readiness, and production SePay acceptance settings.
- Fix Storefront startup so cart loading waits for customer session
  restoration, preventing rotated customer cookies from being cleared by a
  concurrent stale cart request.
- Add guarded Phase 7 CRM/Support/Dashboard source preflight commands and
  operations documentation for exit evidence collection, with test coverage for
  isolated-environment enforcement, command ordering, focused API/Console
  suites, PostgreSQL/MinIO/ClamAV integration, EICAR rejection, and reporting
  scale query plans.
- Add a Phase 7 CRM/Support/Dashboard browser check covering Customer, Support,
  and Dashboard surfaces at 390x844, 768x1024, and 1440x900 with focus,
  landmark, overflow, screenshot, and denied-route evidence.
- Add a Phase 7 lifecycle check for disposable PostgreSQL restart persistence,
  custom-format backup/restore, and CRM/Support rollback-forward migration
  while preserving earlier commerce tables.
- Run root source checks with sequential workspace test execution to keep UI
  tests stable under local validation load.
- Add the Executive Dashboard Console workspace with Administrator/Executive
  route gating, default 30-day reporting range, max-range validation,
  PII-free aggregate commerce/product/customer/operations metrics, stale
  refresh warnings, and responsive dashboard cards.
- Add the Support Console workspace with role-gated Support routes, ticket
  queue/create/detail views, workflow actions, append-only timeline rendering,
  stale mutation recovery, and authenticated attachment upload/download UI.
- Add the Customer and CRM Console workspace with role-gated customer routes,
  URL-backed search and segment filters, read-only Customer 360, note
  correction timeline, versioned follow-up claiming, and responsive dark UI.
- Add authoritative aggregate Reporting APIs for commerce, products, customers,
  and operations under `/v1/admin/reporting`, with Administrator/Executive
  access, PII-free DTOs, VND integer arithmetic, PostgreSQL-backed query
  coverage, and scale query-plan verification.
- Add the ClamAV local scanning lifecycle, private Support attachment MinIO
  bucket readiness, and Support worker interval environment configuration.
- Add private Support ticket attachment upload/download services, ClamD scan
  adapter, MinIO storage adapter, and scan/retention workers.
- Add staff Support ticket operations, PostgreSQL concurrency controls, and SLA escalation worker.
- Add verified Support PostgreSQL, worker, and HTTP route coverage for role
  boundaries, version races, idempotency, chronological history, and SLA claims.

### Added

- Add the reversible Support PostgreSQL schema for staff-created tickets,
  append-only messages/events/audit history, exact lifecycle/version guards,
  continuous SLA pause/stop state, and quarantined attachment tombstones.
- Add pure Support ticket/SLA and attachment rules covering approved workflow
  transitions, boundary breaches, allow-listed formats, limits, and retention.
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

- Use the effective SLA breach instant in automatic escalation keys, preserve
  escalated status while a support operator claims unassigned work, and require
  Support migrations before API readiness succeeds.
- Scope Support ticket idempotency keys per ticket, reject closed-ticket
  messages at service and PostgreSQL boundaries, enforce owned-or-available
  Support operator access, and route administrator reassignment through the
  staff ticket PATCH API.

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
