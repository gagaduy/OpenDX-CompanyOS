# Task 12 Partial Report: Phase 7 Exit Preflight Wiring

Implemented the source-preflight portion of the Phase 7 exit gate. This is not
the full Task 12 acceptance closure.

## Delivered

- Added `scripts/dev/crm-support-dashboard-exit-check.mjs`.
- Added `scripts/dev/crm-support-dashboard-exit-check.test.mjs` and wired it
  into `pnpm check:crm-support-dashboard`.
- Added `pnpm check:crm-support-dashboard`.
- Added `make check-crm-support-dashboard`.
- Updated repository audit Make target allowlist.
- Added `docs/operations/crm-support-dashboard.md`.
- Updated README, build-from-source, dependencies, Docker README, roadmap, and
  master/focused plans to reference the guarded Phase 7 preflight and remaining
  full-evidence requirements.
- Updated `CHANGELOG.md`.

## Verification

- `TEST_DATABASE_URL=postgres://opendx_local:opendx_local_password@localhost:55432/opendx_test MINIO_SUPPORT_BUCKET=support-attachments-test pnpm check:crm-support-dashboard`
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

## Remaining Task 12 work

- Deterministic acceptance fixture creation.
- Full HTTP/browser chain.
- MinIO/ClamAV clean and EICAR paths.
- Stack restart persistence proof.
- Custom-format backup/restore.
- CRM/Support rollback then forward migration proof.
- Independent review of complete Phase 7 range.
- Final roadmap/plan closure after evidence exists.
