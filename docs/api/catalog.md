<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Staff Catalog API

The staff Catalog API is mounted at `/v1/admin/catalog`. Every request
requires a Keycloak bearer token with the `administrator` or `catalog_manager`
realm role. Mutations are validated by the backend, use optimistic `version`
checks where applicable, and write audit events in the same PostgreSQL
transaction as catalog data.

## Endpoints

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
GET    /v1/admin/catalog/products/:productId/audit
GET    /v1/admin/catalog/products/:productId/publication-readiness
POST   /v1/admin/catalog/products/:productId/publish
POST   /v1/admin/catalog/products/:productId/unpublish

POST   /v1/admin/catalog/products/:productId/variants
PATCH  /v1/admin/catalog/products/:productId/variants/:variantId
POST   /v1/admin/catalog/products/:productId/variants/:variantId/archive
PUT    /v1/admin/catalog/products/:productId/variants/:variantId/price

POST   /v1/admin/catalog/products/:productId/media
PATCH  /v1/admin/catalog/products/:productId/media/:mediaId
DELETE /v1/admin/catalog/products/:productId/media/:mediaId
GET    /v1/admin/catalog/products/:productId/media/:mediaId/content
```

Product listing accepts `query`, `categoryId`, `status` (`draft`, `published`,
or `archived`), `page`, and `pageSize` query parameters. Published list items
include `availabilitySummary`. `pageSize` is limited to 100. Prices use integer
minor units, must use `VND`, and are replaced rather than updated in place. Product media is
multipart form data with the image in `file` plus `altText`, `sortOrder`, and
`isPrimary`; the server accepts JPEG, PNG, WebP, and AVIF by detected bytes and
enforces `MEDIA_MAX_BYTES`.

## Example

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://localhost:4000/v1/admin/catalog/products?page=1&pageSize=20"
```

Successful responses use `{ "data": ... }`. Errors include a stable `errorCode`, a
human-readable `message` and optional validation errors. The response header
returns `x-correlation-id`. Duplicate slugs/SKUs return conflict responses, and
stale versions return an optimistic-concurrency conflict.

Publication readiness requires an active category, an active variant, a current
VND price, primary image with alt text, and initialized inventory. Readiness,
publish, and unpublish require `administrator` or `catalog_manager`; mutation
bodies contain the current `{ "version": 3 }`. Missing requirements return
`PRODUCT_NOT_READY_FOR_PUBLICATION`, and stale versions return `STALE_VERSION`.
Unpublishing keeps inventory and catalog data.

See [`inventory.md`](inventory.md) for stock operations and
[`storefront-catalog.md`](storefront-catalog.md) for anonymous public reads.
Shipping, refunds, returns, and payment remain outside this phase.
