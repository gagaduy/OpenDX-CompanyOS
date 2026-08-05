<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Database Operations

PostgreSQL is the only production/runtime persistence path for Catalog,
Company Operating Core, Inventory, Customer, and Cart. The API has no in-memory
fallback. The migration job applies Catalog, Company Core, Inventory, Customer,
then Cart migrations. Seed ordering is Company Core, Catalog, then Inventory;
Customer and Cart begin empty and are populated by Storefront activity.

## Migrate, Roll Back, and Seed

```bash
make db-migrate
make db-rollback
make db-seed
```

Direct equivalents are:

```bash
docker compose -f infra/docker/docker-compose.yml run --rm migrate
docker compose -f infra/docker/docker-compose.yml run --rm api pnpm --filter @opendx/api db:rollback:all
docker compose -f infra/docker/docker-compose.yml run --rm seed
```

Rollback runs in the inverse order: Cart, Customer, Inventory, Company Core,
then Catalog. It is destructive and intended for local development. Seeding is
transactional and idempotent at the database boundary; Catalog image objects
use stable MinIO keys.

## Backup and Restore

```bash
make db-backup
make db-restore BACKUP=infra/backups/opendx-YYYYMMDD-HHMMSS.dump
```

Backups are PostgreSQL custom-format archives under the ignored
`infra/backups/` directory. Restore rejects an empty or missing path, stops API
and frontend containers to quiesce application writes, and runs
`pg_restore --clean --if-exists --no-owner --exit-on-error
--single-transaction`. The stopped containers are restarted even if restore
fails. Restore replaces matching database objects and can destroy newer local
data, so retain a separate backup first. MinIO objects are not included in a
PostgreSQL archive and need an independent object-storage backup for disaster
recovery.

The PostgreSQL archive includes Catalog publication state, Company Operating
Core data, Inventory balances, movements, idempotency records, reservations,
customers, hash-only sessions, addresses, carts, and resolution history. After
restore, run `make db-migrate` before starting writes if the archive predates
the current schema.

`make down` preserves named volumes. Removing Compose volumes, for example with
`docker compose down --volumes`, permanently removes local PostgreSQL and MinIO
state and is intentionally not exposed as a Make target.
