<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# NovaCommerce Storefront Tech Redesign Design

## Status

Approved in collaborative design review on 2026-08-27. This focused design
replaces the current 3D Storefront homepage and redesigns every customer route
around the user-provided dark technology-commerce reference while preserving
the NovaCommerce brand, current Commerce contracts, and feature-first project
structure.

## Purpose

NovaCommerce needs a dense, product-led commerce interface with a two-row
header, category navigation, dynamic hero, service assurances, promotional
category cards, product rails, compact product cards, and consistent customer
workspaces. The redesign must support dark and light themes, use real Catalog
and Inventory data, and retain backend authority for pricing, availability,
checkout, payment, and orders.

The redesign also adds a customer-owned persisted wishlist because the
approved reference includes a functional favorites journey that does not exist
in the current product.

## Scope

- Redesign the shared Storefront shell, homepage, catalog discovery, search,
  category, product detail, sign-in, account, address, wishlist, cart,
  checkout, payment-return, order-list, and order-detail surfaces.
- Keep the brand name NovaCommerce and all existing customer routes and
  business flows.
- Replace the scroll-directed Three.js homepage with a data-driven commerce
  homepage.
- Preserve dark and light theme selection and persistence. Dark is the default
  and follows the approved reference most closely; light uses the same layout
  and hierarchy with a light technical palette.
- Add an authenticated, PostgreSQL-backed customer wishlist.
- Extend public Catalog pricing DTOs with backend-derived previous-price and
  discount evidence where a real price-history reduction exists.
- Use current public Catalog queries for categories, hero slides, newest,
  best-selling, and on-sale products.
- Update tests, browser acceptance, public API documentation, design guidance,
  dependency documentation, project structure documentation, and the
  changelog in the implementation unit.

## Explicit Non-Goals

- No Storefront V2 tree, duplicate router, parallel component system, or
  repository-wide refactor.
- No changes to Console, AI Runtime, Agentic workflows, Keycloak staff
  identity, or deployment topology.
- No marketplace, multi-store, multi-warehouse, shipping-provider, refund,
  return, electronic-invoice, or new payment-provider behavior.
- No guest wishlist, local-only wishlist, or automatic guest-to-customer
  wishlist merge.
- No frontend calculation of authoritative price, promotion, inventory,
  checkout, payment, or order truth.
- The approved service-assurance copy does not create shipping, warranty,
  installment, or support backend contracts. It remains presentational copy
  and must not influence checkout or payment decisions.

## Architecture and Ownership

The repository layout remains unchanged at the top level. Existing Storefront
features retain ownership of their routes and behavior.

```text
apps/storefront/src/
|-- app/                  router, shell, theme, composition
|-- features/catalog/     homepage, discovery, product detail, product UI
|-- features/wishlist/    authenticated wishlist state and page
|-- features/cart/        cart behavior and surfaces
|-- features/checkout/    checkout behavior and surfaces
|-- features/payment/     payment-return behavior and surfaces
|-- features/order/       customer order behavior and surfaces
`-- features/*            unchanged current feature owners

apps/api/src/modules/
|-- catalog/              public product truth and wishlist product reader
`-- customer/             customer-owned wishlist application and persistence
```

The frontend `wishlist` feature may consume reusable Catalog product UI only
through an intentional `features/catalog/index.ts` public entry. Catalog
product surfaces may consume wishlist state only through
`features/wishlist/index.ts`. No feature imports another feature's private
files.

The Customer application layer consumes a focused Catalog public reader
exported from `modules/catalog/index.ts`. Customer does not import Catalog
repositories, entities, or infrastructure.

```text
Wishlist React feature
  -> authenticated Storefront API
  -> Customer Wishlist application service
  -> Customer Wishlist repository -> PostgreSQL
  -> Catalog public wishlist reader -> published public product DTOs
```

## Shared Shell and Visual System

### Header

The shared shell uses two desktop rows:

1. NovaCommerce brand, large product search, account/sign-in, wishlist, theme,
   and cart actions.
2. Home, Products, Categories, and Discover navigation with a clear active
   state.

Search continues to submit URL-backed Catalog filters. Cart count continues to
come from `CartProvider`. Wishlist count comes from the authenticated wishlist
response. The header may be sticky but cannot cover anchored content or break
keyboard navigation.

### Themes

Dark mode uses a navy-black canvas, deep blue panels, crisp blue borders,
lavender/cyan action emphasis, and bounded glow around active controls, hero
edges, and focus states. Light mode retains identical structure using white
and cool-gray surfaces, blue-gray borders, restrained shadows, and the same
semantic action hierarchy.

The existing `novacommerce-theme` storage contract remains intact. Theme
styles use semantic CSS tokens rather than component-local hard-coded colors.
The implementation must update `docs/design/linear-product-canvas.md` with the
approved Storefront-specific dark-tech direction; Console rules remain
unchanged.

### Reusable UI

Buttons, icon buttons, inputs, select controls, badges, cards, state panels,
section headings, price displays, and focus treatments share one semantic
visual vocabulary. A new UI abstraction is created only where at least two
current Storefront consumers need identical behavior.

## Homepage Composition

The homepage follows the approved desktop hierarchy:

```text
+----------------+----------------------------+----------------+
| Category rail  | Dynamic product hero       | Service copy   |
|                | carousel, CTA, live price  | panel          |
+----------------+----------------------------+----------------+
| Dynamic category promotion cards                              |
+---------------------------------------------------------------+
| Featured | Best selling | Newest product rail                 |
+---------------------------------------------------------------+
| Brand/service metric strip                                    |
+---------------------------------------------------------------+
```

- Categories come from the public Catalog category endpoint.
- Hero slides come from the current public hero endpoint and rotate only when
  motion preferences and focus/hover state allow it.
- Category promotion cards use real category products and media.
- Product tabs use existing `best_selling`, `newest`, and `on_sale` query
  contracts.
- Each region owns its loading, empty, and error state. One failed query cannot
  blank the entire homepage.
- Product cards show real product media, published price, availability,
  backend-supported discount evidence, wishlist action, and add-to-cart
  action.
- The service panel displays the approved copy: free shipping, official
  warranty, zero-percent installment, and 24/7 support. This copy remains
  presentation-only.

## Customer Route Redesign

- Product discovery, search, and category routes use a dense category/filter
  sidebar, compact toolbar, product grid, and pagination.
- Product detail uses a prominent gallery plus product information, variant,
  stock, quantity, wishlist, and cart actions. It includes the approved service
  assurance panel.
- Sign-in uses dynamic product media and the existing Google sign-in contract.
- Account and address routes become a coherent customer dashboard with links
  to profile, addresses, wishlist, and orders.
- Wishlist uses the public Catalog product-card contract and supports remove
  and add-to-cart for currently purchasable products.
- Cart retains authoritative cart state, quantity updates, availability
  warnings, and resolution behavior in a dense list-plus-summary layout.
- Checkout retains address selection, promotion input, backend review, and a
  sticky authoritative summary.
- Payment return continues to poll backend payment/order truth. A browser
  redirect never confirms payment.
- Order list and detail retain customer ownership, immutable totals, legal
  states, and order history in compact operational layouts.

## Wishlist Contract

### Persistence

The Customer migration adds:

```text
customer_wishlist_items
- customer_id UUID NOT NULL
- product_id UUID NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- PRIMARY KEY (customer_id, product_id)
```

The table references Customer and Catalog product records with deletion
behavior that removes wishlist rows when the owning customer or product is
deleted. Both foreign keys use `ON DELETE CASCADE`. Migration and rollback
follow the existing Customer migration family and global dependency order.

### API

```text
GET    /v1/storefront/account/wishlist?page=1&pageSize=24
PUT    /v1/storefront/account/wishlist/items/:productId
DELETE /v1/storefront/account/wishlist/items/:productId
```

- Every route requires an active customer session.
- Mutations require the existing Storefront origin and CSRF protections.
- Repeated add and repeated remove requests are idempotent.
- The composite primary key resolves concurrent duplicate adds.
- Add validates the product through the public Catalog reader and returns 404
  for a product that is absent or not publicly eligible.
- List returns only currently published public product DTOs with pagination
  metadata. Results use newest-wishlist-item first ordering with product ID as
  the stable tiebreaker. `page` defaults to 1, `pageSize` defaults to 24, and
  `pageSize` is capped at 48. It does not expose unpublished product details.
- Add and remove responses return the exact `productId` and a server-confirmed
  `wished` boolean. List returns the normal success envelope with product DTOs
  in `data` and `page`, `pageSize`, `totalItems`, and `totalPages` in `meta`.
- Header count reflects currently public wishlist results.
- An unauthenticated heart action routes to sign-in with a validated local
  return URL; it never accepts an arbitrary external redirect.

Wishlist mutations wait for server confirmation. The initiating control is
disabled while its request is in flight, and a failure leaves the last
server-confirmed state visible.

## Public Pricing Evidence

The public variant price DTO remains backward compatible and adds:

```text
price: {
  amountMinor: number
  currency: "VND"
  previousAmountMinor?: number
  discountPercentage?: number
}
```

Catalog derives optional fields from valid product price history for the same
variant. The comparable prior price is the most recent earlier price record
before the current valid price. Catalog emits the fields only when that prior
amount is greater than the current amount. `discountPercentage` is the integer
percentage rounded down from `(previous - current) * 100 / previous` using
overflow-safe backend arithmetic. Storefront code formats these values but
never invents a prior price or discount.

Checkout Promotion remains a separate backend-authoritative concept. A
promotion code is not represented as a catalog markdown.

## Responsive Behavior

The desktop information order remains consistent at every viewport. At narrow
widths, fixed desktop columns become bounded horizontal rails or controlled
single-column regions without changing their semantic order. Category,
promotion, and product rails may use scroll snap. The page itself must not have
horizontal overflow.

Acceptance viewports are 390x844, 768x1024, and 1440x900. Text cannot overlap
controls, fixed actions must remain reachable, and touch targets must remain
usable even though the visual density follows the desktop reference.

## Accessibility and Motion

- Preserve skip navigation and semantic header, navigation, main, section,
  aside, and footer landmarks.
- Every icon-only action has an accessible name and a visible keyboard focus
  state.
- Hero controls expose previous, next, selected slide, and pause conditions.
- Rotation pauses on hover and focus, stops when the document is hidden, and
  respects reduced-motion preference.
- Loading uses status semantics; request failures use alert semantics; empty
  states provide a useful next action.
- Dark and light themes must meet readable contrast for text, controls,
  borders, badges, and focus indicators.

## Failure and Security Behavior

- Hero, category promotions, and product rails fail independently.
- Broken or absent media uses a bounded fallback with truthful alt text.
- Expired customer sessions route protected pages to sign-in and preserve only
  a safe same-origin return path.
- Wishlist errors stay within the wishlist control or page and do not corrupt
  Catalog or Cart state.
- Product publication, price, inventory, promotion, checkout, payment, and
  order authorization remain backend enforced.
- The redesign does not log customer session cookies, CSRF tokens, customer
  PII, or payment evidence.

## Performance and Dependency Cleanup

Hero media loads eagerly; non-hero product media loads lazily with stable
dimensions. Homepage queries run in parallel with bounded page sizes. No UI
framework or carousel dependency is added.

After the new homepage passes replacement tests and browser acceptance, remove
the obsolete Three.js homepage implementation, GLB assets, `three`,
`@react-three/fiber`, and `@types/three`. Update the lockfile and
`docs/dependencies.md` in the same implementation unit. Do not retain an unused
parallel homepage path.

## Testing Strategy

Implementation follows red-green-refactor in focused vertical slices.

Backend coverage includes:

- Customer migration up/down lifecycle and constraints.
- Wishlist application rules and purpose-specific DTO mapping.
- PostgreSQL repository idempotency, ownership, pagination, and concurrent
  duplicate adds.
- API authentication, origin, CSRF, invalid IDs, unpublished products,
  repeated mutations, and zero cross-customer leakage.
- Catalog previous-price and discount derivation, including no-discount and
  mismatched-variant cases.

Frontend coverage includes:

- Shared shell navigation, search, counts, sign-in state, and theme persistence.
- Homepage loading, partial failure, empty, success, carousel, reduced motion,
  dynamic category, and dynamic product states.
- Product-card and product-detail wishlist behavior.
- Sign-in redirect and safe return URL handling.
- Wishlist list, pagination, remove, add-to-cart, unavailable product, and
  request-failure behavior.
- Existing account, address, cart, checkout, payment, and order observable
  behavior under the redesigned markup.
- Storefront production build and dark/light browser acceptance at all three
  supported viewport sizes with no document overflow.

Before handoff run the focused API and Storefront suites, PostgreSQL integration
tests for the changed modules, Storefront typecheck/build, Storefront browser
acceptance, `git diff --check`, `pnpm audit:repo`, and the broad source gate
appropriate to the final cross-service diff. Report any credential-owned or
external acceptance that remains intentionally unavailable.

## Documentation and Change Discipline

The implementation must update:

- `CHANGELOG.md` under `[Unreleased]`.
- `docs/design/linear-product-canvas.md` for the approved Storefront visual
  direction.
- `docs/api/customer.md` for the wishlist contract.
- Catalog API documentation for public price-history evidence.
- `docs/project-structure.md` for the implemented frontend wishlist feature and
  Customer wishlist capability.
- `docs/dependencies.md` when 3D dependencies are removed.
- Build/browser documentation only if validation commands or requirements
  change.

Every new license-capable file carries an Apache-2.0 SPDX header. Commits remain
atomic and Conventional Commits.

## Acceptance Criteria

- Every current Storefront route renders in the approved NovaCommerce
  dark-tech visual system in dark and light themes.
- Homepage structure visibly matches the approved reference: category rail,
  dynamic hero, four service assurances, category promotions, product tabs,
  compact cards, and brand/service strip.
- Homepage contains no active 3D canvas, scene navigation, GLB dependency, or
  unused parallel experience.
- All displayed product media, names, published prices, discount evidence,
  availability, categories, and product rankings come from backend contracts.
- An authenticated customer can add, list, remove, and revisit wishlist items;
  another customer sees zero of those records.
- An unauthenticated wishlist action reaches sign-in and can return only to a
  safe local Storefront path.
- Cart, checkout, payment, and order invariants remain unchanged and backend
  authoritative.
- Dark and light Storefront surfaces pass keyboard, focus, loading/error state,
  and responsive overflow checks at 390x844, 768x1024, and 1440x900.
- Focused, integration, browser, repository-audit, and source validation gates
  required by the implemented diff pass before handoff.
