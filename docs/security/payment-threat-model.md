<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Payment Threat Model

Payment state is authoritative only when backend-controlled checkout, order,
payment, inventory, promotion, and provider-event checks converge. Browser
redirects and customer-provided values never mark an order as paid.

| Threat | Control | Evidence |
| --- | --- | --- |
| Forged IPN | `X-Secret-Key` is checked before business processing | `pnpm --filter @opendx/api test -- src/modules/payment` |
| Replay | provider IDs, invoice numbers, and event IDs are deduplicated | `pnpm --filter @opendx/api test -- src/modules/payment` |
| Amount tampering | backend recalculates cart/order totals and validates expected amount | `pnpm --filter @opendx/api test -- src/modules/checkout src/modules/payment` |
| Idempotency collision | request fingerprint comparison protects checkout/payment creation | `pnpm --filter @opendx/api test -- src/modules/checkout` |
| Secret leakage | logs redact secret/PII fields and payment DTOs avoid raw secrets | `pnpm --filter @opendx/api test -- src/shared/observability src/modules/payment` |
| Production misuse | opt-in confirmation and minimum amount guard block accidental real payments | `pnpm test:sepay-production-acceptance` |

## Non-Goals

- The production guard does not automate a real payment.
- Hosted firewall rules, merchant account operations, and managed secret
  rotation remain operator responsibilities.
- `/health/ready` does not contact SePay because external provider downtime
  should not make the API process look unbootable.

## Required Operator Rule

Run production acceptance only when a human intentionally approves a low-value
real-money transaction and has verified production URLs, merchant credentials,
IPN configuration, customer session, inventory, and rollback/incident process.
