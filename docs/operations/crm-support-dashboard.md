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

Run the Phase 7 source preflight with isolated test resources:

```bash
make check-crm-support-dashboard
```

The command refuses to run without an isolated test database and Support MinIO
bucket. It records a run UUID and avoids printing credentials or customer PII.

The full Phase 7 exit evidence must also include:

- PostgreSQL CRM/Support/reporting integration tests.
- MinIO private Support attachment upload/download with ClamAV clean and EICAR
  rejection paths.
- Console browser checks at 390x844, 768x1024, and 1440x900 for Customer,
  Support, and Dashboard.
- Stack restart persistence.
- Custom-format backup/restore.
- CRM/Support rollback then forward migration without changing earlier commerce
  truth.

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
