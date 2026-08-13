<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Dual-format Make Database Backup Design

## Goal

Make the contributor-facing `make db-backup` command create both a readable
plain SQL backup and a PostgreSQL custom archive from the local `opendx`
database. Make `make db-restore BACKUP=...` safely restore either format based
on its filename extension.

## Scope

This change is limited to the root `Makefile`, its focused regression checks,
and contributor database-operation documentation. Automated production backup
scripts under `scripts/ops` remain custom-format archives and are not changed.
No application code, schema, migration, seed, or database contents change.

## Backup Contract

One `make db-backup` invocation uses one UTC timestamp and creates this pair:

```text
infra/backups/opendx-YYYYMMDD-HHMMSS.sql
infra/backups/opendx-YYYYMMDD-HHMMSS.dump
```

The SQL file uses `pg_dump --format=plain` with clean, ownership, and privilege
options suitable for the documented local restore path. The dump file uses
`pg_dump --format=custom` and retains the existing `pg_restore` workflow.

Each output is first written to a hidden same-directory temporary file. The
command removes temporary files on every exit path, rejects empty output, and
publishes neither final backup unless both dump operations succeed. Publishing
must not overwrite an existing final path; a timestamp collision fails closed.

## Restore Contract

`make db-restore BACKUP=<path>` validates that the value is non-empty, resolves
to an existing regular file, and has an exact supported extension:

- `.sql` uses `psql -X --set ON_ERROR_STOP=1 --single-transaction`;
- `.dump` uses `pg_restore --clean --if-exists --no-owner --exit-on-error
  --single-transaction`;
- every other extension is rejected before services are stopped or database
  input is consumed.

The existing API, Console, and Storefront stop/start guard remains. Quoting
must preserve backup paths containing spaces and prevent shell expansion of
the path supplied through `BACKUP`.

## Failure Handling

- A failed `pg_dump`, empty temporary output, or publish collision exits
  non-zero and leaves no final backup from that invocation.
- A restore failure exits non-zero while the existing exit trap restarts the
  application services.
- SQL execution stops on the first PostgreSQL error and is transaction-bound.
- Error output identifies the invalid path, unsupported extension, dump
  failure, or collision without exposing credentials.

## Verification

Focused shell-level checks will use a fake Compose/`pg_dump` boundary to prove:

- one invocation requests both plain and custom formats;
- both final filenames share a timestamp and use `.sql` and `.dump`;
- partial and empty outputs are cleaned up;
- existing files are never overwritten;
- `.sql` selects `psql`, `.dump` selects `pg_restore`, and other extensions are
  rejected before service interruption;
- backup paths containing spaces remain one shell argument.

Final validation includes `git diff --check`, `pnpm audit:repo`, Makefile dry
runs, and a real local backup/restore smoke test when the PostgreSQL Compose
service is available.

## Non-goals

- Replacing production custom-archive backup scripts.
- Adding compression, encryption, remote storage, retention, or scheduling.
- Supporting arbitrary backup formats or auto-detecting content independently
  of the validated extension.
