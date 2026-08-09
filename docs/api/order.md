<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Order API

Orders preserve product, price, discount, contact, and address snapshots from
checkout. Historical responses never rebuild those values from mutable Catalog
or Customer records. All money is integer VND.

## Customer Routes

Routes are under `/v1/storefront` and require the customer session cookie.

- `GET /orders?status=&page=1&pageSize=20`
- `GET /orders/:orderId`

`pageSize` is at most 100. Ownership is enforced in the repository query; a
customer cannot enumerate or read another customer's order. Summaries expose
the public number, status, total, currency, and timestamps. Detail adds
immutable lines, contact/address snapshots, promotion and tax facts, reservation
expiry, and status history.

## Staff Routes

Routes are under `/v1/admin/orders` and require a Keycloak access token with
`administrator` or `operations_manager`.

- `GET /?status=&page=1&pageSize=20`
- `GET /:orderId`
- `POST /:orderId/transitions`

The transition request requires an `Idempotency-Key` header and:

```json
{
  "targetStatus": "processing",
  "reasonCode": "STAFF_PROCESSING_STARTED",
  "version": 2
}
```

The version is optimistic locking. A stale version returns `STALE_VERSION` and
the operator must refresh. Replaying the same key for the same actor/transition
is idempotent; changing its command returns `IDEMPOTENCY_CONFLICT`.

## State Machine

```text
pending_payment --provider/system--> paid
pending_payment --customer/staff--> canceled
pending_payment --system expiry--> expired
paid --staff--> processing --staff--> ready_for_fulfillment --staff--> completed
```

Terminal states are `completed`, `canceled`, and `expired`. Staff cannot mark an
order paid. There are no shipping, tracking, return, refund, exchange, void, or
electronic-invoice transitions in Phase 6. Every accepted or denied staff
operation records actor and correlation evidence.
