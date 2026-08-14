<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Database Operations

PostgreSQL is the only runtime persistence path for Company Core and Commerce.
The API has no in-memory fallback. Migration order is Catalog, Company Core,
Inventory, Customer, Cart, Promotion, Checkout, Order, then Payment. Seed order
is Company Core, Catalog, Inventory, then Promotion; Customer, Cart, Checkout,
Order, and Payment begin without fabricated operational records.

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

Rollback runs in exact inverse order: Payment, Order, Checkout, Promotion, Cart,
Customer, Inventory, Company Core, then Catalog. It is destructive and intended
for local development. Seeding is transactional and idempotent at the database
boundary; Catalog image objects use stable MinIO keys. Promotion seeds are
`NOVA10` active and `NOVA50K` inactive as documented in
`../api/promotion.md`; they contain no merchant or payment evidence.

## Backup and Restore

```bash
make db-backup
make db-restore BACKUP=infra/backups/opendx-YYYYMMDD-HHMMSS.sql
make db-restore BACKUP=infra/backups/opendx-YYYYMMDD-HHMMSS.dump
```

Each backup creates a matching pair under the ignored `infra/backups/`
directory: a readable plain SQL file and a PostgreSQL custom-format archive.
Both files share one UTC timestamp. The command writes hidden temporary files
first and publishes neither final backup unless both dumps succeed and are
non-empty; an existing timestamp pair is never overwritten.

Restore accepts only `.sql` and `.dump`. SQL uses `psql -X --set
ON_ERROR_STOP=1 --single-transaction`; custom archives use `pg_restore --clean
--if-exists --no-owner --exit-on-error --single-transaction`. Restore rejects
an empty, missing, or unsupported path before stopping services, then stops API
and frontend containers to quiesce application writes. The stopped containers
are restarted even if restore fails. Restore replaces matching database
objects and can destroy newer local data, so retain a separate backup first.
MinIO objects are not included and need an independent object-storage backup
for disaster recovery.

Phase 8 production-style backup and restore scripts are documented in
[`../operations/backup-restore.md`](../operations/backup-restore.md). Use those
scripts for explicit PostgreSQL and MinIO backup/restore operations that need
path validation and restore target guardrails.

The PostgreSQL backups include Catalog publication state, Company Operating
Core data, Inventory balances, movements, idempotency records, reservations,
customers, hash-only sessions, addresses, carts, promotions, immutable
checkout/order snapshots, payment attempts, redacted provider events,
reconciliations, and histories. After restore, run `make db-migrate` before
starting writes if the archive predates the current schema. A PostgreSQL restore
does not replay a provider event or independently prove that money moved.

## Lifecycle Verification

For a disposable local database, verify migration and seed idempotency with:

```bash
make db-migrate
make db-seed
make db-seed
make db-rollback
make db-migrate
make db-seed
```

Do not run rollback against a database whose data must be retained. Use
`make db-backup` first and test restore with an explicit `BACKUP=...` path.
Rolling the Customer migration below its schema version removes audit entries
whose actor type is `customer`, because the older Company Core constraint
cannot represent that actor. This is expected destructive rollback behavior;
restore the backup instead when those records must be retained.

`make down` preserves named volumes. Removing Compose volumes, for example with
`docker compose -f infra/docker/docker-compose.yml down --volumes`, permanently
removes local PostgreSQL and MinIO state and is intentionally not exposed as a
Make target.
