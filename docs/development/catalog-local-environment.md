<!--
SPDX-FileCopyrightText: 2026 OpenDX CompanyOS contributors
SPDX-License-Identifier: Apache-2.0
-->

# Catalog Local Environment

The supported local path is fully containerized:

```bash
make up
```

This starts PostgreSQL, Keycloak, MinIO, migration and seed jobs, the API, and
the console. Open the console at `http://localhost:3000`, Keycloak at
`http://localhost:8080`, the API at `http://localhost:4000`, and the MinIO
console at `http://localhost:9001`. Local credentials are development-only and
are declared in the Compose file and imported Keycloak realm.

The seed is deterministic and safe to repeat. It creates NovaCommerce Company
Operating Core data plus four Catalog categories, twelve draft products,
twenty-four active variants/current VND prices, and twelve repository-owned
product images in MinIO:

```bash
make db-seed
make db-seed
```

Use an `administrator` or `catalog_manager` account to enter `/catalog`. A
signed-in user without either role may view the denied state but cannot mutate
Catalog data. The console supports filtered product listing, category and
product editing, variants, immutable price replacement, media upload/preview,
and audit history.

## Acceptance Commands

```bash
make up
make db-migrate
make db-seed
make db-backup
make check
make down
```

Normal `make down` preserves PostgreSQL and MinIO named volumes. See
[`database-operations.md`](database-operations.md) before restore or any
volume-removal operation.

If media is unavailable, verify `http://localhost:9000/minio/health/live`, the
`product-media` bucket, and the API readiness response at
`http://localhost:4000/health/ready`. If login fails, verify the imported
`opendx` realm and that the browser-visible issuer remains
`http://localhost:8080/realms/opendx`.

## Phase 3 Acceptance Evidence

Validation on 2026-08-05 completed the full-container dependency chain and
reported PostgreSQL, migrations, Keycloak, and MinIO as ready. Authorization
Code with PKCE login loaded all twelve seeded products and their authenticated
image thumbnails. Chrome checks at 1440×900, 1024×768, and 390×844 covered the
product list and editor; the mobile document stayed within its viewport while
the wide data table retained its own horizontal scroll area. The container gate
passed 104 API unit tests, 27 console tests, 24 PostgreSQL/MinIO integration
tests, four shared-package tests, one Python test, the console production build,
repository audit, and Compose validation.

The local workstation used `POSTGRES_PORT=55433` for acceptance because port
5432 was already occupied by a separate system PostgreSQL. This exercises only
the host port mapping; the documented clean-machine default remains 5432 and
all Compose service-to-service connections remain on PostgreSQL port 5432.
