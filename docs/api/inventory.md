<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Inventory API

The one-location Inventory API is mounted at `/v1/admin/inventory` and uses
PostgreSQL as its only runtime store. Send a Keycloak bearer token and an
`x-correlation-id` with staff requests. Catalog Managers can read inventory;
only Administrators and Inventory Managers can receive or adjust stock.

## Routes and roles

| Method and route | Administrator | Catalog Manager | Inventory Manager |
| --- | --- | --- | --- |
| `GET /items` | Read | Read | Read |
| `GET /items/:inventoryItemId` | Read | Read | Read |
| `GET /items/:inventoryItemId/movements` | Read | Read | Read |
| `POST /receipts` | Write | Denied | Write |
| `POST /items/:inventoryItemId/adjust` | Write | Denied | Write |

List query parameters are `query`, `categoryId`, `stockStatus` (`healthy`,
`low`, or `out_of_stock`), `page`, and `pageSize`. Movement lists accept
`page` and `pageSize`; page size is at most 100. List responses place rows in
`data` and pagination in `meta`.

## Receipt and adjustment

The first receipt initializes an inventory item for an active variant. Reusing
the same idempotency key with the same payload returns the recorded result;
reusing it with a different payload returns `409 CONFLICT`.

```json
{
  "variantId": "93000000-0000-4000-8000-000000000001",
  "quantity": 12,
  "idempotencyKey": "goods-receipt-20260805-001"
}
```

An adjustment requires the current optimistic version and a nonzero delta:

```json
{
  "delta": -1,
  "reasonCode": "cycle_count",
  "reasonNote": "Physical count correction",
  "version": 3
}
```

A successful item contains identity fields, `onHand`, `reserved`, calculated
`available`, `stockStatus`, and `version`. Every balance mutation writes one
stock movement plus an audit record in the same transaction. Movements expose
the on-hand/reserved deltas, reason, actor, correlation ID, optional
idempotency key, and occurrence time.

## Errors and reservation boundary

Errors use `{ success: false, message, errorCode, errors }`. Stable Inventory
codes include `VALIDATION_ERROR`, `FORBIDDEN`, `INVENTORY_ITEM_NOT_FOUND`,
`VARIANT_NOT_FOUND`, `VARIANT_NOT_ACTIVE`, `STALE_VERSION`, `CONFLICT`,
`INSUFFICIENT_STOCK`, `INVALID_INVENTORY_BALANCE`,
`INVALID_STOCK_ADJUSTMENT`, and `DEPENDENCY_UNAVAILABLE`. Authentication can
also return `UNAUTHORIZED`.

Cart and checkout modules will consume the inward-facing reservation port; it
is not an anonymous HTTP API in Phase 4. Reservations are PostgreSQL-atomic,
expire after 900 seconds, and release, expiry, and consumption are idempotent.
The runtime scans for expiry every 30 seconds. Row locking prevents successful
reservations from exceeding available stock.
