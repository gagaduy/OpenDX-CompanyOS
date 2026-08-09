<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Checkout API

Checkout converts one authenticated customer's checkout-ready cart into an
immutable pending order, inventory reservation, optional promotion hold, and
payment attempt in one PostgreSQL transaction. The backend re-reads price,
publication, stock, address ownership, and promotion eligibility; browser totals
are never authoritative.

All routes are under `/v1/storefront`, require the customer session cookie, and
return the standard `{ success, message, data }` envelope. Mutations additionally
require an allowed Storefront `Origin` and the double-submit CSRF header/cookie.

## Routes

### `POST /checkouts`

Headers: `Idempotency-Key` is required, 8-128 characters, and limited to ASCII
letters, digits, `.`, `_`, `:`, and `-`.

```json
{
  "addressId": "uuid",
  "promotionCode": "NOVA10",
  "paymentMethod": "BANK_TRANSFER"
}
```

`promotionCode` and `paymentMethod` are optional. Payment method is `CARD`,
`BANK_TRANSFER`, or `NAPAS_BANK_TRANSFER`. Success is `201` with checkout fields
plus `payment.actionUrl`, `payment.method = POST`, and ordered hidden form
fields. Submit those fields directly to the provider; do not rebuild or reorder
the signed form in the browser.

Replaying the same key and request returns the same checkout/order/attempt.
Reusing a key with changed input returns `IDEMPOTENCY_CONFLICT`.

### `GET /checkouts/:checkoutId`

Returns only a checkout owned by the authenticated customer. The DTO contains
`id`, `orderId`, `status`, VND totals, `expiresAt`, optional promotion code, and
immutable lines (`sku`, titles, quantity, unit price, subtotal). Internal
customer IDs and request fingerprints are not exposed.

### `POST /checkouts/:checkoutId/payment-initiation`

Requires Origin and CSRF protection. Recreates the signed provider initiation
for the same unexpired pending attempt without creating another order or
payment. It rejects completed, expired, canceled, or foreign checkouts.

## State And Errors

Checkout state is `created → order_created → completed`; `order_created` may
instead become `expired` or `canceled`. The 900-second checkout and inventory
reservation expiry are aligned.

Expected errors include `VALIDATION_ERROR`, `CHECKOUT_NOT_FOUND`,
`CHECKOUT_EXPIRED`, `PRODUCT_CHANGED`, `IDEMPOTENCY_CONFLICT`, promotion
eligibility codes, `PAYMENT_PROVIDER_NOT_CONFIGURED`, `CSRF_INVALID`, and
authentication/origin failures. A provider redirect never changes checkout,
order, inventory, or payment truth.
