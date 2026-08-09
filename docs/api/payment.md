<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Payment API

Payment is provider-neutral in the application core; SePay is the Phase 6
infrastructure adapter. PostgreSQL owns payment, attempt, event, reconciliation,
and idempotency truth. Browser redirects and query strings are informational.

## Provider Notification

`POST /v1/webhooks/sepay` accepts JSON up to 64 KiB. When SePay is
configured, `X-Secret-Key` must exactly match `SEPAY_IPN_SECRET`; comparison is
timing-safe. Missing configuration returns `503`; failed authentication returns
`401`; malformed or unsupported payloads fail closed.

The adapter normalizes provider identifiers, invoice, amount, currency, order
and transaction statuses. A matching `ORDER_PAID` event atomically marks the
attempt/payment/order paid, consumes reservation, commits promotion, completes
checkout/cart, and appends audit evidence. Duplicate/reordered events converge
without repeating effects. Mismatch is stored as redacted review evidence and
does not mark the order paid.

## Staff Operations

Routes under `/v1/admin/payments` require `administrator` or
`finance_operator`:

- `GET /?status=&page=1&pageSize=20`
- `GET /:paymentId`
- `POST /:paymentId/reconciliations`

Status is `created`, `pending_provider`, `paid`, `failed`, `canceled`, or
`expired`; `pageSize` is at most 100. Reconciliation body is `{}` or:

```json
{ "providerOrderId": "provider-order-id" }
```

Detail exposes payment summary, attempt/expiry, sanitized events, and sanitized
reconciliations. It never exposes IPN authentication results, payload hashes,
secret keys, full card details, or raw provider payloads. Reconciliation results
are `matched_paid`, `still_pending`, `mismatch`, `unsupported`, or
`provider_error`.

## State And Recovery

```text
created → pending_provider → paid
created/pending_provider → failed | canceled | expired
```

Only authenticated IPN or a successful provider reconciliation can establish
`paid`. Provider timeout/error leaves recoverable pending state. The background
worker runs only when all SePay credentials are configured, scans a bounded
batch, and does not affect API readiness when the external sandbox is down.
