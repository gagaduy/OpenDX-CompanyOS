<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# NovaCommerce Commerce Platform Master Design

## Status

- Date: 2026-08-04
- State: Approved master design
- Product name: DX-OS
- Configured company: NovaCommerce
- Commerce model: B2C single-store
- Delivery strategy: vertical slices in a modular monolith

This document supersedes the generic MVP direction in
`2026-07-30-master-roadmap-design.md`. The completed repository foundation and
Company Operating Core remain valid. The next delivery objective is a working
commerce platform; Workflow, Digital Employees, and GraphRAG follow only after
the commerce foundation is stable.

## Product Outcome

DX-OS will operate NovaCommerce as a real B2C commerce business through two
product surfaces:

1. A public storefront where customers discover products, manage a cart,
   check out, pay, and view their account and orders.
2. A governed backoffice console where staff manage catalog, inventory,
   customers, orders, payment operations, support work, and business metrics.

The system remains Company-first and single-company. NovaCommerce is implicit;
there is no Company ID, company selector, or multi-tenant routing.

## Approved Product Decisions

- Sell physical goods only.
- Use one inventory location.
- Support guest checkout and optional customer accounts.
- Build an Operational CRM, not marketing automation.
- Use Keycloak for staff and future Digital Employee identities.
- Keep customer authentication in the Commerce boundary.
- Build `apps/storefront` separately from the staff-facing `apps/console`.
- Use PostgreSQL as the commerce foundation's only operational relational
  database and source of truth.
- Provide a root `Makefile` as the contributor-facing command interface while
  keeping pnpm, Python, and Docker Compose scripts independently runnable.
- Use SePay Payment Gateway for checkout.
- Use SePay sandbox in local development and production credentials only on a
  hosted HTTPS deployment.
- Store prices and financial snapshots in VND minor units as integers.
- Treat displayed prices as tax-inclusive while retaining tax snapshot fields.
- Do not issue electronic invoices in the commerce foundation.
- Do not integrate a shipping provider.
- Do not implement refunds.
- Deliver commerce before Workflow, Digital Employees, or GraphRAG.

## Scope Boundaries

### Commerce Foundation Includes

- Staff authentication through Keycloak and backend authorization.
- Customer guest identity and optional registered account.
- Product catalog, categories, variants, SKU, media, price, and publication.
- One-location inventory, reservation, release, and stock movements.
- Product discovery, search, filter, product detail, cart, and checkout.
- Promotion codes with deterministic eligibility and discount calculations.
- Order creation and an explicit order state machine.
- SePay checkout signing, redirects, authenticated IPN processing, and payment
  reconciliation.
- Catalog, inventory, customer, order, payment, support, and dashboard views in
  the backoffice console.
- Customer 360 profiles, notes, segments, follow-up tasks, support tickets, and
  an interaction timeline.
- Audit events for sensitive staff actions and every payment transition.
- Docker-based local development and a documented path to hosted production.

### Explicit Non-Goals

- Marketplace sellers, commissions, payouts, or disputes.
- Multiple warehouses or automatic warehouse allocation.
- Shipping quotes, carrier accounts, labels, tracking webhooks, or fulfillment
  provider integration.
- Refunds, partial refunds, returns, or exchanges.
- Electronic invoice provider integration.
- Subscription, recurring billing, digital goods, or license delivery.
- Marketing automation, email campaigns, lead scoring, or attribution.
- Multiple currencies; the commerce currency is VND.
- Workflow Builder, Digital Employee execution, GraphRAG, or AI-generated
  operational decisions in the commerce foundation.
- Native mobile applications.

After a payment is confirmed, the foundation allows staff to move an order
through internal processing states. It does not claim that delivery, return, or
refund happened outside DX-OS.

## User Roles

### Public Users

- Guest customer: browse, maintain a guest cart, check out, and pay.
- Registered customer: guest capabilities plus address book and order history.

### Staff Roles

- Administrator: configuration and staff access management.
- Catalog Manager: products, categories, variants, media, and prices.
- Inventory Operator: on-hand stock, reservations, and stock adjustments.
- Sales Operator: orders and customer service coordination.
- CRM Operator: customer profiles, notes, segments, and follow-up tasks.
- Support Operator: tickets and customer interaction timeline.
- Finance Operator: payment review and reconciliation.
- Executive Viewer: read-only dashboard access.

Keycloak authenticates staff. DX-OS owns business authorization, resource
scope, approval rules, and audit. A Keycloak role alone never authorizes a
financial or inventory mutation.

## Product Surfaces

### `apps/storefront`

- Home and category discovery.
- Search and filters.
- Product detail and variant selection.
- Cart.
- Guest/customer checkout.
- SePay redirect result pages.
- Customer registration, login, profile, addresses, and order history.

The storefront contains presentation and customer interaction logic. Pricing,
inventory availability, promotion eligibility, order totals, and payment state
are always authoritative on the backend.

### `apps/console`

- Commerce dashboard.
- Catalog workspace.
- Inventory workspace.
- Order operations.
- Payment operations and reconciliation.
- Customer 360 and CRM workspace.
- Support tickets and interaction timeline.
- Staff administration appropriate to the current phase.

The console may hide unavailable actions for usability, but backend policy is
the enforcement boundary.

## Backend Bounded Contexts

The Express modular monolith grows by business ownership:

```text
apps/api/src/modules/
|-- company-operating-core/  existing organization and governance baseline
|-- identity/                staff claims and customer authentication boundary
|-- catalog/                 products, categories, variants, media, prices
|-- inventory/               one-location stock and reservations
|-- customer/                profiles, accounts, addresses, consent
|-- cart/                    guest/customer carts and cart items
|-- promotion/               codes, eligibility, deterministic discounts
|-- checkout/                checkout orchestration and immutable totals
|-- order/                   orders, lines, status transitions
|-- payment/                 provider-neutral payments and SePay adapter
|-- crm/                     segments, notes, follow-ups, interaction timeline
|-- support/                 tickets and complaint handling
|-- reporting/               read models and dashboard metrics
`-- audit/                   actor and mutation audit contracts
```

Directories are created only with the first approved implementation file. No
empty module tree is added from this target map.

## Dependency and Ownership Rules

- Each context follows the existing domain, application, infrastructure,
  presentation, and composition-root direction.
- A context never imports another context's repository implementation.
- Cross-context writes use focused application contracts or business events.
- Shared packages contain only proven cross-context primitives such as Money,
  pagination, identifiers, and API envelopes.
- PostgreSQL models and migration code remain infrastructure concerns.
- Provider payloads are mapped at the payment infrastructure boundary and do
  not become Order or Payment domain entities.
- Reporting reads source-of-truth tables or maintained projections; reporting
  never owns order, payment, inventory, or customer truth.

## Core Data Model

### Catalog

- `Product`: product identity, title, description, publication state.
- `Category`: hierarchical storefront grouping.
- `ProductVariant`: purchasable option combination.
- `Sku`: immutable business stock code per variant.
- `ProductMedia`: object-storage reference and display metadata.
- `Price`: VND amount and effective publication state.

### Inventory

- `InventoryItem`: one record per SKU at the configured location.
- `InventoryReservation`: quantity held for a checkout/order with expiry.
- `StockMovement`: append-only adjustment, reservation, release, sale, or
  correction record.

The invariant is:

```text
available = on_hand - reserved
available >= 0
```

Reservation and order creation execute transactionally to prevent overselling.

### Customer and CRM

- `CustomerProfile`: canonical CRM identity.
- `CustomerAccount`: optional credential identity linked to one profile.
- `GuestIdentity`: opaque, expiring browser/session identity.
- `CustomerAddress`: versioned customer-owned address.
- `CustomerNote`, `CustomerSegment`, `FollowUpTask`.
- `InteractionEvent`: append-only order, payment, note, and support timeline.
- `SupportTicket` and `TicketMessage`.

Guest checkout creates or links a customer profile by verified contact data
without forcing account creation. Account registration can claim an eligible
guest profile through a verified flow; it cannot merge profiles silently.

### Cart and Checkout

- `Cart` and `CartItem` reference product variants, not mutable product names.
- Cart display totals are estimates and are recalculated by the backend.
- `CheckoutSession` stores the validated customer/address/cart snapshot and
  expires.
- `PromotionRedemption` records promotion use independently of cart display.

### Order and Payment

- `Order` owns customer, address, price, discount, tax, and total snapshots.
- `OrderLine` owns SKU, product title, variant, quantity, and unit price
  snapshots.
- `Payment` is provider-neutral and belongs to one order.
- `PaymentAttempt` records each provider initiation and external reference.
- `PaymentEvent` stores normalized provider notifications and processing state.
- `PaymentReconciliation` records comparisons between internal and provider
  state.

No order total is reconstructed from current catalog prices after order
creation.

## State Machines

### Order

```text
pending_payment
→ paid
→ processing
→ ready_for_fulfillment
→ completed

pending_payment → canceled
```

There is no `refunded`, `returned`, or carrier-delivery state in this scope.
Once paid, cancellation is unavailable until a separately approved financial
adjustment design exists.

### Payment

```text
created
→ pending_provider
→ paid

created | pending_provider → failed | canceled | expired
```

Only authenticated SePay IPN processing or a successful reconciliation can set
`paid`. Browser redirect success pages are never payment proof.

### Inventory Reservation

```text
active → consumed
active → released
active → expired
```

Reservations use an explicit expiry and an idempotent release path.

## Critical Commerce Flows

### Product-to-Cart

```text
Published product
→ customer selects variant
→ API validates SKU and availability
→ cart item added
→ backend returns recalculated cart
```

### Guest Checkout-to-Paid Order

```text
Guest/customer cart
→ validate customer and address
→ recalculate catalog prices and promotion
→ reserve inventory in PostgreSQL transaction
→ create immutable pending order
→ create payment attempt and unique invoice number
→ server signs SePay checkout fields
→ browser posts/redirects to SePay
→ SePay sends authenticated IPN
→ store raw event once and normalize it
→ verify order reference, currency, and amount
→ mark payment and order paid transactionally
→ consume reservation
→ append interaction and audit events
```

### Payment Recovery

```text
Pending payment exceeds threshold
→ query SePay order detail through adapter
→ compare provider amount/status/reference
→ record reconciliation result
→ apply the same idempotent transition used by IPN
→ alert Finance on mismatch
```

### Customer Support

```text
Ticket created
→ linked to customer and optional order
→ Support updates status/messages
→ CRM timeline receives interaction events
→ follow-up task created when needed
→ ticket resolved with audit history
```

## SePay Payment Boundary

The payment context exposes a provider-neutral port. The SePay adapter owns
provider field ordering, HMAC signing, Basic Authentication, endpoint
selection, request/response mapping, timeouts, and redacted structured logs.

Official SePay references used by this design:

- Production API: `https://pgapi.sepay.vn`.
- Sandbox API: `https://pgapi-sandbox.sepay.vn`.
- One-time checkout initialization: `/v1/checkout/init`.
- Currency: VND.
- Payment invoice number: unique per payment order.
- IPN: public HTTPS endpoint with optional `X-Secret-Key` authentication.
- The commerce foundation handles `ORDER_PAID`. Other provider event types are
  authenticated, recorded, acknowledged idempotently, and routed to Finance
  review without applying an unsupported financial transition.

References:

- https://developer.sepay.vn/vi/cong-thanh-toan/API/tong-quan
- https://developer.sepay.vn/vi/cong-thanh-toan/API/don-hang/form-thanh-toan
- https://developer.sepay.vn/vi/cong-thanh-toan/IPN

Required controls:

- Credentials are injected through secret references and never returned to a
  frontend.
- Local uses sandbox credentials; production credentials require hosted HTTPS.
- Each payment initiation has an idempotency key and unique invoice number.
- IPN authentication is verified before parsing business fields.
- Raw IPN events are deduplicated by provider event/transaction/reference data.
- Amount, VND currency, invoice number, and expected order are verified before
  applying `paid`.
- Duplicate and out-of-order IPNs return an acknowledged idempotent response.
- Provider timeouts do not automatically mark a payment failed.
- Logs redact credentials, signatures, full card details, and restricted
  customer data.
- Test fixtures come from documented payload contracts, not captured production
  customer data.

Refund and return behavior is absent. A provider void, reversal, or other
post-payment event cannot mutate an order or payment into a refund-like state;
it requires Finance review until a separate design is approved.

## API Conventions

- Public storefront endpoints live under `/v1/storefront`.
- Customer account endpoints live under `/v1/customer`.
- Staff endpoints live under `/v1/admin`.
- Provider callbacks live under `/v1/webhooks/sepay` and bypass browser CSRF
  only after provider authentication.
- Request DTOs and schemas are use-case specific.
- Collection endpoints are paginated from their first production use.
- Mutations support an idempotency key where retries can duplicate financial,
  inventory, or order effects.
- Error responses use stable error codes and never expose stack traces.
- API documentation is generated or maintained alongside each implemented
  vertical slice.

## Persistence and Transactions

- PostgreSQL is the operational source of truth.
- Caches, search indexes, graph projections, or analytics stores introduced in
  later designs are derived infrastructure and cannot replace PostgreSQL as the
  authority for commerce records.
- A migration tool selected in the first commerce phase owns versioned schema
  changes; application startup never silently mutates production schema.
- Monetary values use integer VND minor units and never floating point.
- Inventory reservation, pending-order creation, and payment transition use
  explicit database transactions.
- Optimistic versioning or row locks protect stock and state-machine updates.
- Outbox records are written in the same transaction as important business
  changes when later processing is asynchronous.
- Object media is stored in MinIO locally and an S3-compatible store on hosting.

## Identity and Security

- Staff authenticate through Keycloak OIDC.
- Customer guest sessions use opaque, rotated tokens stored in secure cookies.
- Registered customer authentication uses proven password/session libraries;
  DX-OS does not implement cryptographic primitives.
- Staff and customer sessions use separate audiences and middleware.
- Every admin mutation resolves actor, role, action, resource, and risk before
  the service executes.
- Payment and inventory actions always emit audit events.
- Rate limits protect login, registration, cart mutation, checkout initiation,
  promotion validation, and webhook endpoints.
- Personal data is minimized in logs and protected in exports.
- Secrets are absent from source, workflow JSON, browser bundles, and audit
  payloads.

## Reporting

The first dashboard includes metrics calculated by SQL/code:

- Gross paid revenue.
- Paid order count.
- Average order value.
- Checkout-to-paid conversion.
- Pending and failed payment counts.
- Product and SKU sales.
- On-hand, reserved, available, and low-stock counts.
- Customer count, repeat-customer count, and customer lifetime paid value.
- Open ticket and overdue follow-up counts.

Metrics define timezone, currency, payment status, and cancellation semantics.
No LLM calculates financial or operational metrics.

## Deployment Model

### Local First

Docker Compose remains the source development environment for PostgreSQL,
Keycloak, MinIO, applications, and supporting infrastructure. The supported
local workflow is full-container mode. SePay uses sandbox credentials locally.

The repository root exposes discoverable `make` targets for setup, validation,
development, Docker lifecycle, logs, migrations, seed/reset, and cleanup. The
`Makefile` delegates to documented repository commands; it does not hide
business logic or become the only supported way to operate the project.

Docker documentation must include:

- A service, image, port, dependency, health-check, and persistent-volume
  matrix.
- Environment-variable setup with safe local defaults and secret boundaries.
- Exact commands for build, start, stop, status, logs, migrations, seed, reset,
  backup, restore, and removal of local data.
- Full-container startup, shutdown, logs, rebuild, and health workflows.
- Readiness checks and expected healthy output.
- Troubleshooting for port conflicts, stale volumes, failed migrations,
  Keycloak bootstrap, PostgreSQL connectivity, and MinIO connectivity.
- A clear distinction between disposable local configuration and hosted
  production requirements.

### Hosted Production Later

The hosting profile must provide:

- Public HTTPS storefront, console, API, and SePay IPN URL.
- Production SePay endpoint and secret injection.
- Persistent PostgreSQL and object-storage volumes or managed equivalents.
- Automated database and media backup with tested restore.
- Health/readiness checks, structured logs, metrics, and alerts.
- Migration execution as a controlled deployment step.
- Separate production customer/staff cookie and origin settings.

The local and hosted profiles use the same application images and environment
contract. Production is not a different code path.

## Delivery Phases

### Phase 1: Repository Foundation — Complete

Monorepo, application shells, Docker baseline, validation, and open-source
governance.

### Phase 2: Company Operating Core — Complete

Single-company organization, goals, KPI, tasks, events, decisions, approvals,
and audit seed baseline.

### Phase 3: Commerce Product Foundation

Full-container local stack, PostgreSQL adapter and migrations, staff OIDC,
API/error conventions, root `Makefile`, general-merchandise catalog, variants,
SKU, VND prices, MinIO product media, audit, and Catalog console workspace.

### Phase 4: Inventory and Product Publication

One-location inventory, stock movements, reservations, product publication,
public product read contracts, and staff inventory workspace.

### Phase 5: Storefront, Customer, and Cart

Public storefront, product discovery, guest identity, optional customer
accounts, CRM profile baseline, cart, and address book.

### Phase 6: Checkout, Order, and SePay

Promotions, checkout snapshots, order state machine, inventory reservation,
SePay sandbox checkout/IPN/reconciliation, and payment/order operations.

### Phase 7: Operational CRM, Support, and Dashboard

Customer 360, segments, notes, follow-up tasks, support tickets, interaction
timeline, reporting read models, and commerce dashboard.

### Phase 8: Production Hardening and Hosting Readiness

Security and authorization matrix, concurrency and idempotency tests, backup and
restore, observability, accessibility, performance, production SePay readiness,
deterministic seed/reset, and deployment documentation.

### Post-Commerce Roadmap

Workflow/iPaaS, approvals beyond commerce policy, Digital Employees, skills,
GraphRAG, company memory, and AI-assisted operations require a new master design
after Phase 8. They are not implemented in parallel with commerce foundation.

## Testing Strategy

- Domain tests cover money, state machines, promotion eligibility, inventory
  invariants, and customer-profile linking.
- Repository contract tests run against in-memory fakes where useful and real
  PostgreSQL adapters for integration behavior.
- API tests cover validation, authorization, pagination, and stable response
  contracts.
- Payment contract tests cover official SePay sandbox-compatible fixtures,
  signing order, IPN authentication, duplicates, out-of-order events, amount
  mismatch, timeout, and reconciliation.
- Concurrency tests prove two checkouts cannot oversell one SKU.
- Storefront tests cover loading, empty, error, cart, checkout, and payment
  return states.
- Console tests cover role-restricted actions and operational workflows.
- End-to-end tests cover guest product-to-paid-order using a deterministic fake
  provider in CI and SePay sandbox in an explicit integration environment.
- Security tests cover staff/customer audience separation, credential leakage,
  unauthorized admin mutations, webhook authentication, and personal-data
  access.

## Master Acceptance Chain

The commerce foundation is complete only when all steps can be demonstrated:

1. Staff signs in through Keycloak and receives correct backoffice permissions.
2. Catalog Manager publishes a physical product with SKU, variant, media, and
   VND price.
3. Inventory Operator records stock at the single location.
4. Guest discovers the product through the public storefront.
5. Guest adds an available variant to a cart.
6. Checkout recalculates price, promotion, tax-inclusive snapshot, and stock.
7. The system transactionally reserves stock and creates a pending order.
8. The backend signs and initiates a SePay sandbox checkout.
9. An authenticated, valid IPN marks payment and order paid exactly once.
10. Inventory reservation is consumed without overselling.
11. CRM shows the customer profile, paid order, and interaction timeline.
12. Staff progresses the order to `ready_for_fulfillment` and `completed`.
13. Dashboard metrics include the paid order using deterministic definitions.
14. Audit records catalog, inventory, payment, order, CRM, and staff actions.
15. The same artifact can be configured for hosted HTTPS and SePay production
    without source changes.

## Documentation and Open-Source Requirements

- Every commerce module documents ownership and public contracts.
- Every new dependency is licensed, locked, justified, and listed in
  `docs/dependencies.md`.
- `.env.example` contains names and safe placeholders, never real credentials.
- Build-from-source documentation covers both frontends, API, AI runtime, and
  Docker services.
- The detailed implementation plan contains checklist tasks for the root
  `Makefile`, Docker Compose topology, health checks, volumes, environment
  contract, migrations, seed/reset, and contributor-facing Docker
  documentation.
- Every root `Makefile` target maps to a documented direct command so
  contributors can work without treating GNU Make as hidden infrastructure.
- API, migration, seed/reset, backup/restore, and payment setup documentation
  evolves with implementation.
- Every phase updates `CHANGELOG.md`, roadmap status, and validation evidence.
- Phase implementation starts only after its focused design spec and detailed
  checklist plan are approved.
