<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Task 4 Report: Support Schema, Workflow, and SLA Domain

Implemented the Phase 7 Support domain baseline without application, HTTP,
object-storage, or ClamAV behavior.

## Delivered

- Pure ticket entities, exact approved transition matrix, SLA targets, pause
  accounting, resolution/closure clock stopping, reopen handling, and automatic
  escalation idempotency.
- Pure attachment allow-list and limits for JPG, PNG, WebP, PDF, TXT, CSV,
  DOCX, and XLSX, plus quarantine/clean/rejected/deleted and 365-day retention
  rules.
- Reversible Support migration after CRM: constrained tickets, append-only
  messages/events/audit history, attachment tombstones, customer/order foreign
  keys, version guards, idempotency/object-key uniqueness, scanner/retention
  indexes, and single-company tables without `company_id`.
- Support migration runners and package scripts, ordered after CRM on apply and
  before CRM on rollback.
- Review hardening: PostgreSQL derives every SLA pause/stop timestamp and
  accumulated second count from the prior ticket row, serializes attachment
  quota checks by locking the parent ticket, and preserves scan/rejection
  provenance through attachment tombstone deletion.

## Verification

- RED observed: `support-rules.test.ts` failed because `support-rules` did not
  exist.
- GREEN: `pnpm --filter @opendx/api test -- support-rules.test.ts` — 350 tests
  passed.
- PostgreSQL lifecycle: focused Support migration integration test on
  `opendx_test` passed, including apply, rollback, and reapply.
- `pnpm --filter @opendx/api typecheck` passed.
- Review regressions: the focused migration test now rejects forged SLA state,
  proves a concurrent quota-boundary race admits exactly one attachment, and
  rejects deletion that clears scanner provenance.

The full `pnpm check` was intentionally not run for the task's quota constraint.
