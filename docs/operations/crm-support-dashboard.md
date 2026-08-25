<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# CRM, Support, and Dashboard Operations

Phase 7 adds least-privilege operational workspaces for NovaCommerce staff:

- `crm_operator`: Customer 360, immutable CRM notes, follow-ups, and CRM-created
  support tickets.
- `support_operator`: Support queue, ticket workflow, messages, and private
  scanned attachments.
- `executive_viewer`: PII-free aggregate Dashboard only.
- `administrator`: all Phase 7 workspaces.

## Local exit check

Run the Phase 7 focused exit preflight with isolated test resources:

```bash
make check-crm-support-dashboard
```

The command refuses to run without an isolated test database, Support MinIO
bucket, MinIO connection details, and `RUN_REPORTING_SCALE=1`. It records a run
UUID and avoids printing credentials or customer PII. The preflight covers
focused CRM/Support/Reporting API unit tests, real PostgreSQL integration and
concurrency tests, private Support attachment MinIO storage, ClamAV clean and
EICAR rejection paths, 100k-customer/1m-order reporting query plans, Console
Phase 7 tests, typecheck/build, repo audit, and `git diff --check`.

The full Phase 7 exit evidence must also include:

- Independent review of the full Phase 7 commit range.

## Browser evidence

Start the Console with the normal Vite environment and run:

```bash
pnpm check:crm-support-dashboard-browser
```

The browser check uses fixture API responses and Chromium. It records screenshots
under `/tmp/opendx-crm-support-dashboard-browser` by default and verifies
Customer list/detail, Support queue/detail, and Dashboard surfaces at 390x844,
768x1024, and 1440x900. It also verifies visible keyboard focus, semantic
landmarks, no horizontal document overflow, and a denied Dashboard route that
does not call Phase 7 APIs.

## Lifecycle evidence

Run:

```bash
pnpm check:crm-support-dashboard-lifecycle
```

The lifecycle check creates disposable PostgreSQL databases only. It migrates
forward through CRM/Support, inserts a minimal CRM/Support fixture, restarts the
PostgreSQL Compose service, verifies persistence, writes a custom-format dump,
restores it into another disposable database, rolls CRM/Support back, verifies
earlier commerce tables remain, then migrates CRM/Support forward again.

Do not mark Phase 7 complete until those evidence items are captured.

## Attachment operations

Support attachments are private. Staff download through the authenticated API;
the Console must not render MinIO object keys or public URLs. Uploads are
quarantined until ClamAV records a clean scan. Infected or scan-failed files are
not downloadable.

## Failure recovery

- If ClamAV is unavailable, attachments remain quarantined and download is
  denied.
- If a ticket mutation returns a stale version, reload the ticket and retry with
  the latest version.
- If dashboard metrics are stale, keep the old aggregate view visible and retry
  the Reporting request.
