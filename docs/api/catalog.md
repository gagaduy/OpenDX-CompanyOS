<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Catalog API

The Phase 3 staff Catalog API is mounted at `/v1/admin/catalog`. Every request
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

POST   /v1/admin/catalog/products/:productId/variants
PATCH  /v1/admin/catalog/products/:productId/variants/:variantId
POST   /v1/admin/catalog/products/:productId/variants/:variantId/archive
PUT    /v1/admin/catalog/products/:productId/variants/:variantId/price

POST   /v1/admin/catalog/products/:productId/media
PATCH  /v1/admin/catalog/products/:productId/media/:mediaId
DELETE /v1/admin/catalog/products/:productId/media/:mediaId
GET    /v1/admin/catalog/products/:productId/media/:mediaId/content
```

Product listing accepts `query`, `categoryId`, `status`, `page`, and `pageSize`
query parameters. `pageSize` is limited to 100. Prices use integer minor units,
must use `VND`, and are replaced rather than updated in place. Product media is
multipart form data with the image in `file` plus `altText`, `sortOrder`, and
`isPrimary`; the server accepts JPEG, PNG, WebP, and AVIF by detected bytes and
enforces `MEDIA_MAX_BYTES`.

## Example

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://localhost:4000/v1/admin/catalog/products?page=1&pageSize=20"
```

Successful responses use `{ "data": ... }`. Errors include a stable `code`, a
human-readable `message`, the request `correlationId`, and optional validation
`details`. Duplicate slugs/SKUs return conflict responses, and stale versions
return an optimistic-concurrency conflict.

Inventory, publication, storefront, shipping, refunds, returns, and payment
behavior remain outside this API phase.
