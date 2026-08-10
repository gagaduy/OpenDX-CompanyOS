# Task 12 Partial Report: Phase 7 Focused Exit Preflight Wiring

Implemented and hardened the focused automated-preflight portion of the Phase 7
exit gate. This is still not the full Task 12 acceptance closure because
browser, restart, backup/restore, rollback/forward lifecycle, ClamAV EICAR, and
independent-review evidence remain open.

## Delivered

- Added `scripts/dev/crm-support-dashboard-exit-check.mjs`.
- Added `scripts/dev/crm-support-dashboard-exit-check.test.mjs` and wired it
  into `pnpm check:crm-support-dashboard`.
- Added `pnpm check:crm-support-dashboard`.
- Added `make check-crm-support-dashboard`.
- Extended the Phase 7 runner to require isolated PostgreSQL, private Support
  MinIO details, ClamAV details, and `RUN_REPORTING_SCALE=1`.
- Added focused API unit, real PostgreSQL/MinIO integration, reporting
  100k-customer/1m-order scale, ClamAV clean/EICAR scan, Console Phase 7,
  typecheck/build, audit, and diff-check commands to the runner.
- Fixed `make check-crm-support-dashboard` to rebuild the API image from the
  current source and pass isolated product/support MinIO bucket names.
- Added `scripts/dev/crm-support-dashboard-browser-check.mjs` and
  `pnpm check:crm-support-dashboard-browser` for Phase 7 browser evidence.
- Added `scripts/dev/crm-support-dashboard-lifecycle-check.mjs` and
  `pnpm check:crm-support-dashboard-lifecycle` for restart, backup/restore, and
  CRM/Support migration lifecycle evidence.
- Updated repository audit Make target allowlist.
- Added `docs/operations/crm-support-dashboard.md`.
- Updated README, build-from-source, dependencies, Docker README, roadmap, and
  master/focused plans to reference the guarded Phase 7 preflight and remaining
  full-evidence requirements.
- Updated `CHANGELOG.md`.

## Verification

- `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test MINIO_ENDPOINT=http://localhost:9000 MINIO_ACCESS_KEY=opendx_minio MINIO_SECRET_KEY=opendx_minio_password MINIO_SUPPORT_BUCKET=support-attachments-test RUN_REPORTING_SCALE=1 pnpm check:crm-support-dashboard`
  - Exit runner tests passed: 5/5.
  - Focused API unit suites passed: 75 files, 383 tests.
  - Focused API PostgreSQL/MinIO integration suites passed: 8 files, 57 tests,
    0 skipped.
  - Reporting scale query-plan test passed with 100k customers and 1m orders.
  - Focused Console Phase 7 suites passed: 20 files, 97 tests.
  - API typecheck passed.
  - Console typecheck passed.
  - Console production build passed.
  - Repository audit passed.
  - `git diff --check` passed.
- `make check-crm-support-dashboard`
  - Rebuilt the API image from the current source.
  - Exit runner tests passed: 5/5.
  - Focused API unit suites passed: 75 files, 383 tests.
  - Focused API PostgreSQL/MinIO/ClamAV integration suites passed: 9 files, 58
    tests, 0 skipped.
  - ClamAV accepted a clean stream and rejected the EICAR test signature.
  - Reporting scale query-plan test passed with 100k customers and 1m orders.
  - Focused Console Phase 7 suites passed: 20 files, 97 tests.
  - API typecheck passed.
  - Console typecheck passed.
  - Console production build passed.
  - Repository audit passed.
  - `git diff --check` passed.
- `pnpm test:crm-support-dashboard-exit`
  - Exit runner tests passed: 5/5.
  - Covered isolated environment rejection, no secret leakage in diagnostics,
    deterministic command ordering, fail-fast status propagation, and command
    suppression when the environment is unsafe.
- `CONSOLE_URL=http://127.0.0.1:3001 pnpm check:crm-support-dashboard-browser`
  - Verified Customers list, Customer detail, Support queue, Support detail,
    and Dashboard at 390x844, 768x1024, and 1440x900.
  - Wrote 15 screenshots under `/tmp/opendx-crm-support-dashboard-browser`.
  - Verified no horizontal document overflow, one main landmark, navigation
    landmark, visible keyboard focus, and denied Dashboard route with zero
    Phase 7 API calls.
- `pnpm check:crm-support-dashboard-lifecycle`
  - Created disposable database `opendx_phase7_lifecycle_<pid>_test`.
  - Migrated through all modules including CRM and Support.
  - Inserted CRM note/follow-up and Support ticket fixture.
  - Restarted PostgreSQL Compose service and verified persisted Support data.
  - Wrote custom-format dump
    `/tmp/opendx-crm-support-dashboard-exit/crm-support-dashboard.dump`.
  - Restored into disposable restore database and verified CRM/Support counts.
  - Rolled back Support and CRM, verified earlier `orders` table remained, then
    migrated CRM/Support forward again.
  - Wrote lifecycle evidence
    `/tmp/opendx-crm-support-dashboard-exit/lifecycle.json`.

## Remaining Task 12 work

- Independent review of complete Phase 7 range.
- Final roadmap/plan closure after evidence exists.
