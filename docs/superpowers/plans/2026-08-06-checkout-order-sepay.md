<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Checkout, Order, and SePay Implementation Plan

> **For agentic workers:** Execute this plan in order with focused tests observed
> failing before behavior is implemented. Update checkboxes with evidence. Do
> not mark Phase 6 complete from source inspection or browser redirects.

**Goal:** Convert an authenticated NovaCommerce cart into an immutable,
transactionally reserved order; initiate a server-signed SePay sandbox payment;
confirm payment exactly once through authenticated IPN or reconciliation; and
let authorized staff complete internal order processing.

**Architecture:** Add feature-first `promotion`, `checkout`, `order`, and
`payment` modules to the Express modular monolith. PostgreSQL is authoritative
for all commerce state. Checkout coordinates public application ports and one
shared database transaction without importing another module's infrastructure.
Payment owns a provider-neutral gateway port and a SePay infrastructure adapter.
Storefront and Console consume validated DTOs through feature-owned API layers.

**Tech Stack:** Node.js 22+, strict TypeScript, Express 5, React 19, Vite,
React Router, Zod, PostgreSQL 18, `pg`, `node-pg-migrate`, Node `crypto`,
Vitest, Supertest, Testing Library, Keycloak, Docker Compose, pnpm 11, and the
external SePay Payment Gateway sandbox.

## Global Constraints

- Work on `feat/checkout-order-sepay`, based on `develop`; do not edit `main`.
- Keep NovaCommerce single-company, B2C, single-store, one inventory location,
  physical-goods, authenticated checkout, and VND-only. No new table or route
  contains Company ID.
- Do not add shipping, refund, return, exchange, provider void, carrier,
  tracking, electronic-invoice, cash-on-delivery, marketplace, or multi-
  warehouse behavior.
- PostgreSQL is the only runtime relational source of truth. Runtime behavior
  never switches to an in-memory repository or fake provider by environment.
- Deterministic tests may inject fakes through inward-facing ports. SePay
  sandbox tests are opt-in and credential-owned by the contributor.
- Browser redirects and query parameters never set payment or order state.
- Use integer VND values and backend calculations. Do not calculate trusted
  money with JavaScript floating point or an LLM.
- Store immutable checkout/order snapshots. Never rebuild a historical order
  from current Catalog, Customer, address, Promotion, or Inventory records.
- Create pending order state and reserve stock in one PostgreSQL transaction.
- Apply paid state and consume stock in one PostgreSQL transaction.
- Verify IPN authentication before parsing business fields. Use constant-time
  secret comparison and strict request/body limits.
- Treat duplicate, delayed, and out-of-order provider events idempotently.
- Treat timeouts as unknown/pending, not failed. Record mismatches for Finance
  review and do not force a paid transition.
- Never log or persist merchant secrets, Basic Auth, signatures, raw cookies,
  full addresses, Google tokens, or unmasked card data.
- Keep imports inward. Cross-module use goes through public `index.ts` exports.
- Add directories only with their first approved source or test file. Do not add
  a DI framework, queue, scheduler library, or SePay SDK without a separately
  documented dependency need.
- Update `CHANGELOG.md` under `[Unreleased]` with each implementation unit.
- Keep Storefront light/dark support and Console's dark operational canvas.

## Stable Phase Contracts

### Durations and identifiers

| Contract | Value | Enforcement |
| --- | --- | --- |
| Checkout/payment window | 900 seconds | Same fixed TTL as Inventory reservation |
| Currency | `VND` | Internal and provider amount match |
| Order number | `NVC-YYYYMMDD-XXXXXXXX` | Server-generated, unique |
| Provider invoice | `NVC-PAY-<UUID without dashes>` | Unique per payment attempt |
| Checkout idempotency | `Idempotency-Key` header | Customer + canonical request hash |
| Staff transition idempotency | `Idempotency-Key` header | Order + target state + actor |
| IPN deduplication | provider/transaction/invoice/payload hash | Database uniqueness |

### Migration order

```text
Catalog -> Company Core -> Inventory -> Customer -> Cart
-> Promotion -> Checkout -> Order -> Payment

Payment rollback -> Order -> Checkout -> Promotion -> Cart -> Customer
-> Inventory -> Company Core -> Catalog
```

Foreign-key cycles are prohibited. Checkout may reference its resulting order
with a nullable post-create link, while Order owns the required checkout ID.

### Route families

```text
POST /v1/storefront/checkouts
GET  /v1/storefront/checkouts/:checkoutId
POST /v1/storefront/checkouts/:checkoutId/payment-initiation
GET  /v1/storefront/orders
GET  /v1/storefront/orders/:orderId

POST /v1/webhooks/sepay

GET   /v1/admin/promotions
POST  /v1/admin/promotions
PATCH /v1/admin/promotions/:promotionId
GET   /v1/admin/orders
GET   /v1/admin/orders/:orderId
POST  /v1/admin/orders/:orderId/transitions
GET   /v1/admin/payments
GET   /v1/admin/payments/:paymentId
POST  /v1/admin/payments/:paymentId/reconciliations
```

## Implementation Checklist

### Task 1: Phase Contracts, Environment, and Staff Roles

**Files:**

- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `apps/api/src/shared/auth/staff-principal.ts`
- Modify: `apps/api/src/shared/auth/staff-auth.middleware.ts`
- Modify: `apps/api/src/shared/auth/staff-auth.middleware.test.ts`
- Modify: `apps/console/src/features/authentication/api/oidc-manager.ts`
- Modify: `apps/console/src/features/authentication/tests/authentication.test.tsx`
- Modify: `infra/keycloak/realm-export.json`
- Modify: `.env.example`
- Modify: `CHANGELOG.md`

- [ ] Write failing environment tests for SePay environment, checkout/API base
  URLs, merchant ID, secret key, IPN secret, callback URLs, timeout, and fixed
  900-second checkout TTL.
- [ ] Reject production with sandbox endpoints, missing secrets, non-HTTPS
  callbacks, or an HTTP Storefront origin.
- [ ] Permit development startup without contributor credentials, but expose an
  explicit `PAYMENT_PROVIDER_NOT_CONFIGURED` checkout error.
- [ ] Add `operations_manager` and `finance_operator` to backend/frontend role
  parsing and local Keycloak fixtures. Keep audience isolation unchanged.
- [ ] Add role tests proving unknown roles are discarded and role visibility
  never replaces backend authorization.
- [ ] Add no dependency. Use Node `crypto` and the existing HTTP/runtime stack.
- [ ] Run API environment/auth and Console authentication tests.
- [ ] Commit as `feat(identity): add commerce operations roles`.

### Task 2: PostgreSQL Schemas and Migration Lifecycle

**Files:**

- Create: `apps/api/src/modules/promotion/infrastructure/database/migrations/202608060007_create_promotion.ts`
- Create: `apps/api/src/modules/promotion/infrastructure/database/run-promotion-migrations.ts`
- Create: `apps/api/src/modules/checkout/infrastructure/database/migrations/202608060008_create_checkout.ts`
- Create: `apps/api/src/modules/checkout/infrastructure/database/run-checkout-migrations.ts`
- Create: `apps/api/src/modules/order/infrastructure/database/migrations/202608060009_create_order.ts`
- Create: `apps/api/src/modules/order/infrastructure/database/run-order-migrations.ts`
- Create: `apps/api/src/modules/payment/infrastructure/database/migrations/202608060010_create_payment.ts`
- Create: `apps/api/src/modules/payment/infrastructure/database/run-payment-migrations.ts`
- Create: corresponding migration integration tests beside each runner
- Modify: `apps/api/src/shared/database/run-migrations.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/package.json`
- Modify: `Makefile`
- Modify: `CHANGELOG.md`

- [ ] Write failing migration tests for every table, enum/check constraint,
  foreign key, unique idempotency key, provider-event deduplication key, money
  constraint, and absence of `company_id`.
- [ ] Add Promotion, Checkout, Order, and Payment schemas exactly in dependency
  order and rollback in reverse order.
- [ ] Use integer/bigint-compatible VND columns and reject negative snapshots.
- [ ] Ensure immutable snapshot rows cannot be silently overwritten by normal
  repository update paths; only state/version fields are mutable.
- [ ] Extend readiness to verify all Phase 6 migration tables without contacting
  SePay.
- [ ] Prove migrate -> rollback -> migrate and backup/restore preserve data.
- [ ] Run focused migration tests and Docker Compose configuration validation.
- [ ] Commit as `feat(commerce): add checkout order payment schemas`.

### Task 3: Promotion Domain and Application Service

**Files:**

- Create: `apps/api/src/modules/promotion/domain/entities/promotion.ts`
- Create: `apps/api/src/modules/promotion/domain/entities/promotion-redemption.ts`
- Create: `apps/api/src/modules/promotion/domain/services/promotion-rules.ts`
- Create: `apps/api/src/modules/promotion/domain/services/promotion-rules.test.ts`
- Create: `apps/api/src/modules/promotion/domain/exceptions/promotion-domain.error.ts`
- Create: `apps/api/src/modules/promotion/application/dtos/promotion.dto.ts`
- Create: `apps/api/src/modules/promotion/application/repositories/interfaces/promotion.repository.ts`
- Create: `apps/api/src/modules/promotion/application/services/interfaces/promotion.service.ts`
- Create: `apps/api/src/modules/promotion/application/services/interfaces/promotion-checkout-port.ts`
- Create: `apps/api/src/modules/promotion/application/services/implementations/promotion.service.ts`
- Create: `apps/api/src/modules/promotion/application/services/implementations/promotion.service.test.ts`
- Create: `apps/api/src/modules/promotion/infrastructure/repositories/implementations/postgresql-promotion.repository.ts`
- Create: corresponding repository integration test
- Create: `apps/api/src/modules/promotion/presentation/` validator, controller,
  routes, and error middleware files as first used
- Create: `apps/api/src/modules/promotion/promotion.module.ts`
- Create: `apps/api/src/modules/promotion/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `CHANGELOG.md`

- [ ] First test percentage basis-point rounding, fixed discounts, cap, minimum
  subtotal, time windows, zero-total rejection, code normalization, and no
  stacking.
- [ ] Test total/per-customer limits under concurrent holds and idempotent hold,
  commit, release, and expiry.
- [ ] Implement a session-aware Checkout port so Promotion participates in the
  outer transaction without exposing its repository.
- [ ] Add administrator-only list/create/update APIs with version conflicts and
  audited writes.
- [ ] Add deterministic `NOVA10` seed behavior later through the module's public
  seed entry point; do not hard-code it in application logic.
- [ ] Run domain, service, repository, and API tests.
- [ ] Commit as `feat(promotion): add deterministic promotion rules`.

### Task 4: Transaction-Participating Customer, Cart, Catalog, and Inventory Ports

**Files:**

- Modify: `apps/api/src/modules/customer/index.ts`
- Modify: Customer application/repository contracts and PostgreSQL adapter as
  required for an owned-address snapshot read in a supplied session
- Modify: `apps/api/src/modules/cart/application/services/interfaces/checkout-ready-cart-reader.ts`
- Modify: Cart service/repository implementation and tests
- Modify: `apps/api/src/modules/cart/index.ts`
- Modify: `apps/api/src/modules/catalog/application/services/interfaces/storefront-variant-reader.ts`
- Modify: Catalog reader implementation/tests and `index.ts`
- Modify: `apps/api/src/modules/inventory/application/services/interfaces/inventory-reservations.ts`
- Modify: Inventory reservation service/repository tests and `index.ts`
- Modify: `CHANGELOG.md`

- [ ] Write failing contract tests proving each port can re-read/lock its facts
  inside one caller-supplied `DatabaseSession`.
- [ ] Keep current Phase 5 public methods behavior-compatible while adding only
  the narrow Phase 6 session-aware operations.
- [ ] Add Customer owned-address snapshot, Cart checkout-ready snapshot, Catalog
  current variant snapshot, and Inventory reserve/consume/release operations.
- [ ] Ensure Inventory still owns all stock SQL, movement, and audit writes.
- [ ] Prove reserve rollback leaves no balance, movement, reservation, or audit
  residue when a later order/payment write fails.
- [ ] Prove consume rollback similarly leaves all paid effects unchanged.
- [ ] Run Cart, Customer, Catalog, Inventory, transaction, and integration tests.
- [ ] Commit as `refactor(commerce): expose atomic checkout ports`.

### Task 5: Order Domain, Snapshots, and Staff Transitions

**Files:**

- Create: `apps/api/src/modules/order/domain/entities/order.ts`
- Create: `apps/api/src/modules/order/domain/entities/order-line.ts`
- Create: `apps/api/src/modules/order/domain/entities/order-status-history.ts`
- Create: `apps/api/src/modules/order/domain/services/order-rules.ts`
- Create: `apps/api/src/modules/order/domain/services/order-rules.test.ts`
- Create: `apps/api/src/modules/order/domain/exceptions/order-domain.error.ts`
- Create: `apps/api/src/modules/order/application/dtos/order.dto.ts`
- Create: `apps/api/src/modules/order/application/mappers/order.mapper.ts`
- Create: `apps/api/src/modules/order/application/repositories/interfaces/order.repository.ts`
- Create: `apps/api/src/modules/order/application/services/interfaces/order.service.ts`
- Create: `apps/api/src/modules/order/application/services/interfaces/order-checkout-port.ts`
- Create: `apps/api/src/modules/order/application/services/implementations/order.service.ts`
- Create: focused service tests
- Create: `apps/api/src/modules/order/infrastructure/repositories/implementations/postgresql-order.repository.ts`
- Create: repository integration tests
- Create: `apps/api/src/modules/order/presentation/` validators, controllers,
  customer/admin routes, and error middleware
- Create: `apps/api/src/modules/order/order.module.ts`
- Create: `apps/api/src/modules/order/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `CHANGELOG.md`

- [ ] Test the exact order transition allow-list and reject paid cancellation,
  skipping states, stale versions, duplicate commands, and unauthorized actors.
- [ ] Test immutable line/address/contact/price/promotion snapshots and public
  number uniqueness.
- [ ] Implement customer-owned list/detail queries that always constrain by the
  authenticated customer ID.
- [ ] Implement administrator/operations-manager list/detail/transition routes
  with filters, pagination, history, audited success, and audited denial.
- [ ] Return purpose-specific DTOs; do not expose database rows or customer IDs
  unnecessarily.
- [ ] Run Order domain, repository, service, API, ownership, and role tests.
- [ ] Commit as `feat(order): add immutable order operations`.

### Task 6: Provider-Neutral Payment Core and SePay Signing Adapter

**Files:**

- Create: `apps/api/src/modules/payment/domain/entities/payment.ts`
- Create: `apps/api/src/modules/payment/domain/entities/payment-attempt.ts`
- Create: `apps/api/src/modules/payment/domain/entities/payment-event.ts`
- Create: `apps/api/src/modules/payment/domain/entities/payment-reconciliation.ts`
- Create: `apps/api/src/modules/payment/domain/services/payment-rules.ts`
- Create: `apps/api/src/modules/payment/domain/services/payment-rules.test.ts`
- Create: `apps/api/src/modules/payment/domain/exceptions/payment-domain.error.ts`
- Create: `apps/api/src/modules/payment/application/providers/payment-gateway.ts`
- Create: `apps/api/src/modules/payment/application/dtos/payment.dto.ts`
- Create: `apps/api/src/modules/payment/application/repositories/interfaces/payment.repository.ts`
- Create: `apps/api/src/modules/payment/application/services/interfaces/payment.service.ts`
- Create: `apps/api/src/modules/payment/application/services/implementations/payment.service.ts`
- Create: service tests with a deterministic fake gateway
- Create: `apps/api/src/modules/payment/infrastructure/providers/sepay/sepay-payment-gateway.ts`
- Create: `apps/api/src/modules/payment/infrastructure/providers/sepay/sepay-signature.ts`
- Create: synthetic official-contract fixtures and adapter tests
- Create: PostgreSQL payment repository and integration tests
- Create: `apps/api/src/modules/payment/payment.module.ts`
- Create: `apps/api/src/modules/payment/index.ts`
- Modify: `CHANGELOG.md`

- [ ] Test payment/attempt state machines and invoice uniqueness before writing
  infrastructure code.
- [ ] Define provider-neutral ordered checkout fields, order-detail result,
  normalized notification, and provider error categories.
- [ ] Implement the documented SePay field order and Base64 HMAC-SHA256 with
  Node `crypto`; compare against fixed synthetic vectors.
- [ ] Implement sandbox/production endpoint selection and Basic Auth order-detail
  lookup with timeout/abort and no secret-bearing errors.
- [ ] Return only action URL plus ordered form fields. Never expose the secret.
- [ ] Redact Authorization, signature, full card fields, address, and provider
  raw values in logs and persisted event projections.
- [ ] Run domain, fake-provider service, signing, mapping, timeout, redaction,
  repository, and environment tests.
- [ ] Commit as `feat(payment): add sepay gateway boundary`.

### Task 7: Atomic Checkout Orchestration

**Files:**

- Create: `apps/api/src/modules/checkout/domain/entities/checkout-session.ts`
- Create: `apps/api/src/modules/checkout/domain/entities/checkout-line.ts`
- Create: `apps/api/src/modules/checkout/domain/services/checkout-rules.ts`
- Create: `apps/api/src/modules/checkout/domain/services/checkout-rules.test.ts`
- Create: `apps/api/src/modules/checkout/application/dtos/checkout.dto.ts`
- Create: `apps/api/src/modules/checkout/application/mappers/checkout.mapper.ts`
- Create: `apps/api/src/modules/checkout/application/repositories/interfaces/checkout.repository.ts`
- Create: `apps/api/src/modules/checkout/application/services/interfaces/checkout.service.ts`
- Create: `apps/api/src/modules/checkout/application/services/implementations/checkout.service.ts`
- Create: focused service tests
- Create: `apps/api/src/modules/checkout/infrastructure/repositories/implementations/postgresql-checkout.repository.ts`
- Create: repository and transaction integration tests
- Create: `apps/api/src/modules/checkout/presentation/` validator, controller,
  routes, and error middleware
- Create: `apps/api/src/modules/checkout/checkout.module.ts`
- Create: `apps/api/src/modules/checkout/index.ts`
- Modify: module composition in `apps/api/src/app.ts` and `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

- [ ] Write failing tests for missing/stale address, non-checkout-ready cart,
  unpublished/inactive variant, changed price, unavailable stock, invalid
  promotion, total overflow, expired session, and provider not configured.
- [ ] Test idempotent replay returns the same checkout/order/attempt and changed
  input under the same key returns `IDEMPOTENCY_CONFLICT`.
- [ ] In one transaction, lock/re-read facts; calculate totals; create checkout,
  immutable lines, order, order lines, payment, attempt, promotion hold, audit;
  and reserve Inventory.
- [ ] Generate signed SePay fields only after commit. Provider/signing failure
  leaves a recoverable pending order and the same idempotent payment attempt.
- [ ] Implement safe payment-initiation replay for an unexpired pending attempt.
- [ ] Add customer session, ownership, origin, CSRF, body-limit, and rate-limit
  coverage around checkout mutations.
- [ ] Run domain/service/repository/API tests and scarce-stock concurrency tests.
- [ ] Commit as `feat(checkout): create transactionally reserved orders`.

### Task 8: Authenticated IPN and Exact-Once Paid Transition

**Files:**

- Create: `apps/api/src/modules/payment/presentation/validators/sepay-ipn.validator.ts`
- Create: `apps/api/src/modules/payment/presentation/middleware/sepay-ipn-auth.middleware.ts`
- Create: `apps/api/src/modules/payment/presentation/controllers/sepay-ipn.controller.ts`
- Create: `apps/api/src/modules/payment/presentation/routes/sepay-ipn.routes.ts`
- Create: middleware/controller/service/API tests
- Modify: Payment repository/service interfaces and implementations
- Modify: Order, Promotion, Cart, and Inventory session-aware public ports as
  needed by the paid transaction
- Modify: `apps/api/src/app.ts`
- Modify: `CHANGELOG.md`

- [ ] First test missing/wrong secret, constant-time verification path, malformed
  authenticated payload, unsupported notification, duplicate payload, duplicate
  transaction, out-of-order event, amount/currency/invoice/order mismatch, and
  database failure acknowledgement behavior.
- [ ] Authenticate before business schema parsing and before any repository read.
- [ ] Persist an allow-listed redacted event and deduplication identity.
- [ ] For matching `ORDER_PAID` evidence, transactionally mark attempt/payment/
  order paid, consume reservation, commit promotion, finalize checkout/cart, and
  append one history/audit effect.
- [ ] Acknowledge valid duplicate and unsupported-recorded events with HTTP 200.
- [ ] Return HTTP 500 only when durable event processing did not commit.
- [ ] Prove 20 concurrent duplicate IPNs converge to one paid transition, one
  consume movement per line, one redemption commit, and one state-change audit.
- [ ] Commit as `feat(payment): process sepay ipn exactly once`.

### Task 9: Expiry and Reconciliation

**Files:**

- Create: `apps/api/src/modules/checkout/infrastructure/workers/checkout-expiry.worker.ts`
- Create: worker tests
- Create: `apps/api/src/modules/payment/application/services/interfaces/payment-reconciliation.service.ts`
- Create: `apps/api/src/modules/payment/application/services/implementations/payment-reconciliation.service.ts`
- Create: service tests
- Create: `apps/api/src/modules/payment/infrastructure/workers/payment-reconciliation.worker.ts`
- Create: worker tests
- Create: Payment admin validators/controllers/routes and API tests
- Modify: `apps/api/src/server.ts`
- Modify: `CHANGELOG.md`

- [ ] Test unpaid expiry releases/observes expired Inventory, releases promotion,
  expires payment/order/checkout, and remains idempotent if Inventory expiry won
  the race.
- [ ] Test reconciliation exact match, still pending, timeout, provider 4xx/5xx,
  amount/currency/invoice mismatch, unsupported state, already paid, and
  concurrent IPN/reconciliation.
- [ ] Persist every reconciliation comparison with redacted provider evidence.
- [ ] Call the same exact-once paid transition used by IPN; do not duplicate paid
  logic in the worker or controller.
- [ ] Bound batches and external retries. Never hold a database transaction open
  during the provider HTTP request.
- [ ] Add administrator/finance-operator payment list/detail/reconcile APIs with
  backend authorization and audit.
- [ ] Run expiry, reconciliation, race, role, and API tests.
- [ ] Commit as `feat(payment): reconcile pending sepay payments`.

### Task 10: Storefront Checkout, Payment, and Orders

**Files:**

- Create: `apps/storefront/src/features/checkout/api/checkout-api.ts`
- Create: `apps/storefront/src/features/checkout/schemas/checkout.schema.ts`
- Create: `apps/storefront/src/features/checkout/types/checkout.types.ts`
- Create: `apps/storefront/src/features/checkout/mappers/checkout.mapper.ts`
- Create: Checkout hooks, components, page, and tests as first used
- Create: `apps/storefront/src/features/payment/` API/schema/types/form-submit,
  result page, polling hook, and tests
- Create: `apps/storefront/src/features/order/` API/schema/types/mapper, list,
  detail, status timeline, and tests
- Modify: `apps/storefront/src/app/app-router.tsx`
- Modify: `apps/storefront/src/app/storefront-shell.tsx`
- Modify: `apps/storefront/src/features/cart/pages/cart-page.tsx`
- Modify: `apps/storefront/src/shared/styles/globals.css`
- Modify: `scripts/dev/storefront-browser-check.mjs`
- Modify: `CHANGELOG.md`

- [ ] Write failing user-visible tests for address selection, promotion apply/
  reject, immutable review, changed-cart conflict, stock conflict, submit lock,
  payment form field order, and provider-not-configured state.
- [ ] Submit the backend-provided ordered fields to the backend-provided SePay
  action URL without recalculating, sorting, or editing them.
- [ ] Implement success/error/cancel return pages as navigation outcomes only;
  poll backend payment/order state with bounded backoff and show pending until
  authoritative confirmation.
- [ ] Add customer order list/detail with immutable lines, total, payment state,
  and internal processing timeline. Do not display shipping promises.
- [ ] Preserve loading, empty, recoverable error, expired, conflict, paid, and
  terminal states plus keyboard focus and semantic structure.
- [ ] Verify light/dark themes and no overflow at 390x844, 768x1024, and
  1440x900 with real seeded products.
- [ ] Run Storefront tests, typecheck, production build, and browser acceptance.
- [ ] Commit as `feat(storefront): add checkout and order journey`.

### Task 11: Console Order and Payment Operations

**Files:**

- Create: `apps/console/src/features/orders/` API, schema, types, mapper, hooks,
  list/detail/history components, page, and tests
- Create: `apps/console/src/features/payments/` API, schema, types, mapper, hooks,
  list/detail/events/reconciliation components, page, and tests
- Modify: `apps/console/src/app/app-router.tsx`
- Modify: `apps/console/src/app/console-shell.tsx`
- Modify: `apps/console/src/shared/styles/globals.css`
- Create or modify: Console browser acceptance script
- Modify: `CHANGELOG.md`

- [ ] Test role-aware routes for administrator, operations manager, finance
  operator, catalog manager, inventory manager, and unauthorized staff.
- [ ] Build a dense order table/detail/status-history workspace with only the
  next legal authorized transition.
- [ ] Build payment/event/reconciliation views emphasizing pending, mismatch,
  review-required, and paid evidence.
- [ ] Do not render refund, void, return, shipping, label, or tracking actions.
- [ ] Add explicit loading, empty, error, denied, stale-version, retry, and
  success states.
- [ ] Verify responsive desktop/mobile layouts, stable table controls, keyboard
  focus, no overlap, and no horizontal document overflow.
- [ ] Run Console tests, typecheck, production build, and browser acceptance.
- [ ] Commit as `feat(console): add order and payment operations`.

### Task 12: Seeds, Docker, Make, and Documentation

**Files:**

- Create: Promotion deterministic seed and integration test
- Create: optional Order/Payment operational fixture seed and tests only if the
  Console acceptance requires it
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/docker/README.md`
- Modify: `.env.example`
- Modify: `Makefile`
- Modify: `apps/api/src/server.ts`
- Create: `docs/integrations/sepay.md`
- Create: `docs/api/checkout.md`
- Create: `docs/api/order.md`
- Create: `docs/api/payment.md`
- Create: `docs/api/promotion.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/development/database-operations.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/product/vision.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] Add migration/seed dependencies and worker lifecycle to full-container
  startup without adding a SePay container.
- [ ] Keep API readiness local and deterministic; it must not fail because the
  external sandbox is unavailable.
- [ ] Keep the contributor Make surface focused on `up`, `down`, `db-migrate`,
  `db-rollback`, `db-backup`, `db-restore`, and validation commands already in
  use. Do not hide payment business logic in Make.
- [ ] Seed a deterministic inactive/active promotion set and document fixture
  truth. Never seed merchant credentials or fake provider confirmation claims.
- [ ] Document sandbox registration, environment variables, public HTTPS tunnel,
  IPN configuration, credential rotation, redaction, local callback limits,
  reconciliation, and production switch deferred to Phase 8.
- [ ] Document every route, DTO, state machine, authorization rule, idempotency
  contract, migration order, rollback, backup/restore, and troubleshooting path.
- [ ] Record that existing dependencies are reused; update dependency docs only
  if implementation proves a new reviewed package necessary.
- [ ] Run Docker Compose config, clean migration/seed, repeated seed, rollback/
  reapply, custom backup/restore, and full-container health acceptance.
- [ ] Commit as `docs(commerce): document checkout and sepay operations`.

### Task 13: Exit Acceptance, Review, and Phase Closure

**Files:**

- Create: deterministic checkout-to-paid acceptance script under `scripts/dev/`
- Create: opt-in SePay sandbox acceptance script/config with no credentials in
  source
- Modify: `package.json` and/or `Makefile` only to expose clear validation entry
  points
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `CHANGELOG.md`

- [ ] Run all domain, application, repository, API, Storefront, Console, Python,
  audit, build, and Compose checks through `make check`.
- [ ] Run 20-way scarce-stock checkout concurrency and prove successful orders
  never exceed available stock.
- [ ] Replay valid IPN concurrently and prove one order/payment transition, one
  reservation consumption, one promotion commit, and one audit effect.
- [ ] Race IPN, reconciliation, and expiry; prove one valid terminal outcome and
  no partial stock/money/order state.
- [ ] Prove invalid auth, malformed body, amount/currency/invoice mismatch,
  customer ownership violation, and unauthorized staff action fail closed.
- [ ] Run browser acceptance for Storefront checkout/order and Console order/
  payment workflows at desktop, tablet, and mobile in required themes.
- [ ] Run opt-in real SePay sandbox checkout/IPN/reconciliation using contributor
  credentials and public HTTPS callback. Record redacted evidence only.
- [ ] Verify `make db-backup`/`make db-restore` across a paid-order probe and
  migration rollback/reapply on a disposable database.
- [ ] Run `git diff --check`, `pnpm audit:repo`, secret scan, and dependency/
  license review.
- [ ] Request independent review focused on financial correctness, idempotency,
  concurrency, authorization, secret handling, and unsupported-scope leakage.
- [ ] Fix Critical/Important findings with regression tests and rerun all gates.
- [ ] Mark Phase 6 complete only after real sandbox evidence and review are
  recorded; otherwise retain an explicit external-acceptance status.
- [ ] Commit as `test(commerce): validate checkout to paid order`.

## Exit Gate

An authenticated customer cart must create one immutable pending order and one
active reservation atomically, start only a server-signed SePay sandbox
checkout, remain pending after redirect, become paid only from trusted backend
evidence, consume stock exactly once, and be processable by authorized staff to
completion. Duplicate/reordered provider evidence, concurrent checkout,
reconciliation, and expiry must converge without partial state. No shipping,
refund, return, exchange, void, tracking, or electronic-invoice behavior may be
present.

