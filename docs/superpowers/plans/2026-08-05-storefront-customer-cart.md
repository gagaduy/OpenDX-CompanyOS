<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront, Customer, and Cart Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with tests written and
> observed failing before implementation. Update each checkbox as evidence is
> produced; do not mark the phase complete from source inspection alone.

**Goal:** Deliver Phase 5 as a real NovaCommerce customer journey: anonymous
technology-product discovery, a persistent seven-day guest cart, Google-backed
customer registration/login, a 30-day Commerce session, owned addresses,
explicit cart resolution, and a checkout-ready summary without creating an
order or payment.

**Architecture:** Add a separate React + TypeScript + Vite storefront and two
feature-first Express modules, `customer` and `cart`. PostgreSQL owns customer,
session, address, cart, and cart-resolution truth. Customer identity is isolated
from staff Keycloak. Cart consumes only exported Catalog and Inventory
application ports and recalculates all price and availability projections on the
backend.

**Tech Stack:** Node.js 22+, TypeScript strict mode, Express 5, React 19, Vite,
React Router, Zod, PostgreSQL 18, `pg`, `node-pg-migrate`, `jose`, reviewed
cookie parsing and Express rate-limiting packages, Vitest, Testing Library,
Supertest, Docker Compose, and pnpm 11.

## Global Constraints

- Work on `feat/storefront-customer-cart`, based on `develop`; do not edit
  `main` directly.
- Keep NovaCommerce single-company, B2C, single-store, one inventory location,
  physical-goods, and VND-only. No Phase 5 table or route contains Company ID.
- Keep anonymous checkout, order creation, promotion evaluation, inventory
  checkout reservation, SePay, shipping providers, refunds, returns, and
  electronic invoices outside this phase.
- PostgreSQL is the sole runtime relational source of truth. Test fakes enter
  through real inward-facing ports and are never selected by runtime flags.
- Staff Keycloak bearer tokens and Commerce customer cookies are separate
  identity audiences. Neither middleware accepts the other's credential.
- Store only hashes of opaque guest/customer session tokens. Never log raw
  session tokens, Google credentials, provider subjects, or address payloads.
- Use Google `sub` as external identity. A matching email never authorizes an
  account merge.
- Use a maintained verifier (`jose` with Google's remote JWKS) and validate
  issuer, exact audience, expiry, subject, email, and `email_verified`; do not
  implement JWT cryptography or key rotation manually.
- Fix guest expiry at seven days and customer-session absolute expiry at 30
  days. Rotation cannot extend the original absolute expiry.
- Protect mutations with allowed-origin checks, `SameSite=Lax` cookies, a CSRF
  cookie/header pair, bounded schemas, and selected auth rate limits.
- Cart ownership is always constrained by guest or customer identity in
  application and repository operations. A cart UUID alone grants nothing.
- Cart quantities, publication, active variant, current price, availability,
  line subtotals, and total are backend-authoritative on every mutation.
- Never silently remove stale lines or silently choose between non-empty guest
  and customer carts. Preserve superseded cart history.
- Keep imports inward and cross-module imports on public `index.ts` contracts.
- Add directories only with their first source or test file. Avoid ceremonial
  pass-through layers and a DI framework.
- Use the approved dark product canvas, but make storefront product imagery,
  price, availability, and purchase actions the first-viewport signals.
- Update `CHANGELOG.md` under `[Unreleased]` with each repository-changing unit.
- Do not begin Phase 6 until every Phase 5 exit item has fresh acceptance
  evidence and independent review.

## Stable Phase Contracts

### Cookies and headers

| Contract | Development default | Rule |
| --- | --- | --- |
| Guest cookie | `opendx_guest` | `HttpOnly`, `SameSite=Lax`, path `/v1/storefront`, seven-day absolute max age |
| Customer cookie | `opendx_customer` | `HttpOnly`, `SameSite=Lax`, path `/v1/storefront`, 30-day absolute max age |
| CSRF cookie | `opendx_csrf` | Browser-readable, `SameSite=Lax`, same path and secure policy |
| CSRF header | `x-csrf-token` | Must match the CSRF cookie on mutation routes |
| Production cookies | same names | Add `Secure`; reject non-HTTPS production configuration |

The API additionally validates `Origin` against the configured storefront
origin. Catalog GET routes remain anonymous and do not create guest state.

### Route families

```text
GET    /v1/storefront/categories
GET    /v1/storefront/products
GET    /v1/storefront/products/:productSlug

POST   /v1/storefront/guest-sessions
POST   /v1/storefront/auth/google
GET    /v1/storefront/session
POST   /v1/storefront/logout

GET    /v1/storefront/account
PATCH  /v1/storefront/account
GET    /v1/storefront/account/addresses
POST   /v1/storefront/account/addresses
PATCH  /v1/storefront/account/addresses/:addressId
DELETE /v1/storefront/account/addresses/:addressId
POST   /v1/storefront/account/addresses/:addressId/default

GET    /v1/storefront/cart
POST   /v1/storefront/cart/items
PATCH  /v1/storefront/cart/items/:cartItemId
DELETE /v1/storefront/cart/items/:cartItemId
GET    /v1/storefront/cart/resolution
POST   /v1/storefront/cart/resolution
POST   /v1/storefront/cart/checkout-readiness
```

### Migration and seed order

```text
Catalog -> Company Core -> Inventory -> Customer -> Cart
Company Core -> Catalog -> Inventory -> Customer -> Cart fixtures
Cart rollback -> Customer rollback -> Inventory -> Company Core -> Catalog
```

## File Map

### Customer backend

- `apps/api/src/modules/customer/domain/`: customer, verified identity, session,
  guest session, address entities and pure expiry/default-address rules.
- `apps/api/src/modules/customer/application/identity/google-identity-verifier.ts`:
  framework-neutral verified-identity port.
- `apps/api/src/modules/customer/application/security/session-token-service.ts`:
  opaque token generation/hash contract.
- `apps/api/src/modules/customer/application/repositories/interfaces/`:
  customer/session/address/audit persistence contracts.
- `apps/api/src/modules/customer/application/services/`: authentication,
  session, profile, and address use cases plus purpose-specific DTOs/mappers.
- `apps/api/src/modules/customer/infrastructure/database/`: Customer migration
  and migration runner using `customer_migrations`.
- `apps/api/src/modules/customer/infrastructure/identity/`:
  `jose` Google verifier adapter.
- `apps/api/src/modules/customer/infrastructure/repositories/implementations/`:
  PostgreSQL adapters.
- `apps/api/src/modules/customer/presentation/`: cookie/session middleware,
  origin/CSRF/rate-limit boundaries, validators, controllers, and routes.
- `apps/api/src/modules/customer/customer.module.ts` and `index.ts`: composition
  root and intentional public session/principal exports.

### Cart backend and owner contracts

- `apps/api/src/modules/cart/domain/`: cart, line, ownership, resolution, and
  recalculation rules.
- `apps/api/src/modules/cart/application/`: Cart DTOs, repository contract,
  Catalog/Inventory reader inputs, service interfaces and implementations.
- `apps/api/src/modules/cart/infrastructure/database/`: Cart migration and
  migration runner using `cart_migrations`.
- `apps/api/src/modules/cart/infrastructure/repositories/implementations/`:
  PostgreSQL cart and resolution-idempotency adapter.
- `apps/api/src/modules/cart/presentation/`: validators, controller, routes.
- `apps/api/src/modules/cart/cart.module.ts` and `index.ts`: composition root
  and Phase 6 checkout-readiness port.
- `apps/api/src/modules/catalog/application/services/interfaces/storefront-variant-reader.ts`:
  exported published variant/product/price/media projection for Cart.
- Existing Inventory `InventoryAvailabilityReader` remains Cart's only stock
  read dependency.

### Storefront

- `apps/storefront/src/app/`: environment, router, application composition,
  error boundary, and storefront shell.
- `apps/storefront/src/features/catalog/`: discovery API/schema/mapper, product
  cards, filter surface, home/category/search/detail pages, hooks and tests.
- `apps/storefront/src/features/cart/`: cart API/schema/mapper, provider/hooks,
  line/resolution UI, cart page, checkout intent, and tests.
- `apps/storefront/src/features/authentication/`: Google Identity script
  adapter, session API/schema, sign-in page/provider, and tests.
- `apps/storefront/src/features/customer-account/`: profile/address API,
  forms/pages, ownership/error states, and tests.
- `apps/storefront/src/shared/`: only proven shared HTTP, formatting, layout,
  and style primitives.
- `apps/storefront/Dockerfile`: pinned non-root full-container development and
  production-build path.

---

### Task 1: Dependency Review, Storefront Scaffold, and Environment Contracts

**Files:**

- Create: `apps/storefront/package.json`
- Create: `apps/storefront/tsconfig.json`
- Create: `apps/storefront/vite.config.ts`
- Create: `apps/storefront/index.html`
- Create: `apps/storefront/src/main.tsx`
- Create: `apps/storefront/src/app/environment.ts`
- Create: `apps/storefront/src/app/environment.test.ts`
- Create: `apps/storefront/src/app/app.tsx`
- Create: `apps/storefront/src/app/app.test.tsx`
- Create: `apps/storefront/src/test/setup.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/dependencies.md`
- Modify: `CHANGELOG.md`

- [x] Write failing storefront environment tests for API URL, storefront origin,
  optional Google client ID, and production-safe URL validation.
- [x] Add a failing storefront smoke test asserting a semantic `main`,
  NovaCommerce identity, and an application-loading state.
- [x] Review current versions, maintenance, licenses, and advisories for `cookie`
  and `express-rate-limit`; record the decision before installation. Reuse
  existing `jose`, React, Vite, Router, Zod, Lucide, Vitest, and Testing Library.
- [x] Create only the minimum Vite application needed for the tests to pass;
  routes and feature directories arrive in their owning tasks.
- [x] Add strict TypeScript, jsdom setup, scripts for `dev`, `build`, `lint`,
  `typecheck`, and `test`, and port `3100`.
- [x] Run `pnpm --filter @opendx/storefront test`, `typecheck`, and `build`.
- [x] Commit as `feat(storefront): scaffold customer storefront`.

### Task 2: Customer and Cart PostgreSQL Schemas plus Domain Rules

**Files:**

- Create: `apps/api/src/modules/customer/infrastructure/database/migrations/202608050005_create_customer.ts`
- Create: `apps/api/src/modules/customer/infrastructure/database/run-customer-migrations.ts`
- Create: `apps/api/src/modules/customer/infrastructure/database/customer-migration.integration.test.ts`
- Create: `apps/api/src/modules/customer/domain/entities/customer.ts`
- Create: `apps/api/src/modules/customer/domain/entities/customer-session.ts`
- Create: `apps/api/src/modules/customer/domain/entities/guest-session.ts`
- Create: `apps/api/src/modules/customer/domain/entities/customer-address.ts`
- Create: `apps/api/src/modules/customer/domain/exceptions/customer-domain.error.ts`
- Create: `apps/api/src/modules/customer/domain/services/customer-rules.ts`
- Create: `apps/api/src/modules/customer/domain/services/customer-rules.test.ts`
- Create: `apps/api/src/modules/cart/infrastructure/database/migrations/202608050006_create_cart.ts`
- Create: `apps/api/src/modules/cart/infrastructure/database/run-cart-migrations.ts`
- Create: `apps/api/src/modules/cart/infrastructure/database/cart-migration.integration.test.ts`
- Create: `apps/api/src/modules/cart/domain/entities/cart.ts`
- Create: `apps/api/src/modules/cart/domain/entities/cart-item.ts`
- Create: `apps/api/src/modules/cart/domain/exceptions/cart-domain.error.ts`
- Create: `apps/api/src/modules/cart/domain/services/cart-rules.ts`
- Create: `apps/api/src/modules/cart/domain/services/cart-rules.test.ts`
- Modify: `apps/api/package.json`
- Modify: `CHANGELOG.md`

- [ ] Write failing Customer domain tests for seven/30-day absolute expiry,
  immutable terminal session states, verified identity requirements, bounded
  profile fields, address validation, and one default address.
- [ ] Write failing Cart domain tests for positive safe-integer quantities,
  unique variants, VND subtotal/total safe-integer arithmetic, stale-line
  markers, and legal active/superseded/checkout-ready transitions.
- [ ] Write failing migration tests proving all tables, checks, partial unique
  indexes, foreign keys, migration order, and complete rollback.
- [ ] Create `customers`, `customer_external_identities`, `customer_sessions`,
  `guest_sessions`, and `customer_addresses` without `company_id` or raw token
  columns. Enforce unique provider subject and at most one default address per
  customer with a partial unique index.
- [ ] Create `carts`, `cart_items`, and `cart_resolution_requests`. Require
  exactly one cart owner, one active cart per owner, one variant per cart,
  positive quantities, immutable superseded history, and unique
  `(customer_id, idempotency_key)` resolution requests with a request
  fingerprint and resulting cart reference.
- [ ] Add module-local migrate/rollback scripts and all-order scripts.
- [ ] Run domain tests and PostgreSQL migration up/down integration tests.
- [ ] Commit as `feat(commerce): add customer and cart foundations`.

### Task 3: Customer Authentication, Sessions, and PostgreSQL Adapters

**Files:**

- Create: `apps/api/src/modules/customer/application/dtos/customer.dto.ts`
- Create: `apps/api/src/modules/customer/application/identity/google-identity-verifier.ts`
- Create: `apps/api/src/modules/customer/application/security/session-token-service.ts`
- Create: `apps/api/src/modules/customer/application/repositories/interfaces/customer.repository.ts`
- Create: `apps/api/src/modules/customer/application/repositories/interfaces/customer-audit.repository.ts`
- Create: `apps/api/src/modules/customer/application/services/interfaces/customer-authentication.service.ts`
- Create: `apps/api/src/modules/customer/application/services/interfaces/customer-session.service.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-authentication.service.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-authentication.service.test.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-session.service.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-session.service.test.ts`
- Create: `apps/api/src/modules/customer/infrastructure/identity/google-jose-identity-verifier.ts`
- Create: `apps/api/src/modules/customer/infrastructure/identity/google-jose-identity-verifier.test.ts`
- Create: `apps/api/src/modules/customer/infrastructure/security/node-session-token-service.ts`
- Create: `apps/api/src/modules/customer/infrastructure/repositories/implementations/postgresql-customer.repository.ts`
- Create: `apps/api/src/modules/customer/infrastructure/repositories/implementations/postgresql-customer.repository.integration.test.ts`
- Create: `apps/api/src/modules/customer/infrastructure/repositories/implementations/postgresql-customer-audit.repository.ts`
- Modify: `CHANGELOG.md`

- [ ] Write failing application tests for first Google login, repeat login,
  unverified email, duplicate subject convergence, same-email/different-subject
  conflict, disabled customer, token hashing, rotation without expiry extension,
  logout, revocation, guest restoration, and expired-session rejection.
- [ ] Define the verifier output as only provider, subject, verified email, and
  verification timestamp. Keep provider JWT types out of domain/application DTOs.
- [ ] Implement the Google adapter with remote JWKS and exact issuer/audience
  checks. Tests inject a local signed key set; runtime never receives a fake
  verifier through environment selection.
- [ ] Implement 256-bit opaque tokens with Node `crypto`, SHA-256 persistence
  hashes, transactional customer/identity/session creation, and concurrency-safe
  unique-conflict recovery.
- [ ] Add PostgreSQL repository integration tests for rollback, duplicate login,
  rotation, revocation, absolute expiry, and no raw token persistence.
- [ ] Audit auth outcomes without credential, email, subject, or token payloads.
- [ ] Run focused unit and integration tests.
- [ ] Commit as `feat(customer): add verified commerce sessions`.

### Task 4: Customer HTTP Security, Session, Profile, and Address APIs

**Files:**

- Create: `apps/api/src/modules/customer/application/services/interfaces/customer-profile.service.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-profile.service.ts`
- Create: `apps/api/src/modules/customer/application/services/implementations/customer-profile.service.test.ts`
- Create: `apps/api/src/modules/customer/application/mappers/customer.mapper.ts`
- Create: `apps/api/src/modules/customer/presentation/middleware/customer-session.middleware.ts`
- Create: `apps/api/src/modules/customer/presentation/middleware/storefront-mutation.middleware.ts`
- Create: `apps/api/src/modules/customer/presentation/middleware/storefront-rate-limit.middleware.ts`
- Create: `apps/api/src/modules/customer/presentation/validators/customer.validator.ts`
- Create: `apps/api/src/modules/customer/presentation/controllers/customer-auth.controller.ts`
- Create: `apps/api/src/modules/customer/presentation/controllers/customer-account.controller.ts`
- Create: `apps/api/src/modules/customer/presentation/routes/customer-auth.routes.ts`
- Create: `apps/api/src/modules/customer/presentation/routes/customer-account.routes.ts`
- Create: `apps/api/src/modules/customer/customer.module.ts`
- Create: `apps/api/src/modules/customer/index.ts`
- Create: `apps/api/src/modules/customer/tests/customer.api.test.ts`
- Create: `apps/api/src/modules/customer/tests/customer.api.integration.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/shared/config/environment.ts`
- Modify: `apps/api/src/shared/config/environment.test.ts`
- Modify: `CHANGELOG.md`

- [ ] Write failing profile/address service tests for owner-constrained reads,
  validation, optimistic versions, default switching, deletion, and disabled
  customers.
- [ ] Write failing API tests for exact cookie attributes, credentials-enabled
  CORS, allowed origins, CSRF mismatch, auth rate limits, stable errors, cookie
  clearing, staff/customer credential isolation, and address ownership.
- [ ] Parse/serialize cookies with the reviewed package. Use one shared mutation
  boundary for origin plus CSRF cookie/header equality; do not scatter security
  checks through controllers.
- [ ] Return only session kind, customer ID where authenticated, verified email,
  profile, address DTOs, expiry, and cart-resolution status. Never return hashes,
  raw tokens, Google subjects, or provider internals.
- [ ] Compose Customer with explicit verifier/token/clock/ID/transaction
  dependencies and mount its routes under `/v1/storefront`.
- [ ] Extend API configuration with storefront origin, Google audience, cookie
  names/security, fixed TTL validation, and bounded rate-limit settings.
- [ ] Run Customer service, HTTP, integration, and environment tests.
- [ ] Commit as `feat(api): expose secure customer account workflows`.

### Task 5: Catalog Cart Projection and Backend-Authoritative Cart Service

**Files:**

- Create: `apps/api/src/modules/catalog/application/services/interfaces/storefront-variant-reader.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/storefront-variant-reader.ts`
- Create: `apps/api/src/modules/catalog/application/services/implementations/storefront-variant-reader.test.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/application/repositories/interfaces/public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/catalog.module.ts`
- Modify: `apps/api/src/modules/catalog/index.ts`
- Create: `apps/api/src/modules/cart/application/dtos/cart.dto.ts`
- Create: `apps/api/src/modules/cart/application/repositories/interfaces/cart.repository.ts`
- Create: `apps/api/src/modules/cart/application/services/interfaces/cart.service.ts`
- Create: `apps/api/src/modules/cart/application/services/interfaces/checkout-ready-cart-reader.ts`
- Create: `apps/api/src/modules/cart/application/services/implementations/cart.service.ts`
- Create: `apps/api/src/modules/cart/application/services/implementations/cart.service.test.ts`
- Create: `apps/api/src/modules/cart/application/mappers/cart.mapper.ts`
- Create: `apps/api/src/modules/cart/infrastructure/repositories/implementations/postgresql-cart.repository.ts`
- Create: `apps/api/src/modules/cart/infrastructure/repositories/implementations/postgresql-cart.repository.integration.test.ts`
- Modify: `CHANGELOG.md`

- [ ] Write failing Catalog reader tests for published product, active variant,
  current VND price, SKU, option values, primary media, and missing/unpublished
  variants without exposing Catalog repositories to Cart.
- [ ] Write failing Cart service tests for empty read, add/update/remove,
  quantity aggregation, stale/unpublished line visibility, changed price,
  insufficient stock, safe totals, ownership denial, and idempotent retries.
- [ ] Implement a batch Catalog projection port and reuse Inventory's batch
  availability port to avoid per-line queries.
- [ ] Lock/version the active cart in PostgreSQL mutations. Persist only variant,
  quantity, and last validated price; recalculate all public line fields and
  totals from owner contracts before every response.
- [ ] Ensure a missing session read returns an empty anonymous cart without
  creating state. First add requires/creates the guest session through the
  explicit guest-session endpoint.
- [ ] Prove concurrent first-add and same-variant mutations converge to one
  active cart and one line without lost updates or duplicate rows.
- [ ] Run Catalog reader, Cart service, and PostgreSQL integration tests.
- [ ] Commit as `feat(cart): add authoritative cart operations`.

### Task 6: Explicit Cart Resolution and Checkout-Readiness API

**Files:**

- Create: `apps/api/src/modules/cart/application/services/interfaces/cart-resolution.service.ts`
- Create: `apps/api/src/modules/cart/application/services/implementations/cart-resolution.service.ts`
- Create: `apps/api/src/modules/cart/application/services/implementations/cart-resolution.service.test.ts`
- Create: `apps/api/src/modules/cart/presentation/validators/cart.validator.ts`
- Create: `apps/api/src/modules/cart/presentation/controllers/cart.controller.ts`
- Create: `apps/api/src/modules/cart/presentation/routes/cart.routes.ts`
- Create: `apps/api/src/modules/cart/cart.module.ts`
- Create: `apps/api/src/modules/cart/index.ts`
- Create: `apps/api/src/modules/cart/tests/cart.api.test.ts`
- Create: `apps/api/src/modules/cart/tests/cart.api.integration.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/modules/customer/customer.module.ts`
- Modify: `CHANGELOG.md`

- [ ] Write failing resolution tests for no conflict, guest-only transfer,
  keep-guest, keep-saved, merge, quantity/availability conflict, request
  fingerprint mismatch, idempotent retry, and cross-customer denial.
- [ ] On login, inspect both carts. Transfer automatically only when at most one
  contains lines; otherwise return `CART_RESOLUTION_REQUIRED` without mutation.
- [ ] Preserve superseded carts and resolution records. Never reactivate a
  superseded cart or delete historical lines during a retry.
- [ ] Write failing API tests for all cart routes, guest/customer requirements,
  CSRF/origin enforcement, stable errors, and fully recalculated envelopes.
- [ ] Implement checkout readiness as validation plus a stable Cart DTO only.
  It requires a customer session and resolved cart, but creates no reservation,
  order, promotion, checkout row, payment, or event.
- [ ] Export only the checkout-ready reader required by Phase 6.
- [ ] Run Cart unit/API/PostgreSQL tests including concurrent resolution.
- [ ] Commit as `feat(api): expose cart resolution workflows`.

### Task 7: Storefront Shell and Catalog Discovery

**Files:**

- Create: `apps/storefront/src/app/app-router.tsx`
- Create: `apps/storefront/src/app/storefront-shell.tsx`
- Create: `apps/storefront/src/shared/http/api-client.ts`
- Create: `apps/storefront/src/shared/format/currency.ts`
- Create: `apps/storefront/src/shared/styles/globals.css`
- Create: `apps/storefront/src/features/catalog/api/storefront-catalog-api.ts`
- Create: `apps/storefront/src/features/catalog/schemas/storefront-catalog.schema.ts`
- Create: `apps/storefront/src/features/catalog/types/catalog.types.ts`
- Create: `apps/storefront/src/features/catalog/mappers/catalog.mapper.ts`
- Create: `apps/storefront/src/features/catalog/hooks/use-product-discovery.ts`
- Create: `apps/storefront/src/features/catalog/components/product-card.tsx`
- Create: `apps/storefront/src/features/catalog/components/catalog-filters.tsx`
- Create: `apps/storefront/src/features/catalog/components/product-grid.tsx`
- Create: `apps/storefront/src/features/catalog/pages/home-page.tsx`
- Create: `apps/storefront/src/features/catalog/pages/category-page.tsx`
- Create: `apps/storefront/src/features/catalog/pages/search-page.tsx`
- Create: `apps/storefront/src/features/catalog/tests/catalog-discovery.test.tsx`
- Modify: `apps/api/src/modules/catalog/presentation/validators/public-catalog.validator.ts`
- Modify: `apps/api/src/modules/catalog/infrastructure/repositories/implementations/postgresql-public-catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/tests/public-catalog.api.test.ts`
- Modify: `CHANGELOG.md`

- [ ] Write failing API tests for query, category slug, min/max VND price,
  in/out-of-stock, stable sort, page, page size, malformed filters, and sold-out
  visibility before extending Catalog contracts.
- [ ] Write failing Storefront tests for loading, empty, dependency error/retry,
  success, URL restoration, pagination, mobile filters, and sold-out cards.
- [ ] Build the actual catalog as the first screen: compact brand/search/header,
  category shortcuts, and real product grid. Do not add a marketing landing hero.
- [ ] Keep primary image dimensions stable, preserve aspect ratio, use Catalog
  alt text, and show VND price plus textual availability on every card.
- [ ] Keep filters in URL search params and submit backend-supported values only.
  Frontend code does not refilter authoritative results.
- [ ] Verify keyboard navigation, visible focus, semantic landmarks, 390x844,
  768x1024, and 1440x900 layouts without document overflow.
- [ ] Run Catalog API and Storefront discovery tests plus production build.
- [ ] Commit as `feat(storefront): add catalog discovery`.

### Task 8: Product Detail and Persistent Guest Cart UI

**Files:**

- Create: `apps/storefront/src/features/catalog/hooks/use-product-detail.ts`
- Create: `apps/storefront/src/features/catalog/components/product-gallery.tsx`
- Create: `apps/storefront/src/features/catalog/components/variant-selector.tsx`
- Create: `apps/storefront/src/features/catalog/pages/product-detail-page.tsx`
- Create: `apps/storefront/src/features/catalog/tests/product-detail.test.tsx`
- Create: `apps/storefront/src/features/cart/api/cart-api.ts`
- Create: `apps/storefront/src/features/cart/schemas/cart.schema.ts`
- Create: `apps/storefront/src/features/cart/types/cart.types.ts`
- Create: `apps/storefront/src/features/cart/mappers/cart.mapper.ts`
- Create: `apps/storefront/src/features/cart/hooks/cart-context.tsx`
- Create: `apps/storefront/src/features/cart/components/cart-line.tsx`
- Create: `apps/storefront/src/features/cart/pages/cart-page.tsx`
- Create: `apps/storefront/src/features/cart/tests/guest-cart.test.tsx`
- Modify: `apps/storefront/src/app/app.tsx`
- Modify: `apps/storefront/src/app/app-router.tsx`
- Modify: `apps/storefront/src/app/storefront-shell.tsx`
- Modify: `CHANGELOG.md`

- [ ] Write failing detail tests for image, alt text, variant selection, SKU,
  variant price/availability, sold-out disabling, add success, and server error.
- [ ] Write failing cart tests for first guest-session creation, credentials and
  CSRF header use, refresh restoration, quantity changes, removal, changed price,
  stale stock, unavailable product, empty state, and retry.
- [ ] Build first-viewport product identity with inspectable media, name, VND
  price, selected variant, SKU, availability, and one clear add action.
- [ ] Create a guest session only immediately before the first stateful cart
  mutation. Never create guest cookies during anonymous browsing.
- [ ] Validate every API envelope with Zod and render backend totals/change
  markers; never calculate trusted cart totals in React.
- [ ] Keep cart badge/layout dimensions stable during loading and mutations.
- [ ] Run detail/cart tests and storefront production build.
- [ ] Commit as `feat(storefront): add persistent guest cart`.

### Task 9: Google Sign-In, Customer Session, and Checkout Gate UI

**Files:**

- Create: `apps/storefront/src/features/authentication/api/customer-session-api.ts`
- Create: `apps/storefront/src/features/authentication/api/google-identity-client.ts`
- Create: `apps/storefront/src/features/authentication/schemas/customer-session.schema.ts`
- Create: `apps/storefront/src/features/authentication/types/authentication.types.ts`
- Create: `apps/storefront/src/features/authentication/hooks/customer-session-context.tsx`
- Create: `apps/storefront/src/features/authentication/components/google-sign-in-button.tsx`
- Create: `apps/storefront/src/features/authentication/components/checkout-gate.tsx`
- Create: `apps/storefront/src/features/authentication/pages/sign-in-page.tsx`
- Create: `apps/storefront/src/features/authentication/tests/authentication.test.tsx`
- Modify: `apps/storefront/src/features/cart/pages/cart-page.tsx`
- Modify: `apps/storefront/src/app/app.tsx`
- Modify: `apps/storefront/src/app/app-router.tsx`
- Modify: `CHANGELOG.md`

- [ ] Write failing tests for unavailable Google configuration, script failure,
  credential success/failure, session restoration, logout, CSRF, same-origin
  return target validation, resolution-required result, and checkout readiness.
- [ ] Load Google Identity Services only on sign-in intent and request identity
  scopes only. Keep the credential in memory only until the API call completes.
- [ ] Hide no failure: when no client ID is configured, render a clear
  unavailable sign-in state while catalog and guest cart remain functional.
- [ ] Accept return targets only from the approved route allowlist and never
  navigate to an arbitrary URL.
- [ ] Make checkout intent authenticate and request readiness only. Do not create
  `/checkout`, order, reservation, or payment behavior.
- [ ] Run authentication/cart tests and production build.
- [ ] Commit as `feat(storefront): add customer sign-in gate`.

### Task 10: Account, Address Book, and Cart Resolution UI

**Files:**

- Create: `apps/storefront/src/features/customer-account/api/customer-account-api.ts`
- Create: `apps/storefront/src/features/customer-account/schemas/customer-account.schema.ts`
- Create: `apps/storefront/src/features/customer-account/types/customer-account.types.ts`
- Create: `apps/storefront/src/features/customer-account/hooks/use-customer-account.ts`
- Create: `apps/storefront/src/features/customer-account/components/profile-form.tsx`
- Create: `apps/storefront/src/features/customer-account/components/address-form.tsx`
- Create: `apps/storefront/src/features/customer-account/components/address-list.tsx`
- Create: `apps/storefront/src/features/customer-account/pages/account-page.tsx`
- Create: `apps/storefront/src/features/customer-account/pages/address-page.tsx`
- Create: `apps/storefront/src/features/customer-account/tests/customer-account.test.tsx`
- Create: `apps/storefront/src/features/cart/components/cart-resolution-dialog.tsx`
- Create: `apps/storefront/src/features/cart/tests/cart-resolution.test.tsx`
- Modify: `apps/storefront/src/features/cart/api/cart-api.ts`
- Modify: `apps/storefront/src/features/cart/hooks/cart-context.tsx`
- Modify: `apps/storefront/src/app/app-router.tsx`
- Modify: `CHANGELOG.md`

- [ ] Write failing account tests for guarded routes, verified email display,
  profile validation, address loading/empty/error/success, create/update/delete,
  default switching, stale version, and ownership denial.
- [ ] Write failing resolution UI tests for opaque guest/saved summaries,
  keep-guest, keep-saved, merge, conflict correction, pending/disabled states,
  idempotency key reuse, and retry.
- [ ] Use labels and explicit destructive confirmations; do not place API calls
  directly in presentational forms or dialogs.
- [ ] Preserve form input after recoverable validation errors and expose no
  provider subject, session token, or internal IDs beyond opaque resource IDs.
- [ ] Verify keyboard focus trapping/restoration for the resolution dialog and
  mobile text/control fit.
- [ ] Run account/resolution tests and production build.
- [ ] Commit as `feat(storefront): add customer account workflows`.

### Task 11: Docker, Documentation, Full Validation, and Exit Evidence

**Files:**

- Create: `apps/storefront/Dockerfile`
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/docker/README.md`
- Modify: `.env.example`
- Modify: `Makefile` only if existing commands cannot include Storefront/Customer/Cart
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/server.ts`
- Modify: `scripts/dev/check.sh`
- Create: `docs/api/customer.md`
- Create: `docs/api/cart.md`
- Modify: `docs/api/storefront-catalog.md`
- Create: `docs/development/storefront-local-environment.md`
- Modify: `docs/build-from-source.md`
- Modify: `docs/dependencies.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/architecture/system-baseline.md`
- Modify: `docs/product/vision.md`
- Modify: `docs/roadmap/mvp-status.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] Extend `db:migrate:all`, `db:rollback:all`, readiness migration checks,
  Compose migration/seed order, integration-test database reset, and backup/
  restore acceptance for Customer then Cart.
- [ ] Add Storefront on host port `3100` after API readiness with a pinned
  non-root image, source mounts consistent with current full-container mode,
  and a health check that does not contact Google.
- [ ] Keep the focused Make interface (`up`, `down`, `logs`, `check`, migration,
  seed, backup, restore) and make existing targets include the new services;
  do not add one target per frontend feature.
- [ ] Document local Google OAuth setup using contributor-owned credentials,
  exact authorized origin `http://localhost:3100`, and no committed secret/token.
- [ ] Run focused unit suites after every task, then `pnpm check`, `make check`,
  `git diff --check`, `pnpm audit:repo`, and Compose configuration validation.
- [ ] From a clean database, prove migrate, repeated seed, rollback/reapply,
  backup/restore, full-stack readiness, and persistence across `make down`/`up`.
- [ ] Run real HTTP acceptance for public filters, guest-cookie restoration,
  CSRF denial, customer/address ownership denial, cart recalculation, all three
  resolution actions, and checkout readiness with no order/payment rows.
- [ ] Run browser acceptance at 390x844, 768x1024, and 1440x900. Capture evidence
  that images render, focus is visible, keyboard flows work, and no incoherent
  overlap or horizontal document overflow exists.
- [ ] Run one real Google login only with an external local `.env`; verify login,
  rotation, logout, and re-login without recording credentials or tokens.
- [ ] Request independent code/security review and resolve all Critical and
  Important findings with regression tests.
- [ ] Mark every completed task checkbox, record exact evidence in
  `docs/roadmap/mvp-status.md`, and set Phase 5 complete only after all exit-gate
  statements pass.
- [ ] Commit as `docs(storefront): complete phase 5 acceptance`.

## Execution Order and Stop Conditions

Execute Tasks 1 through 11 in order. A task may be split into smaller atomic
commits, but its contract must be green before a dependent task starts.

Stop and obtain a focused design amendment before:

- adding password, email OTP, anonymous checkout, promotions, orders, SePay,
  shipping, refunds, returns, or electronic invoices;
- changing the approved Google subject/email linking rule;
- weakening CSRF, origin, cookie, ownership, or session-expiry requirements;
- introducing another database, queue, scheduler, identity provider, DI
  framework, or frontend application boundary;
- changing checkout readiness into reservation or order creation; or
- exposing private Catalog/Inventory persistence contracts to Cart.

## Phase 5 Exit Gate

- [ ] Guest discovery, filters, product detail, sold-out visibility, and image
  delivery pass against real seeded Catalog/Inventory data.
- [ ] Seven-day guest cart survives refresh/browser restart and remains
  backend-authoritative.
- [ ] Google verified login creates/restores the correct customer and a rotating,
  revocable 30-day local session without silent email merge.
- [ ] Staff and customer credentials remain mutually isolated.
- [ ] Owned profile/address behavior and cross-account denial pass.
- [ ] Keep-guest, keep-saved, merge, merge conflicts, and retries pass without
  silent replacement or deleted history.
- [ ] Every cart response reflects current publication, price, availability,
  subtotal, total, and line changes from backend owners.
- [ ] Checkout readiness requires a customer and creates no order, reservation,
  promotion, or payment.
- [ ] Source, PostgreSQL, Docker, build, test, accessibility, responsive,
  backup/restore, and real-Google acceptance evidence is current.
- [ ] Independent review is resolved and the phase is merged through a pull
  request into `develop`.
