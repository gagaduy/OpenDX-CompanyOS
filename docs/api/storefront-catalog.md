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
GET /v1/storefront/content
GET /v1/storefront/hero-slides
GET /v1/storefront/hero-presentation
GET /v1/storefront/hero-media/:mediaId/content
HEAD /v1/storefront/hero-media/:mediaId/content
GET /v1/storefront/products
GET /v1/storefront/products/:slug
GET /v1/storefront/products/:productId/media/:mediaId/content
```

`GET /v1/storefront/hero-presentation` returns the active synchronized video
only when every configured chapter resolves to one complete published product
in an active category. Slides are ordered by chapter order and each chapter
selects the newest eligible product for its configured category. If the active
presentation is absent or any chapter is incomplete, the response omits
`media` and returns the same image slides used by `GET /hero-slides`.

```json
{
  "success": true,
  "message": "Hero presentation retrieved",
  "data": {
    "media": {
      "id": "e7600000-0000-4000-8000-000000000001",
      "contentUrl": "/v1/storefront/hero-media/e7600000-0000-4000-8000-000000000001/content",
      "contentType": "video/mp4",
      "byteSize": 25481434,
      "durationMs": 24000
    },
    "slides": [
      {
        "category": { "id": "...", "name": "Laptops", "slug": "laptops" },
        "product": { "id": "...", "slug": "nova-laptop-pro" },
        "chapter": { "startMs": 0, "endMs": 4000, "label": "Laptop nổi bật" }
      }
    ]
  }
}
```

`GET /v1/storefront/hero-media/:mediaId/content` authorizes only the currently
active presentation and supports one HTTP byte range. A request without
`Range` returns `200`; a satisfiable range such as `bytes=0-1048575` returns
`206` with `Content-Range`. Multiple, malformed, and unsatisfiable ranges
return `416` with `Content-Range: bytes */<size>`. Responses advertise
`Accept-Ranges: bytes`, use `video/mp4`, and set `Cache-Control: no-store`.
The no-store policy is required because an operator replacement can preserve
the public presentation UUID while changing its authorized object and bytes.
The API streams MinIO chunks without assembling the full MP4 in memory. Hero
presentation and media responses never expose object keys, content digests,
timestamps, or storage credentials.

`HEAD /v1/storefront/hero-media/:mediaId/content` performs the same active UUID
authorization and returns `Accept-Ranges`, `Content-Type`, `Content-Length`,
and `Cache-Control` metadata without opening MinIO or streaming a response
body. Range negotiation remains a `GET` concern.

`GET /v1/storefront/content` anonymously returns enabled service assurances
and trust metrics ordered by their configured order and stable code. It returns
empty arrays when no content is enabled and never exposes enable flags, sort
orders, or persistence timestamps.

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

Product listing accepts `query`, category slug in `category`, `minPriceVnd`,
`maxPriceVnd`, `stockStatus` (`in_stock` or `out_of_stock`), `discountStatus`
(`on_sale`), `sort` (`newest`, `best_selling`, `price_asc`, `price_desc`, or
`name_asc`), `page`, and `pageSize` (maximum 100). Responses use
`{ success, message, data, meta? }`. Product detail contains category,
public descriptive fields, primary media, and active variants with current VND
price and live calculated availability.

```json
{
  "id": "variant-phone-black",
  "sku": "TECH-PHONE-BLACK",
  "title": "Black",
  "optionValues": { "color": "Black" },
  "price": {
    "amountMinor": 17990000,
    "currency": "VND",
    "previousAmountMinor": 19990000,
    "discountPercentage": 10
  },
  "availableQuantity": 0,
  "purchasable": false
}
```

`previousAmountMinor` and `discountPercentage` are optional backend-derived
sale evidence. The comparable prior amount is the most recent earlier valid
price record for the same variant. Both fields are omitted unless that amount
is greater than the current price. The percentage is rounded down from
`(previous - current) * 100 / previous`; clients must not invent either value.
Catalog markdown evidence is separate from checkout promotion codes.

Published sold-out products remain discoverable. Their variants report zero
availability and `purchasable: false`; restocking changes that calculation
without republishing. An unpublished product or media object returns
`404 PRODUCT_NOT_PUBLISHED`; unknown public resources return `404 NOT_FOUND`.
Invalid query or path values return `400 VALIDATION_ERROR`, and unavailable
PostgreSQL or MinIO dependencies fail closed.
