<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Task 7 Report: ClamAV Attachment Scanning Lifecycle

Implemented ClamAV and Support attachment runtime configuration for the local
Compose stack. The API now parses ClamAV host/port/timeout, Support worker
intervals, and a private `support-attachments` MinIO bucket distinct from the
product media bucket.

## Delivered

- Added environment validation defaults and bounds:
  `clamav:3310`, 30-second ClamAV timeout, 30-second Support scan/escalation
  ticks, and one-hour retention tick.
- Wired API composition to use real `ClamdSupportAttachmentScanner`,
  `MinioSupportAttachmentStorage`, the private Support bucket, and configured
  Support worker intervals.
- Extended API readiness to check Support migration count, both MinIO buckets,
  and ClamAV `zPING`.
- Added pinned local ClamAV Compose service with persistent
  `opendx_clamav_signatures` volume and no host port.
- Extended MinIO bootstrap to create `product-media` and `support-attachments`.
- Documented ClamAV startup, memory, persistence, and fail-closed quarantine
  semantics.

## Verification

- RED observed in `environment.test.ts` before parser support.
- `pnpm --filter @opendx/api test -- src/shared/config/environment.test.ts`
  passed: 378 tests.
- `pnpm --filter @opendx/api typecheck` passed.
- `docker compose --env-file .env -f infra/docker/docker-compose.yml config --quiet`
  passed.
- `docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --wait clamav`
  passed after pulling the pinned ClamAV image and waiting for healthy `zPING`.
- Initial `make up` exposed an incorrect CRM migration readiness threshold;
  root cause was verified by querying migration counts and fixed.
- Final `make up` passed with PostgreSQL, Keycloak, MinIO, ClamAV, API, Console,
  and Storefront all healthy.
- MinIO bucket listing confirmed both `product-media/` and
  `support-attachments/`.
