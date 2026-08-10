<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Backup and Restore Operations

Phase 8 provides explicit scripts for PostgreSQL and MinIO backups. They require
environment variables, resolve filesystem paths with `realpath`, and refuse
ambiguous restore targets.

## PostgreSQL Backup

```bash
BACKUP_DIR=infra/backups \
DATABASE_URL=postgres://user:password@host:5432/opendx \
scripts/ops/postgres-backup.sh
```

The script writes a PostgreSQL custom-format `.dump` file and prints expired
backup candidates based on `BACKUP_RETENTION_DAYS` without deleting them.

## PostgreSQL Restore

```bash
BACKUP_FILE=infra/backups/opendx-postgres-YYYYMMDDTHHMMSSZ.dump \
TARGET_DATABASE_URL=postgres://user:password@host:5432/opendx_restore \
scripts/ops/postgres-restore.sh
```

Restore uses:

```bash
pg_restore --clean --if-exists --no-owner --exit-on-error --single-transaction
```

If `TARGET_DATABASE_URL` equals `DATABASE_URL`, the script refuses to run unless
`ALLOW_RESTORE_TO_PRODUCTION=I_UNDERSTAND_THIS_CAN_OVERWRITE_PRODUCTION` is set.

## MinIO Backup

Requires the MinIO client (`mc`):

```bash
BACKUP_DIR=infra/backups \
MINIO_ENDPOINT=https://storage.example.invalid \
MINIO_ACCESS_KEY=... \
MINIO_SECRET_KEY=... \
MINIO_BUCKET=product-media \
MINIO_SUPPORT_BUCKET=support-attachments \
scripts/ops/minio-backup.sh
```

The script mirrors product media and private support attachments into separate
directories under the backup directory.

## MinIO Restore

```bash
BACKUP_DIR=infra/backups \
TARGET_MINIO_ENDPOINT=https://target-storage.example.invalid \
TARGET_MINIO_ACCESS_KEY=... \
TARGET_MINIO_SECRET_KEY=... \
TARGET_MINIO_BUCKET=product-media \
TARGET_MINIO_SUPPORT_BUCKET=support-attachments \
scripts/ops/minio-restore.sh
```

If source MinIO variables are also present and the target endpoint/key match
the source, restore refuses to run unless
`ALLOW_RESTORE_TO_PRODUCTION=I_UNDERSTAND_THIS_CAN_OVERWRITE_PRODUCTION` is set.

## Validation

```bash
pnpm check:backup-restore
bash -n scripts/ops/postgres-backup.sh scripts/ops/postgres-restore.sh scripts/ops/minio-backup.sh scripts/ops/minio-restore.sh
```

Install `pg_dump`, `pg_restore`, and `mc` on the operator machine before a full
runtime backup/restore exercise.

The Phase 8 exit preflight runs the static safety check. A full restore drill
must still be recorded against an explicitly disposable target before go-live.
