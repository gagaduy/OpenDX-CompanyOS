<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Cart API

```text
GET    /v1/storefront/cart
POST   /v1/storefront/cart/items
PATCH  /v1/storefront/cart/items/:cartItemId
DELETE /v1/storefront/cart/items/:cartItemId
GET    /v1/storefront/cart/resolution
POST   /v1/storefront/cart/resolution
POST   /v1/storefront/cart/checkout-readiness
```

Anonymous `GET /cart` returns an empty DTO and creates no session. Mutations
require an existing guest or customer session plus Origin/CSRF protection.
The backend resolves product identity and current VND price through Catalog,
availability through Inventory, then locks and versions the PostgreSQL cart.
Responses contain current unit price, subtotal, total, availability,
purchasability, and `unchanged`, `price_changed`, or `unavailable` markers.

Login transfers a non-conflicting guest cart automatically. When both carts
contain lines, the customer chooses `keep_guest`, `keep_saved`, or `merge`.
Resolution requests require a bounded idempotency key; reused keys must retain
the same fingerprint. Superseded carts and line history are retained.

Checkout readiness requires an authenticated customer, resolved non-empty
cart, current products/prices, and sufficient stock. It is a read-only preview;
`POST /v1/storefront/checkouts` performs the Phase 6 locked revalidation and
atomic checkout, reservation, promotion, order, payment, and audit writes.
