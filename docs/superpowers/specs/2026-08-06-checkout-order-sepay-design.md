<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Checkout, Order, and SePay Design

## Status

- Date: 2026-08-06
- State: Proposed focused design
- Master design: `2026-08-04-novacommerce-commerce-platform-design.md`
- Master plan: `../plans/2026-08-04-novacommerce-commerce-platform.md`
- Delivery phase: Phase 6

## Outcome

Phase 6 converts an authenticated NovaCommerce customer cart into a durable
order whose price, promotion, customer, address, product, and SKU facts no
longer depend on mutable Catalog or Customer records. Inventory is reserved in
the same PostgreSQL transaction that creates the pending order. A server-signed
SePay sandbox checkout starts payment, and only an authenticated provider event
or a successful provider reconciliation can mark the payment and order paid.

The same idempotent paid transition consumes inventory exactly once. Staff can
inspect orders, reconcile payments, and move paid orders through internal
processing to completion. Browser redirects only select the customer-facing
result screen; they never change financial state.

## Approved Decisions

- Require a valid Commerce customer session and owned address for checkout.
- Keep VND integer minor units as the only monetary representation in domain
  and persistence code. NovaCommerce prices are tax-inclusive; Phase 6 records
  this policy but does not separate a tax amount without an approved tax model.
- Allow at most one promotion code per order. Promotions never stack.
- Support order-level percentage and fixed-amount promotions with deterministic
  time, subtotal, total-usage, per-customer usage, and discount-cap rules.
- Recalculate every price, promotion, customer, address, publication, variant,
  and availability fact on the backend immediately before order creation.
- Use the existing 15-minute Inventory reservation TTL as the checkout payment
  window. Checkout sessions and their order reservation share the same expiry.
- Create the checkout snapshot, pending order, payment, first payment attempt,
  promotion redemption hold, and Inventory reservation in one PostgreSQL
  transaction.
- Use one provider-neutral payment application port. SePay field ordering,
  HMAC-SHA256 signing, Basic Auth, endpoints, payload mapping, timeouts, and
  redaction belong only to the SePay infrastructure adapter.
- Submit signed checkout fields from the browser to SePay. The backend returns
  an ordered field list and action URL; it never returns the secret key.
- Configure SePay IPN with `X-Secret-Key` authentication. Missing or invalid
  authentication fails before business payload processing.
- Persist an authenticated raw provider event before normalization. Deduplicate
  with provider event and transaction identifiers plus invoice number.
- Confirm paid only after invoice number, internal order, VND currency, amount,
  provider order state, and provider transaction state all match.
- Use SePay order-detail lookup for reconciliation. Reconciliation and IPN call
  the same exact-once paid transition.
- Keep provider timeout as unknown/pending. A timeout is not payment failure.
- Add `operations_manager` and `finance_operator` staff roles. Administrators
  retain access to both operational areas.
- Keep production credentials and real transactions disabled locally. Phase 6
  supports SePay sandbox locally; hosted HTTPS production readiness remains
  Phase 8.

## Official SePay Contract Baseline

This design was checked against the official SePay Payment Gateway
documentation on 2026-08-06:

- Sandbox checkout: `https://pay-sandbox.sepay.vn/v1/checkout/init`.
- Sandbox REST API: `https://pgapi-sandbox.sepay.vn`.
- Production checkout: `https://pay.sepay.vn/v1/checkout/init`.
- Production REST API: `https://pgapi.sepay.vn`.
- REST API authentication: Basic Auth using `merchant_id:secret_key`.
- Checkout signature: HMAC-SHA256 over the documented ordered field list, then
  Base64 encoding.
- `order_invoice_number` is unique and purchase amount is positive VND.
- IPN is an HTTP POST with JSON and, when configured, `X-Secret-Key`.
- `ORDER_PAID` carries order, transaction, and customer projections.
- IPN endpoints must be public HTTPS for provider delivery and acknowledge a
  successfully processed or already-processed event with HTTP 200.
- Provider order detail is available through
  `GET /v1/order/detail/{order_id}` and is used for reconciliation.

References:

- https://developer.sepay.vn/vi/cong-thanh-toan/sandbox
- https://developer.sepay.vn/vi/cong-thanh-toan/API/don-hang/form-thanh-toan
- https://developer.sepay.vn/vi/cong-thanh-toan/API/don-hang/chi-tiet-don-hang
- https://developer.sepay.vn/vi/cong-thanh-toan/IPN

The official examples are transport guidance, not the complete NovaCommerce
correctness model. NovaCommerce additionally requires idempotency, strict
amount/reference matching, transactionally consistent stock, audit, and
unsupported-event review.

## Scope

### Included

- Promotion definitions, deterministic evaluation, redemption holds, and
  committed redemptions.
- Authenticated checkout validation and immutable checkout snapshots.
- Transactional pending-order creation and one-location stock reservation.
- Order and payment state machines plus transition history.
- SePay sandbox checkout signing and ordered form-field generation.
- Authenticated, idempotent SePay IPN ingestion.
- Manual and due-payment reconciliation through SePay order detail.
- Reservation expiry and unpaid-order expiry coordination.
- Customer checkout, redirect-result, pending, paid, failed, canceled, expired,
  order-list, and order-detail states.
- Staff promotion API, order operations, payment review, and reconciliation.
- PostgreSQL migrations, deterministic fixtures, Docker configuration, health
  checks, contributor documentation, API documentation, and acceptance tests.

### Excluded

- Anonymous checkout.
- Shipping rates, carriers, labels, tracking, delivery states, or warehouse
  routing.
- Refunds, returns, exchanges, chargeback automation, capture reversal, or
  provider void commands.
- Electronic invoices or a separated VAT calculation model.
- Cash on delivery, subscriptions, installments, multiple currencies, multiple
  stores, multiple warehouses, or marketplace behavior.
- Marketing campaigns, automatic promotion recommendations, loyalty points,
  gift cards, or promotion stacking.
- Workflow, Temporal, Digital Employees, GraphRAG, CRM timeline projection, or
  dashboard aggregation. Phase 6 exposes stable records for Phase 7 consumers.

## Architecture

### Module Ownership

`promotion` owns promotion definitions, deterministic eligibility, discount
calculation, redemption holds, and usage commitment.

`checkout` owns checkout orchestration, server-side revalidation, immutable
checkout snapshots, idempotent order creation, and coordination of Promotion,
Cart, Customer, Catalog, Inventory, Order, and Payment public contracts.

`order` owns order snapshots, order state transitions, transition history,
customer order reads, and staff order operations.

`payment` owns provider-neutral payments, attempts, raw/normalized provider
events, reconciliation records, exact-once paid coordination, and the SePay
adapter. It does not own order totals or inventory rules.

Existing modules keep their authority:

- Customer proves the customer session and owns address data.
- Cart supplies the authenticated checkout-ready cart and remains unchanged
  after order creation except for an explicit successful checkout finalization.
- Catalog owns current product, variant, SKU, title, and VND price truth.
- Inventory owns stock locking, reservation, release, expiry, and consumption.

### Dependency Direction

```text
Storefront or Console intent
-> presentation validator/controller
-> owning application service
-> domain rules and public inward-facing ports
-> PostgreSQL or SePay infrastructure adapters
-> purpose-specific response DTO
```

Checkout imports other modules only through their public `index.ts` contracts.
No module imports another module's SQL, repository implementation, domain
entity, controller, or provider type.

### Atomic Cross-Module Work

The existing shared `TransactionRunner` remains the transaction boundary. Cart,
Customer, Promotion, Order, Payment, and Inventory expose narrowly scoped
application ports that can participate in an existing `DatabaseSession`.

Two transactions are correctness-critical:

1. Create checkout snapshot, order, lines, payment, attempt, promotion hold,
   audit records, and Inventory reservation.
2. Apply trusted paid evidence, mark event processed, mark payment/order paid,
   consume Inventory reservation, commit promotion redemption, and append audit
   records.

The Checkout or Payment service owns orchestration. Every participating module
still owns its writes and invariants. Checkout and Payment never issue SQL
against Inventory, Customer, Cart, or Promotion tables directly.

## Monetary and Promotion Rules

- Monetary values are safe non-negative integers in VND. Floating-point money
  is prohibited.
- `subtotal = sum(unit_price_vnd * quantity)` using current backend prices.
- A promotion is eligible only when active, inside its UTC validity window,
  above its minimum subtotal, below its total usage limit, and below its
  per-customer limit.
- Percentage discounts use integer basis points from 1 to 10,000 and round down
  to the nearest VND before applying an optional maximum discount.
- Fixed discounts are positive VND and cannot exceed the subtotal.
- Final discount is clamped to `[0, subtotal]`.
- `total = subtotal - discount` because tax is included and shipping is absent.
- A zero-total order is not supported in Phase 6; the resulting total must be
  at least 1 VND.
- Promotion codes are normalized with trim plus uppercase and are unique.
- A checkout stores the evaluated rule version and inputs. Later promotion
  edits cannot change an existing checkout or order.
- Promotion usage is held during an active pending payment and committed on
  paid. Expired/canceled unpaid orders release the hold. Concurrency is enforced
  with row locks and unique redemption constraints.

## Persistence Model

All IDs are UUIDs unless a provider supplies its own opaque identifier. All
timestamps are timezone-aware. No table contains `company_id`.

### Promotion

`promotions` stores code, name, type (`percentage` or `fixed_amount`), basis
points or fixed VND value, optional maximum discount, minimum subtotal, UTC
validity window, total and per-customer limits, status, version, and timestamps.

`promotion_redemptions` stores promotion, customer, checkout, order, discount
snapshot, state (`held`, `committed`, `released`), idempotency key, expiry, and
timestamps. A checkout/order can own at most one redemption.

### Checkout

`checkout_sessions` stores customer ID, source cart ID/version, address JSON
snapshot, customer contact snapshot, promotion code/version, subtotal,
discount, total, currency, tax mode, status, idempotency key, order ID, expiry,
and timestamps.

`checkout_session_lines` stores checkout ID, variant ID, SKU, product title,
variant label, quantity, unit price, line subtotal, and deterministic line
position. The rows are immutable after creation.

Checkout status is `created`, `order_created`, `completed`, `expired`, or
`canceled`. `created` is an internal transaction state and is not exposed
before commit.

### Order

`orders` stores public order number, customer ID, checkout ID, address and
contact snapshots, subtotal, discount, total, VND currency, tax mode, status,
reservation expiry, paid/completed timestamps, version, and timestamps.

`order_lines` stores immutable variant, SKU, product title, variant label,
quantity, unit price, discount allocation, and line total snapshots.

`order_status_history` stores prior/new state, actor type/ID, reason code,
correlation ID, and occurrence time. A unique transition idempotency key
prevents duplicate staff commands.

Public order numbers use `NVC-YYYYMMDD-XXXXXXXX`, generated server-side with a
random uppercase hexadecimal suffix and a database uniqueness constraint.

### Payment

`payments` stores order ID, provider (`sepay`), expected amount/currency,
status, active attempt ID, paid timestamp, version, and timestamps.

`payment_attempts` stores payment ID, unique provider invoice number, optional
provider order ID, method selection, state, idempotency key, checkout expiry,
and timestamps. Invoice numbers use `NVC-PAY-<UUID-without-dashes>` and remain
within the provider's documented constraints.

`payment_events` stores provider, authentication result, notification type,
provider event/order/transaction identifiers, invoice number, amount/currency,
redacted raw JSON, normalized state, processing result, failure reason,
correlation ID, received/processed timestamps, and a payload hash. Unique
constraints prevent replay by provider transaction and equivalent payload.

`payment_reconciliations` stores payment/attempt, trigger actor, provider order
ID, internal/provider status and amount, comparison result, redacted response
snapshot, correlation ID, and timestamps.

Provider secrets, checkout signatures, full card numbers, and authentication
credentials are never persisted in these tables.

## State Machines

### Checkout

```text
created -> order_created -> completed
order_created -> expired | canceled
```

### Order

```text
pending_payment -> paid -> processing -> ready_for_fulfillment -> completed
pending_payment -> canceled
pending_payment -> expired
```

Paid orders cannot be canceled in Phase 6. Every transition uses optimistic
versioning, an allow-list, actor authorization, and append-only history.

### Payment

```text
created -> pending_provider -> paid
created | pending_provider -> failed | canceled | expired
```

A browser return cannot apply any transition. Unsupported provider void,
reversal, or post-payment events are recorded as `review_required` and leave
the payment/order unchanged.

### Inventory Reservation

```text
active -> consumed
active -> released
active -> expired
```

The order ID is the reservation reference. A paid transition consumes active
reservations. Unpaid cancellation releases them. The existing expiry worker
expires due reservations; an order expiry worker converges the corresponding
pending order, payment, promotion hold, and checkout state idempotently.

## Critical Flows

### Checkout Creation

```text
authenticated customer intent + idempotency key
-> validate owned active address and checkout-ready cart
-> lock/re-read customer, cart, promotion, price, publication, and stock facts
-> calculate subtotal, discount, and total
-> create immutable checkout and order snapshots
-> reserve inventory with order reference
-> create payment and first SePay attempt
-> hold promotion usage when applicable
-> commit transaction
-> generate ordered signed SePay form fields
-> return order plus payment initiation DTO
```

Repeating the same idempotency key with the same canonical request returns the
same order and attempt. Reusing it with different address, cart version, or
promotion input returns an idempotency conflict.

### Trusted Paid Transition

```text
authenticated IPN or successful reconciliation
-> deduplicate evidence
-> lock payment, attempt, order, reservation, and promotion hold
-> verify invoice, provider IDs, VND, amount, and approved/captured status
-> mark payment and order paid
-> consume reservation
-> commit promotion redemption
-> mark checkout completed and cart checked out
-> append histories and audit
-> commit once
```

Duplicate evidence returns success with `already_processed` and creates no new
stock movement, state transition, redemption, or audit success effect.

### Reconciliation

```text
Finance command or due-payment worker
-> load pending attempt with provider order ID
-> query SePay order detail through provider port
-> persist redacted comparison
-> exact match and captured/approved -> trusted paid transition
-> pending/unknown -> no state change
-> mismatch or unsupported state -> review_required and Finance-visible alert
```

Automatic reconciliation is bounded, uses retry with backoff, and never retries
inside a long-running database transaction.

## API Contracts

### Customer Storefront

```text
POST /v1/storefront/checkouts
GET  /v1/storefront/checkouts/:checkoutId
POST /v1/storefront/checkouts/:checkoutId/payment-initiation

GET  /v1/storefront/orders
GET  /v1/storefront/orders/:orderId
```

Checkout creation requires the customer cookie, CSRF protection, allowed
origin, an `Idempotency-Key` header, `addressId`, and optional `promotionCode`.
The response returns the internal checkout/order projection and a payment form:

```json
{
  "actionUrl": "https://pay-sandbox.sepay.vn/v1/checkout/init",
  "method": "POST",
  "fields": [
    { "name": "order_amount", "value": "9990000" },
    { "name": "merchant", "value": "sandbox-merchant" },
    { "name": "currency", "value": "VND" },
    { "name": "operation", "value": "PURCHASE" },
    { "name": "signature", "value": "redacted-in-logs-only" }
  ]
}
```

The ordered list is submitted without sorting or mutation. API documentation
must warn that the returned signature is short-lived payment-initiation data,
not a reusable credential.

### Provider Callback

```text
POST /v1/webhooks/sepay
```

The route is outside customer/staff authentication and browser CSRF, but it
requires the configured provider authentication before payload parsing. It has
a strict body limit, JSON schema, request timeout, redacted logging, and stable
acknowledgement behavior.

- `401` for missing/invalid provider authentication.
- `400` for authenticated but structurally invalid payload.
- `200` for applied, duplicate, unsupported-recorded, or already-terminal
  events.
- `409` is not used for provider retries; authenticated mismatches are recorded
  and acknowledged after entering Finance review.
- `500` is returned only when durable processing did not commit, allowing
  SePay retry.

### Staff API

```text
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

Promotion writes require `administrator`. Order reads/transitions require
`administrator` or `operations_manager`. Payment reads/reconciliation require
`administrator` or `finance_operator`. All staff mutations are audited in the
same transaction as their state change.

## Frontend Experience

### Storefront

The Storefront adds feature-owned `checkout`, `order`, and `payment` areas. It
keeps the established responsive light/dark token system and theme preference.

- Checkout: address choice, contact snapshot, promotion entry, item/price
  review, expiry indicator, explicit final total, and submit state.
- Payment: browser form submission to SePay plus return pages for success,
  error, and cancel navigation outcomes.
- Pending result: polls the backend-owned order projection with bounded backoff
  and clearly distinguishes `Đang xác nhận thanh toán` from paid.
- Order history/detail: immutable lines, totals, status timeline, payment
  status, and internal fulfillment status without shipping claims.
- Every mutation has loading, disabled, retry, conflict, expired, and terminal
  states. A stale cart or price change sends the customer back to review.

### Console

The Console adds dense operational order and payment workspaces consistent with
the Linear product canvas:

- Orders: filterable table, detail panel, immutable snapshots, status history,
  and only the next authorized transition action.
- Payments: pending/mismatch/review filters, provider references, event history,
  reconciliation results, and an explicit reconcile command.
- No refund, void, return, shipping, or tracking control is rendered.

## Security and Data Handling

- Validate SePay environment, endpoints, merchant ID, secret key, IPN secret,
  public callback URLs, and timeout values at startup.
- Production mode rejects sandbox endpoints, HTTP callback URLs, absent secure
  cookies, or missing provider secrets. Development defaults to sandbox and may
  start without credentials, but checkout initiation returns a clear
  configuration error rather than using fake production behavior.
- Use constant-time comparison for IPN secret verification.
- Never log Authorization headers, secret keys, checkout signatures, cookies,
  raw customer addresses, or unmasked card data.
- Store a redacted/allow-listed provider event projection. Do not persist full
  raw card payloads merely because SePay sent them.
- Customer order reads always constrain by authenticated customer ID. An order
  UUID or public number alone grants nothing.
- Staff authorization is backend-enforced. Frontend role checks only improve
  navigation and control visibility.
- Correlation IDs connect checkout, order, payment, provider event,
  reconciliation, Inventory movement, and audit records.

## Docker and Contributor Operations

The full-container topology remains PostgreSQL, Keycloak, MinIO, API, Console,
and Storefront. SePay is an external sandbox and is not emulated as a container.

- Add Promotion -> Checkout -> Order -> Payment migrations after Cart while
  respecting foreign-key dependencies. Rollback uses exact reverse order.
- API readiness verifies every new migration table and validates that sandbox
  configuration is internally consistent without requiring external SePay
  network availability.
- `make up`, `make down`, `make db-migrate`, `make db-rollback`,
  `make db-backup`, and `make db-restore` remain the contributor interface.
- Seed/reset creates deterministic promotions and optional local pending/paid
  operational fixtures without storing SePay credentials or claiming that a
  fake fixture was provider-confirmed.
- Local real sandbox acceptance requires contributor-owned sandbox merchant
  credentials and a public HTTPS tunnel for IPN/callback delivery. This profile
  is opt-in and separate from `make check`.
- Backup/restore covers all new PostgreSQL records. Provider credentials remain
  environment secrets and are not part of a database backup.

## Testing Strategy

### Deterministic Gates

- Domain tests: money, promotion eligibility/rounding/limits, state machines,
  transition guards, invoice/order number constraints, and provider mapping.
- Application tests: idempotent checkout, stale cart/address, price change,
  promotion concurrency, amount mismatch, timeout, duplicate/out-of-order IPN,
  reconciliation convergence, unsupported events, and exact-once paid effects.
- Repository/integration tests: transaction rollback, row locks, unique keys,
  concurrent checkout against scarce stock, event replay, reservation expiry,
  and role/ownership isolation.
- Provider contract tests: official sandbox-compatible signing order, HMAC
  output, IPN headers/payload, order-detail mapping, Basic Auth, timeout, and
  redaction using synthetic data only.
- API tests: customer CSRF/session, staff roles, webhook authentication before
  business parsing, stable envelopes, and private record isolation.
- Frontend tests: checkout review, promotion results, redirect form ordering,
  pending polling, paid/expired/error states, order history, staff transitions,
  reconciliation, light/dark themes, and responsive behavior.

### Acceptance

1. Authenticated customer selects an owned address and checks out an available
   cart with a deterministic promotion.
2. PostgreSQL contains one immutable pending order, one payment attempt, one
   promotion hold, and one active reservation created atomically.
3. Browser posts only server-generated ordered fields to SePay sandbox.
4. Redirect alone leaves the order pending.
5. Authenticated matching IPN marks payment/order paid, consumes stock, and
   commits promotion once.
6. Replaying the IPN creates no duplicate state, stock, redemption, or audit
   effect.
7. A missed IPN is recovered by SePay order-detail reconciliation through the
   same paid transition.
8. Staff processes the paid order to `completed` without shipping behavior.
9. Invalid authentication, amount/currency/reference mismatch, expired stock,
   and concurrent checkout attempts fail closed with durable evidence.
10. `make check`, Storefront browser acceptance, Console responsive acceptance,
    backup/restore, migration rollback/reapply, and repository audit pass.

## Exit Gate

Phase 6 is complete only when an authenticated cart can become a paid order in
SePay sandbox; all price and stock facts are backend-authoritative; order,
payment, promotion, and Inventory effects converge exactly once under retries
and concurrency; staff can complete internal order processing; and the product
contains no shipping, refund, return, exchange, or electronic-invoice behavior.

