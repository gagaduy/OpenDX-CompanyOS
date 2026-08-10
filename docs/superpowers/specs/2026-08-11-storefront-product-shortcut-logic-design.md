<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Storefront Product Shortcut Logic Design

## Context

The Storefront discovery taskbar currently contains customer-facing shortcuts
for `Sản phẩm mới`, `Bán chạy`, `Đang giảm`, `Còn hàng`, `Hỗ trợ`, and quick
search. Some shortcuts only scroll to the catalog and do not yet express real
commerce logic. The user wants these shortcuts to be backed by PostgreSQL
commerce data instead of placeholders.

## Scope

This change is limited to the public Storefront product discovery path:

- Storefront taskbar links and filter/sort options.
- Public Catalog API query validation and DTO typing.
- Public Catalog application/repository behavior.
- PostgreSQL-backed product list queries.
- Tests and changelog updates.

Out of scope:

- Admin catalog editing UX.
- Checkout/order/payment state machines.
- New promotion-code behavior.
- Shipping, refunds, returns, marketplace, or multi-warehouse behavior.
- Fake frontend-only ranking.

## Shortcut Behavior

### Sản phẩm mới

`Sản phẩm mới` must list products by store insertion time:

- Query: `sort=newest`
- Backend ordering: `products.created_at DESC, products.id`
- Rationale: “new product” means newly added by the store, not recently edited.

### Bán chạy

`Bán chạy` must rank products by actual paid order history across all time:

- Query: `sort=best_selling`
- Backend ordering:
  1. Sum `order_lines.quantity` per product across all qualifying orders.
  2. Higher sold quantity first.
  3. Tie-break by `products.created_at DESC, products.id`.
- Qualifying order statuses:
  - `paid`
  - `processing`
  - `ready_for_fulfillment`
  - `completed`
- Canceled, expired, and pending-payment orders do not count.
- Products with no sales may still appear after sold products if the page has
  remaining slots, so the shortcut never creates an empty demo catalog merely
  because there are few paid orders.

### Đang giảm

`Đang giảm` must show products whose current price is lower than the immediately
previous price for at least one active variant:

- Query: `discountStatus=on_sale`
- Current price:
  - `product_prices.valid_from <= NOW()`
  - `product_prices.valid_to IS NULL OR product_prices.valid_to > NOW()`
  - latest current candidate by `valid_from DESC`
- Previous price:
  - the most recent prior row for the same variant with `valid_to IS NOT NULL`
    or a `valid_from` earlier than the current price.
- A variant is on sale when `current.amount_minor < previous.amount_minor`.
- A product is on sale when any active variant is on sale.
- This uses real product price history, not order-level promotion codes.

### Còn hàng

`Còn hàng` keeps the existing public catalog behavior:

- Query: `stockStatus=in_stock`
- Backend truth remains authoritative through inventory-aware product
  projection/filtering.

### Tìm nhanh sản phẩm

Quick search keeps the existing `/search` route. It is not changed by this
feature.

## API Contract

The public Storefront product list accepts:

- Existing `sort` values:
  - `newest`
  - `price_asc`
  - `price_desc`
  - `name_asc`
- New `sort` value:
  - `best_selling`
- New optional filter:
  - `discountStatus=on_sale`

Invalid values must return the existing validation error envelope.

## Architecture

The Catalog module remains the owner of public product discovery. It may read
Order tables for aggregate sales ranking because the public catalog list needs
customer-facing product ranking, but it must do so through a narrow,
read-only SQL projection inside the public catalog repository. No Storefront
code may calculate sales ranking locally.

The Storefront continues to pass query parameters to the existing public
Catalog API. It does not read private tables or infer product truth client-side.

## Testing

Required coverage:

- Public Catalog validator accepts `best_selling` and `discountStatus=on_sale`.
- Public Catalog validator rejects invalid `discountStatus`.
- PostgreSQL public catalog integration proves:
  - `newest` uses `products.created_at`, not `updated_at`.
  - `best_selling` ranks by all-time paid order quantities and ignores unpaid,
    canceled, and expired orders.
  - `discountStatus=on_sale` includes products with a lower current price than
    their previous price and excludes products without a real price drop.
- Storefront tests prove taskbar links emit:
  - `/?sort=newest#catalog`
  - `/?sort=best_selling#catalog`
  - `/?discountStatus=on_sale#catalog`
  - `/?stockStatus=in_stock#catalog`
- Storefront filter form exposes `Bán chạy` as a sort option and `Đang giảm` as
  an explicit filter option without removing current price/name/stock filters.

## Validation

Before handoff, run:

- Focused API unit/integration tests for public catalog.
- Focused Storefront tests for shell and catalog discovery.
- `pnpm --filter @opendx/storefront typecheck`
- `pnpm --filter @opendx/storefront build`
- `git diff --check`
- `pnpm audit:repo`
- `pnpm check`
