<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Commerce Product Foundation Design

## Status

- Date: 2026-08-05
- State: Written, pending user review
- Master design: `2026-08-04-novacommerce-commerce-platform-design.md`
- Master plan: `../plans/2026-08-04-novacommerce-commerce-platform.md`
- Delivery phase: Phase 3

## Outcome

Phase 3 delivers the first real NovaCommerce commerce capability: authorized
staff can run the full local platform in Docker, sign in, and manage a
PostgreSQL-backed general-merchandise product catalog with categories,
variants, SKU, VND prices, media, and audit history.

This phase establishes only the platform foundations required by that product
workflow. It does not persist or expand the generic Company Operating Core.

## Approved Decisions

- NovaCommerce is a general-merchandise B2C store.
- Initial catalog groups are Electronics and Accessories, Home and Living,
  Personal Care, and Sports and Outdoors.
- Use PostgreSQL as the commerce source of truth.
- Use `pg` as the PostgreSQL driver.
- Use `node-pg-migrate` for versioned `up` and `down` migrations.
- Keep all PostgreSQL details inside infrastructure adapters.
- Use JSONB for validated product attributes and variant option values; do not
  build an entity-attribute-value framework.
- Use Keycloak for staff authentication and roles.
- Run the complete local stack in Docker containers.
- Provide a small root `Makefile` with common project commands only.
- Store product media in MinIO through the backend; never expose storage
  credentials to the browser.
- Keep Company Overview as an unchanged secondary alpha surface. Do not migrate
  Company Core in-memory data in this phase.
- Product publication and inventory availability begin in Phase 4.

## Scope

### Included

- Root Docker and environment contract for PostgreSQL, Keycloak, MinIO, API,
  and console.
- Root `Makefile` for common lifecycle, validation, migration, seed, backup, and
  restore commands.
- PostgreSQL connection, transaction helper, migrations, and integration-test
  database workflow.
- Keycloak realm import, console OIDC login, backend JWT verification, and staff
  role authorization.
- Centralized API validation, correlation ID, response envelope, and error
  mapping.
- Liveness and dependency-aware readiness endpoints.
- Category management.
- Draft and archived product management.
- Variant and SKU management.
- Current and historical VND price management.
- Product image upload, ordering, primary-image selection, alt text, and
  deletion.
- Product mutation audit history.
- Deterministic general-merchandise seed data.
- Contributor-facing Docker, database, Keycloak, MinIO, and build docs.

### Excluded

- Inventory quantities, reservations, or stock movements.
- Product publication or public product APIs.
- Storefront, customer identity, cart, checkout, orders, or SePay.
- Promotions, CRM, support, reporting, or dashboard implementation.
- Shipping, refunds, returns, exchanges, or electronic invoices.
- Company Core PostgreSQL migration.
- Temporal, workflow, Digital Employees, GraphRAG, or AI runtime execution.
- Product bundles, subscriptions, digital products, multiple currencies,
  marketplace sellers, or category-specific EAV schemas.

## Users and Authorization

### Staff Roles

- `administrator`: all Phase 3 catalog and configuration actions.
- `catalog_manager`: category, product, variant, price, media, and catalog audit
  read actions.

No anonymous or customer-facing catalog mutation exists.

### Authentication Flow

The console uses OIDC Authorization Code with PKCE against the local Keycloak
realm. The browser client is public and holds no client secret. The API verifies
JWT signature through Keycloak JWKS and validates issuer, audience, expiry, and
required roles.

- Missing or invalid authentication returns `401 AUTHENTICATION_REQUIRED`.
- Authenticated actors without an allowed role return `403 FORBIDDEN`.
- Role checks run in backend middleware before the controller.
- Audit actor IDs come from the verified Keycloak subject claim.
- Local realm users and passwords are development fixtures and cannot be reused
  in hosted environments.

## Architecture

### Request Flow

```text
Route
-> authentication and authorization middleware
-> request validator
-> controller
-> service interface
-> service implementation
-> repository or object-storage port
-> PostgreSQL or MinIO implementation
-> mapper
-> response DTO
```

### Module Ownership

`apps/api/src/modules/catalog` owns category, product, variant, price, media,
and catalog audit use cases. The module follows the repository Clean
Architecture layout and exposes only its router and composition contract from
its public entry point.

Shared technical code is limited to:

- `apps/api/src/shared/config`: validated process configuration.
- `apps/api/src/shared/database`: PostgreSQL pool, transaction boundary, and
  migration/test helpers.
- `apps/api/src/shared/http`: response envelopes, correlation IDs, technical
  health routes, and centralized error middleware.
- `apps/api/src/shared/auth`: verified staff principal and role middleware.
- `apps/api/src/shared/object-storage`: an inward-facing object-storage port and
  MinIO adapter only if a second current module needs the abstraction;
  otherwise the port remains catalog-owned.

The domain imports no Express, `pg`, Keycloak, MinIO, environment, or transport
types. Application repository interfaces do not expose SQL rows or `pg`
clients. Infrastructure maps rows to domain models and domain models to SQL
parameters.

### Transactions

The shared database boundary provides explicit transaction execution. A
service requests a transaction through an inward-facing unit-of-work contract;
it does not call `BEGIN`, `COMMIT`, or `ROLLBACK` directly.

Price replacement closes the current price and creates the new current price
in one transaction. Category/product/variant mutations and their audit event
are committed atomically.

MinIO and PostgreSQL cannot share one transaction. Media upload follows this
compensation sequence:

```text
validate metadata and file
-> write object with generated key
-> insert media row and audit in PostgreSQL
-> remove the object if the database transaction fails
```

Media deletion first marks/removes the database record transactionally and
then deletes the object idempotently. A failed object deletion is logged with a
correlation ID and remains retryable without restoring a visible media record.

## Persistence Model

No Phase 3 commerce table contains `company_id` or `companyId`.

### `categories`

- `id`: UUID primary key.
- `parent_id`: nullable self-reference.
- `name`: non-empty display name.
- `slug`: normalized unique slug.
- `description`: optional text.
- `sort_order`: non-negative integer.
- `status`: `active` or `archived`.
- `created_at`, `updated_at`: timezone-aware timestamps.
- `version`: optimistic concurrency integer.

Application validation prevents category cycles. An archived category cannot
receive a new product. Archiving a category with non-archived products is
rejected.

### `products`

- `id`: UUID primary key.
- `category_id`: required category reference.
- `name`: non-empty display name.
- `slug`: normalized unique slug.
- `brand`: optional text.
- `description`: non-empty product description.
- `attributes`: JSONB object with string, number, boolean, or string-array
  values.
- `status`: `draft` or `archived`.
- `created_at`, `updated_at`: timezone-aware timestamps.
- `version`: optimistic concurrency integer.

An archived product cannot accept new variants, prices, or media. Restoring an
archived product is not part of Phase 3.

### `product_variants`

- `id`: UUID primary key.
- `product_id`: required product reference.
- `sku`: normalized globally unique SKU.
- `title`: human-readable variant title.
- `option_values`: JSONB object such as `{ "color": "Black", "size": "M" }`.
- `status`: `active` or `archived`.
- `created_at`, `updated_at`: timezone-aware timestamps.
- `version`: optimistic concurrency integer.

Every product has at least one active variant before Phase 4 can publish it.
SKU is compared case-insensitively after trim and uppercase normalization.

### `product_prices`

- `id`: UUID primary key.
- `variant_id`: required variant reference.
- `amount_minor`: positive PostgreSQL `bigint` in VND.
- `currency`: fixed `VND` check constraint.
- `tax_inclusive`: fixed `true` in this phase.
- `valid_from`: timezone-aware timestamp.
- `valid_to`: nullable timezone-aware timestamp.
- `created_by`: verified staff subject.

A partial unique index permits only one row with `valid_to IS NULL` per variant.
Infrastructure converts `bigint` text from `pg` to a JavaScript safe integer and
rejects values outside `Number.MAX_SAFE_INTEGER`. API responses expose
`amountMinor` as an integer number.

### `product_media`

- `id`: UUID primary key.
- `product_id`: required product reference.
- `object_key`: unique MinIO object key generated by the backend.
- `content_type`: allowlisted image MIME type.
- `byte_size`: positive integer within the configured upload limit.
- `alt_text`: required accessible description.
- `sort_order`: non-negative integer.
- `is_primary`: boolean.
- `created_at`: timezone-aware timestamp.

A partial unique index permits only one primary image per product. The backend
accepts JPEG, PNG, WebP, and AVIF images within the configured size limit. SVG
upload is excluded from this endpoint.

### `audit_events`

- `id`: UUID primary key.
- `actor_type`: `staff`.
- `actor_id`: verified Keycloak subject.
- `action`: stable catalog action name.
- `resource_type`, `resource_id`: affected category/product/variant/price/media.
- `outcome`: `success`, `failure`, or `denied`.
- `correlation_id`: request correlation ID.
- `metadata`: redacted JSONB details.
- `occurred_at`: timezone-aware timestamp.

Audit metadata never stores access tokens, passwords, MinIO credentials, raw
image contents, or unrestricted request bodies.

## API Contract

### Routes

```text
GET    /v1/admin/catalog/categories
POST   /v1/admin/catalog/categories
PATCH  /v1/admin/catalog/categories/:categoryId
POST   /v1/admin/catalog/categories/:categoryId/archive

GET    /v1/admin/catalog/products
POST   /v1/admin/catalog/products
GET    /v1/admin/catalog/products/:productId
PATCH  /v1/admin/catalog/products/:productId
POST   /v1/admin/catalog/products/:productId/archive

POST   /v1/admin/catalog/products/:productId/variants
PATCH  /v1/admin/catalog/products/:productId/variants/:variantId
POST   /v1/admin/catalog/products/:productId/variants/:variantId/archive
PUT    /v1/admin/catalog/products/:productId/variants/:variantId/price

POST   /v1/admin/catalog/products/:productId/media
PATCH  /v1/admin/catalog/products/:productId/media/:mediaId
DELETE /v1/admin/catalog/products/:productId/media/:mediaId

GET    /v1/admin/catalog/products/:productId/audit
```

List routes use page-based pagination from first use. Product list supports
`query`, `categoryId`, `status`, `page`, and `pageSize`; `page` defaults to `1`,
`pageSize` defaults to `20`, and `pageSize` cannot exceed `100`. Pagination meta
returns `page`, `pageSize`, `totalItems`, and `totalPages`.

### Success Envelope

```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {},
  "meta": {}
}
```

### Error Envelope

```json
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "errors": []
}
```

Stable Phase 3 error codes include authentication required, forbidden,
validation error, resource not found, conflict, stale version, unsupported
media type, media too large, dependency unavailable, and internal error.
Internal stack traces and infrastructure errors never enter API responses.

Optimistic updates require the current `version`. A stale update returns
`409 STALE_VERSION` instead of silently overwriting another staff edit.

## Console Experience

After Keycloak sign-in, the staff console exposes Catalog as the primary
commerce workspace:

- Product list with search, category/status filters, pagination, primary image,
  variant count, price range, and last update.
- Category list and editor.
- Product create/edit page.
- Variant and price editor.
- Media uploader, ordering, primary selection, preview, and alt-text editing.
- Product audit timeline.

Every page has explicit loading, empty, error, validation, permission-denied,
and success states. Compact operational layouts follow the approved
Linear-inspired design system. Familiar actions use Lucide icons with tooltips.
The product and its image are immediate visual signals; catalog UI is not a
marketing landing page.

The existing Company Overview remains secondary and unchanged. It does not
block or own the catalog workflow.

## Docker and Makefile

### Full-Container Local Topology

```text
console -> api -> postgres
               -> keycloak JWKS
               -> minio
```

Long-running Compose services are PostgreSQL, Keycloak, MinIO, API, and console.
A one-shot migration job uses the API image and must complete before API
startup. A one-shot MinIO bootstrap job creates the product-media bucket.
Temporal, AI runtime, and storefront are absent from the active Phase 3
topology.

- Images use reviewed version tags or immutable digests, never `latest`.
- PostgreSQL and MinIO use named persistent volumes.
- Keycloak imports a deterministic local realm.
- MinIO bootstraps the product-media bucket idempotently.
- API and console source are bind-mounted for containerized hot reload.
- Health checks cover every service.
- The one-shot migration job applies committed migrations; application startup
  never changes schema itself.
- API readiness fails when PostgreSQL, Keycloak metadata/JWKS, MinIO, or schema
  migration state is unavailable.
- `make down` preserves volumes.

### Root Make Targets

```text
make help
make up
make down
make logs
make check
make db-migrate
make db-rollback
make db-seed
make db-backup
make db-restore
```

`make up` builds the images, starts dependencies, completes the one-shot
migration and bucket-bootstrap jobs, and starts the API and console. Make
targets are thin, self-documenting delegates to direct Docker Compose, pnpm, or
database scripts. The docs show every direct equivalent. There is no
`make db-reset` in this phase.

Backup produces a timestamped PostgreSQL custom-format archive in a gitignored
local backup directory. Restore requires an explicit archive path, validates
that the file exists, and documents that current local database contents are
replaced.

## Configuration

The root `.env.example` documents safe local values for:

- PostgreSQL database, user, password, host, and port.
- API and console ports and allowed origins.
- Keycloak base URL, realm, API audience, console client ID, and local bootstrap
  administrator.
- MinIO endpoint, region, bucket, access key, secret key, and upload limit.
- Cookie and session settings required by the selected OIDC client flow.

Environment values are validated at startup. Missing or malformed required
values stop the affected service with a precise configuration error. Production
secrets and SePay credentials are not part of this phase.

## Seed Data

The idempotent local seed contains:

- Four approved top-level categories.
- Approximately twelve products distributed across those categories.
- Products with one to three variants and realistic normalized SKUs.
- Integer VND prices and tax-inclusive flags.
- Repository-owned, generated, or attribution-compatible product imagery.
- Alt text for every product image.
- Local Keycloak staff users for both approved roles.

Running the seed repeatedly updates deterministic fixtures or skips existing
fixtures; it never duplicates them. Seed data contains no production endpoint,
credential, personal data, or copyrighted asset copied without permission.

## Error and Failure Handling

- PostgreSQL unavailable at startup: API remains live but not ready and rejects
  business traffic with dependency unavailable.
- Migration mismatch: API is not ready; application startup does not mutate the
  schema silently.
- Keycloak unavailable: existing verified requests cannot bypass validation;
  new authentication/readiness fails closed.
- MinIO unavailable: non-media catalog operations remain available if their
  dependencies are healthy; media operations return dependency unavailable.
- Duplicate slug or SKU: return deterministic conflict without leaking SQL.
- Stale version: return conflict and require client refresh.
- Invalid or oversized media: reject before durable object creation.
- Object upload followed by database failure: perform idempotent compensation.
- Unexpected error: log structured correlation context, redact secrets, and
  return stable internal error.

## Testing Strategy

### Domain and Application

- Category hierarchy and archive rules.
- Product draft/archive transitions.
- Slug and SKU normalization.
- Product/variant attribute validation.
- Positive VND price and safe-integer conversion.
- Single current price replacement.
- Media ordering and primary-image invariants.
- Authorization policy and audit command construction.

### Infrastructure

- Migration up and down on an isolated PostgreSQL database.
- Repository contract tests against PostgreSQL.
- Unique, foreign-key, partial-index, and optimistic-version constraints.
- Atomic price replacement and audit write.
- MinIO upload, compensation, deletion, ordering, and credential isolation.
- Idempotent product/media and Keycloak seed/bootstrap.
- PostgreSQL backup and restore preserving catalog records.

### HTTP and Security

- Missing, malformed, expired, wrong-issuer, wrong-audience, and wrong-role JWT.
- Request validation and stable response/error envelopes.
- Correlation ID propagation and redacted error logging.
- Category/product/variant/price/media happy paths and conflicts.
- Pagination and filters.
- Upload MIME and size enforcement.
- Liveness and dependency-aware readiness.

### Console and End-to-End

- Authentication redirect/callback/logout and protected routes.
- Product/category loading, empty, error, validation, permission, and success
  states.
- Product create/edit, variant, price, media, archive, and audit workflows.
- Responsive and keyboard behavior at mobile, tablet, and desktop widths.
- `make up` from a clean checkout, healthy stack, migration, seed, login,
  product creation, backup, mutation, restore, and recovered product evidence.

All checks run through `make check`, which delegates to the repository's full
validation gate and Docker Compose configuration validation.

## Documentation Deliverables

- Root README quick start using `make up`.
- Build-from-source direct commands and Make equivalents.
- Docker service/image/port/dependency/health/volume matrix.
- Environment configuration reference.
- Keycloak local realm and role documentation.
- PostgreSQL migration, rollback, seed, backup, and restore guide.
- MinIO product-media setup and troubleshooting.
- Catalog API documentation with examples and error codes.
- Dependency purpose and license records.
- Updated project structure, architecture, roadmap, and changelog.

## Acceptance Chain

Phase 3 is complete only when all steps pass from a clean checkout:

1. Contributor prepares the documented local environment.
2. `make up` builds and starts PostgreSQL, Keycloak, MinIO, API, and console.
3. All services become healthy and API readiness confirms migration state.
4. `make db-migrate` is idempotent with no pending migration afterward.
5. `make db-seed` creates the general-merchandise fixtures once.
6. Catalog Manager signs in through Keycloak with PKCE.
7. Console lists the seeded products and categories from PostgreSQL.
8. Catalog Manager creates a draft product with category and attributes.
9. Catalog Manager adds a variant with a unique SKU and VND price.
10. Catalog Manager uploads and describes a product image stored in MinIO.
11. Catalog Manager edits the product and sees audit history for all mutations.
12. An unauthorized staff role receives `403` for a catalog mutation.
13. Duplicate SKU and stale-version edits return deterministic conflicts.
14. `make db-backup` captures the catalog database.
15. After a documented local mutation, `make db-restore` recovers the backed-up
    product state.
16. `make check` passes lint, typecheck, tests, builds, repository audit, and
    Docker Compose validation.
17. `make down` stops the stack without deleting PostgreSQL or MinIO volumes.

## Master Roadmap Alignment

This focused design changes the master phase split:

- Phase 3 becomes Commerce Product Foundation and includes the product catalog,
  PostgreSQL/Docker/Make foundation, staff authentication, media, and audit.
- Phase 4 becomes Inventory and Product Publication.
- Company Core persistence is removed from Phase 3 and remains outside the
  active commerce delivery path until a later operating-core need justifies it.

All later commerce phases retain their approved order and boundaries.
