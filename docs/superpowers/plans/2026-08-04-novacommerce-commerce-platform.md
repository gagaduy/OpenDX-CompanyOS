<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# NovaCommerce Commerce Platform Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver DX-OS as a locally runnable, production-ready B2C commerce
platform for NovaCommerce, with a public storefront, governed staff console,
PostgreSQL-backed operations, SePay payments, Operational CRM, support, and
dashboard.

**Architecture:** Extend the existing TypeScript monorepo as a feature-first
Clean Architecture modular monolith. `apps/api` owns authoritative commerce
rules and PostgreSQL transactions; `apps/storefront` and `apps/console` consume
purpose-specific APIs; Keycloak authenticates staff; customer identity remains
inside the Commerce boundary. Delivery proceeds as vertical slices behind a
focused design and implementation-plan gate for every phase.

**Tech Stack:** Node.js 22+, TypeScript strict mode, Express 5, React 19 + Vite,
pnpm workspaces, PostgreSQL 18, Docker Compose, Keycloak, MinIO, SePay Payment
Gateway, Vitest, Testing Library, Supertest, and Python 3.13/FastAPI retained as
a dormant post-commerce service shell.

## Global Constraints

- NovaCommerce is the only company; no Company ID, tenant selector, or
  multi-company route is introduced.
- Commerce is B2C, single-store, physical-goods, one inventory location, and
  VND-only.
- PostgreSQL is the sole operational relational database and commerce source of
  truth.
- Store monetary amounts as integer VND minor units; never use floating point
  for financial calculations.
- Prices are tax-inclusive and orders retain immutable price, discount, and tax
  snapshots.
- Staff use Keycloak; guest and Google-registered customer identity belongs to
  the Commerce boundary, and checkout requires a registered customer session.
- Browser redirects never prove payment. Only authenticated SePay IPN handling
  or successful provider reconciliation can mark a payment paid.
- Shipping-provider integration, refunds, partial refunds, returns, exchanges,
  and electronic invoices are excluded.
- Workflow, Temporal execution, Digital Employees, GraphRAG, and AI operations
  remain post-commerce work.
- Backend code authoritatively enforces price, promotion, inventory, order,
  payment, authorization, audit, and reporting rules.
- Follow feature-first Clean Architecture and create directories only with
  approved implementation and tests.
- Use constructor injection by default; do not add a dependency-injection
  framework without a focused dependency decision.
- Every dependency must have a current-phase purpose, compatible license,
  lockfile update, and `docs/dependencies.md` entry.
- The root `Makefile` is a discoverable command facade. Every target maps to a
  documented pnpm, Python, or Docker Compose command.
- Every phase uses TDD for observable behavior, updates documentation and
  `CHANGELOG.md`, passes `pnpm check`, and merges through a reviewed pull
  request into `develop`.

---

## How To Execute This Master Plan

This document is the end-to-end delivery map. It intentionally does not replace
the focused design and implementation plan required for a phase.

For each phase:

- [ ] Create a feature branch from the latest `develop`.
- [ ] Run the `superpowers:brainstorming` workflow and write the focused design
  under `docs/superpowers/specs/`.
- [ ] Obtain user review of the committed focused design.
- [ ] Run `superpowers:writing-plans` and write exact file-level TDD tasks under
  `docs/superpowers/plans/`.
- [ ] Execute the focused plan with `superpowers:subagent-driven-development`
  or `superpowers:executing-plans`.
- [ ] Run the phase test matrix and repository-wide `pnpm check`.
- [ ] Update API, architecture, dependency, build, Docker, roadmap, and
  changelog documentation affected by the phase.
- [ ] Request code review, address findings, and create a pull request to
  `develop`.
- [ ] Mark the phase complete only after its exit gate is demonstrated from a
  clean checkout.

## Dependency Order

```text
Phase 3: Commerce Product Foundation
  -> Phase 4: Inventory and Product Publication
    -> Phase 5: Storefront, Customer, and Cart
      -> Phase 6: Checkout, Order, and SePay
        -> Phase 7: Operational CRM, Support, and Dashboard
          -> Phase 8: Production Hardening and Hosting Readiness
```

No later phase starts implementation while an earlier phase has unresolved
data-contract, security, or acceptance failures.

## Stable Cross-Phase Contracts

The focused phase designs may refine names, but they cannot weaken these
contracts without updating and re-approving the master design:

| Boundary | Contract |
| --- | --- |
| Public API | `/v1/storefront/*` |
| Customer API | `/v1/customer/*` |
| Staff API | `/v1/admin/*` |
| SePay callback | `/v1/webhooks/sepay` |
| API success | `{ "success": true, "message": string, "data": T, "meta"?: object }` |
| API error | `{ "success": false, "message": string, "errorCode": string, "errors"?: object[] }` |
| Order states | `pending_payment -> paid -> processing -> ready_for_fulfillment -> completed`; unpaid orders may become `canceled` |
| Payment states | `created -> pending_provider -> paid`; unpaid attempts may become `failed`, `canceled`, or `expired` |
| Reservation states | `active -> consumed | released | expired` |
| Payment proof | Authenticated IPN or successful reconciliation only |
| Persistence | PostgreSQL transactions and versioned migrations |
| Audit | Actor, action, resource, outcome, correlation ID, and timestamp |

---

### Task 1: Phase 3 - Commerce Product Foundation

**Purpose:** Deliver the first PostgreSQL-backed commerce workflow: authorized
staff manage a general-merchandise product catalog with variants, SKU, VND
prices, media, and audit through a full-container local stack.

**Focused design:**
`docs/superpowers/specs/2026-08-05-commerce-product-foundation-design.md`.
The dated implementation plan is created after focused-spec review.

**Primary implementation areas:**

- Create: `Makefile`
- Modify: `.env.example`, root/package manifests, and lockfile
- Create: `apps/api/Dockerfile` and `apps/console/Dockerfile`
- Modify: `infra/docker/docker-compose.yml` and `infra/docker/README.md`
- Create: `infra/keycloak/realm-export.json`
- Create: API shared config, PostgreSQL, HTTP, and staff-auth boundaries
- Create: `apps/api/src/modules/catalog/`
- Create: `apps/console/src/features/catalog/`
- Create: catalog/audit migrations, database scripts, and seed assets
- Update: build, dependency, API, structure, roadmap, and changelog docs

**Interfaces produced for later phases:**

- Typed configuration and PostgreSQL transaction boundaries.
- Versioned migration, rollback, seed, integration-test, backup, and restore
  workflows using `pg` and `node-pg-migrate`.
- Staff OIDC authentication and backend role authorization.
- Standard API envelopes, correlation IDs, error mapping, liveness, and
  dependency-aware readiness.
- Category, draft product, variant, SKU, current/history VND price, media, and
  catalog audit contracts.
- MinIO-backed product media without browser-visible storage credentials.

**Checklist:**

- [ ] Implement the approved focused design and its file-level TDD plan.
- [ ] Run PostgreSQL, Keycloak, MinIO, API, and console in full-container mode;
  remove Temporal from the active commerce Compose topology.
- [ ] Add only `make help`, `up`, `down`, `logs`, `check`, `db-migrate`,
  `db-rollback`, `db-seed`, `db-backup`, and `db-restore` targets.
- [ ] Pin images, add health checks and persistent volumes, import the local
  Keycloak realm, and bootstrap the MinIO product-media bucket idempotently.
- [ ] Implement category, product, variant, SKU, price-history, media, and audit
  migrations without `company_id`.
- [ ] Implement authorized admin APIs and the Catalog console workspace.
- [ ] Add deterministic general-merchandise seed data across four categories.
- [ ] Test domain rules, PostgreSQL repositories/constraints, authentication,
  authorization, API contracts, MinIO compensation, console states, Docker
  smoke behavior, and backup/restore.
- [ ] Leave Company Core persistence and functionality unchanged.
- [ ] Demonstrate the focused spec acceptance chain from a clean checkout.

**Exit gate:** `make up` starts a healthy full stack; a Catalog Manager signs
in, manages a PostgreSQL-backed draft product with SKU, VND price and MinIO
media, sees its audit history, backs up/restores the catalog, passes
`make check`, and stops the stack without data loss.

---

### Task 2: Phase 4 - Inventory and Product Publication

**Purpose:** Add oversell-safe one-location inventory and publish complete,
available products for storefront consumption.

**Focused planning files:** Create a dated design and plan under
`docs/superpowers/specs/` and `docs/superpowers/plans/` using the topic slug
`inventory-product-publication` at Phase 4 kickoff.

**Primary implementation areas:**

- Create: `apps/api/src/modules/inventory/`
- Extend: `apps/api/src/modules/catalog/` through its public contracts
- Create: `apps/console/src/features/inventory/`
- Extend: `apps/console/src/features/catalog/` with publication controls
- Create: inventory, stock movement, reservation, and publication migrations
- Add: inventory, availability, and publication API documentation
- Modify: seed, Make/Docker docs, roadmap, and changelog as needed

**Interfaces produced for later phases:**

- Published product/category read contracts for storefront discovery.
- Inventory balance, stock movement, reservation, release, expiry, and consume
  ports for checkout.
- Availability queries exposing on-hand, reserved, and available quantities.
- Publication policy requiring complete product data, active variant, current
  price, primary image, and available stock.

**Checklist:**

- [ ] Define stock movement, balance, reservation, publication, and unpublish
  invariants in the focused design.
- [ ] Model one inventory location without warehouse-allocation abstractions.
- [ ] Implement migrations and rollback coverage for inventory and publication.
- [ ] Implement receive, adjust with reason, movement history, reserve, release,
  expire, consume, publish, and unpublish use cases.
- [ ] Require backend authorization and audit for every staff mutation.
- [ ] Build inventory and publication console workflows with complete UI states.
- [ ] Add domain, PostgreSQL concurrency, API, authorization, and UI tests.
- [ ] Extend deterministic seed data with stock and published products.
- [ ] Prove concurrent reservations cannot oversell one SKU.

**Exit gate:** Authorized staff can stock and publish a complete product;
public read contracts expose only published available products; inventory and
audit explain every quantity; concurrency tests prove no oversell.

---

### Task 3: Phase 5 - Storefront, Customer, and Cart

**Purpose:** Deliver the first real customer journey from product discovery to
a server-authoritative cart, without introducing payment yet.

**Focused planning files:** Create a dated design and plan under
`docs/superpowers/specs/` and `docs/superpowers/plans/` using the topic slug
`storefront-customer-cart` at Phase 5 kickoff.

**Primary implementation areas:**

- Create: `apps/storefront/package.json`
- Create: `apps/storefront/tsconfig.json`
- Create: `apps/storefront/vite.config.ts`
- Create: `apps/storefront/Dockerfile`
- Create: `apps/storefront/src/app/`
- Create: `apps/storefront/src/features/catalog/`
- Create: `apps/storefront/src/features/authentication/`
- Create: `apps/storefront/src/features/customer-account/`
- Create: `apps/storefront/src/features/cart/`
- Create: `apps/api/src/modules/customer/`
- Create: `apps/api/src/modules/cart/`
- Create: customer and cart migrations in the established migration location
- Modify: `infra/docker/docker-compose.yml`, `Makefile`, `.env.example`, build
  docs, API docs, dependency docs, roadmap, and changelog

**Interfaces produced for later phases:**

- Public paginated category, search, filter, and product-detail APIs.
- Seven-day guest-session and Google-registered customer authentication
  contracts isolated from staff Keycloak identity.
- Customer profile, verified-contact claim, address book, and order-history
  extension points.
- Cart create/read/update/remove contracts that revalidate variant publication,
  current price, and current availability on the backend.
- A checkout-ready cart summary contract consumed by Phase 6.

**Checklist:**

- [ ] Define storefront information architecture, responsive behavior, customer
  session security, registration/login, verified profile claim, and cart
  lifecycle in the focused design.
- [ ] Create `apps/storefront` with React + TypeScript + Vite and the established
  feature-first structure; do not copy console operational layouts blindly.
- [ ] Apply the approved dark visual system while making product identity,
  imagery, price, availability, and buying actions first-viewport signals.
- [ ] Build public home/category/search/product-detail routes with URL-addressable
  filters and pagination.
- [ ] Build guest cart creation and registered-customer cart ownership without
  trusting browser totals.
- [ ] Build Google registration/login, Commerce-owned session rotation, logout,
  profile, address book, and eligible guest-cart claim flow.
- [ ] Prevent silent customer-profile merges and cross-account cart access.
- [ ] Recalculate cart lines and totals on every mutation and mark changed price
  or unavailable stock explicitly.
- [ ] Add image alt text, keyboard operation, focus states, semantic landmarks,
  and responsive tests at mobile, tablet, and desktop viewports.
- [ ] Add domain tests for cart quantities, removed/unpublished variants,
  customer claim eligibility, session expiry, and ownership.
- [ ] Add API tests for public/private boundaries, rate limiting where selected,
  cookie/CSRF behavior, pagination, and stable error responses.
- [ ] Add storefront tests for loading, empty search, unavailable variant,
  server error, cart success, session restoration, and signed-in states.
- [ ] Add storefront to Docker and Make workflows with documented direct
  commands.
- [ ] Demonstrate a guest browsing a seeded catalog, selecting a variant, and
  maintaining a valid cart across a browser refresh.

**Exit gate:** A guest can discover and inspect real seeded products, select an
available variant, and maintain a backend-authoritative cart; Google login
creates or restores a customer that can manage an address and pass the
authenticated checkout gate; staff and customer authentication remain
isolated.

---

### Task 4: Phase 6 - Checkout, Order, and SePay

**Purpose:** Convert a validated cart into a durable paid order with exact-once
payment transitions and transactional stock handling.

**Focused planning files:** Create a dated design and plan under
`docs/superpowers/specs/` and `docs/superpowers/plans/` using the topic slug
`checkout-order-sepay` at Phase 6 kickoff.

**Primary implementation areas:**

- Create: `apps/api/src/modules/promotion/`
- Create: `apps/api/src/modules/checkout/`
- Create: `apps/api/src/modules/order/`
- Create: `apps/api/src/modules/payment/`
- Create: `apps/storefront/src/features/checkout/`
- Create: `apps/storefront/src/features/order/`
- Create: `apps/storefront/src/features/payment/`
- Create: `apps/console/src/features/orders/`
- Create: `apps/console/src/features/payments/`
- Create: promotion, checkout, order, payment, payment-attempt, payment-event,
  and reconciliation migrations
- Add: `docs/integrations/sepay.md`
- Add: checkout, order, payment, webhook, and reconciliation API documentation
- Modify: `.env.example`, Docker/Make workflows, dependency docs, roadmap, and
  changelog

**Interfaces produced for later phases:**

- Deterministic promotion evaluation and redemption contracts.
- Checkout validation and immutable customer/address/cart snapshot contracts.
- Order query and allowed-transition commands for storefront and staff.
- Provider-neutral payment port with a SePay adapter behind infrastructure.
- Authenticated idempotent webhook processor and reconciliation command.
- Commerce events/read contracts for CRM timeline and reporting.

**Checklist:**

- [x] Define promotion precedence, usage limits, checkout expiry, reservation
  duration, idempotency keys, invoice-number format, SePay field signing,
  webhook authentication, reconciliation, and mismatch escalation.
- [x] Define and test exact order, payment, payment-attempt, payment-event, and
  reservation state machines before transport implementation.
- [x] Create a pending order and active inventory reservation in one PostgreSQL
  transaction after server-side price/promotion/customer/address validation.
- [x] Store immutable order-line SKU/title/variant/quantity/price and order-level
  discount/tax/total snapshots.
- [x] Initiate SePay checkout only from server-generated fields and secrets.
- [x] Verify webhook authentication before business parsing; deduplicate raw
  provider events and validate invoice, VND currency, amount, and order.
- [x] Use one idempotent application transition for both valid IPN confirmation
  and successful reconciliation.
- [x] Treat redirects as display/navigation only and show pending until backend
  payment state becomes authoritative.
- [x] Record unsupported void, reversal, or post-payment provider events for
  Finance review without applying refund-like state transitions.
- [x] Do not expose refund, return, exchange, carrier, tracking, or electronic-
  invoice API/UI behavior.
- [x] Build checkout address/contact, promotion, review, redirect, pending,
  confirmed, failed, canceled, and expired storefront states.
- [x] Build staff order list/detail/transition and payment reconciliation views
  with authorization and audit.
- [x] Add signing and webhook contract fixtures derived from official SePay
  documentation, with no captured production customer data.
- [x] Add tests for duplicate/out-of-order events, amount mismatch, invalid
  signature/secret, timeout, retry, expired reservation, and concurrent payment
  processing.
- [x] Add an explicit SePay sandbox integration test profile that is separate
  from deterministic fake-provider CI tests.
- [x] Document sandbox setup, callback exposure for local testing, credential
  rotation, redacted logging, and hosted HTTPS production switch.
- [x] Demonstrate authenticated customer cart to paid order in sandbox and
  prove duplicate IPNs do not duplicate payment, order, stock, or audit
  effects.

**Exit gate:** An authenticated customer checkout creates a transactionally
reserved pending order, SePay sandbox payment is confirmed only by trusted
backend evidence, stock is consumed exactly once, staff can process the paid
order to completion, and no refund/shipping behavior exists.

---

### Task 5: Phase 7 - Operational CRM, Support, and Dashboard

**Purpose:** Turn commerce records into a usable staff operating surface for
customer context, support work, follow-up, and deterministic business metrics.

**Focused planning files:** Create a dated design and plan under
`docs/superpowers/specs/` and `docs/superpowers/plans/` using the topic slug
`crm-support-dashboard` at Phase 7 kickoff.

**Primary implementation areas:**

- Create: `apps/api/src/modules/crm/`
- Create: `apps/api/src/modules/support/`
- Create: `apps/api/src/modules/reporting/`
- Create: `apps/console/src/features/customers/`
- Create: `apps/console/src/features/crm/`
- Create: `apps/console/src/features/support/`
- Create: `apps/console/src/features/dashboard/`
- Create: CRM, support, and reporting migrations/read models
- Add: CRM, support, reporting, and metric-definition API documentation
- Modify: seed/reset, Docker/Make docs, roadmap, and changelog

**Interfaces produced:**

- Customer 360 read model with profile, contacts, addresses, paid value, order
  history, notes, tasks, tickets, and interaction timeline.
- Staff-owned segment, note, follow-up task, support ticket, message, and status
  use cases.
- SQL/code-owned reporting queries with explicit metric definitions, timezone,
  and payment-state inclusion rules.

**Checklist:**

- [ ] Define customer 360 visibility, data classification, note editing policy,
  segment rules, follow-up SLA, ticket state machine, and timeline event sources.
- [ ] Define every dashboard metric formula, time boundary, VND semantics, paid
  status inclusion, and empty-data behavior before UI implementation.
- [ ] Build customer list/search/filter/detail APIs and console views with
  pagination and role-specific personal-data access.
- [ ] Build notes, deterministic segments, follow-up tasks, and interaction
  timeline without marketing automation or lead scoring.
- [ ] Build support ticket create/assign/message/status/resolve flows linked to
  customer and optional order.
- [ ] Build reporting read models or indexed SQL queries for gross paid revenue,
  paid orders, average order value, conversion, payment status, SKU sales,
  inventory, customers, repeat customers, lifetime paid value, tickets, and
  overdue follow-ups.
- [ ] Build dashboard and operational pages with explicit loading, empty, error,
  stale-data, filter, and permission states.
- [ ] Audit restricted profile access and every CRM/support mutation.
- [ ] Add domain/API tests for ticket transitions, task SLA, segment membership,
  note ownership, timeline ordering, and authorization.
- [ ] Add metric fixture tests that calculate expected values independently from
  production query code.
- [ ] Add query-plan/performance checks for the seeded showcase data volume.
- [ ] Demonstrate a paid order appearing consistently in customer 360,
  interaction timeline, support context, and dashboard metrics.

**Exit gate:** Staff can operate customer follow-up and support from one
permission-aware console, and every displayed metric is reproducible from
documented PostgreSQL-backed rules without LLM calculation.

---

### Task 6: Phase 8 - Production Hardening and Hosting Readiness

**Purpose:** Make the complete commerce system secure, observable, recoverable,
accessible, performant, and deployable from the same artifacts used locally.

**Focused planning files:** Create a dated design and plan under
`docs/superpowers/specs/` and `docs/superpowers/plans/` using the topic slug
`commerce-hardening-hosting` at Phase 8 kickoff.

**Primary implementation areas:**

- Modify: application Dockerfiles and `infra/docker/docker-compose.yml`
- Create: hosted deployment examples under `infra/deploy/` only for the hosting
  target approved by the focused design
- Create or modify: `.github/workflows/` CI and security workflows
- Create: `docs/deployment/production.md`
- Create: `docs/operations/backup-restore.md`
- Create: `docs/operations/observability.md`
- Create: `docs/security/authorization-matrix.md`
- Create: `docs/security/payment-threat-model.md`
- Modify: `SECURITY.md`, `.env.example`, `Makefile`, Docker docs,
  build-from-source docs, dependency docs, roadmap, and changelog

**Checklist:**

- [ ] Define the approved hosting target, TLS termination, DNS/origins, secret
  injection, persistent services, backup retention, restore objective,
  observability stack, and deployment rollback in the focused design.
- [ ] Build immutable multi-stage images as non-root users with minimal runtime
  contents and pinned base-image policy.
- [ ] Separate liveness and readiness, add graceful shutdown, and verify failed
  dependencies do not report ready.
- [ ] Enforce secure production cookies, CSRF strategy, CORS allowlists, CSP and
  security headers, request size limits, rate limits, and webhook isolation.
- [ ] Complete staff role/resource/action authorization and customer ownership
  matrices with deny-by-default tests.
- [ ] Run payment threat modeling and tests for replay, forged webhook,
  idempotency collision, amount tampering, secret leakage, and log redaction.
- [ ] Run PostgreSQL concurrency, migration rollback/forward, backup, restore,
  and point-in-time strategy tests appropriate to the selected hosting service.
- [ ] Add structured logs, correlation IDs, metrics, traces where justified,
  alert thresholds, and operator runbooks.
- [ ] Add accessibility checks and manual keyboard/screen-reader review for
  storefront checkout and critical console operations.
- [ ] Establish performance budgets for storefront load, API latency, database
  queries, image delivery, and dashboard reads; test with representative data.
- [ ] Add dependency, secret, license, container, and source scanning to CI with
  documented triage rules.
- [ ] Verify deterministic seed/reset and the complete acceptance demo from a
  clean checkout and from the hosted staging environment.
- [ ] Verify production SePay configuration changes only environment/secret
  values and endpoints, not source code.
- [ ] Document deploy, migrate, rollback, backup, restore, credential rotation,
  incident response, and local-to-hosted differences.

**Exit gate:** The same versioned application images pass CI, run locally and
in hosted staging, survive backup/restore and restart tests, expose actionable
health/observability, meet security/accessibility/performance gates, and execute
the full sandbox commerce demo deterministically.

---

### Task 7: Master Acceptance, Documentation, and Milestone Review

**Purpose:** Close the commerce roadmap only when the repository, running
system, and contributor experience tell the same verified story.

**Files:**

- Modify: `README.md`
- Modify: `docs/product/vision.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/architecture/mvp-phases.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`
- Create: `docs/demo/novacommerce-commerce-demo.md`
- Create: `docs/release/commerce-milestone-checklist.md`

**Checklist:**

- [ ] Run the 15-step master acceptance chain from the approved design using a
  clean local checkout and record commands and expected evidence.
- [ ] Run the same journey in hosted staging with SePay sandbox and record only
  redacted evidence.
- [ ] Verify `make help` exposes every supported contributor workflow and every
  target has a documented direct equivalent.
- [ ] Verify Docker documentation matches actual service names, images, ports,
  health checks, volumes, profiles, and data-loss behavior.
- [ ] Verify all public/admin/customer/webhook APIs have current documentation
  and no persistence entity is exposed by convenience.
- [ ] Verify no Company ID, shipping-provider, refund, return, electronic-
  invoice, workflow, Digital Employee, GraphRAG, or hidden multi-tenant behavior
  entered the commerce implementation.
- [ ] Run `pnpm check`, all PostgreSQL integration tests, deterministic provider
  tests, explicit SePay sandbox tests, end-to-end browser tests, security scans,
  accessibility checks, and performance gates.
- [ ] Perform a clean database backup/restore and confirm order, payment,
  inventory, customer, CRM, support, reporting, and audit consistency.
- [ ] Update all active product, architecture, build, dependency, security,
  operations, roadmap, and contributor documentation.
- [ ] Request final code review and resolve every blocking or high-severity
  finding.
- [ ] Merge the completed commerce milestone to `develop`.
- [ ] Decide separately whether the milestone is stable enough for a
  `develop`-to-`main` pull request and first functional release; do not create a
  release automatically.

**Exit gate:** A new contributor and a reviewer can independently build, run,
inspect, test, and demonstrate the complete NovaCommerce commerce platform from
the repository documentation, with no undocumented manual intervention.

---

## Master Progress Checklist

- [x] Phase 1: Repository Foundation
- [x] Phase 2: Company Operating Core
- [x] Phase 3: Commerce Product Foundation
- [x] Phase 4: Inventory and Product Publication
- [x] Phase 5: Storefront, Customer, and Cart
- [x] Phase 6: Checkout, Order, and SePay
- [x] Phase 7: Operational CRM, Support, and Dashboard — complete after focused
  API, PostgreSQL/MinIO/ClamAV, browser, lifecycle, full-source, Compose, and
  documentation exit evidence.
- [ ] Phase 8: Production Hardening and Hosting Readiness
- [ ] Master acceptance and milestone review

## Post-Commerce Boundary

After this plan is complete, Workflow/iPaaS, Digital Employees, skills, tools,
GraphRAG, company memory, and AI-assisted operations require a new master design
and roadmap. They are not parallel workstreams hidden inside this plan.
