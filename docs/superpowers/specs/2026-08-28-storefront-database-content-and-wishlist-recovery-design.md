<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Database Content and Wishlist Recovery Design

## Status

The design direction and written specification were approved in collaborative
review on 2026-08-28. It is ready for implementation planning.

## Purpose

NovaCommerce currently reads product, category, price, inventory, promotion,
customer, cart, order, and payment truth from backend services, but two groups
of homepage merchandising content remain embedded in React source: service
assurances and trust metrics. Those values must become PostgreSQL-backed public
Catalog content without turning ordinary interface labels into database data.

The live environment also ran Wishlist application code before its Customer
migration had been applied. The missing `customer_wishlist_items` table caused
authenticated `PUT /v1/storefront/account/wishlist/items/:productId` requests
to return HTTP 500. The table has been recovered operationally in the current
development database; implementation must add readiness and acceptance
evidence that prevents the same schema drift from appearing healthy again.

## Scope

- Persist Storefront service assurances and trust metrics in PostgreSQL.
- Seed the currently approved NovaCommerce values idempotently.
- Expose the content through the anonymous, read-only Catalog boundary.
- Load the content once in the Storefront Catalog feature and reuse it on the
  homepage and product-detail assurance panel.
- Preserve explicit loading, empty, and recoverable error states.
- Make API readiness fail when the Wishlist migration/table is absent.
- Verify authenticated Wishlist add, list, idempotent add, remove, and customer
  isolation against PostgreSQL.
- Rebuild the affected services, apply all migrations and seeds, and verify the
  live local Storefront after implementation.

## Hard-Code Boundary

The following customer-visible merchandising values move to PostgreSQL:

- Service assurance icon key, title, supporting copy, order, and enabled state.
- Trust metric displayed value, label, order, and enabled state.

The following data is already backend- or database-owned and remains there:

- Categories, products, descriptions, brands, media, variants, prices, price
  history, inventory, promotion evidence, customers, wishlists, carts,
  checkouts, orders, and payments.

Interface vocabulary remains in frontend source until a separately approved
localization/content-management capability exists. This includes navigation
labels, section headings, CTA labels, filter labels, loading text, validation
messages, and error messages. Query definitions such as `best_selling` and
`newest` also remain application behavior rather than mutable content.

No generic key/value or arbitrary JSON content store is introduced. Typed
tables keep the public response predictable and prevent invalid content shapes.

## Ownership and Architecture

Catalog owns public merchandising content because it already owns anonymous
Storefront discovery and homepage composition data.

```text
PostgreSQL Catalog tables
  -> Catalog repository implementation
  -> Public Catalog service
  -> Public Catalog controller and route
  -> StorefrontCatalogApi schema validation
  -> Catalog content provider
  -> assurance and metric components
```

Dependencies continue to point inward. React never reads persistence records,
the controller contains no business logic, and the public response omits
database IDs, timestamps, audit fields, and inactive rows. Other frontend
features consume Catalog only through `features/catalog/index.ts`.

## Persistence

The next Catalog migration creates two typed tables.

```text
storefront_service_assurances
- code TEXT PRIMARY KEY
- icon_key TEXT NOT NULL
- title TEXT NOT NULL
- description TEXT NOT NULL
- sort_order INTEGER NOT NULL
- enabled BOOLEAN NOT NULL DEFAULT TRUE
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL

storefront_trust_metrics
- code TEXT PRIMARY KEY
- display_value TEXT NOT NULL
- label TEXT NOT NULL
- sort_order INTEGER NOT NULL
- enabled BOOLEAN NOT NULL DEFAULT TRUE
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
```

`code` is a stable public business key rather than an internal database ID.
`icon_key` accepts only the approved icon vocabulary
needed by the current UI: `truck`, `shield-check`, `badge-percent`, and
`headphones`. Text columns reject empty values and `sort_order` is
non-negative. An index supports enabled, ordered reads; `code` is the stable
tiebreaker when two rows share a sort order. Rollback drops the two tables only.

The Catalog seed upserts these values:

| Assurance | Icon | Title | Description |
| --- | --- | --- | --- |
| `free-delivery` | `truck` | Miễn phí vận chuyển | Cho đơn hàng đủ điều kiện |
| `official-warranty` | `shield-check` | Bảo hành chính hãng | Cam kết sản phẩm xác thực |
| `zero-installment` | `badge-percent` | Trả góp 0% | Theo điều kiện thanh toán |
| `customer-support` | `headphones` | Hỗ trợ 24/7 | Đồng hành khi bạn cần |

| Metric | Value | Label |
| --- | --- | --- |
| `authentic-products` | `100%` | Sản phẩm chính hãng |
| `trusted-brands` | `30+` | Thương hiệu uy tín |
| `product-selection` | `1.000+` | Sản phẩm đa dạng |
| `trusted-customers` | `50.000+` | Khách hàng tin tưởng |

The values remain presentation claims. They do not create shipping, warranty,
installment, support, inventory, or payment rules.

## Public API Contract

Catalog adds:

```text
GET /v1/storefront/content
```

Successful response:

```json
{
  "success": true,
  "message": "Storefront content retrieved",
  "data": {
    "assurances": [
      {
        "code": "free-delivery",
        "iconKey": "truck",
        "title": "Miễn phí vận chuyển",
        "description": "Cho đơn hàng đủ điều kiện"
      }
    ],
    "metrics": [
      {
        "code": "authentic-products",
        "displayValue": "100%",
        "label": "Sản phẩm chính hãng"
      }
    ]
  }
}
```

Only enabled rows are returned, ordered by `sort_order`, then `code`. An empty
database returns two empty arrays rather than invented defaults. Database
failure uses the existing closed failure envelope. The endpoint is anonymous,
read-only, and does not add a management API in this scope.

## Storefront Data Flow

`StorefrontCatalogApi` validates the response with Zod. A Catalog-owned content
provider is mounted once at the route composition boundary, fetches content
once per application load, and exposes `loading`, `ready`, `empty`, and `error`
states plus retry.

`ServiceAssurancePanel` and `ServiceMetricStrip` consume the provider rather
than module constants. An exhaustive `iconKey` map selects existing Lucide
components; unknown keys are rejected by the API schema. The homepage and
product detail share the same fetched assurances. No component invents fallback
business copy when the endpoint is empty or unavailable.

Loading uses bounded skeleton/state panels. Empty content omits the relevant
panel without breaking the hero or product layout. An error appears once in the
assurance region with a compact retry action; the metric strip stays omitted.
It does not blank product, price, inventory, cart, or checkout data.

## Wishlist Recovery and Schema Drift Prevention

The existing Customer Wishlist migration remains the sole schema owner. No
duplicate table or compensating runtime DDL is added.

API readiness must require the latest Customer migration rather than accepting
the historical minimum of one Customer migration. The readiness check verifies
the migration ledger entry for `202608270030_add_customer_wishlist` and the
presence of `customer_wishlist_items`. A source/runtime combination that lacks
either reports migrations down and cannot be treated as ready.

The implementation rollout runs the normal `db:migrate:all` and
`db:seed:catalog` commands before restarting the API and Storefront. It then
verifies the migration ledger and table through read-only queries. No customer
or product records are reset to repair Wishlist.

## Error Handling

- Invalid public content cannot cross the frontend validation boundary.
- Empty content stays distinct from transport failure.
- Wishlist product-not-found remains a purpose-specific 404.
- Missing or invalid customer session remains 401.
- Missing CSRF evidence remains 403.
- Persistence failures remain server errors and are logged without leaking SQL
  details to customers.
- A failed Wishlist mutation keeps the last server-confirmed heart state and
  shows one product-scoped alert, as implemented by the existing UI fix.

## Testing and Acceptance

Implementation follows red-green-refactor in these units:

1. Catalog migration test proves tables, constraints, ordering, rollback, and
   reapply behavior.
2. Catalog seed integration test proves idempotent assurance/metric upserts.
3. Repository/service tests prove enabled-only deterministic content and empty
   results without frontend fallbacks.
4. Public API tests prove the response envelope and DTO redaction.
5. Storefront API/schema tests reject malformed icon/content values.
6. Component tests prove loading, ready, empty, error, retry, and shared
   homepage/product-detail content.
7. Readiness tests fail when the Wishlist migration entry or table is missing.
8. Customer integration tests exercise authenticated add/list/idempotent
   add/remove and isolation using the real Wishlist table.
9. Browser acceptance covers populated and unavailable content in dark/light
   themes at mobile, tablet, and desktop without overflow.

Final verification includes API unit and focused PostgreSQL integration suites,
Storefront tests and build, responsive browser acceptance, repository audit,
and `git diff --check`. Live acceptance confirms API and Storefront health plus
one authenticated Wishlist add/remove journey after migrations are applied.

## Explicit Non-Goals

- No CMS, staff content editor, generic settings engine, translation system, or
  arbitrary JSON content table.
- No changes to authoritative shipping, warranty, installment, support,
  inventory, promotion, checkout, order, or payment behavior.
- No guest wishlist or guest-to-customer wishlist merge.
- No reset, destructive restore, or replacement of existing contributor data.
- No Console, Agentic, AI Runtime, or deployment-topology redesign.
