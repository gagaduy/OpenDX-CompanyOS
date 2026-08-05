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

All images use reviewed version tags and pinned digests. Credentials are
local-development values and must not be reused in production.

## Commands

```bash
make up
make logs
make check
make down
```

PostgreSQL must become healthy before migrations. MinIO must become healthy
before bucket bootstrap. The idempotent seed runs only after both jobs, then the
API waits for Keycloak and seed completion before the console starts. Normal
shutdown preserves the `opendx_postgres` and `opendx_minio` volumes.

See `docs/development/catalog-local-environment.md` and
`docs/development/database-operations.md` for seed, backup, restore, and
troubleshooting workflows.
