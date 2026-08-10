<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Task 8 Report: Authoritative Reporting API

Implemented the Phase 7 Reporting module for backend aggregate commerce,
product, customer, inventory, and operations metrics.

## Delivered

- Added `reporting` application DTOs, mapper, repository contract, service,
  PostgreSQL repository, controller, validator, routes, module factory, and
  public index.
- Mounted the authenticated router once at `/v1/admin/reporting`.
- Enforced Administrator/Executive-only access with denied audit events and no
  service invocation on forbidden roles.
- Implemented Vietnam calendar date ranges, default previous 30 local days,
  max 366 days, half-open UTC query bounds, safe integer guards, and half-up
  integer AOV/conversion rounding.
- Implemented read-only SQL aggregates using `paid_at` for paid facts and
  `orders.created_at` for conversion/payment status cohorts.
- Added deterministic PostgreSQL fixture coverage for revenue, order counts,
  AOV inputs, conversion inputs, payment statuses, paid SKU sales, current
  inventory, customer/repeat/LTV, open tickets, overdue follow-ups, and SLA
  breaches.
- Added scale query-plan contract for 100,000 customers and 1,000,000 orders in
  a transaction-scoped fixture, rolled back after measurement.

## Verification

- RED service test first failed on missing Reporting modules.
- GREEN service/API focused run:
  `pnpm exec vitest run src/modules/reporting/application/services/implementations/reporting.service.test.ts src/modules/reporting/tests/reporting.api.integration.test.ts`
  — 2 files, 18 tests passed.
- GREEN PostgreSQL focused run:
  `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test pnpm exec vitest run --config vitest.integration.config.ts src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.integration.test.ts`
  — 1 file, 1 passed, 1 skipped.
- GREEN scale run:
  `RUN_REPORTING_SCALE=1 TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test pnpm exec vitest run --config vitest.integration.config.ts src/modules/reporting/infrastructure/repositories/implementations/postgresql-reporting.repository.integration.test.ts`
  — 1 file, 2 tests passed, duration 53.22s.
- GREEN full API integration after resetting `opendx_test` to empty and using
  test MinIO buckets with one worker:
  `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=opendx_minio MINIO_SECRET_KEY=opendx_minio_password MINIO_BUCKET=product-media-test MINIO_SUPPORT_BUCKET=support-attachments-test pnpm exec vitest run --config vitest.integration.config.ts --maxWorkers=1`
  — 40 files, 141 passed, 1 skipped.
- API typecheck passed.

## Notes

- Full integration must start from an empty `opendx_test`; many existing suites
  intentionally test per-module migration apply/rollback and fail if the full
  schema is pre-applied.
