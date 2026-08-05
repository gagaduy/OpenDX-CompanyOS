<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Inventory and Product Publication Design

## Status

- Date: 2026-08-05
- State: Approved focused design
- Master design: `2026-08-04-novacommerce-commerce-platform-design.md`
- Master plan: `../plans/2026-08-04-novacommerce-commerce-platform.md`
- Delivery phase: Phase 4

## Outcome

Phase 4 gives authorized NovaCommerce staff an oversell-safe, one-location
inventory workspace and product-publication workflow. It also establishes the
public catalog contracts that Phase 5 will consume for a technology storefront.

Published products remain discoverable when they sell out. The backend exposes
their authoritative availability and rejects attempts to reserve unavailable
variants. Publication intent and current stock are therefore separate concerns.

## Approved Decisions

- NovaCommerce's customer-facing catalog specializes in general technology:
  laptops, phones, tablets, smart watches, computer components, and accessories.
- Inventory has exactly one implicit location. There is no warehouse selector,
  allocation strategy, transfer workflow, or location abstraction.
- PostgreSQL is the inventory and publication source of truth.
- Maintain an append-only stock-movement ledger plus a transactionally updated
  inventory balance for each SKU.
- Calculate `available = on_hand - reserved` and never permit a negative result.
- Protect reservations with PostgreSQL row locks and explicit transactions.
- Reservations expire 15 minutes after creation.
- A published product stays published when every variant is out of stock. Public
  reads return it as not purchasable instead of hiding it.
- Restocking a published variant makes it purchasable without republishing the
  product.
- Staff inventory mutations require a reason where applicable, backend
  authorization, actor identity, and audit.
- Phase 4 introduces no new runtime database, queue, scheduler dependency, or
  dependency-injection framework.

## Scope

### Included

- One inventory balance per active catalog SKU.
- Stock receiving and reasoned positive or negative adjustments.
- Append-only movement history.
- Reservation, release, expiry, and consumption use cases exposed through the
  Inventory module's public application contracts.
- Fifteen-minute reservation expiry with idempotent cleanup.
- Product publish and unpublish behavior.
- Public category, product-list, and product-detail read contracts.
- Backend-computed variant availability and purchasability.
- Inventory and publication staff-console workflows.
- Deterministic technology catalog, stock, publication, and movement seed data.
- PostgreSQL migrations with rollback and concurrency coverage.
- API, operations, architecture, roadmap, and contributor documentation needed
  by this phase.

### Excluded

- The customer-facing React storefront, guest identity, accounts, addresses, or
  carts; these begin in Phase 5.
- Checkout, order creation, promotions, SePay, or payment behavior; these begin
  in Phase 6.
- Multiple warehouses, stock transfers, bins, lots, serial-number tracking,
  suppliers, purchase orders, backorders, or preorder behavior.
- Shipping providers, refunds, returns, exchanges, and electronic invoices.
- Marketplace, multiple stores, multiple currencies, bundles, subscriptions,
  digital products, or marketing automation.
- Workflow, Temporal, Digital Employees, GraphRAG, and AI execution.

## Architecture

### Module Ownership

`apps/api/src/modules/inventory` owns stock balances, movements, reservations,
expiry, and the inward-facing ports later checkout code will consume. It follows
the existing feature-first Clean Architecture and exports only intentional
contracts through `index.ts`.

`apps/api/src/modules/catalog` continues to own categories, products, variants,
prices, media, and publication state. It adds publication use cases and public
read projections. Inventory and Catalog collaborate only through their public
application contracts; neither module imports another module's entities,
repositories, infrastructure, or presentation files.

`apps/console/src/features/inventory` owns the staff inventory workspace.
`apps/console/src/features/catalog` gains publication controls through its
existing public feature boundary. No existing modules or features are moved.

### Dependency Flow

```text
Admin or public route
-> authentication/authorization where required
-> validator
-> controller
-> application service interface
-> service implementation
-> inventory/catalog public port
-> PostgreSQL repository and transaction implementation
-> purpose-specific response mapper
```

Domain code imports no Express, React, PostgreSQL, environment, or transport
types. Application ports do not expose SQL rows or `pg` clients. The existing
shared PostgreSQL transaction boundary coordinates atomic work without moving
business rules into SQL triggers.

## Persistence Model

No Phase 4 table contains `company_id`, warehouse allocation fields, or
storefront presentation state.

### `inventory_items`

- `id`: UUID primary key.
- `variant_id`: unique required reference to one catalog variant.
- `on_hand`: non-negative integer quantity.
- `reserved`: non-negative integer quantity.
- `version`: optimistic concurrency integer for staff edits and projections.
- `created_at`, `updated_at`: timezone-aware timestamps.

Database checks require `on_hand >= 0`, `reserved >= 0`, and
`on_hand - reserved >= 0`. One row represents the configured location for one
SKU; no location table is introduced.

An inventory item is created atomically on the first receipt for an active
variant. Repeating that receipt with the same idempotency key cannot create a
second balance or apply the quantity twice. A variant without an inventory item
has zero availability and is not publication-ready.

### `inventory_reservations`

- `id`: UUID primary key.
- `reference_type`: stable owner type for current or future checkout/order use.
- `reference_id`: idempotent caller-owned reference.
- `variant_id`: required catalog variant reference.
- `quantity`: positive integer.
- `status`: `active`, `released`, `expired`, or `consumed`.
- `expires_at`: timezone-aware timestamp fixed at creation.
- `finalized_at`: nullable timezone-aware timestamp.
- `created_at`, `updated_at`: timezone-aware timestamps.

A unique constraint over the caller reference and variant prevents a retry from
holding the same units twice. An active reservation can transition exactly once
to `released`, `expired`, or `consumed`; finalized reservations never reactivate.

### `stock_movements`

- `id`: UUID primary key.
- `inventory_item_id`: required inventory balance reference.
- `reservation_id`: nullable reservation reference.
- `movement_type`: `receive`, `adjustment`, `reservation`, `release`, `expiry`,
  or `consume`.
- `on_hand_delta`, `reserved_delta`: signed integer deltas.
- `reason`: stable reason code plus optional bounded staff note.
- `actor_type`, `actor_id`: verified staff or system identity.
- `correlation_id`: originating request or job correlation ID.
- `occurred_at`: timezone-aware timestamp.

Rows are append-only. Corrections create a new reasoned adjustment rather than
editing or deleting history. Every balance-changing transaction writes the
movement that explains it.

### Catalog Publication

The existing product status adds `published` while retaining `draft` and
`archived`. Publication changes use the existing product optimistic `version`.
An archived product cannot be published. Unpublishing returns a published
product to `draft`; it does not delete catalog, inventory, or movement records.

## Domain Invariants and Use Cases

### Balance Invariants

```text
available = on_hand - reserved
on_hand >= 0
reserved >= 0
available >= 0
```

- Receive increases `on_hand` by a positive integer.
- Adjustment changes `on_hand` by a non-zero integer and requires a reason.
- A negative adjustment is rejected if it would make `on_hand < reserved`.
- Reservation increases `reserved` only when sufficient availability exists.
- Release or expiry decreases `reserved` without changing `on_hand`.
- Consume decreases both `on_hand` and `reserved` by the reserved quantity.
- Every command is atomic with its movement and required audit event.

### Reservation Transaction

```text
begin transaction
-> resolve active variant and inventory item
-> lock inventory item row for update
-> resolve idempotency/reference retry
-> expire applicable stale reservation state when required
-> verify available quantity
-> create active reservation with expires_at = database now + 15 minutes
-> increment reserved
-> append reservation movement
-> commit
```

Release, expiry, and consume lock the reservation and inventory rows in a
consistent order, verify the current state, update the balance, append one
movement, and finalize the reservation in one transaction. Repeating the same
finalization request returns the existing outcome without applying another
delta.

The expiry worker claims bounded batches using PostgreSQL row locking that
skips already claimed rows. This permits multiple API instances without double
release. The worker starts and stops with the API composition root, exposes
structured failures, and requires no separate scheduler service.

### Publication Policy

A product may be published only when all of these conditions hold:

- The product is not archived and its category is active.
- It has at least one active variant.
- Every active variant exposed publicly has a current positive VND price.
- It has exactly one primary image with accessible alt text.
- Every active variant has an inventory item, including zero-stock balances.

Positive stock is not a publication prerequisite. Public projections expose a
published product even when every variant has zero availability. A variant is
`purchasable` only when it is active, has a current price, and its authoritative
available quantity is positive.

## API Contract

### Staff Inventory Routes

```text
GET  /v1/admin/inventory/items
GET  /v1/admin/inventory/items/:inventoryItemId
POST /v1/admin/inventory/receipts
POST /v1/admin/inventory/items/:inventoryItemId/adjust
GET  /v1/admin/inventory/items/:inventoryItemId/movements
```

Inventory lists support `query`, `categoryId`, `stockStatus`, `page`, and
`pageSize`. They return SKU, product, variant, `onHand`, `reserved`, `available`,
status, and optimistic version. Movement lists are paginated from first use.
The receipt command identifies an active variant, uses an idempotency key, and
creates its inventory item during the first receipt when necessary.

### Staff Publication Routes

```text
POST /v1/admin/catalog/products/:productId/publish
POST /v1/admin/catalog/products/:productId/unpublish
```

Publish validates the full policy in the backend and returns a structured list
of missing requirements. Unpublish requires the current product version.

### Internal Inventory Contracts

The Inventory module public API exposes focused application ports for:

- Querying availability by variant.
- Reserving one or more variant quantities under a caller reference.
- Releasing, expiring, or consuming reservations idempotently.

These are application contracts, not HTTP routes in Phase 4. Phase 6 must use
them rather than importing Inventory repositories or SQL.

### Public Storefront Routes

```text
GET /v1/storefront/categories
GET /v1/storefront/products
GET /v1/storefront/products/:slug
```

Only published, non-archived products in active categories are returned. The
product list supports `query`, `category`, `stockStatus`, `page`, and `pageSize`.
Public DTOs include display catalog data, backend-mediated media URLs, current
VND prices, `availableQuantity`, and `purchasable`; they exclude admin versions,
movement history, audit metadata, storage keys, and unpublished records.

The existing response envelope, correlation behavior, page defaults, and
maximum page size remain unchanged. Public results are safe for anonymous use;
they do not require staff credentials.

### Stable Errors

- `INVENTORY_ITEM_NOT_FOUND`
- `INSUFFICIENT_STOCK`
- `INVALID_STOCK_ADJUSTMENT`
- `RESERVATION_NOT_FOUND`
- `RESERVATION_EXPIRED`
- `RESERVATION_ALREADY_FINALIZED`
- `PRODUCT_NOT_READY_FOR_PUBLICATION`
- `PRODUCT_NOT_PUBLISHED`
- Existing authentication, forbidden, validation, stale-version, dependency,
  and internal error codes remain applicable.

No response exposes SQL, stack traces, credentials, internal object keys, or
unrestricted request data.

## Authorization and Audit

- `administrator` may perform every Phase 4 action.
- `catalog_manager` may publish/unpublish eligible products and read inventory.
- A new `inventory_manager` staff role may read, receive, and adjust inventory
  and inspect movement history; it cannot mutate catalog definitions.
- Public storefront reads require no staff role.
- Reservation ports accept an authenticated application caller context; they
  cannot be reached through anonymous admin routes.

Backend middleware and application policy both protect staff mutations. The UI
may hide unavailable actions only as a usability aid. Receive, adjust, publish,
unpublish, reserve, release, expire, and consume produce audit events with actor,
action, resource, outcome, correlation ID, and timestamp. Audit metadata is
bounded and redacted.

## Console Experience

The console keeps the existing Linear-inspired dark operational canvas and
feature structure.

### Inventory Workspace

- Compact table with product image, product, variant, SKU, on-hand, reserved,
  available, and stock status.
- Search by product name or SKU and filter by category or stock status.
- Detail panel with current balances and paginated movement history.
- `Receive stock` and `Adjust stock` actions; adjustments require a reason.
- Status text and icons distinguish healthy, low, and out-of-stock states
  without relying only on color.

### Catalog Publication Controls

- Product states display as `Draft`, `Published`, or
  `Published · Out of stock`.
- Publication readiness lists missing category, variant, price, image, or
  inventory requirements.
- Publish is available only to authorized staff after readiness succeeds.
- Unpublish requires confirmation and never removes inventory.

Every surface implements stable loading, empty, validation, recoverable error,
permission-denied, and success states. Mobile layouts use compact stacked rows
instead of overlapping tables. Keyboard access, focus indicators, labels, and
status announcements are part of acceptance.

## Seed Data

The deterministic fresh-checkout seed establishes a technology storefront with
laptops, phones, tablets, smart watches, computer components, and accessories.
Fixtures cover multiple variants, VND prices, primary MinIO images, published
and draft products, healthy stock, low stock, reserved stock, and sold-out
published products.

Phase 4 may update repository-owned Phase 3 fixture records to this approved
technology assortment, but it must not delete or overwrite user-created catalog
data. Repeated seed runs converge on deterministic fixture values and never
duplicate balances, reservations, movements, publication events, or media.

## Docker and Operations

The long-running topology remains PostgreSQL, Keycloak, MinIO, API, and console.
No in-memory runtime database or new infrastructure service is added.

- The existing one-shot migration job applies Catalog then Inventory schema
  changes before API readiness succeeds.
- Migration rollback covers publication and all Inventory tables and indexes.
- The existing seed command adds catalog fixtures, balances, movements, and
  publication state in dependency order.
- API readiness includes the required Inventory migration level.
- Reservation expiry configuration is validated, defaults to the approved
  15-minute TTL, and cannot silently vary by frontend input.
- `make up`, migration, rollback, seed, backup, restore, check, logs, and
  volume-preserving shutdown behavior remain documented and operable.
- PostgreSQL backup and restore include Inventory and publication records.

## Error and Recovery Handling

- PostgreSQL unavailable: business traffic fails closed and readiness is false.
- Missing or stale migration: readiness is false; startup never changes schema.
- Concurrent insufficient reservations: at most the available units commit;
  losers receive `INSUFFICIENT_STOCK`.
- Duplicate reservation request: return the original reservation without
  applying another movement or balance delta.
- Expiry worker interruption: active expired rows remain recoverable on the next
  bounded scan.
- Negative or malformed staff adjustment: reject before persistence.
- Stale staff version: return `409 STALE_VERSION` and require refresh.
- Publication validation failure: preserve current state and return all missing
  readiness requirements.
- MinIO unavailable: public catalog metadata may remain readable, while media
  content follows the existing dependency/error contract.
- Unexpected failure: roll back the transaction, log redacted structured
  correlation context, and return the stable internal error envelope.

## Testing Strategy

### Domain and Application

- Balance arithmetic and non-negative invariants.
- Receive and reasoned adjustment rules.
- Reservation creation, 15-minute expiry, release, consume, and final-state
  idempotency.
- Publication readiness and sold-out published-product behavior.
- Authorization decisions and audit command construction.

### PostgreSQL and Concurrency

- Migration `up` and `down` on an isolated PostgreSQL database.
- Repository contracts, constraints, indexes, row mapping, and rollback.
- Atomic balance, movement, reservation, publication, and audit writes.
- Parallel reservation attempts against one SKU prove committed quantity never
  exceeds availability.
- Multiple expiry workers cannot release the same reservation twice.
- Idempotent seed, backup, and restore preserve explanatory movement history.

### HTTP and Security

- Staff authentication, role matrix, validation, pagination, correlation, and
  stable errors.
- Unauthorized inventory/publication mutations return no protected data and
  create no business mutation.
- Public endpoints expose only published product projections and safe fields.
- Sold-out published products remain visible with `purchasable: false`.
- Draft, archived, invalid-category, and unpublished products remain private.

### Console and End-to-End

- Inventory loading, empty, filters, details, movement, validation, error,
  permission, and success states.
- Publication readiness, publish, unpublish, sold-out, and responsive states.
- Keyboard and mobile/desktop inspection for high-value workflows.
- Clean-checkout stack startup, migration, seed, staff login, stock mutation,
  publication, public read, concurrent reservation proof, backup/restore, and
  full repository validation.

The final gate runs `git diff --check`, `pnpm audit:repo`, and `pnpm check` in
addition to focused PostgreSQL concurrency and Docker acceptance commands.

## Documentation Deliverables

- Inventory, reservation, availability, publication, and public catalog API
  documentation.
- Role and local Keycloak fixture documentation for `inventory_manager`.
- Migration, seed, expiry worker, backup, restore, and troubleshooting guidance.
- Docker topology, environment, health, and direct command documentation.
- Updated architecture, project structure, roadmap, acceptance evidence, and
  changelog.

## Acceptance Chain

Phase 4 is complete only when all steps pass from a clean checkout:

1. The documented full-container stack starts with PostgreSQL migrations
   applied and all required services healthy.
2. Deterministic seed creates the technology catalog, inventory balances,
   movement history, publication states, and staff fixtures once.
3. Inventory Manager signs in and sees SKU balances from PostgreSQL.
4. Inventory Manager receives stock and sees a matching movement and audit.
5. Invalid or unauthorized adjustment changes no balance.
6. Catalog Manager sees every missing publication requirement.
7. Catalog Manager completes and publishes an eligible product.
8. The anonymous public API exposes the published product, price, media, and
   authoritative availability but no admin-only fields.
9. Parallel reservation attempts cannot commit more units than are available.
10. Release and expiry return reserved units exactly once.
11. Consume reduces on-hand and reserved quantities exactly once.
12. A published sold-out product remains publicly visible and not purchasable.
13. Restocking that product makes it purchasable without republishing it.
14. Backup and restore preserve balances, reservations, movements, and
    publication state.
15. The full validation gate passes and shutdown preserves volumes.

## Master Roadmap Alignment

This focused design refines one Phase 4 master-plan rule: positive available
stock is no longer required to retain or expose a published product. Publication
still requires complete catalog data and an inventory record, while availability
determines whether each variant is purchasable. This user-approved change
supports discoverable sold-out technology products without weakening backend
stock enforcement or the no-oversell gate.

Phases 5 through 8 retain their approved order and boundaries. Phase 5 consumes
the public catalog contracts; Phase 6 consumes only the Inventory module's
public reservation ports.
