<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Task 6 Report: Private Scanned Support Attachments

Implemented Support attachment application ports, upload/download service,
private MinIO storage adapter, ClamD TCP scanner adapter, scan worker, retention
worker, and multipart API routes under the existing Support ticket mount.

The implementation stores uploaded objects with backend-generated UUID object
keys, keeps metadata quarantined until scan publication, denies non-clean
downloads, enforces ticket read ownership in the service, and avoids holding a
database transaction while calling MinIO or ClamD.

## Verification

- RED observed for missing attachment service, ClamD scanner, and attachment
  workers before implementation.
- Focused unit/API command passed: Support service, attachment service, ClamD
  scanner, scan worker, retention worker, and Support API tests.
- API typecheck passed.
- PostgreSQL focused integration passed for attachment create/find, scan claim,
  clean transition, retention claim, and deleted tombstone.
- MinIO storage integration is present and skips when MinIO env variables are
  absent in the local shell.

## Notes

- Task 7 still owns ClamAV Docker/env/readiness and the dedicated private
  `support-attachments` bucket bootstrap. Until Task 7 wires real env values,
  `createSupportModule` uses fail-closed default storage/scanner adapters.
