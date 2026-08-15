<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Backup and Restore Operations

PostgreSQL workflow state is backed up as one recovery set. MinIO remains a
separate backup boundary. The scripts resolve filesystem paths with `realpath`
and refuse ambiguous or incomplete restore targets.

## PostgreSQL Backup

For the local Compose stack:

```bash
make db-backup
```

The command creates `infra/backups/recovery-YYYYMMDD-HHMMSS/` containing
`opendx.dump`, `temporal.dump`, `temporal_visibility.dump`, `manifest.json`,
and `checksums.sha256`. The manifest records database names, custom dump
format, PostgreSQL and Temporal versions, schema versions, creation time, file
sizes, and SHA-256 values. It never records credentials. The directory is
published atomically only after all three non-empty archives pass
`pg_restore -l`.

Backup closes the local Console and Storefront, drains the worker, then stops
API, AI Runtime, and Temporal for one bounded recovery window. Do not call the
published local API port during this window. Services restart even if archive
creation or validation fails. Backup refuses to run while an Agentic lifecycle
or recovery checker lock exists. Backup and restore also acquire the same
atomic maintenance lock, so two database operations cannot quiesce or publish a
set concurrently. If an operator process is killed without running cleanup,
confirm that no backup or restore is active before removing the reported stale
lock directory.

For production, use the deployment Compose file and real env file:

```bash
BACKUP_DIR=/srv/opendx-backups \
COMPOSE_FILE=infra/deploy/compose.production.yml \
COMPOSE_ENV_FILE=.env.production \
OPENDX_DEPLOYMENT_MODE=production \
POSTGRES_ADMIN_USER="$POSTGRES_ADMIN_USER" \
scripts/ops/postgres-backup.sh
```

Caddy stops first so no new public workflow command enters while internal work
drains.

## PostgreSQL Restore

```bash
make db-restore BACKUP=infra/backups/recovery-YYYYMMDD-HHMMSS
```

Restore validates the exact member list, manifest version,
database-to-archive mapping, file sizes, SHA-256 checksums, pinned Temporal
version, and all three custom archives before stopping a service or mutating a
database. It then restores all databases, runs application migrations, applies
the pinned Temporal schema job, verifies the namespace, and starts workloads
with readiness waits.

An older single `opendx` custom dump is not a recovery set. Local emergency
compatibility requires a `.dump` path and `ALLOW_OPENDX_ONLY_RESTORE=1`.
Production always rejects this mode because it cannot restore Temporal history
consistently.

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
pnpm test:make-database-backup
make check-agentic-workflow-recovery
bash -n scripts/ops/postgres-backup.sh scripts/ops/postgres-restore.sh scripts/ops/minio-backup.sh scripts/ops/minio-restore.sh
node --check scripts/ops/postgres-recovery-set.mjs
```

The PostgreSQL tools run inside the pinned Compose PostgreSQL image. Install
`mc` on the operator machine before a full MinIO exercise.

`make check-agentic-workflow-recovery` uses three disposable suffixed databases
and isolated temporary workflow containers. It backs up a run waiting for its
bound approval, destroys and restores only those disposable databases, resumes
the approval exactly once, and replays the restored Temporal JSON history
against the current V1 workflow implementation. It does not mutate the normal
`opendx`, `temporal`, or `temporal_visibility` databases.

The Phase 8 exit preflight runs the static safety check. A full restore drill
must still be recorded against an explicitly disposable target before go-live.
