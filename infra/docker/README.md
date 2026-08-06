<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Local Docker Infrastructure

This directory contains local-only infrastructure for OpenDX CompanyOS.

## Services

- PostgreSQL 18: `localhost:5432`
- Keycloak: `http://localhost:8080`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`
- API: `http://localhost:4000`
- Console: `http://localhost:3000`
- Storefront: `http://localhost:3100`

All images use reviewed version tags and pinned digests. Credentials are
local-development values and must not be reused in production.

## Commands

```bash
make up
make logs
make check
make down
```

PostgreSQL must become healthy before Catalog → Company Core → Inventory → Customer → Cart
migrations. MinIO must become healthy before bucket bootstrap. The Company
Core → Catalog → Inventory idempotent seed runs only after both jobs, then the
API waits for Keycloak and seed completion before the Console and Storefront start. Normal
shutdown preserves the `opendx_postgres` and `opendx_minio` volumes.

The development Storefront mounts both `apps/storefront/src` and its read-only
`public` assets so UI and product-canvas changes appear without rebuilding the
container image.

API readiness checks every implemented module migration table and the MinIO bucket. The
Inventory expiry worker uses a 900-second reservation TTL and a 30-second scan.
No Temporal service is started. Use `POSTGRES_PORT=<free-port> make up` when
host port 5432 is occupied; internal service connections remain on 5432.

See `docs/development/catalog-local-environment.md` and
`docs/development/storefront-local-environment.md` plus
`docs/development/database-operations.md` for seed, identity, backup, restore, and
troubleshooting workflows.
