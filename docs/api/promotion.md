<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Promotion API

Promotion is backend-evaluated during checkout. Codes normalize to uppercase;
discount arithmetic uses integer VND and percentage basis points. A promotion
cannot produce a zero-total order.

## Administrator Routes

All routes are under `/v1/admin/promotions` and require the Keycloak
`administrator` role.

- `GET /`
- `POST /`
- `PATCH /:promotionId`

Create and update use a discriminated DTO. Percentage example:

```json
{
  "code": "NOVA10",
  "name": "Ten percent",
  "type": "percentage",
  "percentageBps": 1000,
  "maximumDiscountVnd": 2000000,
  "minimumSubtotalVnd": 1000000,
  "totalUsageLimit": 1000,
  "perCustomerLimit": 3,
  "status": "active"
}
```

For `fixed_amount`, replace `percentageBps` with positive `fixedAmountVnd`.
Optional `startsAt` and `endsAt` are ISO timestamps. Status is `draft`,
`active`, or `inactive`. Update includes positive `version`; stale writes return
`CONFLICT`.

Checkout checks status, time window, minimum subtotal, total usage, and
per-customer usage while holding the promotion row. Redemption progresses
`held → committed` after trusted payment or `held → released` after expiry or
cancellation. The hold belongs to one checkout/idempotency key.

## Local Fixtures

`make db-seed` installs exactly two idempotent fixtures:

| Code | State | Rule |
| --- | --- | --- |
| `NOVA10` | active | 10%, maximum 2,000,000 VND, minimum 1,000,000 VND, 1,000 total uses, 3/customer |
| `NOVA50K` | inactive | fixed 50,000 VND, minimum 500,000 VND |

The inactive fixture exists to exercise rejection UI and API behavior. Seeds
contain no customer redemption, merchant credential, provider transaction, or
fake payment confirmation.
