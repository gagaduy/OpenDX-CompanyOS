<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Catalog API

The anonymous read-only boundary is mounted at `/v1/storefront`. It exposes
only published products and purpose-specific public DTOs; it never returns
audit fields, object keys, internal versions, staff identity, or storage
credentials.

## Routes

```text
GET /v1/storefront/categories
GET /v1/storefront/products
GET /v1/storefront/products/:slug
GET /v1/storefront/products/:productId/media/:mediaId/content
```

Product listing accepts `query`, category slug in `category`, `minPriceVnd`,
`maxPriceVnd`, `stockStatus` (`in_stock` or `out_of_stock`), `sort` (`newest`,
`price_asc`, `price_desc`, or `name_asc`), `page`, and `pageSize` (maximum 100). Responses
use `{ success, message, data, meta? }`. Product detail contains category,
public descriptive fields, primary media, and active variants with current VND
price and live calculated availability.

```json
{
  "id": "variant-phone-black",
  "sku": "TECH-PHONE-BLACK",
  "title": "Black",
  "optionValues": { "color": "Black" },
  "price": { "amountMinor": 19990000, "currency": "VND" },
  "availableQuantity": 0,
  "purchasable": false
}
```

Published sold-out products remain discoverable. Their variants report zero
availability and `purchasable: false`; restocking changes that calculation
without republishing. An unpublished product or media object returns
`404 PRODUCT_NOT_PUBLISHED`; unknown public resources return `404 NOT_FOUND`.
Invalid query or path values return `400 VALIDATION_ERROR`, and unavailable
PostgreSQL or MinIO dependencies fail closed.
