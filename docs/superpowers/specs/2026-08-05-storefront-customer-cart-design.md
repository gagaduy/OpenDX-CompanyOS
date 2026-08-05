<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront, Customer, and Cart Design

## Status

- Date: 2026-08-05
- State: Approved focused design
- Master design: `2026-08-04-novacommerce-commerce-platform-design.md`
- Master plan: `../plans/2026-08-04-novacommerce-commerce-platform.md`
- Delivery phase: Phase 5

## Outcome

Phase 5 delivers NovaCommerce's first customer-facing React storefront and a
PostgreSQL-authoritative customer and cart boundary. A guest can discover the
seeded technology catalog, inspect products, select an available variant, and
keep a cart across refreshes and browser restarts for seven days.

Checkout is account-gated. When the customer chooses to continue toward
checkout, Google Sign-In creates or restores a Commerce-owned customer account
and a local 30-day session. Phase 5 returns a checkout-ready cart summary but
does not create an order, reserve stock for checkout, evaluate promotions, or
start payment; those behaviors remain Phase 6.

## Approved Decisions

- Build `apps/storefront` separately from the staff-facing `apps/console`.
- Specialize discovery for general technology while preserving the existing
  Catalog and Inventory source-of-truth contracts.
- Allow anonymous browsing and a seven-day guest cart, but require an
  authenticated customer account before checkout can begin.
- Use Google Identity Services for customer registration and login. First
  successful Google login is registration; there is no separate password or
  email-OTP flow in Phase 5.
- Request and retain only the Google subject and provider-verified email. Do
  not persist Google access tokens, refresh tokens, names, or profile images.
- Keep customer identity and sessions inside the Commerce boundary. Keycloak
  continues to authenticate staff only.
- Issue a Commerce-owned opaque session cookie with a 30-day absolute expiry,
  server-side rotation, revocation, and PostgreSQL persistence.
- Never silently merge or replace an existing customer cart. When guest and
  customer carts both exist, require an explicit keep-current, keep-saved, or
  merge decision.
- Show published sold-out products with an explicit `Hết hàng` state. Do not
  hide them, permit their unavailable variants to enter a cart, or trust stale
  browser availability.
- Provide category, price-range, stock-status, sort, and pagination filters in
  URL-addressable storefront routes.
- PostgreSQL remains the only runtime relational database. No memory database,
  test identity bypass, new queue, scheduler, or DI framework is introduced.

## Master-Design Amendment

This focused design replaces the master design's earlier guest-checkout
decision. The approved customer journey is now:

```text
anonymous discovery and cart
-> Google registration/login when checkout is requested
-> explicit cart resolution when required
-> authenticated checkout in Phase 6
```

Guest identity and guest cart remain required Phase 5 capabilities. Anonymous
order creation and anonymous payment are no longer in scope. The master design,
master plan, product vision, and architecture baseline must use this amended
language.

## Scope

### Included

- React, TypeScript, and Vite storefront application at `apps/storefront`.
- Home, category, search, product-detail, cart, sign-in, account, and address
  routes.
- URL-backed category, price, stock, sort, and pagination state.
- Public Catalog API extensions needed by the approved storefront filters and
  projections without exposing private Catalog or Inventory data.
- Opaque seven-day guest identity in a secure cookie.
- Google ID-token verification behind an inward-facing customer identity port.
- Automatic account creation on first verified Google login.
- Opaque, rotated, revocable 30-day registered-customer sessions.
- Customer profile baseline and customer-owned address book.
- Guest-owned and customer-owned carts with backend-authoritative totals.
- Explicit guest/customer cart conflict resolution.
- Checkout-ready cart summary plus an authentication gate for later Phase 6.
- PostgreSQL migrations, rollback, deterministic tests, Docker topology,
  health checks, contributor commands, API documentation, and accessibility
  acceptance needed by the phase.

### Excluded

- Passwords, email OTP, magic links, or Resend integration.
- Anonymous checkout or anonymous order creation.
- Promotion evaluation, checkout snapshots, inventory checkout reservation,
  order creation, SePay initiation, payment confirmation, or order history;
  these begin in Phase 6.
- Google API access beyond identity verification, Google access/refresh token
  storage, profile image ingestion, or contact synchronization.
- Marketing banners backed by campaign or promotion behavior.
- Product reviews, wishlists, comparisons, recommendations, recently viewed
  tracking, or marketing automation.
- Marketplace, multiple stores, multiple warehouses, multiple currencies,
  shipping-provider behavior, refunds, returns, and electronic invoices.
- Workflow, Temporal, Digital Employees, GraphRAG, or AI execution.

## Architecture

### Frontend Ownership

`apps/storefront` is a new application, not a route inside `apps/console`. It
uses the established React feature-first direction and creates directories only
with their first approved source or test file:

```text
apps/storefront/src/
|-- app/                    routing, composition, top-level providers
|-- features/
|   |-- catalog/            home, category, search, product detail
|   |-- authentication/     Google sign-in and local session states
|   |-- customer-account/   profile and address book
|   `-- cart/               cart display, mutations, resolution
`-- shared/                 proven cross-feature UI and HTTP concerns only
```

Features consume another feature through its public entry point. API response
schemas are validated before mapping into frontend-owned view models. Pages
compose behavior; presentational components do not calculate trusted totals or
decide authorization.

### Backend Ownership

`apps/api/src/modules/customer` owns customers, Google external identities,
guest and registered sessions, profiles, and addresses.

`apps/api/src/modules/cart` owns carts, cart lines, ownership, quantity rules,
recalculation, conflict resolution, and the checkout-ready summary contract.

Catalog continues to own publication, product, variant, media, and price.
Inventory continues to own availability and reservations. Customer and Cart
may consume only intentional public application contracts from other modules;
they do not import another module's entities, SQL, repositories,
infrastructure, or presentation files.

Google SDK access belongs to a Customer infrastructure adapter behind a
framework-neutral verifier port. PostgreSQL access belongs to repository
implementations. Express routes validate untrusted input, controllers call
application interfaces, and response mappers return purpose-specific DTOs.

### Dependency Flow

```text
Storefront intent
-> public or customer-authenticated API route
-> validator and cookie/CSRF middleware
-> controller
-> Customer or Cart application service
-> public Catalog/Inventory application contracts where required
-> PostgreSQL repositories / Google verifier adapter
-> response mapper
-> validated storefront view model
```

The Google adapter cannot create a customer or session directly. It returns a
verified provider identity to the Customer application service, which owns all
linking, creation, rotation, and revocation decisions.

## Identity and Session Model

### Google Registration and Login

The storefront uses Google Identity Services to obtain a signed ID token and
sends it to the API over HTTPS. The API verifies the signature using rotating
Google public keys through a maintained verification library and validates at
least:

- `iss` is an accepted Google issuer.
- `aud` exactly matches the configured storefront Google client ID.
- `exp` has not passed.
- `sub` is present and used as the provider-stable identity.
- `email` is present and `email_verified` is true.

The API never accepts a plain Google user ID or browser-provided email as proof
of identity. A unique `(provider, provider_subject)` identifies the customer.
Email is contact data, not the key used to silently merge accounts. If a
different Google subject presents an email already tied to another customer,
the API fails closed with a stable account-conflict result and does not merge.

On first successful login, the Customer application service creates the
customer and Google identity in one PostgreSQL transaction, then creates a
local session. On later login, it resolves the existing identity and creates a
new local session. Google ID tokens are neither logged nor persisted.

### Registered Session

The local session uses a cryptographically random opaque token. Only a
one-way token hash is stored in PostgreSQL; the raw value appears only in the
cookie delivered to the browser. The cookie is `HttpOnly`, `Secure` in HTTPS
environments, `SameSite=Lax`, path-bounded, and absent from JavaScript APIs.

The session has a 30-day absolute expiry. Rotation replaces the token without
extending the absolute boundary. The prior token is invalidated atomically.
Logout revokes the current session. Customer-security operations may revoke
all sessions for one customer. Expired and revoked sessions cannot be
reactivated.

### Guest Session

The guest session also uses an opaque cookie and a one-way PostgreSQL hash. It
has a seven-day absolute expiry and restores the same guest cart across reloads
and browser restarts within that window. An expired or unknown token creates a
new guest session only when a guest-owned state is first required; anonymous
catalog reads do not create sessions unnecessarily.

Staff Keycloak middleware never accepts customer cookies. Customer middleware
never accepts staff access tokens. The two identity audiences and route trees
remain isolated.

## Persistence Model

All identifiers are UUIDs unless the existing repository convention requires a
different opaque identifier. All timestamps are timezone-aware. No Phase 5
table contains `company_id`.

### `customers`

- `id`: primary key.
- `email`: current provider-verified contact email.
- `email_verified_at`: provider verification observation time.
- `status`: `active` or `disabled`.
- `version`: optimistic version for customer-owned profile changes.
- `created_at`, `updated_at`.

Names and phone numbers remain nullable until the customer enters them. The
application does not populate them from Google.

### `customer_external_identities`

- `id`: primary key.
- `customer_id`: required customer reference.
- `provider`: `google` in Phase 5.
- `provider_subject`: required opaque Google `sub`.
- `provider_email`: last verified email observed during login.
- `last_authenticated_at`, `created_at`, `updated_at`.

A unique constraint on `(provider, provider_subject)` prevents duplicate
identity ownership. Provider email alone never authorizes a link or merge.

### `customer_sessions`

- `id`: primary key.
- `customer_id`: required customer reference.
- `token_hash`: unique one-way hash.
- `expires_at`: fixed 30-day absolute expiry.
- `last_seen_at`, `rotated_at`, `revoked_at`, `created_at`.

### `guest_sessions`

- `id`: primary key.
- `token_hash`: unique one-way hash.
- `expires_at`: fixed seven-day absolute expiry.
- `last_seen_at`, `revoked_at`, `created_at`.

### `customer_addresses`

- `id`: primary key.
- `customer_id`: required owner.
- `recipient_name`, `phone_number`.
- `address_line`, `ward`, `province_or_city`.
- `postal_code`, `delivery_note`: optional bounded text.
- `is_default`: at most one default per customer.
- `version`, `created_at`, `updated_at`.

Address ownership is enforced in every query. Phase 5 supports create, list,
update, set-default, and delete. Checkout validation and immutable address
snapshots remain Phase 6.

### `carts`

- `id`: primary key.
- `guest_session_id`: nullable guest owner.
- `customer_id`: nullable customer owner.
- `status`: `active`, `superseded`, or `checkout_ready`.
- `version`, `created_at`, `updated_at`, `expires_at`.

A database check requires exactly one owner. Partial uniqueness permits at
most one active cart per guest session and at most one active cart per
customer.

### `cart_items`

- `id`: primary key.
- `cart_id`: required cart reference.
- `variant_id`: required Catalog variant reference.
- `quantity`: positive integer.
- `last_validated_unit_price_vnd`: non-negative integer.
- `created_at`, `updated_at`.

`(cart_id, variant_id)` is unique. Product title, image, price, publication,
and availability are read from their authoritative owners and mapped into cart
response projections rather than trusted from browser input.

## Cart Invariants and Lifecycle

Every create, add, quantity update, remove, resolution, and checkout-readiness
operation verifies ownership in the application layer and constrains the
repository query by owner. Knowing a cart UUID is never sufficient.

On every mutation the backend:

1. locks or version-checks the active cart;
2. resolves the variant through Catalog's public contract;
3. verifies publication, active state, and current positive VND price;
4. reads current Inventory availability;
5. validates the requested positive quantity against availability;
6. writes the cart mutation transactionally; and
7. returns a fully recalculated summary.

Cart totals are estimates until Phase 6 creates an immutable checkout/order
snapshot. The cart summary includes the current unit price, line subtotal,
total, availability, purchasability, and explicit change markers when the
current price differs from the last validated price or quantity is no longer
available. A stale or unpublished line remains visible as requiring customer
action; the backend does not silently remove it.

### Login and Cart Resolution

After Google login, the guest cart and customer cart are inspected. If at most
one contains items, ownership may transfer to the customer without a decision.
If both contain items, the API returns `CART_RESOLUTION_REQUIRED` and opaque
summaries of both carts.

The customer explicitly selects one action:

- `keep_guest`: transfer the guest cart and supersede the saved cart.
- `keep_saved`: retain the saved cart and supersede the guest cart.
- `merge`: combine matching variants, revalidate current prices and
  availability, and return line-specific conflicts that require correction.

No action deletes historical rows. Superseded carts cannot become active again
through a retry. A resolution request is idempotent and cannot access another
customer's cart.

## Storefront Information Architecture

### Routes

```text
/
/categories/:categorySlug
/search
/products/:productSlug
/cart
/sign-in
/account
/account/addresses
```

The Phase 6 `/checkout` route is not implemented. The Phase 5 checkout action
checks local customer authentication, redirects an unauthenticated guest to
`/sign-in` with a validated same-origin return target, resolves any cart
conflict, and requests a checkout-ready summary.

### Home and Discovery

The home page uses a catalog-first technology-retail layout. Search, category
shortcuts, and real product cards appear in the first viewport. Product cards
show the primary image, name, current VND price, and availability. There is no
promotion-backed campaign banner before Phase 6.

Category and search pages keep these values in the URL:

- category;
- query;
- minimum and maximum VND price;
- stock status;
- sort order;
- page and page size.

The backend applies filtering, stable sorting, and pagination before returning
results. Empty, loading, error, and success states are explicit. Published
sold-out products remain discoverable and may be included or excluded through
the stock filter.

### Product Detail

The first viewport prioritizes product imagery, name, current VND price,
variant selection, SKU, availability, and the buying action. Selecting a
variant updates its authoritative price and availability. Only an active,
published, priced, available variant can be added to the cart. The backend
repeats those checks regardless of displayed state.

### Cart and Account

The cart shows each line's product identity, selected variant, current unit
price, quantity, subtotal, availability, change state, and available actions.
It displays backend totals and never calculates trusted checkout totals in the
browser.

The account surface exposes the verified email, logout, and address book.
Names, phone number, and address are requested when checkout begins in Phase 6,
not immediately after Google registration. Customers may enter them earlier in
the account surface.

## Visual, Responsive, and Accessibility Rules

The storefront uses the approved dark token system but does not copy the dense
operational shell of the staff console. Product identity, imagery, price,
availability, and buying actions are first-viewport signals.

- Canvas remains `#010102`; lavender remains scarce and reserved for brand,
  primary CTA, focus, and links.
- Use surface hierarchy and hairline borders without decorative gradients,
  orbs, or unrelated bright accents.
- Product grids adapt across mobile, tablet, and desktop without horizontal
  document overflow.
- Filters collapse into an accessible mobile surface while remaining
  URL-backed.
- Images require useful Catalog alt text and stable dimensions.
- Every control supports keyboard operation, visible focus, semantic labels,
  and appropriate landmarks.
- Sold-out and changed-price states use text and semantics, not color alone.

## API Contracts

Exact request and response schemas are finalized in the file-level plan, but
the approved route families are:

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

Catalog reads remain anonymous. Guest cart routes accept only a valid guest
cookie. Customer account, address, resolution, and checkout-readiness routes
require a valid customer session. Mutation routes require CSRF protection.

Purpose-specific public DTOs expose no Google token, session token, token hash,
provider subject, internal audit metadata, SQL shape, or private Catalog and
Inventory state.

## Error Handling

Stable Phase 5 errors include:

- `GOOGLE_TOKEN_INVALID`
- `GOOGLE_IDENTITY_CONFLICT`
- `CUSTOMER_SESSION_EXPIRED`
- `CUSTOMER_DISABLED`
- `CSRF_INVALID`
- `CART_NOT_FOUND`
- `CART_OWNERSHIP_DENIED`
- `CART_RESOLUTION_REQUIRED`
- `CART_RESOLUTION_CONFLICT`
- `PRODUCT_NOT_AVAILABLE`
- `PRICE_CHANGED`
- `INSUFFICIENT_STOCK`
- `DEPENDENCY_UNAVAILABLE`

Provider error bodies, stack traces, database details, credentials, and tokens
are never reflected to clients. Storefront errors remain contextual and
recoverable where possible. If Google is unavailable, anonymous catalog and
guest cart behavior remain available, but the checkout gate fails closed.

## Security and Privacy

- Use a maintained Google token-verification library; do not implement JWT
  signature verification or key rotation by hand.
- Request identity scopes only. Do not request Drive, Gmail, Calendar, contacts,
  offline access, or broad profile data.
- Restrict accepted Google audience to the configured storefront client ID.
- Protect auth and cart mutations with origin checks, bounded inputs, rate
  limits, secure cookies, and CSRF tokens/headers where required.
- Accept return targets only when they resolve to approved same-origin
  storefront paths; never implement an open redirect.
- Use timing-safe token-hash comparison through established primitives and
  never log raw session or Google tokens.
- Minimize email and address data in structured logs, audit metadata, fixtures,
  and test failure output.
- Store secrets only in validated backend environment configuration. The
  Google web client ID may reach the browser; no backend secret may.
- Authorization and cart ownership are backend requirements. Hidden frontend
  controls are usability only.

## Testing Strategy

### Domain and Application

- Guest and customer session creation, absolute expiry, rotation, logout, and
  revocation.
- Google identity creation, repeat login, subject uniqueness, verified-email
  requirement, and no email-based silent merge.
- Address ownership, default-address uniqueness, validation, and optimistic
  conflicts.
- Positive cart quantities, variant uniqueness, current price, unpublished and
  archived variants, sold-out behavior, and unavailable quantity changes.
- Keep-guest, keep-saved, and merge resolution including idempotent retries and
  line conflicts.
- Cross-customer and cross-guest access returns no protected resource.

### PostgreSQL and API Integration

- Migration up/down and repeated seed/reset behavior.
- Real PostgreSQL repository contracts and transaction rollback.
- Concurrent cart mutations and concurrent first Google login converge without
  duplicate customer, identity, active cart, or cart item rows.
- Cookie attributes, session rotation, CSRF, origin policy, rate limits, stable
  errors, and public/private route boundaries.
- Catalog filter, pagination, publication, current-price, and live-availability
  projections.
- Fake Google verifier tests deterministic API behavior. Test-only verifiers
  are injected through the real port and never selected by runtime environment.

### Storefront

- Loading, empty search, dependency error, retry, and success states.
- URL-backed filters and pagination restoration.
- Sold-out products remain visible and cannot be added.
- Variant changes update price and availability.
- Guest cart creation, refresh restoration, mutation, changed price, and stale
  availability.
- Google sign-in success/failure, registered session restoration, logout, and
  guarded checkout intent.
- All three explicit cart-resolution choices and merge-conflict correction.
- Account and address ownership states.
- Keyboard, focus, semantic landmark, alt-text, and responsive behavior at
  mobile, tablet, and desktop viewports.

### Acceptance

Run source and container gates plus real browser/HTTP acceptance. A real Google
OAuth client is used only in a local acceptance profile with contributor-owned
credentials outside Git. Deterministic CI uses the fake verifier at the
application boundary and cannot enable it in a production composition root.

## Local Operations

Docker Compose adds the storefront on host port `3100`, after API readiness.
The storefront and API expose health behavior that does not contact Google on
every probe. PostgreSQL migrations run in the established Catalog -> Company
Core -> Inventory -> Customer -> Cart order; rollback reverses that order.
Seed ordering keeps Company Core -> Catalog -> Inventory before Customer and
Cart fixtures.

Configuration documents at least:

- storefront origin and port;
- Google web client ID and accepted audience;
- customer and guest cookie names and attributes;
- session and guest absolute TTLs;
- CSRF and allowed-origin settings.

A clean checkout can install, build, test, and start without committed Google
credentials. Google login remains visibly unavailable until a valid client ID
is configured. Phase exit requires a separate real-login acceptance run using
an OAuth web client configured for the local storefront origin. No OAuth
credential or token enters source control, docs, logs, fixtures, or images.

The root `Makefile`, `.env.example`, Docker documentation, dependency inventory,
API docs, project structure, roadmap, and changelog are updated in the
implementation unit that makes each statement true.

## Phase 5 Exit Gate

Phase 5 is complete only when fresh evidence proves all of these:

- A guest can browse the real seeded technology catalog, use URL-backed
  filters, inspect a variant, and see sold-out products remain visible.
- A guest can add an available variant, refresh or reopen the browser, and
  recover the same seven-day backend-authoritative cart.
- Google registration/login creates or restores the correct customer using a
  verified ID token and issues a revocable, rotating local session.
- Staff Keycloak and customer Google/session authentication remain isolated.
- A customer can manage owned addresses without cross-account access.
- Guest and saved carts never merge or replace one another silently; all three
  approved choices are tested.
- Every cart mutation recalculates publication, current VND price,
  availability, line subtotals, and total on the backend.
- Checkout intent requires customer authentication and returns a validated
  checkout-ready summary without creating an order or payment.
- PostgreSQL migration/rollback, repeated seed, backup/restore, source checks,
  full-container health, API integration, frontend production build,
  accessibility, and responsive acceptance all pass.

Failure of any required item leaves Phase 5 in progress. Phase 6 design does
not begin until this gate is complete and independently reviewed.
